// SPDX-License-Identifier: Apache-2.0
//! Thermal state the workers consult before hashing.
//!
//! The default (public) build has no thermal guard: `Thermal` is created
//! unguarded, the duty cycle stays at 100 % and every check below returns at
//! once. The thermal-guard build (`--features fleet`, Linux) adds the guard
//! of `guard.rs`, which publishes its readings here:
//!
//! - workers refuse to hash on a reading older than 1 s and exit 82 after
//!   3 s without one: a starved guard is a missing guard;
//! - below the stop, a global duty cycle: every worker hashes during the first
//!   `d x period` of each period and sleeps the rest, all in phase.
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::time::{Duration, Instant};

pub const EXIT_THERMAL: i32 = 82;
/// The hard limit of the thermal-guard build. Nothing on the command line can
/// raise it.
#[cfg_attr(not(feature = "fleet"), allow(dead_code))]
pub const HARD_LIMIT_C: f64 = 82.0;
/// Age of the latest reading beyond which workers stop hashing.
pub const STALE_NS: u64 = 1_000_000_000;
/// Age beyond which the process exits (82, "guard starved").
///
/// Who enforces it: not the guard thread, which on a failed read only logs
/// and tries again at the next poll — the hashing threads do, in
/// [`worker_may_hash`], before every batch (mining, --bench-walk, --tune,
/// --check-nonces) and before every walk of --gate / the start-up self-test.
/// So the same exit covers a sensor that stopped answering (reads fail) and a
/// guard thread that no longer gets the CPU (no read at all): in both cases
/// nothing vouches for the temperature any more. 3 s = 12 missed polls at
/// 250 ms; between 1 and 3 s the threads already hash nothing (STALE_NS), so
/// a stalled guard never lets the machine heat unwatched for more than ~1 s.
pub const STARVED_NS: u64 = 3_000_000_000;

#[cfg_attr(not(feature = "fleet"), allow(dead_code))]
pub struct Thermal {
    pub t0: Instant,
    /// True only in the thermal-guard build with a sensor: the watchdog runs.
    pub guarded: bool,
    /// Latest guard temperature, milli-C.
    pub temp_mc: AtomicU32,
    /// Latest Tctl (package), milli-C.
    pub tctl_mc: AtomicU32,
    /// Each die in the latest reading, milli-C (first `n_ccd` used, up to 8).
    pub ccd_mc: [AtomicU32; 8],
    pub n_ccd: AtomicU32,
    /// Nanos since `t0` of the latest successful reading (0 = never).
    pub temp_ns: AtomicU64,
    /// Longest interval between two successful readings, nanos, and the
    /// number of readings: evidence that the guard was never starved (--gate).
    pub gap_max_ns: AtomicU64,
    pub readings: AtomicU64,
    /// Peak of `temp_mc` since the last `reset_peak`.
    pub peak_mc: AtomicU32,
    /// Stop flag for the guard thread (tests, orderly shutdown).
    pub quit: AtomicBool,
    /// Duty cycle of the hashing gate, 1/1000 (1000 = always on).
    pub duty_milli: AtomicU32,
    /// PWM period, nanos.
    pub period_ns: AtomicU64,
}

impl Thermal {
    pub fn new(t0: Instant, guarded: bool) -> Thermal {
        Thermal {
            t0,
            guarded,
            temp_mc: AtomicU32::new(0),
            tctl_mc: AtomicU32::new(0),
            ccd_mc: Default::default(),
            n_ccd: AtomicU32::new(0),
            temp_ns: AtomicU64::new(0),
            gap_max_ns: AtomicU64::new(0),
            readings: AtomicU64::new(0),
            peak_mc: AtomicU32::new(0),
            quit: AtomicBool::new(false),
            duty_milli: AtomicU32::new(1000),
            period_ns: AtomicU64::new(1_000_000_000),
        }
    }

    pub fn duty(&self) -> f64 {
        self.duty_milli.load(Ordering::Relaxed) as f64 / 1000.0
    }

    pub fn now_ns(&self) -> u64 {
        self.t0.elapsed().as_nanos() as u64
    }

    pub fn temp_c(&self) -> f64 {
        self.temp_mc.load(Ordering::Relaxed) as f64 / 1000.0
    }

    pub fn peak_c(&self) -> f64 {
        self.peak_mc.load(Ordering::Relaxed) as f64 / 1000.0
    }

    pub fn reset_peak(&self) {
        self.peak_mc.store(self.temp_mc.load(Ordering::Relaxed), Ordering::Relaxed);
    }

    /// Age of the latest reading in nanos (u64::MAX before the first one).
    pub fn age_ns(&self) -> u64 {
        match self.temp_ns.load(Ordering::Relaxed) {
            0 => u64::MAX,
            t => self.now_ns().saturating_sub(t),
        }
    }

