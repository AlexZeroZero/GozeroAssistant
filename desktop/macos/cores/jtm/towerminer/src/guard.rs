// SPDX-License-Identifier: Apache-2.0
//! Thermal guard of the thermal-guard build (`--features fleet`, Linux).
//! Rule of that build: a CPU above 82 C means the machine is cut, so the
//! miner must stay clearly below it on its own, whatever the network does.
//!
//! - [`Sensor`]: the hwmon inputs, resolved once at start-up (k10temp Tctl and
//!   every Tccd, or zenpower, or coretemp packages; all sockets).
//! - [`Guard`]: a dedicated thread that reads the sensor every `poll_ms`
//!   (250 ms by default) and exits the process (82) at `stop` C, or earlier
//!   when the slope of the last second projects the hard limit within one
//!   second. It never touches the network and shares no lock with the poller.
//!   It publishes into [`Thermal`]; the workers' watchdog is in `thermal.rs`.
//! - [`Regulator`] (+ [`Ramp`]): below the stop, a global duty cycle. Every
//!   worker hashes during the first `d x period` of each period and sleeps
//!   the rest, all in phase, so every core stays at the same (lowest, most
//!   efficient) V/f point and the heat is proportional to `d`. Parking some
//!   cores instead is the wrong lever on a power-limited part: on the 5950X
//!   12 threads draw MORE than 16 (144.7 vs 136.8 W) and 8 threads on one
//!   CCD run HOTTER (74.2 vs 62.8 C) [MEASURED 2026-09-28].
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::status::exit_once;
use crate::thermal::{Thermal, EXIT_THERMAL, HARD_LIMIT_C};

pub const EXIT_NO_SENSOR: i32 = 5;
/// Default period of the duty-cycle gate. 1 s: the on-phases are long enough
/// for the package power limiter to hold the all-core V/f point, not the
/// burst boost of cores just out of idle [MEASURED 2026-09-28, 5950X, target
/// 56 C: 97.9 H/J at 1 s vs 90.4 at 500 ms and ~60 at 100 ms].
pub const DEFAULT_PWM_MS: u64 = 1000;

// ---------------------------------------------------------------------------
// Sensor
// ---------------------------------------------------------------------------

/// Resolved temperature inputs.
#[derive(Debug, Clone)]
pub struct Sensor {
    pub chip: String,
    /// Package-level inputs (Tctl / Tdie / Package id N), one per socket.
    pub tctl: Vec<PathBuf>,
    /// Per-die inputs (Tccd1..), all sockets.
    pub ccd: Vec<PathBuf>,
}

#[derive(Debug, Clone, Default)]
pub struct Reading {
    /// Max over the package inputs, milli-C.
    pub tctl_mc: i64,
    /// Each die, milli-C, in `Sensor::ccd` order.
    pub ccd_mc: Vec<i64>,
}

impl Reading {
    /// What the guard acts on: the hottest of Tctl and every die.
    pub fn max_mc(&self) -> i64 {
        self.ccd_mc.iter().copied().fold(self.tctl_mc, i64::max)
    }
}

fn read_trim(p: &Path) -> Option<String> {
    fs::read_to_string(p).ok().map(|s| s.trim().to_string())
}

impl Sensor {
    pub fn detect() -> Option<Sensor> {
        Self::detect_in(Path::new("/sys/class/hwmon"))
    }

    /// Scan `root` (a hwmon class directory) and keep the first chip family
    /// found in the order k10temp, zenpower, coretemp (every instance of it:
    /// one per socket). Returns `None` unless a first reading succeeds and is
    /// plausible (10..=100 C).
    pub fn detect_in(root: &Path) -> Option<Sensor> {
        let mut dirs: Vec<PathBuf> = fs::read_dir(root).ok()?.flatten().map(|e| e.path()).collect();
        dirs.sort();
        for family in ["k10temp", "zenpower", "coretemp"] {
            let mut s = Sensor { chip: family.to_string(), tctl: Vec::new(), ccd: Vec::new() };
            for d in &dirs {
                if read_trim(&d.join("name")).as_deref() != Some(family) {
                    continue;
                }
                let mut inputs: Vec<(u32, PathBuf)> = fs::read_dir(d)
                    .map(|rd| {
                        rd.flatten()
                            .filter_map(|e| {
                                let n = e.file_name().to_string_lossy().to_string();
                                let idx = n.strip_prefix("temp")?.strip_suffix("_input")?.parse::<u32>().ok()?;
                                Some((idx, e.path()))
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                inputs.sort();
                let mut pkg = Vec::new();
                for (idx, p) in &inputs {
                    let label = read_trim(&d.join(format!("temp{idx}_label"))).unwrap_or_default();
                    match family {
                        "coretemp" => {
                            if label.starts_with("Package id") {
                                pkg.push(p.clone());
                            }
                        }
                        _ => {
                            if label == "Tctl" || label == "Tdie" {
                                pkg.push(p.clone());
                            } else if label.starts_with("Tccd") {
                                s.ccd.push(p.clone());
                            }
                        }
                    }
                }
                if pkg.is_empty() {
                    // Unlabelled chip: temp1 is the package reading on all three.
                    if let Some((_, p)) = inputs.iter().find(|(i, _)| *i == 1) {
                        pkg.push(p.clone());
                    }
                }
                s.tctl.extend(pkg);
            }
            if s.tctl.is_empty() {
                continue;
            }
            let r = s.read()?;
            let c = r.max_mc() as f64 / 1000.0;
            if (10.0..=100.0).contains(&c) {
                return Some(s);
            }
            return None;
        }
        None
    }

    /// One reading of every input. `None` if any package input fails.
    pub fn read(&self) -> Option<Reading> {
        let mut r = Reading { tctl_mc: i64::MIN, ccd_mc: Vec::with_capacity(self.ccd.len()) };
        for p in &self.tctl {
            let v: i64 = read_trim(p)?.parse().ok()?;
            r.tctl_mc = r.tctl_mc.max(v);
        }
        for p in &self.ccd {
            // A die input that fails is dropped from this reading, not fatal:
            // the package input is the one the hard limit is about.
            if let Some(v) = read_trim(p).and_then(|s| s.parse().ok()) {
                r.ccd_mc.push(v);
            }
        }
        Some(r)
    }

    pub fn describe(&self) -> String {
        let short = |p: &PathBuf| {
            let dir = p.parent().and_then(|d| d.file_name()).map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            format!("{dir}/{}", p.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default())
        };
        format!(
            "{} [{}{}]",
            self.chip,
            self.tctl.iter().map(short).collect::<Vec<_>>().join(" "),
            if self.ccd.is_empty() { String::new() } else { format!(" + {} die inputs", self.ccd.len()) }
        )
    }
}

/// Publish a reading; `guard_c` is the value the guard acts on.
fn publish(th: &Thermal, r: &Reading, guard_c: f64) {
    let clamp = |v: i64| v.clamp(0, u32::MAX as i64) as u32;
    let m = clamp((guard_c * 1000.0).round() as i64);
    th.temp_mc.store(m, Ordering::Relaxed);
    th.tctl_mc.store(clamp(r.tctl_mc), Ordering::Relaxed);
    for (i, v) in r.ccd_mc.iter().take(8).enumerate() {
        th.ccd_mc[i].store(clamp(*v), Ordering::Relaxed);
    }
    th.n_ccd.store(r.ccd_mc.len().min(8) as u32, Ordering::Relaxed);
    th.peak_mc.fetch_max(m, Ordering::Relaxed);
    let now = th.now_ns().max(1);
    let prev = th.temp_ns.swap(now, Ordering::AcqRel);
    if prev != 0 {
        th.gap_max_ns.fetch_max(now.saturating_sub(prev), Ordering::Relaxed);
    }
    th.readings.fetch_add(1, Ordering::Relaxed);
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct GuardCfg {
    /// Hard stop, C (<= 82).
    pub stop_c: f64,
    /// Limit the predictor projects against (82, lower only for tests).
    pub hard_c: f64,
    pub poll_ms: u64,
    /// Test hook: stall the guard once, `.0` s after start, for `.1` s.
    pub stall: Option<(f64, f64)>,
    /// Duty-cycle regulation (None = always on; the stop still applies).
    pub reg: Option<RegCfg>,
}

#[derive(Debug, Clone)]
pub struct RegCfg {
    pub target_c: f64,
    pub min_duty: f64,
    pub period_ms: u64,
    /// Start-up ramp length (0 = full duty at once).
    pub ramp_secs: f64,
}

// ---------------------------------------------------------------------------
// Regulator: a pure function of (time, hottest reading of the last second).
// ---------------------------------------------------------------------------

/// Start-up ramp: the duty starts at 0.3 and climbs 0.7 / `secs` per second
/// while the machine is more than 3 C below target. It hands over to the
/// regulator as soon as Tctl comes within 3 C of the target, or at 100 %.
#[derive(Debug, Clone)]
pub struct Ramp {
    pub per_s: f64,
}

pub const RAMP_START: f64 = 0.3;
/// PI gains, per C of error on the smoothed Tctl (and per second).
pub const KP: f64 = 0.03;
pub const KI: f64 = 0.003;
/// Smoothing of the regulator input: exponential average over ~3 s. The
/// part moves Tctl by 2-3 C within 1-2 s at constant duty (its own boost
/// dynamics); a proportional term fed the raw second pumped the duty down
/// while still under target [MEASURED 2026-09-28, e5-r4 run 2: 0.25 -> 0.14
/// at 53.9 C for a 56 C target; mean 53 C over the run].
pub const EMA_SECS: f64 = 3.0;
/// The duty never rises faster than this per second (heat arrives late).
pub const UP_MAX: f64 = 0.02;
/// Peak more than this over target: cut 0.10 at once (safety path).
pub const FAST_DOWN_AT: f64 = 5.0;
pub const FAST_DOWN: f64 = 0.10;

/// Duty-cycle regulator: a PI controller on Tctl (1 s means, smoothed over
/// ~3 s), with a clamped integral, increases limited to +0.02/s (the heat
/// sink answers tens of seconds late: a faster climb overshoots), and a -0.10
/// safety step when the peak of the second is more than 5 C over target.
///
/// The step law first planned (-0.15/-0.05/+0.02/+0.05 on thresholds) was
/// measured to limit-cycle on the 5950X: at target 56 C and a 1 s period the
/// duty swung 0.10 <-> 0.70 and Tctl 48 <-> 60 C (e5-r3-p1000.tsv, first run).
#[derive(Debug, Clone)]
pub struct Regulator {
    pub target: f64,
    pub min_duty: f64,
    pub d: f64,
    /// Integral state: the duty the controller holds at zero error.
    i: f64,
    /// Smoothed Tctl (None before the first step).
    ema: Option<f64>,
    pub ramp: Option<Ramp>,
}

impl Regulator {
    pub fn new(target: f64, min_duty: f64, ramp_secs: f64) -> Regulator {
        let ramp = (ramp_secs > 0.0).then(|| Ramp { per_s: (1.0 - RAMP_START) / ramp_secs });
        let d = if ramp.is_some() { RAMP_START } else { 1.0 };
        Regulator { target, min_duty, d, i: d, ema: None, ramp }
    }

    /// One step per second: `t_mean` and `t_max` = mean and peak of Tctl over
    /// that second. Returns the new duty.
    ///
    /// Positional PI: `d = i - KP * e`, the integral `i` (the duty held at zero
    /// error) clamped to [min_duty, 1] and frozen while an increase is being
    /// rate-limited (no windup under the limiter). A safety cut restarts the
    /// integral from the cut duty. Far below target the output simply sits at
    /// 1: temperature moves there never cut the duty.
    pub fn step(&mut self, t_mean: f64, t_max: f64) -> f64 {
        let ema = match self.ema {
            Some(x) => x + (t_mean - x) / EMA_SECS,
            None => t_mean,
        };
        self.ema = Some(ema);
        let e = ema - self.target;
        if let Some(r) = &self.ramp {
            if e < -3.0 && t_max < self.target {
                self.d = (self.d + r.per_s).min(1.0);
                if self.d >= 1.0 - 1e-9 {
                    self.d = 1.0;
                    self.ramp = None;
                }
                self.i = self.d;
                return self.d;
            }
            self.ramp = None;
            self.i = self.d;
        }
        if t_max > self.target + FAST_DOWN_AT {
            let d = (self.d - FAST_DOWN).max(self.min_duty);
            self.i = d;
            self.d = d;
            return d;
        }
        let i = (self.i - KI * e).clamp(self.min_duty, 1.0);
        let mut d = (i - KP * e).clamp(self.min_duty, 1.0);
        let mut integrate = true;
        if d > self.d + UP_MAX {
            d = self.d + UP_MAX;
            integrate = e >= 0.0;
        }
        if integrate {
            self.i = i;
        }
        self.d = d;
        d
    }
}

/// Why the guard stops, if it does: at/above `stop`, or the sustained slope
/// projects `hard` within one second (`T + max(0, slope) * 1 s`).
pub fn trip_reason(t: f64, slope_c_per_s: f64, stop: f64, hard: f64) -> Option<String> {
    if t >= stop.min(hard) {
        return Some(format!("{t:.1} C >= stop {:.0} C", stop.min(hard)));
    }
    let proj = t + slope_c_per_s.max(0.0) * 1.0;
    if proj >= hard {
        return Some(format!(
            "{t:.1} C rising {slope_c_per_s:.1} C/s for 2 s: T + slope x 1 s = {proj:.1} >= {hard:.0} C"
        ));
    }
    None
}

/// Sustained slope in C/s over the readings `(secs, C)` (oldest first): the
/// smaller of the slopes over the last second and over the second before.
///
/// Why not the plain slope of the last second: on Zen, Tctl carries a fast
/// component proportional to the power drawn right now. A load step moves it
/// by +17 C (16 threads) to +20 C (8 threads, one CCD) within 0.25-0.5 s and
/// then it saturates [MEASURED 2026-09-28 on the 5950X lab box: 44.4 -> 53.0 ->
/// 61.2 C at 0 / 0.25 / 0.5 s]. Extrapolating that step over one more second
/// predicts 95 C for a machine that settles at 63, and would stop every run
/// started above ~50 C. A step shows up in one of the two seconds only; a real
/// runaway (heat sink saturating) shows up in both. The step itself is bounded
/// by the hard stop, read every `poll_ms`, and by the start-up ramp.
/// Returns 0 until the readings span two seconds.
pub fn sustained_slope(ring: &[(f64, f64)]) -> f64 {
    let Some(&(tn, cn)) = ring.last() else { return 0.0 };
    // Latest reading at least 1 s (resp. 2 s) older than the newest one.
    let at = |age: f64| ring.iter().rev().find(|(t, _)| tn - t >= age - 1e-6).copied();
    let (Some((ta, ca)), Some((tb, cb))) = (at(1.0), at(2.0)) else { return 0.0 };
    if tn - ta <= 0.0 || ta - tb <= 0.0 {
        return 0.0;
    }
    ((cn - ca) / (tn - ta)).min((ca - cb) / (ta - tb))
}

/// The temperature the guard acts on: Tctl, or the hottest die averaged over
/// the last second, whichever is higher.
///
/// Why not the raw die sensors: on the 5950X, Tctl is a filtered signal (it
/// moves by 0.5-2 C within a second even under a 1 s on/off duty cycle),
/// while each Tccd channel swings by 15-30 C within milliseconds on every
/// load edge — Tccd1 read 65 C at the start of a 10 ms burst while Tctl read
/// 50 C and the die averaged 38 C over the second [MEASURED 2026-09-28,
/// e5-r3-p*.tsv, 50 ms sampling]. A stop on the raw peak stops on transients
/// the package never sees; the one-second mean still catches a die that is
/// really hotter than Tctl (steady full load: Tccd +1..3 C over Tctl).
pub fn guard_temp(tctl: f64, die_hist: &[f64]) -> f64 {
    if die_hist.is_empty() {
        return tctl;
    }
    tctl.max(die_hist.iter().sum::<f64>() / die_hist.len() as f64)
}

pub struct Guard;

impl Guard {
    /// First reading synchronously (so `temp_ns` is set before any worker
    /// starts, and a machine already too hot never starts hashing), then the
    /// guard thread.
    pub fn start(sensor: Sensor, cfg: GuardCfg, th: Arc<Thermal>) -> std::thread::JoinHandle<()> {
        if let Some(r) = &cfg.reg {
            th.period_ns.store(r.period_ms.max(1) * 1_000_000, Ordering::Relaxed);
            let d0 = if r.ramp_secs > 0.0 { RAMP_START } else { 1.0 };
            th.duty_milli.store((d0 * 1000.0) as u32, Ordering::Relaxed);
        }
        let first = sensor.read();
        let mut ring: Vec<(f64, f64)> = Vec::new();
        match &first {
            Some(r) => {
                // No history yet: the first reading counts every die at face value.
                let c = r.max_mc() as f64 / 1000.0;
                publish(&th, r, c);
                ring.push((th.t0.elapsed().as_secs_f64(), c));
                if let Some(why) = trip_reason(c, 0.0, cfg.stop_c, cfg.hard_c) {
                    trip(&why, &ring);
                }
            }
            None => exit_once(EXIT_NO_SENSOR, "THERMAL: first sensor reading failed — refusing to start. Exit 5."),
        }
        std::thread::Builder::new()
            .name("tguard".into())
            .spawn(move || guard_loop(sensor, cfg, th, ring))
            .expect("spawn thermal guard")
    }
}

fn trip(why: &str, ring: &[(f64, f64)]) -> ! {
    let last: Vec<String> = ring.iter().rev().take(4).rev().map(|(t, c)| format!("{c:.1}@{t:.2}s")).collect();
    let others = crate::sys::other_miners();
    exit_once(
        EXIT_THERMAL,
        &format!(
            "THERMAL: {why} — stopping now (hard limit {HARD_LIMIT_C:.0} C). Last readings: {}.{} Exit {EXIT_THERMAL}.",
            last.join(" "),
            if others.is_empty() { String::new() } else { format!(" Other miners still running here (left alone): {}.", others.join(" ")) }
        ),
    )
}

const TICK: Duration = Duration::from_millis(50);

/// Sensor cadence while the regulator runs: 20 readings per second, so that
/// a second of readings covers a PWM period evenly. At 250 ms the reading
/// grid is phase-locked to a 1 s period and the mean jumps by 2-3 C whenever
/// the on-phase crosses a reading instant [MEASURED 2026-09-28: a ~10 s limit
/// cycle at duty 0.45-0.5, e5-r3-p1000.tsv, second run].
pub const REG_POLL_MS: u64 = 50;

fn guard_loop(sensor: Sensor, cfg: GuardCfg, th: Arc<Thermal>, mut ring: Vec<(f64, f64)>) {
    let poll_ms = if cfg.reg.is_some() { cfg.poll_ms.min(REG_POLL_MS) } else { cfg.poll_ms };
    let poll = Duration::from_millis(poll_ms);
    let mut reg = cfg.reg.as_ref().map(|r| Regulator::new(r.target_c, r.min_duty, r.ramp_secs));
    let mut win_max = f64::MIN;
    let (mut win_sum, mut win_n) = (0.0f64, 0u32);
    let per_s = ((1000 + poll_ms - 1) / poll_ms) as usize;
    let mut dies: std::collections::VecDeque<f64> = Default::default();
    let mut next_reg = Instant::now() + Duration::from_secs(1);
    let mut logged_d = reg.as_ref().map(|r| r.d).unwrap_or(1.0);
    // Two seconds of readings, plus slack for a late tick.
    let keep = (2 * (1000 + poll_ms - 1) / poll_ms + 3) as usize;
    let started = Instant::now();
    let mut next_poll = started + poll;
    let mut stall = cfg.stall;
    let mut fails = 0u32;
    while !th.quit.load(Ordering::Relaxed) {
        let now = Instant::now();
        if now >= next_poll {
            next_poll += poll;
            if next_poll < now {
                next_poll = now + poll;
            }
            if let Some((at, secs)) = stall {
                if started.elapsed().as_secs_f64() >= at {
                    stall = None;
                    eprintln!("[debug] thermal guard stalling for {secs:.1} s");
                    std::thread::sleep(Duration::from_secs_f64(secs));
                    continue;
                }
            }
            match sensor.read() {
                Some(r) => {
                    fails = 0;
                    let tctl = r.tctl_mc as f64 / 1000.0;
                    if let Some(d) = r.ccd_mc.iter().max() {
                        dies.push_back(*d as f64 / 1000.0);
                        if dies.len() > per_s {
                            dies.pop_front();
                        }
                    }
                    let c = guard_temp(tctl, dies.make_contiguous());
                    publish(&th, &r, c);
                    ring.push((th.t0.elapsed().as_secs_f64(), c));
                    if ring.len() > keep {
                        ring.remove(0);
                    }
                    if let Some(why) = trip_reason(c, sustained_slope(&ring), cfg.stop_c, cfg.hard_c) {
                        trip(&why, &ring);
                    }
                    // The regulator follows Tctl (filtered, what the CPU itself
                    // throttles on); the guard above still covers the dies.
                    win_max = win_max.max(tctl);
                    win_sum += tctl;
                    win_n += 1;
                }
                None => {
                    fails += 1;
                    if fails == 1 {
                        eprintln!("THERMAL: sensor read failed; workers stop hashing after 1 s without a reading, and the process exits after 3 s");
                    }
                }
            }
        }
        if let Some(r) = reg.as_mut() {
            if Instant::now() >= next_reg && win_n > 0 {
                next_reg += Duration::from_secs(1);
                let ramping = r.ramp.is_some();
                let mean = win_sum / win_n as f64;
                let d = r.step(mean, win_max);
                th.duty_milli.store((d * 1000.0).round() as u32, Ordering::Relaxed);
                // Log the ramp second by second, then only real moves.
                if (ramping && (d - logged_d).abs() > 1e-9) || (d - logged_d).abs() >= 0.099 || (d < 1.0 && logged_d >= 1.0) {
                    eprintln!(
                        "THERMAL: {}pwm {:.2} -> {:.2}  (Tctl {mean:.1} C, peak {win_max:.1}, target {:.0} C)",
                        if ramping { "ramp " } else { "" },
                        logged_d,
                        d,
                        r.target
                    );
                    logged_d = d;
                }
                win_max = f64::MIN;
                (win_sum, win_n) = (0.0, 0);
            }
        }
        std::thread::sleep(TICK.min(next_poll.saturating_duration_since(Instant::now())).max(Duration::from_millis(1)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn predictor_stops_when_slope_projects_hard_limit() {
        // Hard stop at/above `stop`.
        assert!(trip_reason(81.0, 0.0, 81.0, 82.0).is_some());
        assert!(trip_reason(80.9, 0.0, 81.0, 82.0).is_none());
        // 78 C rising 4 C/s projects 82 within a second: stop before 81 is read.
        assert!(trip_reason(78.0, 4.0, 81.0, 82.0).is_some());
        assert!(trip_reason(78.0, 3.9, 81.0, 82.0).is_none());
        // A falling temperature never trips the predictor.
        assert!(trip_reason(80.5, -10.0, 81.0, 82.0).is_none());

        // Sustained rise, 4 C/s for 2 s, every 250 ms: 70 -> 78.
        let ramp: Vec<(f64, f64)> = (0..=8).map(|i| (i as f64 * 0.25, 70.0 + i as f64)).collect();
        let s = sustained_slope(&ramp);
        assert!((s - 4.0).abs() < 1e-9, "{s}");
        assert!(trip_reason(78.0, s, 81.0, 82.0).is_some(), "78 C rising 4 C/s for 2 s must stop");

        // Load step as measured on Zen 3 (44 -> 61 C in 0.5 s, then flat at
        // ~62): the step is not a trend and must not trip at 78 either.
        let step = [
            (0.0, 60.0),
            (0.25, 60.0),
            (0.5, 60.0),
            (0.75, 60.0),
            (1.0, 60.0),
            (1.25, 69.0),
            (1.5, 77.0),
            (1.75, 77.5),
            (2.0, 78.0),
        ];
        let s = sustained_slope(&step);
        assert!(s < 1.0, "a saturating step is not a sustained slope: {s}");
        assert!(trip_reason(78.0, s, 81.0, 82.0).is_none());
        // Less than two seconds of history: no slope.
        assert_eq!(sustained_slope(&ramp[..5]), 0.0);
    }

    #[test]
    fn guard_temp_uses_tctl_or_the_die_mean() {
        // A 10 ms burst: one die sample at 65, the rest of the second ~38.
        assert_eq!(guard_temp(50.0, &[65.0, 38.0, 37.0, 36.0]), 50.0);
        // A die that is really hotter than Tctl for the whole second counts.
        assert_eq!(guard_temp(78.0, &[81.0, 81.0, 81.0, 81.0]), 81.0);
        assert_eq!(guard_temp(61.0, &[]), 61.0);
    }

    #[test]
    fn regulator_steps_down_fast_up_slow() {
        let mut r = Regulator::new(74.0, 0.1, 0.0);
        assert_eq!(r.d, 1.0);
        // Peak 6 C over target: the 0.10 safety cut, at once.
        let d = r.step(79.5, 80.0);
        assert!(d <= 0.90 + 1e-9, "{d}");
        // Far under target: it climbs, but never more than 0.02 a second.
        let mut last = r.d;
        for _ in 0..30 {
            let d = r.step(60.0, 60.5);
            assert!(d - last <= UP_MAX + 1e-9, "{last} -> {d}");
            last = d;
        }
        assert!(last > 0.85, "it does climb back");
        // At target: holds.
        let d0 = r.step(74.0, 74.5);
        let d1 = r.step(74.0, 74.5);
        assert!((d1 - d0).abs() < 1e-9);
        // Far below target at full duty, a 3 C jump in a second cuts nothing.
        let mut r = Regulator::new(74.0, 0.1, 0.0);
        for t in [48.0, 48.5, 51.5, 49.0, 52.0] {
            assert_eq!(r.step(t, t + 0.5), 1.0, "at {t} C");
        }
    }

    #[test]
    fn regulator_clamps_to_min_duty() {
        let mut r = Regulator::new(56.0, 0.1, 0.0);
        for _ in 0..60 {
            r.step(70.0, 70.5);
        }
        assert!((r.d - 0.1).abs() < 1e-9);
        for _ in 0..200 {
            r.step(40.0, 40.5);
        }
        assert!((r.d - 1.0).abs() < 1e-9);
    }

    /// Plant shaped on the 5950X at 16 threads: Tctl = 43 C idle, +8 C/duty
    /// within the second (package gradient), +12 C/duty through a 30 s heat
    /// sink. The regulator must settle on target without a limit cycle.
    #[test]
    fn regulator_settles_on_a_first_order_plant() {
        for (target, ramp) in [(56.0, 0.0), (56.0, 10.0), (50.0, 0.0), (60.0, 10.0)] {
            let mut r = Regulator::new(target, 0.1, ramp);
            let mut sink = 0.0f64;
            let mut hist = Vec::new();
            for _ in 0..600 {
                let d = r.d;
                sink += (12.0 * d - sink) / 30.0;
                let t = 43.0 + 8.0 * d + sink;
                r.step(t, t + 0.5);
                hist.push((t, r.d));
            }
            let tail = &hist[480..];
            let (tmin, tmax) = tail.iter().fold((f64::MAX, f64::MIN), |a, (t, _)| (a.0.min(*t), a.1.max(*t)));
            let (dmin, dmax) = tail.iter().fold((f64::MAX, f64::MIN), |a, (_, d)| (a.0.min(*d), a.1.max(*d)));
            assert!(tmax - tmin < 0.5 && (tmin - target).abs() < 0.5, "target {target}: T in [{tmin:.2}, {tmax:.2}]");
            assert!(dmax - dmin < 0.02, "target {target}: duty in [{dmin:.3}, {dmax:.3}]");
        }
    }

    #[test]
    fn ramp_reaches_full_in_ramp_secs() {
        let mut r = Regulator::new(74.0, 0.1, 10.0);
        assert!((r.d - RAMP_START).abs() < 1e-9);
        let mut t = 0;
        while r.d < 1.0 {
            t += 1;
            r.step(50.0, 50.5);
            assert!(t <= 11, "ramp too slow: d = {}", r.d);
        }
        assert_eq!(t, 10);
        assert!(r.ramp.is_none());
        // A ramp that reaches the target hands over to the regulator; a peak
        // 5 C over target is cut at once.
        let mut r = Regulator::new(74.0, 0.1, 10.0);
        r.step(50.0, 50.5);
        let d = r.d;
        r.step(79.5, 80.0);
        assert!(r.ramp.is_none());
        assert!(r.d < d, "over target: the regulator cuts");
    }


    #[test]
    fn sensor_layout_k10temp_fixture() {
        let root = std::env::temp_dir().join(format!("tm-hwmon-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let mk = |dir: &str, files: &[(&str, &str)]| {
            let d = root.join(dir);
            fs::create_dir_all(&d).unwrap();
            for (n, v) in files {
                fs::write(d.join(n), v).unwrap();
            }
        };
        mk("hwmon0", &[("name", "nvme\n"), ("temp1_input", "35000\n")]);
        mk(
            "hwmon1",
            &[
                ("name", "nct6687\n"),
                ("temp1_input", "90000\n"), // board sensor, must be ignored
            ],
        );
        mk(
            "hwmon2",
            &[
                ("name", "k10temp\n"),
                ("temp1_input", "61250\n"),
                ("temp1_label", "Tctl\n"),
                ("temp3_input", "62500\n"),
                ("temp3_label", "Tccd1\n"),
                ("temp4_input", "58000\n"),
                ("temp4_label", "Tccd2\n"),
            ],
        );
        let s = Sensor::detect_in(&root).expect("k10temp found");
        assert_eq!(s.chip, "k10temp");
        assert_eq!(s.tctl.len(), 1);
        assert_eq!(s.ccd.len(), 2);
        let r = s.read().unwrap();
        assert_eq!(r.tctl_mc, 61_250);
        assert_eq!(r.max_mc(), 62_500, "the hottest die counts, not only Tctl");
        // Implausible value: refused.
        fs::write(root.join("hwmon2/temp1_input"), "0\n").unwrap();
        fs::write(root.join("hwmon2/temp3_input"), "0\n").unwrap();
        fs::write(root.join("hwmon2/temp4_input"), "0\n").unwrap();
        assert!(Sensor::detect_in(&root).is_none());
        // No CPU chip at all.
        fs::remove_dir_all(root.join("hwmon2")).unwrap();
        assert!(Sensor::detect_in(&root).is_none());
        let _ = fs::remove_dir_all(&root);
    }
}