    /// One-line summary for reports: `Tctl=61.2 (ccd 60.4/59.1)`; empty
    /// without a guard.
    pub fn summary(&self) -> String {
        if !self.guarded {
            return if cfg!(feature = "fleet") { crate::status::red("NO THERMAL GUARD") } else { String::new() };
        }
        let f = |a: &AtomicU32| a.load(Ordering::Relaxed) as f64 / 1000.0;
        let ccd = self.ccd_c();
        if ccd.is_empty() {
            format!("Tctl={:.1}", f(&self.tctl_mc))
        } else {
            let v: Vec<String> = ccd.iter().map(|c| format!("{c:.1}")).collect();
            format!("Tctl={:.1} (ccd {})", f(&self.tctl_mc), v.join("/"))
        }
    }

    pub fn tctl_c(&self) -> f64 {
        self.tctl_mc.load(Ordering::Relaxed) as f64 / 1000.0
    }

    /// Latest per-die readings, C.
    pub fn ccd_c(&self) -> Vec<f64> {
        let n = self.n_ccd.load(Ordering::Relaxed) as usize;
        self.ccd_mc[..n].iter().map(|a| a.load(Ordering::Relaxed) as f64 / 1000.0).collect()
    }
}

/// Worker-side gate of the duty cycle: returns at once while the gate is open
/// (or the duty is 100 %); otherwise sleeps to the next opening edge and
/// returns false so the caller re-checks everything (stop flag, job).
/// All workers share `t0`, so they open and close together.
#[inline]
pub fn gate_open(th: &Thermal) -> bool {
    let d = th.duty_milli.load(Ordering::Relaxed) as u64;
    if d >= 1000 {
        return true;
    }
    let period = th.period_ns.load(Ordering::Relaxed).max(1_000_000);
    let phase = th.now_ns() % period;
    if phase < period * d / 1000 {
        return true;
    }
    // Sleep to the edge, but wake at least every 50 ms to see a new duty.
    std::thread::sleep(Duration::from_nanos((period - phase).min(50_000_000)));
    false
}

/// Worker-side watchdog. Returns true when the worker may hash now; sleeps and
/// returns false on a stale reading; exits 82 when the guard is starved.
#[inline]
pub fn worker_may_hash(th: &Thermal) -> bool {
    if !th.guarded {
        return true;
    }
    let age = th.age_ns();
    if age <= STALE_NS {
        return true;
    }
    if age > STARVED_NS && age != u64::MAX {
        crate::status::exit_once(
            EXIT_THERMAL,
            &format!(
                "THERMAL: guard starved ({:.1} s without a temperature reading) — stopping. Exit {EXIT_THERMAL}.",
                age as f64 / 1e9
            ),
        );
    }
    std::thread::sleep(Duration::from_millis(20));
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unguarded_never_blocks() {
        let th = Thermal::new(Instant::now(), false);
        assert!(worker_may_hash(&th));
        assert!(gate_open(&th));
    }

    #[test]
    fn pwm_edge_resolution_is_5_percent() {
        // The gate is computed from the clock, not toggled on a tick: any duty
        // in 1/1000 steps is honoured; at the default period a 5 % step is
        // 5 ms of hashing.
        let th = Thermal::new(Instant::now(), false);
        th.period_ns.store(100_000_000, Ordering::Relaxed);
        th.duty_milli.store(1000, Ordering::Relaxed);
        assert!(gate_open(&th));
        let period = th.period_ns.load(Ordering::Relaxed);
        for d in (50..=950).step_by(50) {
            let on = period * d / 1000;
            assert_eq!(on % 5_000_000, 0, "5 % of 100 ms is 5 ms");
            assert!(on > 0 && on < period);
        }
    }

    #[test]
    fn pwm_gate_open_fraction_matches_duty() {
        let th = Thermal::new(Instant::now(), false);
        // Darwin coalesces timer wakeups; a 50 ms period makes scheduler
        // latency comparable to the 15 ms open window. Preserve the same
        // duty/tolerance and cycle count with a longer observation window.
        let scale = if cfg!(target_os = "macos") { 10 } else { 1 };
        th.period_ns.store(50_000_000 * scale, Ordering::Relaxed);
        th.duty_milli.store(300, Ordering::Relaxed);
        let t = Instant::now();
        let mut open_ns = 0u128;
        while t.elapsed() < Duration::from_millis(1000 * scale) {
            let a = Instant::now();
            if gate_open(&th) {
                std::thread::sleep(Duration::from_micros(200));
                open_ns += a.elapsed().as_nanos();
            }
        }
        let f = open_ns as f64 / t.elapsed().as_nanos() as f64;
        assert!((0.25..0.36).contains(&f), "open {f:.3} of the time at duty 0.30");
    }
}
