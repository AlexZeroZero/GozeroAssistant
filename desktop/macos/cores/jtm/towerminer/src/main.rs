// SPDX-License-Identifier: Apache-2.0
// Portions derived from jetsam-extminer (Apache-2.0, the Jetsam developers).
//! # towerminer — TowerWalk CPU miner for Jetsam (JTM)
//!
//! Speaks exactly the protocol of `jetsam-extminer` (getBlockTemplate /
//! submitBlock, Bearer key, pool `nonce_prefix` in bits 96..128, a per-process
//! offset in bits 64..96, one second of submit margin), so it runs against a
//! Jetsam node in `--mode extminer` or a compatible pool unchanged. What
//! differs is the engine:
//!
//! - persistent pinned worker threads, each owning its pads in huge pages and
//!   grinding the current job without a per-template rayon pass;
//! - several nonces walked in lockstep per thread (see `walk.rs`);
//! - a profile chosen from the CPU family, the L2 size and the SMT layout the
//!   kernel reports, not a model name;
//! - every solution re-verified by the reference walk before it is submitted,
//!   a sentinel hash re-checked every 4096, a golden self-test at start-up.
//!
//! The thermal-guard build (`--features fleet`, Linux) adds a thermal guard on
//! its own thread (`guard.rs`); the default build has none.
mod gate;
#[cfg(feature = "fleet")]
mod guard;
#[cfg(target_os = "linux")]
mod rapl;
#[cfg(not(target_os = "linux"))]
#[path = "rapl_none.rs"]
mod rapl;
mod relay;
mod status;
mod sys;
mod thermal;
mod walk;

#[cfg(all(feature = "fleet", not(target_os = "linux")))]
compile_error!("the thermal-guard build (--features fleet) reads Linux hwmon sensors: it is Linux only");

use std::collections::BTreeSet;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};
use clap::Parser;
use jetsam_core::Block128;
use jetsam_poseidon2b::batch::FixedFieldNonceBatch;
use jetsam_poseidon2b::native::domain::TAG_POWHDR;
use jetsam_poseidon2b::towerwalk::Scratch;
use serde::{Deserialize, Serialize};
use serde_json::json;

use gate::{FIELDS, NONCE_FIELD};
use status::{exit_once, red};
use thermal::Thermal;
use walk::{walk_dyn, MAX_PADS};

const VERSION: &str = concat!("GozeroJtmCore/", env!("CARGO_PKG_VERSION"), "+gozero-pool.2-mac");
const SUBMIT_MARGIN: Duration = Duration::from_secs(1);
/// HTTP timeout of a block submission. The answer can legitimately take long:
/// a pool may hold the request up to ~10 s (its own retries to the node), and
/// the node up to 30 s, since it finishes its proof before it seals the
/// block. A 5 s timeout with one retry printed "no answer" then "refused" for
/// blocks the pool reported accepted [2026-09-30]. One attempt only: the pool
/// retries on its side, and a duplicate submission is harmful. Through a LAN
/// relay a solution found while the node still proves its template waits for
/// the end of that proof: 49 s measured on the testnet, answered after a
/// 45 s timeout had already counted it "unknown" [2026-09-30]. Each
/// submission has its own thread, so a long wait never holds back mining.
const SUBMIT_TIMEOUT: Duration = Duration::from_secs(120);
/// Submissions in flight at once, each on its own thread: a second block found
/// while the first one waits for its answer goes out at once.
const SUBMIT_MAX_INFLIGHT: usize = 4;
/// Template polls: a worker that makes the pool fetch a fresh template from
/// the node waits for the node's proof (~8 s measured, the node may take up
/// to 30 s), and a short timeout would abandon exactly the request that
/// brings new work.
const POLL_TIMEOUT: Duration = Duration::from_secs(30);
/// --tune: a candidate is `noisy` when other processes kept the targeted CPUs
/// busier than this (fraction), before or during its window.
const TUNE_FOREIGN_MAX: f64 = 0.05;
/// --status-json: one `status` event this often.
const STATUS_EVERY: Duration = Duration::from_secs(5);
const NONCE_REGION_SHIFT: u32 = 96;
const SPONGE_BATCH: usize = 256;
const SENTINEL_EVERY: u64 = 4096;
const EXIT_SELFTEST: i32 = 2;
const EXIT_DIVERGED: i32 = 3;
const EXIT_NO_HUGE: i32 = 4;

/// `--version`: a mutant build (gate self-check) can never pass for a release.
const VERSION_LONG: &str = if walk::MUTANT {
    concat!(env!("CARGO_PKG_VERSION"), "+mutant")
} else if cfg!(feature = "fleet") {
    concat!(env!("CARGO_PKG_VERSION"), "+fleet")
} else {
    env!("CARGO_PKG_VERSION")
};

#[derive(Parser, Debug)]
#[command(name = "towerminer", version = VERSION_LONG, about = "TowerWalk CPU miner for Jetsam (JTM)")]
struct Cli {
    /// Stop when this macOS GUI parent exits; unset for standalone use.
    #[arg(long, value_parser = clap::value_parser!(u32).range(2..=2147483647))]
    parent_pid: Option<u32>,
    /// JSON-RPC endpoint: your Jetsam node (--mode extminer) or a pool.
    #[arg(long, default_value = "http://127.0.0.1:9701", value_name = "URL")]
    rpc: String,
    /// Bearer token: the node's --mining-key, or your pool key.
    #[arg(long, value_name = "TOKEN", env = "TOWERMINER_KEY", hide_env_values = true)]
    key: Option<String>,
    /// Payout address (j1...) for the blocks this miner finds; the node must
    /// run --allow-custom-coinbase. Empty = the node's own payout.
    #[arg(long, default_value = "", value_name = "ADDRESS")]
    coinbase: String,
    /// CPUs this miner may use (e.g. 0-11,24-35). Default: the process affinity.
    #[arg(long, value_name = "LIST")]
    cpus: Option<String>,
    /// Name sent to the node or pool in the X-Jetsam-Host header, for
    /// per-machine statistics (printable ASCII, 32 characters at most).
    /// Default: no name is sent; the hostname is never transmitted.
    #[arg(long, value_name = "NAME")]
    worker_name: Option<String>,
    /// CPUs to leave alone (removed from --cpus / the affinity).
    #[arg(long, value_name = "LIST")]
    exclude_cpus: Option<String>,
    /// Worker threads per physical core: 1 or 2. Default from the profile.
    #[arg(long)]
    threads_per_core: Option<usize>,
    /// Logical CPUs to use, whole cores first (both SMT siblings of a core,
    /// then the next core); the profile (threads per core, pads) applies
    /// inside them. Default: every allowed CPU.
    #[arg(long, value_name = "N")]
    threads: Option<usize>,
    /// Nonces walked together per thread, 1..=4. Default from the profile.
    #[arg(long)]
    pads: Option<usize>,
    /// Software prefetch of the next address: 0 or 1. Default from the profile.
    #[arg(long)]
    prefetch: Option<u8>,
    /// Walk kernel: base (v0.1) or fast (measured levers: byte-offset
    /// addressing + one-add fill at 1 pad, grouped fold at >= 2 pads).
    /// auto = fast.
    #[arg(long, value_enum, default_value_t = KernelArg::Auto)]
    kernel: KernelArg,
    /// Seeds hashed per sponge call (the 8-leaf AVX2 sponge needs >= 8).
    /// Default: 8 at 1 pad, else = pads.
    #[arg(long, value_parser = clap::value_parser!(u16).range(1..=64))]
    seed_batch: Option<u16>,
    /// Pipelined fill anchors (1 pad, fast kernel, with or without
    /// --prefetch): the next seed's 16 fill folds ride in the free lane of
    /// the current seed's walk folds. auto = on at 1 pad with the fast kernel.
    #[arg(long, value_enum, default_value_t = PipeArg::Auto)]
    pipe: PipeArg,
    /// Use 4 KiB pages instead of huge pages (diagnostic).
    #[arg(long)]
    no_huge: bool,
    /// Exit 4 unless every worker's pads really sit in huge pages (2 MiB THP
    /// on Linux, checked per worker in /proc/self/smaps; large pages on
    /// Windows). Default: a warning, and " 4K!" in the CPU line the pool shows.
    #[arg(long, conflicts_with = "no_huge")]
    require_huge: bool,
    /// Milliseconds between template polls.
    /// 250 ms: after a new block the pool answers from its cache, so polling
    /// faster halves the work spent on a dead parent for almost no cost.
    #[arg(long, default_value_t = 250)]
    poll_ms: u64,
    #[cfg(feature = "fleet")]
    #[command(flatten)]
    guard: GuardArgs,
    /// Print a progress line every N seconds (mining default 15; bench: off).
    #[arg(long, value_name = "SECONDS")]
    report_secs: Option<u64>,
    /// Measure the walk rate for N seconds with the chosen profile and exit.
    #[arg(long, value_name = "SECONDS")]
    bench_walk: Option<u64>,
    /// Measure the candidate profiles on THIS machine (N seconds each, two
    /// alternating rounds), keep the fastest, and remember it for later runs.
    #[arg(long, value_name = "SECONDS")]
    tune: Option<u64>,
    /// Where --tune stores its result (default ~/.config/towerminer/tune.json
    /// on Linux, %APPDATA%\towerminer\tune.json on Windows).
    #[arg(long, value_name = "FILE")]
    tune_file: Option<String>,
    /// --tune: store the result even when a candidate was measured on noisy
    /// CPUs (other processes kept the targeted CPUs, SMT siblings included,
    /// more than 5 % busy).
    #[arg(long)]
    tune_force: bool,
    /// Ignore a stored --tune result and use the built-in table.
    #[arg(long)]
    no_tune_file: bool,
    /// Which profile to load: the fastest (hashrate) or the most hashes per
    /// joule (efficiency), from the --tune file or the built-in table.
    #[arg(long, value_enum, default_value_t = Policy::Hashrate)]
    policy: Policy,
    /// --tune: kernels to try on every shape (comma list: fast, base).
    #[arg(long, value_enum, value_delimiter = ',', default_value = "fast")]
    tune_kernels: Vec<KernelArg>,
    /// --bench-walk: seconds of idle package power measured before the
    /// workers start (0 = skip; the marginal H/J needs it; Linux RAPL only).
    #[arg(long, default_value_t = 3)]
    idle_secs: u64,
    /// Run the full bit-exact gate (all kernel shapes) and exit 0/1.
    #[arg(long)]
    gate: bool,
    /// Check this machine (CPU backend, caches, huge pages, CPU quota) and
    /// exit 0 (ready) or 1.
    #[arg(long)]
    check_hardware: bool,
    /// Random seeds added to --gate on top of the 256 golden vectors.
    #[arg(long, default_value_t = 1000)]
    gate_random: usize,
    /// Nonce-accounting gate: mine a permissive dummy target for N seconds
    /// with the chosen profile; every solution is recomputed from its nonce
    /// through the real seed path and the reference walk; duplicates and
    /// nonces outside the region are counted. Exit 0/1.
    #[arg(long, value_name = "SECONDS")]
    check_nonces: Option<u64>,
    /// Machine-readable events on stdout, one JSON object per line: profile
    /// at start, status every 5 s, block for every submitted solution, error
    /// before a fatal exit. The human log stays on stderr.
    #[arg(long)]
    status_json: bool,
    /// Process priority. low (default): nice 19 on Linux, below normal on
    /// Windows, so a Jetsam node on the same machine gets the CPU first for
    /// its logbook proof; hashing loses nothing measurable. normal: leave the
    /// priority as it is (a machine that only mines).
    #[arg(long, value_enum, default_value_t = Priority::Low)]
    priority: Priority,
    /// Run the LAN relay instead of mining, on this machine's address on your
    /// local network (e.g. 192.168.0.10:9702): the node on this machine does
    /// the logbook proof, the other machines of the network mine through the
    /// relay with --rpc http://IP:PORT --key <LAN key>. --rpc/--key are then
    /// the node's own endpoint and mining key. Only private, link-local and
    /// loopback addresses, for the relay and for its clients.
    #[arg(long, value_name = "IP:PORT", conflicts_with_all = ["gate", "tune", "bench_walk", "check_nonces", "check_hardware", "coinbase"])]
    serve: Option<String>,
    /// --serve: the key your mining machines present (their --key); at least
    /// 16 characters, never the node's mining key.
    #[arg(long, value_name = "KEY", env = "TOWERMINER_LAN_KEY", hide_env_values = true)]
    lan_key: Option<String>,
    /// --serve, RISKY: also listen on a public address and serve clients
    /// outside your local network. The relay speaks plain HTTP: the LAN key
    /// travels in clear and anyone who reads it can mine on your node.
    #[arg(long, requires = "serve")]
    allow_public: bool,
}

/// Thermal-guard options (thermal-guard build only).
#[cfg(feature = "fleet")]
#[derive(clap::Args, Debug)]
struct GuardArgs {
    /// Hard thermal stop (C): exit 82 when max(Tctl, Tccd*) reaches it, or
    /// earlier when the last second's slope projects 82 C within one second.
    /// Cannot be raised above 82.
    #[arg(long, default_value_t = 81.0, value_parser = parse_temp_stop)]
    temp_stop: f64,
    /// Target temperature (C) of the duty-cycle regulator. Default
    /// min(74, stop - 5); must be <= stop - 5.
    #[arg(long)]
    temp_target: Option<f64>,
    /// Milliseconds between two sensor readings of the thermal guard (50 ms
    /// while the duty-cycle regulator runs).
    #[arg(long, default_value_t = 250, value_parser = clap::value_parser!(u64).range(100..=500))]
    temp_poll_ms: u64,
    /// Run without any temperature sensor (no thermal guard at all). Every
    /// report then says so in red.
    #[arg(long)]
    no_thermal_guard: bool,
    /// Period of the duty-cycle gate (ms). All workers hash during the first
    /// `duty x period` and sleep the rest, in phase.
    #[arg(long, default_value_t = guard::DEFAULT_PWM_MS, value_parser = clap::value_parser!(u64).range(10..=2000))]
    pwm_period_ms: u64,
    /// Floor of the duty cycle (0.05..1).
    #[arg(long, default_value_t = 0.10)]
    min_duty: f64,
    /// Start-up ramp (mining only): the duty climbs from 0.3 to 1 over this
    /// many seconds while the machine is well below target (0 = no ramp).
    #[arg(long, default_value_t = 10.0)]
    ramp_secs: f64,
    /// --bench-walk: run the duty-cycle regulator as when mining (off by
    /// default: a bench measures the kernel, not the cooler).
    #[arg(long)]
    bench_regulate: bool,
    /// DEPRECATED, ignored: replaced by --temp-target (duty-cycle regulator).
    #[arg(long, hide = true)]
    temp_pause: Option<f64>,
    /// DEPRECATED, ignored: replaced by --temp-target.
    #[arg(long, hide = true)]
    temp_resume: Option<f64>,
    /// Test hook: the thermal guard sleeps S seconds once, 5 s after start.
    #[arg(long, hide = true, value_name = "S")]
    debug_guard_stall: Option<f64>,
    /// Test hook: the limit the slope predictor projects against (<= 82).
    #[arg(long, hide = true, value_name = "C", value_parser = parse_temp_stop)]
    debug_temp_hard: Option<f64>,
    /// Test hook: behave as if no temperature sensor existed.
    #[arg(long, hide = true)]
    debug_no_sensor: bool,
    /// --tune: cool below this temperature (C) before each candidate.
    #[arg(long, default_value_t = 60.0)]
    tune_cool: f64,
}

#[derive(clap::ValueEnum, Clone, Copy, Debug, PartialEq, Eq)]
enum KernelArg {
    Auto,
    Base,
    Fast,
}

#[derive(clap::ValueEnum, Clone, Copy, Debug, PartialEq, Eq)]
enum PipeArg {
    Auto,
    #[value(name = "0")]
    Off,
    #[value(name = "1")]
    On,
}

#[cfg(feature = "fleet")]
fn parse_temp_stop(s: &str) -> std::result::Result<f64, String> {
    let v: f64 = s.parse().map_err(|e| format!("{e}"))?;
    if !(40.0..=thermal::HARD_LIMIT_C).contains(&v) {
        return Err(format!("must be within 40..={} C (hard limit)", thermal::HARD_LIMIT_C));
    }
    Ok(v)
}

#[cfg(feature = "fleet")]
impl GuardArgs {
    /// Regulator target: explicit, else min(74, stop - 5).
    fn temp_target(&self) -> f64 {
        self.temp_target.unwrap_or_else(|| (self.temp_stop - 5.0).min(74.0))
    }
}

/// Cross-field checks clap cannot express.
fn validate(cli: &Cli) -> Result<()> {
    if cli.threads == Some(0) {
        return Err(anyhow!("--threads must be at least 1"));
    }
    #[cfg(feature = "fleet")]
    {
        let g = &cli.guard;
        if !(0.05..=1.0).contains(&g.min_duty) {
            return Err(anyhow!("--min-duty must be within 0.05..=1"));
        }
        if !(0.0..=600.0).contains(&g.ramp_secs) {
            return Err(anyhow!("--ramp-secs must be within 0..=600"));
        }
        if let Some(t) = g.temp_target {
            if t > g.temp_stop - 5.0 {
                return Err(anyhow!("--temp-target {t} must be <= --temp-stop - 5 ({})", g.temp_stop - 5.0));
            }
            if t < 30.0 {
                return Err(anyhow!("--temp-target {t} is below 30 C"));
            }
        }
    }
    Ok(())
}

/// Regulator target of the thermal-guard build (a --tune candidate that ran
/// hotter is disqualified); none without a guard.
fn reg_target(_cli: &Cli) -> Option<f64> {
    #[cfg(feature = "fleet")]
    {
        Some(_cli.guard.temp_target())
    }
    #[cfg(not(feature = "fleet"))]
    {
        None
    }
}

/// --tune: cool below this before each candidate (thermal-guard build).
fn tune_cool(_cli: &Cli) -> Option<f64> {
    #[cfg(feature = "fleet")]
    {
        Some(_cli.guard.tune_cool)
    }
    #[cfg(not(feature = "fleet"))]
    {
        None
    }
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

struct Profile {
    cpus: Vec<usize>,
    pads: usize,
    prefetch: bool,
    huge: bool,
    l2_kib: usize,
    l3_kib: usize,
    per_core: usize,
    /// walk::K_BASE or walk::K_FAST.
    kernel: u8,
    /// Seeds per sponge call (ring size; a multiple of pads unless piped).
    seed_batch: usize,
    pipe: bool,
    policy: Policy,
    /// Where the (threads/core, pads, prefetch) triple came from.
    source: String,
    tune_key: String,
    /// CPU quota of this process (Linux cgroup), if any.
    quota: Option<sys::Quota>,
    /// Workers the profile would run without the quota.
    uncapped: usize,
}

/// A profile shape: threads per core, pads per thread, prefetch, kernel.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Shape {
    tpc: usize,
    pads: usize,
    pf: bool,
    kernel: u8,
}

impl Shape {
    const fn new(tpc: usize, pads: usize, pf: bool, kernel: u8) -> Shape {
        Shape { tpc, pads, pf, kernel }
    }
    fn label(&self) -> String {
        format!("{}x{}x{} {}", self.tpc, self.pads, self.pf as u8, walk::kernel_name(self.kernel))
    }
}

/// Built-in table, per CPU family, for each policy. `solo`: the workers will
/// run one per physical core (no SMT sibling in the CPU set, or a CPU quota
/// that allows no more workers than there are cores).
///
/// AMD rows (family from cpuid, as Linux prints `cpu family`):
///
/// v0.1 shapes [MEASURED 2026-09-26, whole machine, vs the node's own search
/// path on the same CPUs]: EPYC 7742 (Zen 2, family 23) 2/core, 2 pads,
/// prefetch +24 %; 5950X (Zen 3, 25, L2 512K) 1/core, 1 pad +35 %; 7950X3D and
/// 7900X (Zen 4, L2 1M) 1/core, 2 pads +42 %; 9950X3D (Zen 5, 26) 1/core,
/// 2 pads +28 % (one CCD, thermally capped). Zen 2 and Zen 3 share the L2 size
/// and still want opposite settings, so the family decides, not the cache
/// size. Anything unknown gets the node's own shape (both SMT siblings, one
/// pad) plus huge pages.
///
/// v0.2 adds the fast kernel everywhere [MEASURED on Zen 3 only, 2026-09-28:
/// +6.6 % at 1x1 (pipe + ring 8), +3.8 % at 2x2 prefetch (grouped fold); on
/// Zen 2/4/5 DERIVED from the same mechanism — `--tune` on the machine can
/// contradict it] and an efficiency shape: on the 5950X the L3 regime
/// 2 threads/core x 2 pads + prefetch gives 96.8 % of the rate for 84 % of
/// the power (142.8 vs 124.7 H/J, -5 C) [MEASURED]. Elsewhere the efficiency
/// shape is the rate shape until `--tune` has measured better.
///
/// v0.2.2 [MEASURED 2026-09-30, fast kernel]:
/// - Zen 4 (7950X3D, 8 cores of CCD1): 2x1x0 = 15.15 / 15.33 kH/s on the
///   bench and 15.26-15.31 kH/s mining, vs 1x2x0 (the v0.1 row) = 13.84
///   (13.86 mining): 2 threads/core x 1 pad, +10 %. Zen 5 (family 26, 1 MiB
///   L2) follows Zen 4 [DERIVED, not measured on Zen 5].
/// - Zen 2 (2x EPYC 7742, 112 cores, under a foreign load, so noisy, but
///   the same sign in both passes): 2x1x1 = 56.8 / 57.7 kH/s vs 2x2x1 (the
///   v0.1 row) = 54.0 / 52.8: 1 pad instead of 2, +7 %.
///
/// Intel rows (family 6) [MEASURED 2026-09-30, v0.2.2 binary, fast kernel,
/// `--tune 10` (two passes, H/s of each shape) on 13 rented machines].
/// Most of them ran under a CPU quota far below their CPU count (cpu.max
/// 3.84 of 16 CPUs, 13.4 of 112...): there a 1-thread-per-core shape gets a
/// whole core per CPU-second of quota, which flatters it against 2 threads
/// per core, so the rows below rest first on the machines without a quota or
/// nearly full: i7-8700K (11.5 of 12 CPUs), i7-11700F (5.76 of 6), Core
/// Ultra 9 285K and Xeon Gold 6430 (no cgroup limit). Since v0.3 a quota
/// caps the workers at ceil(quota) and spreads them one per core, which is
/// exactly the `solo` situation those quota runs measured.
/// - `solo` -> 1x2x1. Ultra 9 285K (no SMT, L2 3 MiB, no quota): 1 pad
///   9.53 / 9.48 / 9.63 kH/s, 2 pads 12.43 / 12.43 / 12.41, 2 pads +
///   prefetch 14.32 / 14.36 / 14.37: +51 %. Gold 6430 VM (128 vCPUs shown
///   without SMT, no quota, 20-30 % steal): 1 pad 15.70-15.94, 2 pads
///   16.19-17.32 (+8 %), prefetch neutral. At one thread per core on the
///   8700K: 1x2x1 4.28 vs 1x1x0 3.93 (+9 %; 1x2x0 4.86); on the 11700F:
///   1x2x1 2.37 / 2.17 vs 1x1x0 2.40 / 2.22 (-2 %). Quota runs at one thread
///   per core, 1x2x1 vs 1x1x0: i7-12700 5.23 / 5.06 vs 3.72 / 3.24,
///   Gold 6330 4.52 / 4.54 vs 3.46 / 3.37, E5-2670 7.31 / 7.31 vs
///   5.35 / 5.34, E5-2620 v3 2.76 / 2.27 vs 1.91 / 1.75, Gold 5115
///   2.08 / 2.03 vs 1.63 / 1.32, i7-13700 4.53 / 4.69 vs 3.29 / 3.45
///   (+19..+45 %); 1x2x1 was the stored best of every one of these tunes.
/// - SMT, L2 < 2 MiB -> 2x1x0 (the node shape, unchanged). i7-8700K (L2
///   256K): 2x1x0 4.95 / 4.95 kH/s, best of 8 shapes (1x2x0 4.86, 2x2x1
///   4.74, 2x1x1 4.53); i7-11700F (L2 512K): 2x1x0 3.22 / 3.22 = 2x1x1
///   3.50 / 2.97, 2x2x1 3.25 / 3.13, every 1x shape <= 2.40. Quota runs agree
///   among the 2-per-core shapes at L2 1.25 MiB: i7-12700 2x1x0 3.46 / 3.40
///   vs 2x2x0 2.21 / 2.23; Gold 6330 2.40 / 2.44 vs 1.98 / 2.00.
/// - SMT, L2 >= 2 MiB (Raptor Cove, Sapphire Rapids) -> 2x2x1: four pads
///   (2 MiB) per core fit the L2. Gold 6430 VM (the host's SMT under the
///   vCPUs, no quota): 2 pads per vCPU 17.12-17.32 vs 1 pad 15.42-15.94
///   (+8 %); i7-13700 (quota 3.84 of 16, noisy), among 2-per-core shapes:
///   2x2x1 3.56 / 3.42 vs 2x1x0 2.89 / 3.02 (+18 %) [DERIVED: no machine
///   without quota and with visible SMT at L2 >= 2 MiB was measured].
fn table(intel: bool, family: u32, l2_kib: usize, solo: bool, policy: Policy) -> (Shape, &'static str) {
    const F: u8 = walk::K_FAST;
    match (family, policy) {
        (6, _) if intel && solo => (Shape::new(1, 2, true, F), "table: Intel, one thread per core"),
        (6, _) if intel && l2_kib >= 2048 => (Shape::new(2, 2, true, F), "table: Intel, L2 >= 2 MiB"),
        (6, _) if intel => (Shape::new(2, 1, false, F), "table: Intel"),
        (23, _) => (Shape::new(2, 1, true, F), "table: Zen 2"),
        (25, Policy::Hashrate) if l2_kib < 1024 => (Shape::new(1, 1, false, F), "table: Zen 3"),
        (25, Policy::Efficiency) if l2_kib < 1024 => (Shape::new(2, 2, true, F), "table: Zen 3, efficiency"),
        (25 | 26, _) if l2_kib >= 1024 => (Shape::new(2, 1, false, F), "table: Zen 4/5"),
        _ => (Shape::new(2, 1, false, F), "table: unknown CPU, node shape + huge pages"),
    }
}

#[derive(clap::ValueEnum, Clone, Copy, Debug, PartialEq, Eq)]
enum Priority {
    Low,
    Normal,
}

#[derive(Debug, PartialEq, Eq)]
enum PriorityAction {
    Keep,
    Lower,
}

/// What --priority does, given whether the process already runs at or below
/// the low level. Never raises a priority: `low` only lowers, `normal` never
/// touches it.
fn priority_action(want: Priority, at_or_below_low: bool) -> PriorityAction {
    match want {
        Priority::Low if !at_or_below_low => PriorityAction::Lower,
        _ => PriorityAction::Keep,
    }
}

/// Apply --priority to the whole process. Called first thing in `main`,
/// before any thread exists: on Linux the nice value is per thread and a new
/// thread inherits its creator's. A refusal is not fatal.
fn apply_priority(want: Priority) {
    match (want, priority_action(want, sys::priority_at_or_below_low())) {
        (Priority::Normal, _) => eprintln!("priority: normal"),
        (_, PriorityAction::Keep) => eprintln!("priority: {} (already)", sys::LOW_PRIORITY_LABEL),
        (_, PriorityAction::Lower) => match sys::set_low_priority() {
            Ok(()) => eprintln!("priority: {}", sys::LOW_PRIORITY_LABEL),
            Err(e) => eprintln!("priority: unchanged (lowering refused: {e})"),
        },
    }
}

#[derive(clap::ValueEnum, Clone, Copy, Debug, PartialEq, Eq)]
enum Policy {
    /// Highest rate (the profile the table or --tune measured fastest).
    Hashrate,
    /// Most hashes per joule (the profile --tune measured most efficient).
    Efficiency,
}

fn tune_path(cli: &Cli) -> std::path::PathBuf {
    if let Some(p) = &cli.tune_file {
        return p.into();
    }
    sys::config_dir().join("tune.json")
}

fn allowed_set(cli: &Cli) -> Result<BTreeSet<usize>> {
    let mut allowed: BTreeSet<usize> = match &cli.cpus {
        Some(l) => {
            let want = sys::parse_list(l);
            let aff = sys::allowed_cpus();
            let outside: Vec<String> = want.difference(&aff).map(|c| c.to_string()).collect();
            if !outside.is_empty() {
                static ONCE: std::sync::Once = std::sync::Once::new();
                ONCE.call_once(|| {
                    eprintln!(
                        "warning: --cpus asks for CPUs outside this process's affinity (cpuset/taskset), left out: {}",
                        outside.join(",")
                    )
                });
            }
            want.intersection(&aff).copied().collect()
        }
        None => sys::allowed_cpus(),
    };
    if let Some(ex) = &cli.exclude_cpus {
        for c in sys::parse_list(ex) {
            allowed.remove(&c);
        }
    }
    if allowed.is_empty() {
        return Err(anyhow!("no CPU left to mine on (check --cpus / --exclude-cpus)"));
    }
    Ok(allowed)
}

/// The CPU set the workers may use: the allowed set, cut to `--threads N`
/// logical CPUs (whole cores first).
fn cpu_set(cli: &Cli) -> Result<(BTreeSet<usize>, sys::Topology)> {
    let allowed = allowed_set(cli)?;
    let topo = sys::Topology::detect(&allowed);
    match cli.threads {
        Some(n) if n < allowed.len() => {
            let set = sys::take_logical(&topo.cores, n.max(1));
            let topo = sys::Topology::detect(&set);
            Ok((set, topo))
        }
        _ => Ok((allowed, topo)),
    }
}

/// Key of a stored --tune result: same binary (sha256), same CPU model, same
/// CPU set, same CPU quota, same page mode. Anything else and the numbers are
/// someone else's.
fn tune_key_of(set: &BTreeSet<usize>, cap: Option<usize>) -> String {
    let cpu_list: Vec<String> = set.iter().map(|c| c.to_string()).collect();
    format!(
        "{VERSION}|{}|{}|quota={}|{}|sha={}",
        sys::cpuid().brand,
        cpu_list.join(","),
        cap.map(|c| c.to_string()).unwrap_or_else(|| "-".into()),
        sys::page_env(),
        sys::self_sha256()
    )
}

fn shape_of(v: &serde_json::Value) -> Option<Shape> {
    Some(Shape {
        tpc: v["tpc"].as_u64()? as usize,
        pads: v["pads"].as_u64()? as usize,
        pf: v["pf"].as_bool()?,
        kernel: if v["kernel"].as_str()? == "base" { walk::K_BASE } else { walk::K_FAST },
    })
}

/// Build a profile. Precedence: explicit flags > stored --tune result for this
/// exact binary + CPU model + CPU set + quota + page mode (best rate or best
/// H/J per --policy) > built-in table. A CPU quota caps the workers at
/// ceil(quota / period), whatever the profile.
fn profile_with(cli: &Cli, over: Option<Shape>) -> Result<Profile> {
    let (set, topo) = cpu_set(cli)?;
    let id = sys::cpuid();
    let quota = sys::cpu_quota();
    let cap = quota.as_ref().map(|q| q.max_workers());
    let solo = !topo.smt() || cap.is_some_and(|c| c <= topo.cores.len());
    let tune_key = tune_key_of(&set, cap);
    let (mut sh, src) = table(id.intel(), id.family, topo.l2_kib, solo, cli.policy);
    let mut source = src.to_string();
    if let Some(o) = over {
        sh = o;
        source = "tune candidate".into();
    } else if !cli.no_tune_file {
        if let Ok(txt) = std::fs::read_to_string(tune_path(cli)) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&txt) {
                let which = if cli.policy == Policy::Efficiency { "best_hpj" } else { "best_hps" };
                if v["key"].as_str() == Some(tune_key.as_str()) {
                    if let Some(t) = shape_of(&v[which]) {
                        sh = t;
                        source = format!(
                            "tune file ({which}: {:.0} H/s, {} H/J, measured {})",
                            v[which]["hps"].as_f64().unwrap_or(0.0),
                            v[which]["hpj"].as_f64().map(|x| format!("{x:.1}")).unwrap_or_else(|| "n/a".into()),
                            v["measured_utc"].as_str().unwrap_or("?")
                        );
                    }
                } else if v["key"].is_string() {
                    eprintln!(
                        "note: {} was measured for another binary, CPU set, quota or page mode; using the built-in \
                         table (run --tune again)",
                        tune_path(cli).display()
                    );
                }
            }
        }
    }
    if cli.threads_per_core.is_some() || cli.pads.is_some() || cli.prefetch.is_some() || cli.kernel != KernelArg::Auto {
        source = "command line".into();
    }
    // Never more per core than the set has CPUs per core (no SMT, or SMT
    // hidden by a VM): the label then says what really runs.
    let smt_width = topo.cores.iter().map(|c| c.len()).max().unwrap_or(1).max(1);
    let per_core = cli.threads_per_core.unwrap_or(sh.tpc).clamp(1, 2).min(smt_width);
    let pads = cli.pads.unwrap_or(sh.pads);
    if !(1..=MAX_PADS).contains(&pads) {
        return Err(anyhow!("--pads must be 1..={MAX_PADS}"));
    }
    let prefetch = cli.prefetch.map(|v| v != 0).unwrap_or(sh.pf);
    // Order: first sibling of every core, then second siblings — so a quota
    // cap fills physical cores before it doubles up on one.
    let mut cpus = Vec::new();
    for rank in 0..per_core {
        for core in &topo.cores {
            if let Some(&c) = core.get(rank) {
                cpus.push(c);
            }
        }
    }
    let uncapped = cpus.len();
    if let Some(c) = cap {
        cpus.truncate(c);
    }
    let kernel = match cli.kernel {
        KernelArg::Base => walk::K_BASE,
        KernelArg::Fast => walk::K_FAST,
        KernelArg::Auto => sh.kernel,
    };
    // The piped walk carries the prefetch flag itself (walk_pipe::<PF>).
    let pipe = match cli.pipe {
        PipeArg::Off => false,
        PipeArg::Auto => pads == 1 && kernel == walk::K_FAST,
        PipeArg::On => {
            if pads != 1 || kernel != walk::K_FAST {
                return Err(anyhow!("--pipe 1 needs --pads 1 and the fast kernel"));
            }
            true
        }
    };
    let seed_batch = cli.seed_batch.map(|v| v as usize).unwrap_or(if pads == 1 { 8 } else { pads });
    Ok(Profile {
        cpus,
        pads,
        prefetch,
        huge: !cli.no_huge,
        l2_kib: topo.l2_kib,
        l3_kib: topo.l3_kib,
        per_core,
        kernel,
        seed_batch,
        pipe,
        policy: cli.policy,
        source,
        tune_key,
        quota,
        uncapped,
    })
}

fn profile(cli: &Cli) -> Result<Profile> {
    profile_with(cli, None)
}

impl Profile {
    /// Seeds per sponge call: a multiple of the pads, or (piped) at least 2
    /// so that the successor of every seed but the last is in the same ring.
    fn ring_len(&self) -> usize {
        if self.pipe {
            self.seed_batch.max(2)
        } else {
            self.seed_batch.max(self.pads).div_ceil(self.pads) * self.pads
        }
    }
}

// ---------------------------------------------------------------------------
// Shared state between the network thread and the workers
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct Job {
    epoch: u64,
    template_id: String,
    height: u64,
    fields: [Block128; FIELDS],
    target: [u8; 32],
    walk: bool,
    /// Nonce every worker offsets from: region prefix | process offset.
    base: u128,
}

struct Shared {
    job: RwLock<Option<Arc<Job>>>,
    /// Workers grind only while now < deadline (nanos since `t0`).
    deadline_ns: AtomicU64,
    t0: Instant,
    stop: AtomicBool,
    hashed: AtomicU64,
    busy_ns: AtomicU64,
    /// Published by the thermal guard; checked by every worker every batch.
    th: Arc<Thermal>,
    /// Per worker, after its pads are mapped: see `HUGE_*`.
    huge: Vec<AtomicU8>,
    /// Epoch of the last accepted solution (0 = none): the poller idles on
    /// the same content until the tip moves.
    solved_epoch: AtomicU64,
    found: AtomicU64,
    /// Submissions the pool/node answered yes to.
    accepted: AtomicU64,
    /// Submissions answered no (stale, busy, refused).
    refused: AtomicU64,
    /// Submissions without an answer (transport error, timeout): the block
    /// may or may not have been accepted, so they count as neither.
    unknown: AtomicU64,
    /// Submissions waiting for their answer.
    inflight: AtomicUsize,
}

const HUGE_PENDING: u8 = 0;
const HUGE_OK: u8 = 1;
const HUGE_NO: u8 = 2;
const HUGE_UNKNOWN: u8 = 3;

impl Shared {
    fn new(job: Option<Arc<Job>>, deadline_ns: u64, th: Arc<Thermal>, workers: usize) -> Shared {
        Shared {
            job: RwLock::new(job),
            deadline_ns: AtomicU64::new(deadline_ns),
            t0: Instant::now(),
            stop: AtomicBool::new(false),
            hashed: AtomicU64::new(0),
            busy_ns: AtomicU64::new(0),
            th,
            huge: (0..workers).map(|_| AtomicU8::new(HUGE_PENDING)).collect(),
            solved_epoch: AtomicU64::new(0),
            found: AtomicU64::new(0),
            accepted: AtomicU64::new(0),
            refused: AtomicU64::new(0),
            unknown: AtomicU64::new(0),
            inflight: AtomicUsize::new(0),
        }
    }

    /// Wait (up to `timeout`) for every worker to report its pages; returns
    /// (in huge pages, reported, workers).
    fn huge_status(&self, timeout: Duration) -> (usize, usize, usize) {
        let t = Instant::now();
        loop {
            let st: Vec<u8> = self.huge.iter().map(|a| a.load(Ordering::Acquire)).collect();
            let done = st.iter().filter(|&&s| s != HUGE_PENDING).count();
            if done == st.len() || t.elapsed() >= timeout {
                return (st.iter().filter(|&&s| s == HUGE_OK).count(), done, st.len());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    fn now_ns(&self) -> u64 {
        self.t0.elapsed().as_nanos() as u64
    }
}

struct Found {
    epoch: u64,
    template_id: String,
    height: u64,
    nonce: u128,
    digest: [u8; 32],
    t_found: Instant,
}

#[inline]
fn le256_lt(a: &[u8; 32], b: &[u8; 32]) -> bool {
    for i in (0..32).rev() {
        if a[i] != b[i] {
            return a[i] < b[i];
        }
    }
    false
}

fn diverged(what: &str) -> ! {
    exit_once(
        EXIT_DIVERGED,
        &format!("FATAL: kernel diverged from the reference walk ({what}). Not submitting; exiting {EXIT_DIVERGED}."),
    )
}

/// Nonce layout: `base` (pool region 96..128 | process offset 64..96) |
/// worker id 52..64 | counter 0..52. 2^52 nonces per worker per job (about
/// 10^11 years at 1 kH/s); ids alias beyond 4096 workers.
#[inline]
fn nonce_at(base: u128, id: usize, counter: u128) -> u128 {
    debug_assert!(id < 4096);
    base | ((id as u128 & 0xFFF) << 52) | (counter & ((1u128 << 52) - 1))
}

fn worker(id: usize, cpu: usize, prof: &Profile, sh: &Shared, tx: mpsc::Sender<Found>) {
    if let Err(e) = sys::pin_current(cpu) {
        // Once per process: an unpinned worker still hashes right, but the
        // profile's per-core layout (and NUMA placement) no longer holds.
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            eprintln!("{}", red(&format!("WARNING: cannot pin worker {id} to CPU {cpu} ({e}); workers that fail to pin run unpinned")))
        });
    }
    let region = match sys::Region::new(prof.pads, prof.huge) {
        Ok(r) => r,
        Err(e) => exit_once(1, &format!("fatal: worker {id}: cannot map its scratchpad region: {e}")),
    };
    let state = match region.huge_kb() {
        None => HUGE_UNKNOWN,
        Some(kb) if prof.huge && kb >= region.expected_huge_kb() => HUGE_OK,
        Some(_) => HUGE_NO,
    };
    sh.huge[id].store(state, Ordering::Release);
    let p = prof.pads;
    let mut oracle_pad = Scratch::new();
    let mut seeds = [[0u8; 32]; SPONGE_BATCH];
    let mut outs = [[0u8; 32]; MAX_PADS];
    let mut cur: Option<Arc<Job>> = None;
    let mut hasher: Option<FixedFieldNonceBatch> = None;
    let mut counter: u128 = 0;
    let mut since_sentinel: u64 = 0;
    // Seed ring: `ring_n` seeds per sponge call (the 8-leaf AVX2 sponge halves
    // the cost of a seed from k = 8 on), consumed p at a time — or one at a
    // time when piped, double-buffered so the successor of the last ring
    // entry (whose fill anchors ride in the current walk) is always known.
    // ring[ri] is the seed of nonce_at(counter).
    let ring_n = prof.ring_len();
    let mut ring = vec![[0u8; 32]; ring_n];
    let mut ring2 = vec![[0u8; 32]; if prof.pipe { ring_n } else { 0 }];
    let mut ri = ring_n;
    let mut primed = false;
    let mut pre: Option<walk::Pre> = None;
    let mut cur_seeds = [[0u8; 32]; MAX_PADS];
    while !sh.stop.load(Ordering::Relaxed) {
        if !thermal::worker_may_hash(&sh.th) || !thermal::gate_open(&sh.th) {
            continue;
        }
        let job = sh.job.read().unwrap().clone();
        let live = job.is_some() && sh.now_ns() < sh.deadline_ns.load(Ordering::Relaxed);
        if !live {
            std::thread::sleep(Duration::from_millis(20));
            continue;
        }
        let job = job.unwrap();
        if cur.as_ref().map(|c| c.epoch) != Some(job.epoch) {
            hasher = Some(FixedFieldNonceBatch::new(TAG_POWHDR, &job.fields, NONCE_FIELD));
            // Keep a worker's cursor across template/target changes. A pool
            // difficulty update changes the epoch but may keep identical PoW
            // fields; restarting at zero would re-submit earlier shares.
            ri = ring_n;
            primed = false;
            pre = None;
            cur = Some(job.clone());
        }
        let h = hasher.as_mut().unwrap();
        let start = nonce_at(job.base, id, counter);
        let t = Instant::now();
        if job.walk {
            if ri >= ring_n {
                if prof.pipe {
                    if primed {
                        std::mem::swap(&mut ring, &mut ring2);
                    } else {
                        h.hash_into(start, &mut ring);
                        primed = true;
                    }
                    h.hash_into(nonce_at(job.base, id, counter + ring_n as u128), &mut ring2);
                } else {
                    h.hash_into(start, &mut ring);
                }
                ri = 0;
            }
            let n_done = if prof.pipe {
                let seed = ring[ri];
                let next = if ri + 1 < ring_n { ring[ri + 1] } else { ring2[0] };
                let pc = match pre.take() {
                    Some(x) => x,
                    None => walk::pre_of(&seed),
                };
                let (d, pn) = unsafe { walk::walk_pipe_dyn(prof.prefetch, region.pads[0], &seed, &pc, Some(&next)) };
                pre = pn;
                outs[0] = d;
                cur_seeds[0] = seed;
                1
            } else {
                cur_seeds[..p].copy_from_slice(&ring[ri..ri + p]);
                unsafe { walk_dyn(p, prof.prefetch, prof.kernel, &region.pads, &cur_seeds[..p], &mut outs[..p]) };
                p
            };
            for k in 0..n_done {
                if le256_lt(&outs[k], &job.target) {
                    // Never submit what the reference walk would not reproduce.
                    let check = gate::oracle(&mut oracle_pad, &cur_seeds[k]);
                    if check != outs[k] {
                        diverged("candidate solution");
                    }
                    let _ = tx.send(Found {
                        epoch: job.epoch,
                        template_id: job.template_id.clone(),
                        height: job.height,
                        nonce: start + k as u128,
                        digest: outs[k],
                        t_found: Instant::now(),
                    });
                }
            }
            since_sentinel += n_done as u64;
            if since_sentinel >= SENTINEL_EVERY {
                since_sentinel = 0;
                let slot = (counter as usize / n_done) % n_done;
                if gate::oracle(&mut oracle_pad, &cur_seeds[slot]) != outs[slot] {
                    diverged("sentinel");
                }
            }
            counter += n_done as u128;
            ri += n_done;
            sh.hashed.fetch_add(n_done as u64, Ordering::Relaxed);
        } else {
            // Pre-fork rule: the Poseidon2b digest itself is the PoW.
            h.hash_into(start, &mut seeds);
            for (k, s) in seeds.iter().enumerate() {
                if le256_lt(s, &job.target) {
                    let _ = tx.send(Found {
                        epoch: job.epoch,
                        template_id: job.template_id.clone(),
                        height: job.height,
                        nonce: start + k as u128,
                        digest: *s,
                        t_found: Instant::now(),
                    });
                }
            }
            counter += SPONGE_BATCH as u128;
            sh.hashed.fetch_add(SPONGE_BATCH as u64, Ordering::Relaxed);
        }
        sh.busy_ns.fetch_add(t.elapsed().as_nanos() as u64, Ordering::Relaxed);
    }
}

// ---------------------------------------------------------------------------
// RPC (identical wire format to jetsam-extminer)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct BlockTemplateResponse {
    template_id: String,
    pow_fields_hex: String,
    nonce_field_index: usize,
    difficulty_target_hex: String,
    height: u64,
    expires_in_seconds: u64,
    #[serde(default)]
    n_txs: usize,
    #[serde(default)]
    nonce_prefix: Option<u32>,
    #[serde(default)]
    pow_walk: bool,
}

#[derive(Serialize)]
struct Req<'a, P: Serialize> {
    jsonrpc: &'a str,
    id: u32,
    method: &'a str,
    params: P,
}

#[derive(Deserialize)]
struct Resp<T> {
    result: Option<T>,
    error: Option<serde_json::Value>,
}

struct Rpc {
    url: String,
    key: Option<String>,
    /// X-Jetsam-Host: the name the pool's dashboard shows for this machine;
    /// None = no such header.
    host: Option<String>,
    cpu: String,
    http: reqwest::blocking::Client,
    rate: Arc<AtomicU64>,
    /// The regulator's duty and the policy go into the CPU line the pool
    /// shows (" pwm62%", " eff"): the dashboard sees the thermal regime.
    th: Option<Arc<Thermal>>,
    eff: bool,
}

/// Why a call failed: no HTTP answer at all (connection, timeout: the far
/// end may still have acted on it), or an answer that says no.
#[derive(Debug)]
enum CallErr {
    Transport(String),
    Answer(String),
}

impl std::fmt::Display for CallErr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CallErr::Transport(e) | CallErr::Answer(e) => f.write_str(e),
        }
    }
}

/// Classify a submit refusal the way the pool words it.
fn classify_refusal(msg: &str) -> &'static str {
    let m = msg.to_ascii_lowercase();
    if ["expired", "unknown", "consumed", "stale"].iter().any(|w| m.contains(w)) {
        "stale"
    } else if m.contains("busy") {
        "busy"
    } else {
        "refused"
    }
}

impl Rpc {
    fn cpu_header(&self) -> String {
        let d = self.th.as_ref().map(|t| t.duty_milli.load(Ordering::Relaxed)).unwrap_or(1000);
        let mut sfx = String::new();
        if d < 1000 {
            sfx.push_str(&format!(" pwm{}%", (d + 5) / 10));
        }
        if self.eff {
            sfx.push_str(" eff");
        }
        if sfx.is_empty() {
            self.cpu.clone()
        } else {
            format!("{}{sfx}", header_safe(&self.cpu, 64 - sfx.len()))
        }
    }

    fn call_typed<P: Serialize, R: for<'de> Deserialize<'de>>(&self, method: &str, params: P) -> std::result::Result<R, CallErr> {
        let mut req = self.http.post(&self.url).json(&Req { jsonrpc: "2.0", id: 1, method, params });
        if let Some(k) = &self.key {
            req = req.header("Authorization", format!("Bearer {k}"));
        }
        let r = self.rate.load(Ordering::Relaxed);
        if r > 0 {
            req = req.header("X-Jetsam-Hashrate", r.to_string());
        }
        if let Some(h) = &self.host {
            req = req.header("X-Jetsam-Host", h);
        }
        req = req
            .header("X-Jetsam-Version", VERSION)
            .header("X-Jetsam-PoW", "walk")
            .header("X-Jetsam-CPU", self.cpu_header());
        let resp = req.send().map_err(|e| CallErr::Transport(format!("POST {}: {}", self.url, err_chain(&e))))?;
        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(CallErr::Answer("401 Unauthorized — wrong or missing --key".into()));
        }
        if !resp.status().is_success() {
            return Err(CallErr::Answer(format!("HTTP {} from {}", resp.status(), self.url)));
        }
        let body: Resp<R> = resp.json().map_err(|e| CallErr::Answer(format!("decode JSON-RPC response: {e}")))?;
        if let Some(e) = body.error {
            return Err(CallErr::Answer(format!("RPC error: {e}")));
        }
        body.result.ok_or_else(|| CallErr::Answer("RPC returned null result".into()))
    }
}

/// An error and its causes, "a: b: c" (reqwest keeps "connection refused"
/// in the source chain, not in its own message).
fn err_chain(e: &dyn std::error::Error) -> String {
    let mut s = e.to_string();
    let mut src = e.source();
    while let Some(c) = src {
        let m = c.to_string();
        if !s.contains(&m) {
            s.push_str(": ");
            s.push_str(&m);
        }
        src = c.source();
    }
    s
}

/// Where a found block goes: the pool/node (`Rpc`), or a test double.
trait Submit: Send + Sync {
    /// One `jetsam_submitBlock`; Ok = the block hash.
    fn submit(&self, template_id: &str, nonce_hex: &str) -> std::result::Result<String, CallErr>;
}

impl Submit for Rpc {
    fn submit(&self, template_id: &str, nonce_hex: &str) -> std::result::Result<String, CallErr> {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Reply { Block(String), Share { accepted: bool, block_hash: Option<String> } }
        match self.call_typed::<_, Reply>("jetsam_submitBlock", (template_id, nonce_hex))? {
            Reply::Block(hash) => Ok(hash),
            Reply::Share { accepted: true, block_hash: Some(hash) } => Ok(hash),
            Reply::Share { accepted: true, block_hash: None } => Ok("@gozero-share".into()),
            _ => Err(CallErr::Answer("share not accepted".into())),
        }
    }
}

fn decode_fields(hex_str: &str) -> Result<[Block128; FIELDS]> {
    let b = hex::decode(hex_str)?;
    if b.len() != FIELDS * 16 {
        return Err(anyhow!("pow_fields_hex must be {} bytes, got {}", FIELDS * 16, b.len()));
    }
    let mut f = [Block128::from(0u128); FIELDS];
    for (i, c) in b.chunks_exact(16).enumerate() {
        f[i] = Block128::from(u128::from_le_bytes(c.try_into().unwrap()));
    }
    Ok(f)
}

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------

fn banner(prof: &Profile) {
    let id = sys::cpuid();
    eprintln!(
        "{VERSION}  backend={}  L2={} KiB  L3={} KiB  {}",
        jetsam_core::cpu::selected_backend(),
        prof.l2_kib,
        prof.l3_kib,
        sys::page_env()
    );
    eprintln!("cpu: {} ({}, family {} model {})", cpu_model(), id.vendor, id.family, id.model);
    if let Some(q) = &prof.quota {
        eprintln!(
            "cpu quota: {:.2} CPUs ({}): at most {} worker threads{}",
            q.cpus,
            q.source,
            q.max_workers(),
            if prof.uncapped > prof.cpus.len() {
                format!(" (the profile would run {})", prof.uncapped)
            } else {
                String::new()
            }
        );
    }
    eprintln!(
        "profile: {} threads ({} per core)  pads/thread={}  prefetch={}  pages={}  kernel={}  ring={}  policy={:?}  [{}]",
        prof.cpus.len(),
        prof.per_core,
        prof.pads,
        prof.prefetch as u8,
        sys::pages_label(prof.huge),
        walk::describe(prof.kernel, prof.pads, prof.pipe),
        prof.ring_len(),
        prof.policy,
        prof.source
    );
    // Report other miners, never touch them.
    let others = sys::other_miners();
    if !others.is_empty() {
        eprintln!("note: other miners on this machine (left alone): {}", others.join(" "));
    }
}

/// The default build has no thermal guard: nothing to resolve, no sensor
/// needed.
#[cfg(not(feature = "fleet"))]
fn start_thermal(_cli: &Cli) -> Arc<Thermal> {
    eprintln!("thermal guard: none (public build)");
    Arc::new(Thermal::new(Instant::now(), false))
}

/// Resolve the sensor and start the guard, before any hashing (the self-test
/// included). No sensor: exit 5, unless --no-thermal-guard.
#[cfg(feature = "fleet")]
fn start_thermal(cli: &Cli) -> Arc<Thermal> {
    let g = &cli.guard;
    let sensor = if g.debug_no_sensor { None } else { guard::Sensor::detect() };
    let t0 = Instant::now();
    match sensor {
        None if !g.no_thermal_guard => exit_once(
            guard::EXIT_NO_SENSOR,
            &red(
                "THERMAL: no CPU temperature sensor found (k10temp / zenpower / coretemp). Refusing to mine without a \
                 thermal guard; pass --no-thermal-guard to run anyway. Exit 5.",
            ),
        ),
        None => {
            eprintln!("{}", red("WARNING: --no-thermal-guard: NO temperature sensor, NO thermal protection."));
            Arc::new(Thermal::new(t0, false))
        }
        Some(s) => {
            let th = Arc::new(Thermal::new(t0, true));
            let mining = !cli.gate && cli.bench_walk.is_none() && cli.tune.is_none() && cli.check_nonces.is_none();
            let regulate = mining || (cli.bench_walk.is_some() && g.bench_regulate);
            let cfg = guard::GuardCfg {
                stop_c: g.temp_stop,
                hard_c: g.debug_temp_hard.unwrap_or(thermal::HARD_LIMIT_C),
                poll_ms: g.temp_poll_ms,
                stall: g.debug_guard_stall.map(|s| (5.0, s)),
                reg: regulate.then(|| guard::RegCfg {
                    target_c: g.temp_target(),
                    min_duty: g.min_duty,
                    period_ms: g.pwm_period_ms,
                    ramp_secs: if mining { g.ramp_secs } else { 0.0 },
                }),
            };
            eprintln!(
                "thermal guard: {}  now {:.1} C  stop {:.0} C (predictive vs {:.0} C)  poll {} ms  {}",
                s.describe(),
                s.read().map(|r| r.max_mc() as f64 / 1000.0).unwrap_or(f64::NAN),
                cfg.stop_c,
                cfg.hard_c,
                cfg.poll_ms,
                match &cfg.reg {
                    Some(r) => format!(
                        "regulator: target {:.0} C, pwm period {} ms, min duty {:.2}{}",
                        r.target_c,
                        r.period_ms,
                        r.min_duty,
                        if r.ramp_secs > 0.0 { format!(", ramp {:.0} s from 0.30", r.ramp_secs) } else { String::new() }
                    ),
                    None => "regulator: off".into(),
                }
            );
            guard::Guard::start(s, cfg, th.clone());
            th
        }
    }
}

fn start_workers(prof: &Arc<Profile>, sh: &Arc<Shared>) -> (mpsc::Receiver<Found>, Vec<std::thread::JoinHandle<()>>) {
    let (tx, rx) = mpsc::channel();
    let mut hs = Vec::new();
    for (id, &cpu) in prof.cpus.iter().enumerate() {
        let (prof, sh, tx) = (prof.clone(), sh.clone(), tx.clone());
        hs.push(
            std::thread::Builder::new()
                .name(format!("walk{id}"))
                .spawn(move || worker(id, cpu, &prof, &sh, tx))
                .expect("spawn worker"),
        );
    }
    (rx, hs)
}

fn fmt_rate(h: f64) -> String {
    if h >= 1e6 {
        format!("{:.2} MH/s", h / 1e6)
    } else if h >= 1e3 {
        format!("{:.2} kH/s", h / 1e3)
    } else {
        format!("{h:.0} H/s")
    }
}

/// Every worker's pads in huge pages? Prints the result once; exits 4 under
/// --require-huge when they are not. Returns (in huge pages, workers).
fn check_huge(cli: &Cli, prof: &Profile, sh: &Shared, quiet: bool) -> (usize, usize) {
    let (ok, done, n) = sh.huge_status(Duration::from_secs(2));
    if !prof.huge {
        if !quiet {
            #[cfg(target_os = "macos")]
            eprintln!("huge pages: off (--no-huge): {n} workers; {}", sys::page_env());
            #[cfg(not(target_os = "macos"))]
            eprintln!("huge pages: off (--no-huge): {n} workers in 4 KiB pages");
        }
        return (ok, n);
    }
    if ok == n {
        if !quiet {
            eprintln!("huge pages: {ok}/{n} workers in {} pages", sys::pages_label(true));
        }
    } else {
        let msg = format!(
            "huge pages: only {ok}/{n} workers in {} pages ({} not reported): {}",
            sys::pages_label(true),
            n - done,
            sys::huge_hint()
        );
        if cli.require_huge {
            exit_once(EXIT_NO_HUGE, &red(&format!("{msg}. --require-huge: exit {EXIT_NO_HUGE}.")));
        }
        eprintln!("{}", red(&format!("WARNING: {msg}")));
    }
    (ok, n)
}

#[derive(Default, Clone)]
struct Measured {
    hps: f64,
    /// Peak of max(Tctl, Tccd*) during the window (thermal-guard build).
    peak_c: f64,
    tctl_max: f64,
    ccd_max: Vec<f64>,
    huge_ok: usize,
    workers: usize,
    anon_huge_kb: Option<u64>,
    /// Package / core power over the window (RAPL), W.
    w_pkg: Option<f64>,
    w_core: Option<f64>,
    w_min: Option<f64>,
    w_max: Option<f64>,
    /// Idle package power measured before the workers started, W.
    w_idle: Option<f64>,
    /// Mean scaling_cur_freq of the profile's CPUs, MHz.
    f_avg: Option<f64>,
    /// Share of the targeted CPUs kept busy by OTHER processes over the
    /// window (0..1): their busy time minus this process's CPU time.
    foreign: Option<f64>,
}

/// Snapshot for `foreign_share`: busy/total ticks of the targeted CPUs and
/// this process's own CPU time.
struct CpuSnap {
    busy: u64,
    total: u64,
    own: u64,
}

fn cpu_snap(cpus: &[usize]) -> Option<CpuSnap> {
    let (busy, total) = sys::cpu_ticks(cpus)?;
    Some(CpuSnap { busy, total, own: sys::self_ticks()? })
}

/// Share of the CPUs' time between two snapshots spent by other processes.
fn foreign_share(a: &CpuSnap, b: &CpuSnap) -> Option<f64> {
    let total = b.total.checked_sub(a.total).filter(|&t| t > 0)?;
    let busy = b.busy.saturating_sub(a.busy);
    let own = b.own.saturating_sub(a.own);
    Some(busy.saturating_sub(own) as f64 / total as f64)
}

/// The CPUs whose load can bias a --tune measurement: the CPU set plus the
/// SMT siblings of every CPU in it, even outside it — a neighbour on a
/// sibling slows the core as much as one on the CPU itself.
fn targeted_cpus(cli: &Cli) -> Vec<usize> {
    let set = cpu_set(cli).map(|(s, _)| s).unwrap_or_default();
    sys::with_siblings(&set)
}

impl Measured {
    fn hpj(&self) -> Option<f64> {
        self.w_pkg.map(|w| self.hps / w)
    }
    fn hpj_marg(&self) -> Option<f64> {
        match (self.w_pkg, self.w_idle) {
            (Some(w), Some(i)) if w > i => Some(self.hps / (w - i)),
            _ => None,
        }
    }
}

fn opt(v: Option<f64>, prec: usize) -> String {
    v.map(|x| format!("{x:.prec$}")).unwrap_or_else(|| "n/a".into())
}

/// Walk rate of `prof` on a dummy job, after a 2 s warm-up (pads faulted,
/// huge pages collapsed), with package power (RAPL, 1 Hz), temperatures and
/// the mean clock over the window. `idle_secs` > 0 first measures the idle
/// package power (marginal H/J). In the thermal-guard build the guard runs
/// throughout (it exits the process at the stop temperature).
fn measure(
    cli: &Cli,
    th: &Arc<Thermal>,
    rapl: Option<&rapl::Rapl>,
    prof: Arc<Profile>,
    secs: u64,
    idle_secs: u64,
    quiet: bool,
) -> Measured {
    let mut m = Measured::default();
    if let (Some(r), true) = (rapl, idle_secs > 0) {
        if let Some(a) = r.sample() {
            std::thread::sleep(Duration::from_secs(idle_secs));
            if let Some(b) = r.sample() {
                m.w_idle = Some(r.watts(&a, &b).0);
            }
        }
    }
    let job = Arc::new(Job {
        epoch: 1,
        template_id: "bench".into(),
        height: 0,
        fields: [Block128::from(0x9e37_79b9_7f4a_7c15u128); FIELDS],
        target: [0u8; 32],
        walk: true,
        base: 0,
    });
    let sh = Arc::new(Shared::new(Some(job), u64::MAX, th.clone(), prof.cpus.len()));
    let (_rx, hs) = start_workers(&prof, &sh);
    (m.huge_ok, m.workers) = check_huge(cli, &prof, &sh, quiet);
    std::thread::sleep(Duration::from_secs(2));
    let targets = targeted_cpus(cli);
    let snap0 = cpu_snap(&targets);
    let h0 = sh.hashed.load(Ordering::Relaxed);
    let t = Instant::now();
    th.reset_peak();
    let e0 = rapl.and_then(|r| r.sample());
    let mut e_prev = e0.clone();
    let (mut w_min, mut w_max) = (f64::MAX, 0.0f64);
    let mut freqs: Vec<f64> = Vec::new();
    let mut next_sample = t + Duration::from_secs(1);
    let every = cli.report_secs.map(|s| Duration::from_secs(s.max(1)));
    let mut next = every.map(|e| t + e);
    let mut last = (t, h0);
    let mut ccd_max: Vec<f64> = Vec::new();
    while t.elapsed() < Duration::from_secs(secs) {
        std::thread::sleep(Duration::from_millis(50));
        let now = Instant::now();
        m.tctl_max = m.tctl_max.max(th.tctl_c());
        for (i, c) in th.ccd_c().into_iter().enumerate() {
            if ccd_max.len() <= i {
                ccd_max.push(c);
            }
            ccd_max[i] = ccd_max[i].max(c);
        }
        if now >= next_sample {
            next_sample += Duration::from_secs(1);
            if let (Some(r), Some(a)) = (rapl, e_prev.as_ref()) {
                if let Some(b) = r.sample() {
                    let w = r.watts(a, &b).0;
                    (w_min, w_max) = (w_min.min(w), w_max.max(w));
                    e_prev = Some(b);
                }
            }
            if let Some(f) = rapl::mean_freq_mhz(&prof.cpus) {
                freqs.push(f);
            }
        }
        if let (Some(e), Some(n)) = (every, next) {
            if now >= n {
                next = Some(n + e);
                let h = sh.hashed.load(Ordering::Relaxed);
                let r = (h - last.1) as f64 / now.duration_since(last.0).as_secs_f64();
                last = (now, h);
                eprintln!(
                    "  t={:6.2}s  hashed={h}  rate={}  pwm={:.2}  {}",
                    now.duration_since(t).as_secs_f64(),
                    fmt_rate(r),
                    th.duty(),
                    th.summary()
                );
            }
        }
    }
    let n = sh.hashed.load(Ordering::Relaxed) - h0;
    let el = t.elapsed().as_secs_f64();
    if let (Some(a), Some(b)) = (snap0.as_ref(), cpu_snap(&targets).as_ref()) {
        m.foreign = foreign_share(a, b);
    }
    if let (Some(r), Some(a)) = (rapl, e0.as_ref()) {
        if let Some(b) = r.sample() {
            let (p, c) = r.watts(a, &b);
            m.w_pkg = Some(p);
            m.w_core = c;
        }
    }
    if w_max > 0.0 {
        (m.w_min, m.w_max) = (Some(w_min), Some(w_max));
    }
    m.f_avg = (!freqs.is_empty()).then(|| freqs.iter().sum::<f64>() / freqs.len() as f64);
    m.peak_c = th.peak_c();
    m.ccd_max = ccd_max;
    m.anon_huge_kb = sys::anon_huge_kb(); // while the pads are still mapped
    sh.stop.store(true, Ordering::Relaxed);
    for h in hs {
        let _ = h.join();
    }
    if !quiet {
        // Exact hash count of the whole run, for perf-stat ratios.
        println!("TOTAL_HASHED={}", sh.hashed.load(Ordering::Relaxed));
    }
    m.hps = n as f64 / el;
    m
}

/// Nonce-accounting gate (release gate, not covered by --gate): the seed
/// ring and the pipelined anchors decide which nonce a digest is reported
/// under. One digest in 16 meets the dummy target, so solutions stream out;
/// each one is recomputed from its reported nonce through the real seed path
/// and the reference walk. Duplicates and nonces outside the region fail.
fn check_nonces(cli: &Cli, th: &Arc<Thermal>, prof: Arc<Profile>, secs: u64) -> bool {
    let fields = [Block128::from(0x9e37_79b9_7f4a_7c15u128); FIELDS];
    let mut target = [0xFFu8; 32];
    target[31] = 0x10;
    let base: u128 = (7u128 << NONCE_REGION_SHIFT) | (0xABCDu128 << 64);
    let job = Arc::new(Job { epoch: 1, template_id: "check".into(), height: 0, fields, target, walk: true, base });
    let sh = Arc::new(Shared::new(Some(job), u64::MAX, th.clone(), prof.cpus.len()));
    let (rx, hs) = start_workers(&prof, &sh);
    // Solutions take the mining path: worker -> submit thread -> sink. The
    // sink here is the verifier; the latency is found -> submit.
    let (vtx, vrx) = mpsc::channel::<(Found, Duration)>();
    let submitter = start_submitter(rx, Sink::Check(vtx), &sh);
    check_huge(cli, &prof, &sh, false);
    let deadline = Instant::now() + Duration::from_secs(secs);
    let mut sc = Scratch::new();
    let mut seen = std::collections::HashSet::new();
    let mut lat_us: Vec<u64> = Vec::new();
    let (mut ok, mut bad, mut dup, mut region_bad) = (0u64, 0u64, 0u64, 0u64);
    while Instant::now() < deadline {
        if let Ok((f, lat)) = vrx.recv_timeout(Duration::from_millis(100)) {
            lat_us.push(lat.as_micros() as u64);
            let seed = gate::seed_of(&fields, f.nonce);
            let d = gate::oracle(&mut sc, &seed);
            if d == f.digest && le256_lt(&d, &target) {
                ok += 1;
            } else {
                bad += 1;
                eprintln!("MISMATCH nonce={} reported={} oracle={}", f.nonce, hex::encode(f.digest), hex::encode(d));
            }
            if !seen.insert(f.nonce) {
                dup += 1;
            }
            if f.nonce >> 64 != base >> 64 {
                region_bad += 1;
            }
        }
    }
    sh.stop.store(true, Ordering::Relaxed);
    for h in hs {
        let _ = h.join();
    }
    let _ = submitter.join();
    let hashed = sh.hashed.load(Ordering::Relaxed);
    lat_us.sort_unstable();
    let pct = |q: f64| lat_us.get(((lat_us.len() as f64 - 1.0) * q).round() as usize).copied().unwrap_or(0);
    println!(
        "CHECK-NONCES kernel={} pads={} prefetch={} ring={} hashed={hashed} solutions={} ok={ok} bad={bad} dup={dup} \
         outside_region={region_bad} unchecked={} submit_latency_us p50={} p99={} max={}",
        walk::describe(prof.kernel, prof.pads, prof.pipe),
        prof.pads,
        prof.prefetch as u8,
        prof.ring_len(),
        ok + bad,
        vrx.try_iter().count(),
        pct(0.5),
        pct(0.99),
        lat_us.last().copied().unwrap_or(0)
    );
    bad == 0 && dup == 0 && region_bad == 0 && ok > 0
}

fn open_rapl() -> Option<rapl::Rapl> {
    let r = rapl::Rapl::open();
    if r.is_none() {
        if cfg!(target_os = "linux") {
            eprintln!("note: RAPL energy counters not readable (root or passwordless sudo needed): rapl=n/a");
        } else {
            eprintln!("note: package power is not measured on this platform: rapl=n/a");
        }
    }
    r
}

fn run_bench(cli: &Cli, th: &Arc<Thermal>, prof: Arc<Profile>, secs: u64) {
    let rapl = open_rapl();
    let m = measure(cli, th, rapl.as_ref(), prof.clone(), secs, cli.idle_secs, false);
    let cores = prof.cpus.len().div_ceil(prof.per_core);
    let ccd: Vec<String> = m.ccd_max.iter().map(|c| format!("{c:.1}")).collect();
    let temp = |v: f64| if th.guarded { format!("{v:.1}") } else { "n/a".into() };
    println!(
        "BENCH-WALK threads={} ({}/core) pads={} prefetch={} pages={} kernel={} ring={} : {} ({:.1} H/s per thread)  \
         hps={:.1}  W_pkg={}  W_core={}  W_min={}  W_max={}  W_idle={}  HpJ={}  HpJ_marg={}  Tctl_max={}  Tccd={}  \
         peak={}  f_avg={}  cyc_per_hash={}  huge={}/{}  anon_huge={}  rapl={}  guard={}",
        prof.cpus.len(),
        prof.per_core,
        prof.pads,
        prof.prefetch as u8,
        sys::pages_label(prof.huge && m.huge_ok == m.workers),
        walk::describe(prof.kernel, prof.pads, prof.pipe),
        prof.ring_len(),
        fmt_rate(m.hps),
        m.hps / prof.cpus.len() as f64,
        m.hps,
        opt(m.w_pkg, 1),
        opt(m.w_core, 1),
        opt(m.w_min, 1),
        opt(m.w_max, 1),
        opt(m.w_idle, 1),
        opt(m.hpj(), 2),
        opt(m.hpj_marg(), 2),
        temp(m.tctl_max),
        if ccd.is_empty() { "n/a".into() } else { ccd.join("/") },
        temp(m.peak_c),
        opt(m.f_avg, 0),
        // Core cycles per hash [derived]: mean clock x cores / rate.
        m.f_avg.map(|f| format!("{:.2}M", f * 1e6 * cores as f64 / m.hps / 1e6)).unwrap_or_else(|| "n/a".into()),
        m.huge_ok,
        m.workers,
        m.anon_huge_kb.map(|k| format!("{k}KiB")).unwrap_or_else(|| "n/a".into()),
        rapl.as_ref().map(|r| r.mode.name()).unwrap_or("n/a"),
        if th.guarded {
            "ok"
        } else if cfg!(feature = "fleet") {
            "OFF"
        } else {
            "none"
        }
    );
}

fn utc_now() -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
    let (d, s) = (t.div_euclid(86_400), t.rem_euclid(86_400));
    // civil-from-days (Howard Hinnant), UTC only
    let z = d + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z", s / 3600, (s / 60) % 60, s % 60)
}

fn cool_below(th: &Thermal, c: Option<f64>, max_secs: u64) {
    let Some(c) = c else { return };
    let mut w = 0;
    while th.guarded && th.temp_c() >= c && w < max_secs {
        std::thread::sleep(Duration::from_secs(1));
        w += 1;
    }
}

/// Try the candidate shapes (x kernels) on this machine; keep the fastest and
/// the most efficient. Two rounds in alternating order so a slow drift (heat,
/// a neighbour) cannot favour whichever candidate ran first. In the
/// thermal-guard build every candidate starts below --tune-cool, and a
/// candidate that got hotter than the regulator target is disqualified: its
/// number measures the cooler, not the kernel (the regulator is off here; the
/// stop still applies).
///
/// Other processes on the targeted CPUs (the CPU set and its SMT siblings;
/// the whole machine on Windows) are measured 2 s before each candidate
/// (workers stopped) and during it (busy time minus our own): a candidate
/// that saw more than 5 % is `noisy`, and then the result is NOT stored
/// unless --tune-force — a noisy tune would pin a wrong profile for every
/// later run.
fn run_tune(cli: &Cli, th: &Arc<Thermal>, secs: u64) -> Result<()> {
    let base = profile(cli)?;
    let targets = targeted_cpus(cli);
    let big = base.l2_kib >= 1024;
    let mut shapes: Vec<(usize, usize, bool)> =
        vec![(1, 1, false), (1, 2, false), (1, 2, true), (2, 1, false), (2, 1, true), (2, 2, false), (2, 2, true)];
    if !big || base.l3_kib >= 65_536 {
        shapes.push((1, 3, true));
    }
    let mut kernels: Vec<u8> = cli
        .tune_kernels
        .iter()
        .map(|k| if *k == KernelArg::Base { walk::K_BASE } else { walk::K_FAST })
        .collect();
    kernels.dedup();
    let cands: Vec<Shape> =
        shapes.iter().flat_map(|&(t, p, f)| kernels.iter().map(move |&k| Shape::new(t, p, f, k))).collect();
    let rapl = open_rapl();
    let cool = tune_cool(cli);
    // Idle power once, cool machine, before any candidate.
    cool_below(th, cool, 300);
    let w_idle = rapl.as_ref().and_then(|r| {
        let a = r.sample()?;
        std::thread::sleep(Duration::from_secs(cli.idle_secs.max(1)));
        Some(r.watts(&a, &r.sample()?).0)
    });
    let mut res: Vec<Vec<Measured>> = vec![Vec::new(); cands.len()];
    let mut hot = vec![false; cands.len()];
    // Highest foreign share seen per candidate (before or during, both rounds).
    let mut foreign: Vec<Option<f64>> = vec![None; cands.len()];
    eprintln!("tune: {} candidates x 2 rounds x {secs} s; foreign load measured on {}", cands.len(), sys::FOREIGN_SCOPE);
    for round in 0..2 {
        let order: Vec<usize> = if round == 0 { (0..cands.len()).collect() } else { (0..cands.len()).rev().collect() };
        for i in order {
            let p = Arc::new(profile_with(cli, Some(cands[i]))?);
            cool_below(th, cool, 300);
            let before = cpu_snap(&targets).and_then(|a| {
                std::thread::sleep(Duration::from_secs(2));
                foreign_share(&a, &cpu_snap(&targets)?)
            });
            let m = measure(cli, th, rapl.as_ref(), p.clone(), secs, 0, true);
            let over = reg_target(cli).is_some_and(|t| m.peak_c > t);
            let f = [before, m.foreign].into_iter().flatten().reduce(f64::max);
            let noisy = f.is_some_and(|x| x > TUNE_FOREIGN_MAX);
            eprintln!(
                "tune  {:<12} {:>10}  {:>6} W  {:>7} H/J  peak {}  foreign {} / {} %{}{}",
                cands[i].label(),
                fmt_rate(m.hps),
                opt(m.w_pkg, 1),
                opt(m.hpj(), 2),
                if th.guarded { format!("{:.0} C", m.peak_c) } else { "n/a".into() },
                opt(before.map(|x| x * 100.0), 1),
                opt(m.foreign.map(|x| x * 100.0), 1),
                if noisy { "  NOISY" } else { "" },
                if over { "  (above the regulator target: disqualified)" } else { "" }
            );
            res[i].push(m);
            hot[i] |= over;
            foreign[i] = [foreign[i], f].into_iter().flatten().reduce(f64::max);
        }
    }
    let noisy: Vec<bool> = foreign.iter().map(|f| f.is_some_and(|x| x > TUNE_FOREIGN_MAX)).collect();
    // Spread of the two passes: sample coefficient of variation of the rate.
    let cv: Vec<Option<f64>> = res
        .iter()
        .map(|r| {
            let n = r.len() as f64;
            let mean = r.iter().map(|m| m.hps).sum::<f64>() / n;
            (r.len() >= 2 && mean > 0.0).then(|| {
                (r.iter().map(|m| (m.hps - mean).powi(2)).sum::<f64>() / (n - 1.0)).sqrt() / mean
            })
        })
        .collect();
    let med = |v: Vec<f64>| {
        let mut v = v;
        v.sort_by(|a, b| a.partial_cmp(b).unwrap());
        if v.is_empty() { 0.0 } else { (v[(v.len() - 1) / 2] + v[v.len() / 2]) / 2.0 }
    };
    let hps: Vec<f64> = res.iter().map(|r| med(r.iter().map(|m| m.hps).collect())).collect();
    let w: Vec<Option<f64>> =
        res.iter().map(|r| r.iter().all(|m| m.w_pkg.is_some()).then(|| med(r.iter().filter_map(|m| m.w_pkg).collect()))).collect();
    let hpj: Vec<Option<f64>> = (0..cands.len()).map(|i| w[i].map(|w| hps[i] / w)).collect();
    let ok: Vec<usize> = (0..cands.len()).filter(|&i| !hot[i]).collect();
    let best_hps = *ok
        .iter()
        .max_by(|&&a, &&b| hps[a].partial_cmp(&hps[b]).unwrap())
        .ok_or_else(|| anyhow!("every candidate ran above the regulator target — cool the machine or pass --cpus"))?;
    let best_hpj = ok
        .iter()
        .copied()
        .filter(|&i| hpj[i].is_some())
        .max_by(|&a, &b| hpj[a].partial_cmp(&hpj[b]).unwrap())
        .unwrap_or(best_hps);
    let entry = |i: usize| {
        let c = cands[i];
        let p = profile_with(cli, Some(c)).ok();
        json!({
            "tpc": c.tpc, "pads": c.pads, "pf": c.pf, "kernel": walk::kernel_name(c.kernel),
            "ring": p.as_ref().map(|p| p.ring_len()), "pipe": p.as_ref().map(|p| p.pipe),
            "hps": hps[i].round(), "w": w[i].map(|x| (x * 10.0).round() / 10.0),
            "hpj": hpj[i].map(|x| (x * 100.0).round() / 100.0), "peak_c": res[i].iter().map(|m| m.peak_c).fold(0.0, f64::max),
            "disqualified": hot[i],
            "foreign_busy": foreign[i].map(|x| (x * 1000.0).round() / 1000.0),
            "cv": cv[i].map(|x| (x * 10000.0).round() / 10000.0),
            "noisy": noisy[i],
        })
    };
    let any_noisy = noisy.iter().any(|&n| n);
    let v = json!({
        "version": 3,
        "key": base.tune_key,
        "best_hps": entry(best_hps),
        "best_hpj": entry(best_hpj),
        "w_idle": w_idle.map(|x| (x * 10.0).round() / 10.0),
        "noisy": any_noisy,
        "forced": any_noisy && cli.tune_force,
        "foreign_max": TUNE_FOREIGN_MAX,
        "table": (0..cands.len()).map(entry).collect::<Vec<_>>(),
        "measured_utc": utc_now(),
    });
    let path = tune_path(cli);
    let say = |tag: &str, i: usize| {
        let c = cands[i];
        println!(
            "TUNE {tag}: --threads-per-core {} --pads {} --prefetch {} --kernel {}  ({}, {} W, {} H/J)",
            c.tpc,
            c.pads,
            c.pf as u8,
            walk::kernel_name(c.kernel),
            fmt_rate(hps[i]),
            opt(w[i], 1),
            opt(hpj[i], 2)
        );
    };
    say("best-hps", best_hps);
    say("best-hpj", best_hpj);
    if any_noisy && !cli.tune_force {
        let which: Vec<String> = (0..cands.len())
            .filter(|&i| noisy[i])
            .map(|i| format!("{} ({:.1} %)", cands[i].label(), foreign[i].unwrap_or(0.0) * 100.0))
            .collect();
        println!(
            "TUNE NOT SAVED: other processes kept the targeted CPUs more than {:.0} % busy during {}; {} left as it was. \
             Stop the other load and run --tune again, or pass --tune-force to store this result anyway.",
            TUNE_FOREIGN_MAX * 100.0,
            which.join(", "),
            path.display()
        );
        return Err(anyhow!("noisy measurement, result not stored (--tune-force to store it)"));
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(&v)?)?;
    println!(
        "TUNE saved to {} (--policy hashrate loads best-hps, --policy efficiency best-hpj){}",
        path.display(),
        if any_noisy { "  [--tune-force: noisy candidates stored as measured]" } else { "" }
    );
    Ok(())
}

fn header_safe(s: &str, max: usize) -> String {
    s.chars().filter(|c| c.is_ascii_graphic() || *c == ' ').take(max).collect::<String>().trim().to_string()
}

/// X-Jetsam-Host value: `--worker-name` cleaned, else `fallback` (the
/// hostname in the thermal-guard build, None in the public build). Empty
/// after cleaning = no header.
fn worker_header(name: Option<&str>, fallback: Option<&str>) -> Option<String> {
    Some(header_safe(name.or(fallback)?, 32)).filter(|h| !h.is_empty())
}

fn cpu_model() -> String {
    let b = &sys::cpuid().brand;
    if b.is_empty() {
        return "unknown CPU".into();
    }
    b.replace("AMD ", "")
        .replace(" 16-Core Processor", "")
        .replace(" 12-Core Processor", "")
        .replace(" 64-Core Processor", "")
        .trim()
        .to_string()
}

/// Content key of a template: the same work re-served keeps its epoch (the
/// workers keep their counters, nothing is hashed twice); new content at the
/// same height is new work. The template id is NOT part of it — the node
/// re-uses ids — but the pool's nonce region is.
fn content_key(t: &BlockTemplateResponse) -> String {
    format!(
        "{}|{}|{}|{}|{}",
        t.pow_fields_hex,
        t.difficulty_target_hex,
        t.pow_walk,
        t.height,
        t.nonce_prefix.map(|p| p.to_string()).unwrap_or_else(|| "-".into())
    )
}

/// Search deadline of a template received at `received_ns`: its life minus
/// the submit margin (never before it arrived).
fn template_deadline_ns(received_ns: u64, expires_in_seconds: u64) -> u64 {
    received_ns + Duration::from_secs(expires_in_seconds).saturating_sub(SUBMIT_MARGIN).as_nanos() as u64
}

/// Bits 64..96 of every nonce: differ per process, so two miners given the
/// same region by a pool never grind the same nonces (jetsam-extminer's rule).
fn process_offset(clock_nanos: u128, pid: u128) -> u128 {
    ((clock_nanos ^ (pid << 12)) & 0xFFFF_FFFF) << 64
}

#[derive(Debug, PartialEq, Eq)]
enum TplAction {
    /// Already won this content: no job until the tip moves.
    Idle,
    /// New content: new epoch and seed ring; worker counters continue.
    NewJob(u64),
    /// Same content re-served: keep the epoch, refresh the deadline (and the
    /// template id if it changed).
    Same,
}

#[derive(Default)]
struct Poller {
    epoch: u64,
    cur_key: Option<String>,
    solved_key: Option<String>,
}

impl Poller {
    fn on_template(&mut self, key: &str, solved_epoch: u64) -> TplAction {
        if solved_epoch != 0 && solved_epoch == self.epoch && self.cur_key.is_some() {
            self.solved_key = self.cur_key.clone();
        }
        if self.solved_key.as_deref() == Some(key) {
            TplAction::Idle
        } else if self.cur_key.as_deref() != Some(key) {
            self.epoch += 1;
            self.cur_key = Some(key.to_string());
            self.solved_key = None;
            TplAction::NewJob(self.epoch)
        } else {
            TplAction::Same
        }
    }
}

/// Same content re-served under another template id: swap the id in the live
/// job of that epoch (same epoch, so the workers keep their counters). A job
/// already cleared (block won) or replaced stays as it is.
fn refresh_template_id(job: &RwLock<Option<Arc<Job>>>, epoch: u64, id: &str) -> bool {
    let mut g = job.write().unwrap();
    match g.as_ref() {
        Some(j) if j.epoch == epoch && j.template_id != id => {
            *g = Some(Arc::new(Job { template_id: id.to_string(), ..(**j).clone() }));
            true
        }
        _ => false,
    }
}

/// Where the submit dispatcher sends a solution.
enum Sink {
    /// The pool or node (its own HTTP client, SUBMIT_TIMEOUT).
    Net(Arc<dyn Submit>),
    /// --check-nonces: no network; forward to the verifier with the latency.
    Check(mpsc::Sender<(Found, Duration)>),
}

/// `block` event of --status-json.
fn block_event(height: u64, result: &str, hash: Option<&str>) -> serde_json::Value {
    json!({"type": "block", "ts": status::unix_now(), "height": height, "result": result, "hash": hash})
}

/// One submission, on its own thread: a single attempt, and the counters
/// follow the answer — yes (accepted), no (refused), or none (unknown: a
/// transport error or a timeout says nothing about the block).
fn gozero_pause_epoch(sh: &Shared, epoch: u64) {
    let job = sh.job.read().unwrap();
    if job.as_ref().map(|j| j.epoch) == Some(epoch) {
        sh.deadline_ns.store(0, Ordering::Relaxed);
    }
}

fn gozero_stale_answer(message: &str) -> bool {
    message.strip_prefix("RPC error: ")
        .and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok())
        .and_then(|v| v.get("code").and_then(|c| c.as_i64())) == Some(21)
}

fn submit_one(sub: &dyn Submit, tid: &str, f: Found, sh: &Shared) {
    let nonce_hex = hex::encode(f.nonce.to_le_bytes());
    let latency = f.t_found.elapsed();
    let t = Instant::now();
    let live = sh.job.read().unwrap().as_ref().map(|j| j.epoch) == Some(f.epoch)
        && sh.now_ns() < sh.deadline_ns.load(Ordering::Relaxed);
    if !live { return; }
    let res = sub.submit(tid, &nonce_hex);
    let answer_ms = t.elapsed().as_millis();
    match res {
        Ok(hash) => {
            let n = sh.accepted.fetch_add(1, Ordering::Relaxed) + 1;
            // DongQN pool replies with the literal "accepted" for a share.
            // It is not a block hash and must not retire the live template.
            let share_ack = hash == "accepted" || hash == "@gozero-share";
            if !share_ack {
                sh.solved_epoch.store(f.epoch, Ordering::Relaxed);
                let mut g = sh.job.write().unwrap();
                if g.as_ref().map(|j| j.epoch) == Some(f.epoch) {
                    *g = None;
                }
            }
            eprintln!(
                "└─ {}  h={}  nonce={}  digest={}…  hash={}…  latency={} us  answer={answer_ms} ms  [accepted {n}/{}]",
                if share_ack { "SHARE ACCEPTED" } else { "SOLVED" },
                f.height,
                f.nonce,
                hex::encode(&f.digest[24..]),
                &hash[..hash.len().min(20)],
                latency.as_micros(),
                sh.found.load(Ordering::Relaxed)
            );
            if share_ack {
                status::emit(json!({"type":"share", "height":f.height, "result":"accepted"}));
            } else {
                status::emit(block_event(f.height, "accepted", Some(&hash)));
            }
        }
        Err(CallErr::Answer(e)) => {
            if gozero_stale_answer(&e) { gozero_pause_epoch(sh, f.epoch); }
            sh.refused.fetch_add(1, Ordering::Relaxed);
            eprintln!("└─ submit {}: {e}  (h={} nonce={} answer={answer_ms} ms)", classify_refusal(&e), f.height, f.nonce);
            status::emit(block_event(f.height, "refused", None));
        }
        Err(CallErr::Transport(e)) => {
            sh.unknown.fetch_add(1, Ordering::Relaxed);
            eprintln!(
                "└─ submit: no answer, state unknown (the block may still be accepted; not retried): {e}  \
                 (h={} nonce={} after {answer_ms} ms)",
                f.height, f.nonce
            );
            status::emit(block_event(f.height, "unknown", None));
        }
    }
}

/// The submit dispatcher: owns the workers' channel. A live solution goes out
/// at once on its own thread, at most SUBMIT_MAX_INFLIGHT at a time, so a
/// block waiting for its answer (up to SUBMIT_TIMEOUT) never holds back the
/// next one; nor does whatever the poller is waiting on. Returns when the
/// workers are gone and every submission has its answer.
fn submit_loop(rx: mpsc::Receiver<Found>, sink: Sink, sh: Arc<Shared>) {
    let slots = Arc::new((std::sync::Mutex::new(0usize), std::sync::Condvar::new()));
    let mut inflight: Vec<std::thread::JoinHandle<()>> = Vec::new();
    while let Ok(f) = rx.recv() {
        sh.found.fetch_add(1, Ordering::Relaxed);
        // Still live? Take the CURRENT template id of that epoch: the pool may
        // have re-served the same content under a new id.
        let tid = match sh.job.read().unwrap().as_ref() {
            Some(j) if j.epoch == f.epoch => j.template_id.clone(),
            _ => {
                eprintln!("└─ solution for a replaced template dropped (tpl={} nonce={})", f.template_id, f.nonce);
                continue;
            }
        };
        let sub = match &sink {
            Sink::Check(tx) => {
                let lat = f.t_found.elapsed();
                let _ = tx.send((f, lat));
                continue;
            }
            Sink::Net(s) => s.clone(),
        };
        {
            let (m, cv) = &*slots;
            let mut n = m.lock().unwrap();
            while *n >= SUBMIT_MAX_INFLIGHT {
                n = cv.wait(n).unwrap();
            }
            *n += 1;
        }
        inflight.retain(|h| !h.is_finished());
        let (sh, slots) = (sh.clone(), slots.clone());
        sh.inflight.fetch_add(1, Ordering::SeqCst);
        inflight.push(
            std::thread::Builder::new()
                .name("submit".into())
                .spawn(move || {
                    submit_one(&*sub, &tid, f, &sh);
                    sh.inflight.fetch_sub(1, Ordering::SeqCst);
                    let (m, cv) = &*slots;
                    *m.lock().unwrap() -= 1;
                    cv.notify_one();
                })
                .expect("spawn submit thread"),
        );
    }
    for h in inflight {
        let _ = h.join();
    }
}

fn start_submitter(rx: mpsc::Receiver<Found>, sink: Sink, sh: &Arc<Shared>) -> std::thread::JoinHandle<()> {
    let sh = sh.clone();
    std::thread::Builder::new()
        .name("submit-dispatch".into())
        .spawn(move || submit_loop(rx, sink, sh))
        .expect("spawn submit dispatcher")
}

/// `profile` event of --status-json.
fn profile_event(prof: &Profile, all_huge: bool) -> serde_json::Value {
    json!({
        "type": "profile",
        "version": env!("CARGO_PKG_VERSION"),
        "backend": jetsam_core::cpu::selected_backend().to_string(),
        "cpu": cpu_model(),
        "threads": prof.cpus.len(),
        "tpc": prof.per_core,
        "pads": prof.pads,
        "prefetch": prof.prefetch,
        "kernel": walk::describe(prof.kernel, prof.pads, prof.pipe),
        "pages": sys::pages_label(all_huge),
    })
}

/// `status` event of --status-json.
fn status_event(hps: f64, height: Option<u64>, sh: &Shared, uptime_s: u64, state: &str, message: &str) -> serde_json::Value {
    json!({
        "type": "status",
        "ts": status::unix_now(),
        "hps": (hps * 10.0).round() / 10.0,
        "height": height,
        "found": sh.found.load(Ordering::Relaxed),
        "accepted": sh.accepted.load(Ordering::Relaxed),
        "refused": sh.refused.load(Ordering::Relaxed),
        "unknown": sh.unknown.load(Ordering::Relaxed),
        "uptime_s": uptime_s,
        "state": state,
        "message": message,
    })
}

/// What the poller last saw, for the status thread.
#[derive(Default)]
struct NetView {
    /// The last poll failed: no answer, 401, HTTP error.
    error: Option<String>,
    /// The last poll was answered with an RPC-level refusal (no work yet).
    refusal: Option<String>,
    /// The last template is the one this miner already won.
    idle_after_win: bool,
    /// Height of the last template.
    height: Option<u64>,
}

/// --status-json: one `status` event every 5 s from its own thread, so a
/// poll that waits on the node (up to 30 s) never delays it. The rate is
/// measured over the last 10 s.
fn start_status_thread(sh: Arc<Shared>, view: Arc<std::sync::Mutex<NetView>>, started: Instant) {
    if !status::json_on() {
        return;
    }
    std::thread::Builder::new()
        .name("status".into())
        .spawn(move || {
            let mut win: std::collections::VecDeque<(Instant, u64)> = Default::default();
            win.push_back((Instant::now(), sh.hashed.load(Ordering::Relaxed)));
            let mut next = Instant::now() + STATUS_EVERY;
            loop {
                std::thread::sleep(next.saturating_duration_since(Instant::now()));
                next += STATUS_EVERY;
                let now = Instant::now();
                win.push_back((now, sh.hashed.load(Ordering::Relaxed)));
                while win.len() > 3 {
                    win.pop_front();
                }
                let (t0, h0) = win[0];
                let dt = now.duration_since(t0).as_secs_f64();
                let hps = if dt > 0.5 { (win.back().unwrap().1 - h0) as f64 / dt } else { 0.0 };
                let live = sh.job.read().unwrap().is_some() && sh.now_ns() < sh.deadline_ns.load(Ordering::Relaxed);
                let v = view.lock().unwrap();
                let (state, message) = match (&v.error, live, &v.refusal) {
                    (Some(e), _, _) => ("error", e.clone()),
                    (None, true, _) => ("mining", String::new()),
                    (None, false, Some(r)) => ("waiting", r.clone()),
                    (None, false, None) if v.idle_after_win => ("waiting", "block accepted; waiting for the next one".into()),
                    (None, false, None) => ("waiting", "waiting for a template".into()),
                };
                let e = status_event(hps, v.height, &sh, started.elapsed().as_secs(), state, &message);
                drop(v);
                status::emit(e);
            }
        })
        .expect("spawn status thread");
}

/// Ctrl-C / SIGTERM: stop hashing, give the solutions already on the wire a
/// few seconds for their answer, print the totals, exit 0.
fn shutdown(sh: &Shared, started: Instant) -> ! {
    sh.stop.store(true, Ordering::Relaxed);
    let t = Instant::now();
    while sh.inflight.load(Ordering::SeqCst) > 0 && t.elapsed() < Duration::from_secs(5) {
        std::thread::sleep(Duration::from_millis(50));
    }
    status::emit(status_event(0.0, None, sh, started.elapsed().as_secs(), "waiting", "stopped"));
    exit_once(
        0,
        &format!(
            "stopped after {} s: found={} accepted={} refused={} unknown={}",
            started.elapsed().as_secs(),
            sh.found.load(Ordering::Relaxed),
            sh.accepted.load(Ordering::Relaxed),
            sh.refused.load(Ordering::Relaxed),
            sh.unknown.load(Ordering::Relaxed),
        ),
    )
}

fn mine(cli: &Cli, th: &Arc<Thermal>, prof: Arc<Profile>) -> Result<()> {
    let started = Instant::now();
    let ident_cpu = format!(
        "{} - {}t ({}/core, {} pads{})",
        cpu_model(),
        prof.cpus.len(),
        prof.per_core,
        prof.pads,
        if prof.prefetch { ", pf" } else { "" }
    );
    let mut rpc = Rpc {
        url: cli.rpc.clone(),
        key: cli.key.clone(),
        // The fleet's pool names its machines by hostname; the public build
        // sends a name only when the user gives one.
        host: worker_header(cli.worker_name.as_deref(), cfg!(feature = "fleet").then(sys::hostname).as_deref()),
        cpu: header_safe(&ident_cpu, 64),
        http: reqwest::blocking::Client::builder().timeout(POLL_TIMEOUT).build()?,
        rate: Arc::new(AtomicU64::new(0)),
        th: Some(th.clone()),
        eff: prof.policy == Policy::Efficiency,
    };
    let sh = Arc::new(Shared::new(None, 0, th.clone(), prof.cpus.len()));
    let (rx, _workers) = start_workers(&prof, &sh);
    let (huge_ok, workers) = check_huge(cli, &prof, &sh, false);
    if prof.huge && huge_ok < workers {
        // Tell the pool's dashboard too: a 4K miner is a slow miner.
        rpc.cpu = format!("{} 4K!", header_safe(&rpc.cpu, 59));
    }
    status::emit(profile_event(&prof, prof.huge && huge_ok == workers));
    // The submitter has its own client: a poll stuck in a timeout never
    // delays a found block.
    let submit_rpc = Rpc {
        url: rpc.url.clone(),
        key: rpc.key.clone(),
        host: rpc.host.clone(),
        cpu: rpc.cpu.clone(),
        http: reqwest::blocking::Client::builder().timeout(SUBMIT_TIMEOUT).build()?,
        rate: rpc.rate.clone(),
        th: rpc.th.clone(),
        eff: rpc.eff,
    };
    let _submitter = start_submitter(rx, Sink::Net(Arc::new(submit_rpc)), &sh);
    sys::install_stop_handler();
    eprintln!("rpc={}  auth={}  poll={}ms", cli.rpc, if cli.key.is_some() { "bearer" } else { "none" }, cli.poll_ms);

    let entropy = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u128;
    // Same separation as jetsam-extminer: bits 64..96 differ per process, so two
    // miners given the same region by a pool never grind the same nonces.
    let process_offset: u128 = process_offset(entropy, u128::from(std::process::id()));
    let solo_base: u128 = (entropy & 0xFFFF_FFFF) << 96;

    let mut poller = Poller::default();
    let mut backoff = Duration::from_millis(250);
    // Same refusal from a live pool, every poll: logged once per 10 s.
    let mut last_refusal: Option<(String, Instant)> = None;
    let mut last_report = Instant::now();
    let mut win: std::collections::VecDeque<(Instant, u64, u64)> = Default::default();
    let report_every = Duration::from_secs(cli.report_secs.unwrap_or(15).max(1));
    let mut region_seen: Option<u32> = None;
    // --status-json: what the last poll said, read by the status thread.
    let view = Arc::new(std::sync::Mutex::new(NetView::default()));
    start_status_thread(sh.clone(), view.clone(), started);

    loop {
        if sys::stop_requested() {
            shutdown(&sh, started);
        }
        // Template (solutions go out on the submit thread, never from here).
        match rpc.call_typed::<_, BlockTemplateResponse>("jetsam_getBlockTemplate", [cli.coinbase.as_str()]) {
            Ok(t) => {
                backoff = Duration::from_millis(250);
                last_refusal = None;
                {
                    let mut v = view.lock().unwrap();
                    (v.error, v.refusal, v.height) = (None, None, Some(t.height));
                }
                let received = sh.now_ns();
                if t.nonce_field_index != NONCE_FIELD {
                    return Err(anyhow!("template nonce_field_index must be {NONCE_FIELD}, got {}", t.nonce_field_index));
                }
                if t.nonce_prefix != region_seen {
                    if let Some(p) = t.nonce_prefix {
                        eprintln!("nonce region {p} assigned by the pool");
                    }
                    region_seen = t.nonce_prefix;
                }
                let key = content_key(&t);
                let deadline = template_deadline_ns(received, t.expires_in_seconds);
                let action = poller.on_template(&key, sh.solved_epoch.load(Ordering::Relaxed));
                view.lock().unwrap().idle_after_win = action == TplAction::Idle;
                match action {
                    TplAction::Idle => {} // already won this one; idle until the tip moves
                    TplAction::NewJob(epoch) => {
                        let fields = decode_fields(&t.pow_fields_hex)?;
                        let target: [u8; 32] = hex::decode(&t.difficulty_target_hex)?
                            .try_into()
                            .map_err(|_| anyhow!("difficulty_target must be 32 bytes"))?;
                        let base = match t.nonce_prefix {
                            Some(p) => (u128::from(p) << NONCE_REGION_SHIFT) | process_offset,
                            None => solo_base | process_offset,
                        };
                        let rule = if t.pow_walk { "TowerWalk" } else { "sponge" };
                        eprintln!(
                            "┌─ h={} txs={} rule={rule} expires={}s tpl={}…",
                            t.height,
                            t.n_txs,
                            t.expires_in_seconds,
                            &t.template_id[..t.template_id.len().min(16)]
                        );
                        *sh.job.write().unwrap() = Some(Arc::new(Job {
                            epoch,
                            template_id: t.template_id.clone(),
                            height: t.height,
                            fields,
                            target,
                            walk: t.pow_walk,
                            base,
                        }));
                        sh.deadline_ns.store(deadline, Ordering::Relaxed);
                    }
                    TplAction::Same => {
                        // Same content re-served: the pool's view of its remaining
                        // life wins, and so does its current template id.
                        refresh_template_id(&sh.job, poller.epoch, &t.template_id);
                        sh.deadline_ns.store(deadline, Ordering::Relaxed);
                    }
                }
            }
            // No answer: back off exponentially, up to 2 s.
            Err(CallErr::Transport(e)) => {
                eprintln!("template fetch failed: {e} — retry in {:?}", backoff);
                view.lock().unwrap().error = Some(e);
                std::thread::sleep(backoff);
                backoff = (backoff * 2).min(Duration::from_secs(2));
            }
            // The pool answered (it is alive, e.g. no template yet): the next
            // poll comes after the normal --poll-ms, never later.
            Err(CallErr::Answer(e)) => {
                let epoch = sh.job.read().unwrap().as_ref().map(|j| j.epoch);
                if let Some(epoch) = epoch { gozero_pause_epoch(&sh, epoch); }
                backoff = Duration::from_millis(250);
                let repeat = matches!(&last_refusal, Some((m, t)) if *m == e && t.elapsed() < Duration::from_secs(10));
                if !repeat {
                    eprintln!("template fetch refused: {e} — retry in {} ms", cli.poll_ms);
                    last_refusal = Some((e.clone(), Instant::now()));
                }
                // An RPC-level refusal is a live node/pool without work for us
                // yet; anything else (401, HTTP error, garbage) is an error.
                let mut v = view.lock().unwrap();
                if e.starts_with("RPC error") {
                    (v.error, v.refusal) = (None, Some(e));
                } else {
                    (v.error, v.refusal) = (Some(e), None);
                }
            }
        }

        // Rate over a 10 s window, published to the pool on the next call.
        let now = Instant::now();
        win.push_back((now, sh.hashed.load(Ordering::Relaxed), sh.busy_ns.load(Ordering::Relaxed)));
        while win.len() > 2 && now.duration_since(win[0].0) > Duration::from_secs(10) {
            win.pop_front();
        }
        let (t0, h0, _) = win[0];
        let dt = now.duration_since(t0).as_secs_f64();
        if dt > 1.0 {
            rpc.rate.store(((win.back().unwrap().1 - h0) as f64 / dt) as u64, Ordering::Relaxed);
        }
        if last_report.elapsed() >= report_every {
            last_report = Instant::now();
            let job = sh.job.read().unwrap().clone();
            let (b0, b1) = (win[0].2, win.back().unwrap().2);
            let duty = if dt > 1.0 { (b1 - b0) as f64 / 1e9 / dt / prof.cpus.len() as f64 * 100.0 } else { 0.0 };
            let temps = th.summary();
            eprintln!(
                "⛏  {}  h={}  duty={duty:.1}%  {}{}found={} accepted={} refused={} unknown={}",
                fmt_rate(rpc.rate.load(Ordering::Relaxed) as f64),
                job.map(|j| j.height.to_string()).unwrap_or_else(|| "-".into()),
                if th.guarded { format!("pwm={:.2}  ", th.duty()) } else { String::new() },
                if temps.is_empty() { String::new() } else { format!("{temps}  ") },
                sh.found.load(Ordering::Relaxed),
                sh.accepted.load(Ordering::Relaxed),
                sh.refused.load(Ordering::Relaxed),
                sh.unknown.load(Ordering::Relaxed),
            );
        }
        std::thread::sleep(Duration::from_millis(cli.poll_ms));
    }
}

/// --serve: the LAN relay. It hashes nothing, so it keeps the normal
/// priority (it answers the miners faster) and needs no CPU check.
fn serve(cli: &Cli, addr: &str) -> ! {
    let listen = relay::check_listen(addr, cli.allow_public).unwrap_or_else(|e| exit_once(2, &format!("error: {e}")));
    let lan_key =
        relay::check_lan_key(cli.lan_key.as_deref(), cli.key.as_deref()).unwrap_or_else(|e| exit_once(2, &format!("error: {e}")));
    eprintln!("{VERSION}  LAN relay");
    relay::run(relay::Config {
        listen,
        upstream: cli.rpc.clone(),
        node_key: cli.key.clone().filter(|k| !k.trim().is_empty()),
        lan_key,
        allow_public: cli.allow_public,
        report_every: Duration::from_secs(cli.report_secs.unwrap_or(30).max(1)),
        version: VERSION,
    })
}

/// --check-hardware: everything the miner relies on, one line each.
fn check_hardware(cli: &Cli) -> bool {
    let mut ok = true;
    let mut line = |good: bool, what: &str, v: String| {
        ok &= good;
        println!("{} {what:<10} {v}", if good { "ok  " } else { "FAIL" });
    };
    line(true, "binary", format!("{VERSION} sha256={}", sys::self_sha256()));
    match jetsam_core::cpu::ensure_production_hardware() {
        Ok(_) => line(true, "backend", format!("{}", jetsam_core::cpu::selected_backend())),
        Err(e) => line(false, "backend", format!("{e}")),
    }
    match profile(cli) {
        Ok(p) => {
            let id = sys::cpuid();
            line(
                true,
                "cpu",
                format!(
                    "{} (family {}) | L2 {} KiB, L3 {} KiB | profile {} x {} pads (prefetch {}) on {} CPUs [{}]",
                    cpu_model(),
                    id.family,
                    p.l2_kib,
                    p.l3_kib,
                    p.per_core,
                    p.pads,
                    p.prefetch as u8,
                    p.cpus.len(),
                    p.source
                ),
            );
            line(
                true,
                "quota",
                match &p.quota {
                    Some(q) => format!("{:.2} CPUs ({}): at most {} worker threads", q.cpus, q.source, q.max_workers()),
                    None => "none".into(),
                },
            );
        }
        Err(e) => line(false, "cpu", format!("{e}")),
    }
    for (good, what, v) in sys::platform_checks() {
        line(good, what, v);
    }
    #[cfg(feature = "fleet")]
    match guard::Sensor::detect() {
        Some(s) => {
            let r = s.read().unwrap_or_default();
            line(true, "sensor", format!("{}  now {:.1} C", s.describe(), r.max_mc() as f64 / 1000.0));
        }
        None => line(false, "sensor", "none (k10temp / zenpower / coretemp): the miner refuses to start without --no-thermal-guard".into()),
    }
    #[cfg(not(feature = "fleet"))]
    line(true, "thermal", "none (public build: no thermal guard, no sensor needed)".into());
    #[cfg(target_os = "linux")]
    match rapl::Rapl::open() {
        Some(r) => line(true, "rapl", format!("readable ({})", r.mode.name())),
        None => line(true, "rapl", "n/a (root or passwordless sudo needed; only --bench-walk/--tune use it)".into()),
    }
    ok
}

fn main() {
    let cli = Cli::parse();
    #[cfg(target_os = "macos")]
    if let Some(pid) = cli.parent_pid {
        if unsafe { libc::getppid() } as u32 != pid {
            exit_once(2, "GUI parent does not match the launching process");
        }
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(500));
            if unsafe { libc::getppid() } as u32 != pid {
                sys::STOP.store(true, Ordering::SeqCst);
                // Bound cleanup even during a blocking RPC request.
                std::thread::sleep(Duration::from_secs(5));
                std::process::exit(0);
            }
        });
    }
    if cli.status_json {
        status::enable_json();
    }
    if let Some(addr) = &cli.serve {
        serve(&cli, addr);
    }
    apply_priority(cli.priority);
    if cli.check_hardware {
        std::process::exit(if check_hardware(&cli) { 0 } else { 1 });
    }
    if let Err(e) = validate(&cli) {
        exit_once(2, &format!("error: {e}"));
    }
    if let Err(e) = jetsam_core::cpu::ensure_production_hardware() {
        exit_once(1, &format!("fatal: {e}"));
    }
    if cli.gate {
        // The gate runs every kernel shape at once on all cores. In the
        // thermal-guard build it gets the same guard as mining (stop at 81 C,
        // predictive), without the regulator, and the same watchdog (gate
        // threads at nice +10 check the reading's age before every walk); a
        // tripped guard exits non-zero, so the gate fails safe.
        let th = start_thermal(&cli);
        let ok = gate::full(cli.gate_random, &th);
        #[cfg(feature = "fleet")]
        if th.guarded {
            println!(
                "gate thermal guard: {} readings, longest gap {:.0} ms (poll {} ms, stale after {} ms), peak {:.1} C",
                th.readings.load(Ordering::Relaxed),
                th.gap_max_ns.load(Ordering::Relaxed) as f64 / 1e6,
                cli.guard.temp_poll_ms,
                thermal::STALE_NS / 1_000_000,
                th.peak_c()
            );
        }
        std::process::exit(if ok { 0 } else { 1 });
    }
    #[cfg(feature = "fleet")]
    if cli.guard.temp_pause.is_some() || cli.guard.temp_resume.is_some() {
        eprintln!(
            "warning: --temp-pause/--temp-resume are deprecated and ignored: replaced by --temp-target \
             (duty-cycle regulator) and --temp-stop"
        );
    }
    let prof = match profile(&cli) {
        Ok(p) => Arc::new(p),
        Err(e) => exit_once(1, &format!("fatal: {e}")),
    };
    banner(&prof);
    if prof.huge {
        if let Some(msg) = sys::huge_disabled() {
            exit_once(EXIT_NO_HUGE, &red(&format!("{msg}. Exit {EXIT_NO_HUGE}.")));
        }
    }
    // The guard (thermal-guard build) runs before anything hashes, the
    // self-test included.
    let th = start_thermal(&cli);
    match gate::self_test(prof.pads, prof.prefetch, prof.kernel, prof.huge, prof.pipe, 16, &th) {
        Ok(n) => eprintln!("self-test: {n}/{n} golden vectors bit-exact on this profile"),
        Err(e) => exit_once(EXIT_SELFTEST, &format!("SELF-TEST FAILED: {e}. Refusing to mine; exit {EXIT_SELFTEST}.")),
    }
    if let Some(secs) = cli.check_nonces {
        std::process::exit(if check_nonces(&cli, &th, prof, secs.max(1)) { 0 } else { 1 });
    }
    if let Some(secs) = cli.tune {
        if let Err(e) = run_tune(&cli, &th, secs.max(3)) {
            eprintln!("tune failed: {e:#}");
            std::process::exit(1);
        }
        return;
    }
    if let Some(secs) = cli.bench_walk {
        run_bench(&cli, &th, prof, secs.max(1));
        return;
    }
    if let Err(e) = mine(&cli, &th, prof) {
        exit_once(1, &format!("fatal: {e:#}"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cli(args: &[&str]) -> std::result::Result<Cli, clap::Error> {
        Cli::try_parse_from(std::iter::once("towerminer").chain(args.iter().copied()))
    }

    #[cfg(feature = "fleet")]
    #[test]
    fn cli_rejects_target_above_stop_minus_5() {
        let c = cli(&["--temp-stop", "70", "--temp-target", "66"]).unwrap();
        assert!(validate(&c).is_err(), "66 > 70 - 5 must be refused");
        let c = cli(&["--temp-stop", "70", "--temp-target", "65"]).unwrap();
        assert!(validate(&c).is_ok());
        // The stop can never be raised above the hard limit.
        assert!(cli(&["--temp-stop", "83"]).is_err());
        assert!(cli(&["--temp-stop", "82"]).is_ok());
        // Without an explicit target the default follows a lowered stop.
        let c = cli(&["--temp-stop", "60"]).unwrap();
        assert!(validate(&c).is_ok());
        assert_eq!(c.guard.temp_target(), 55.0);
        assert_eq!(cli(&[]).unwrap().guard.temp_target(), 74.0);
        // Sensor cadence is bounded.
        assert!(cli(&["--temp-poll-ms", "600"]).is_err());
        assert!(cli(&["--temp-poll-ms", "99"]).is_err());
    }

    #[cfg(not(feature = "fleet"))]
    #[test]
    fn public_build_has_no_thermal_options() {
        assert!(cli(&["--temp-stop", "70"]).is_err());
        assert!(cli(&["--no-thermal-guard"]).is_err());
        let c = cli(&[]).unwrap();
        assert_eq!(reg_target(&c), None);
        assert!(!start_thermal(&c).guarded);
    }

    #[test]
    fn priority_defaults_to_low() {
        assert_eq!(cli(&[]).unwrap().priority, Priority::Low);
        assert_eq!(cli(&["--priority", "low"]).unwrap().priority, Priority::Low);
        assert_eq!(cli(&["--priority", "normal"]).unwrap().priority, Priority::Normal);
        assert!(cli(&["--priority", "high"]).is_err());
        assert!(cli(&["--priority", "idle"]).is_err());
        assert!(cli(&["--priority"]).is_err());
    }

    #[test]
    fn priority_action_only_ever_lowers() {
        // low: lower a process above the low level, leave one already at or
        // below it alone (never raise it back).
        assert_eq!(priority_action(Priority::Low, false), PriorityAction::Lower);
        assert_eq!(priority_action(Priority::Low, true), PriorityAction::Keep);
        // normal: the priority is left as it is, whatever it is.
        assert_eq!(priority_action(Priority::Normal, false), PriorityAction::Keep);
        assert_eq!(priority_action(Priority::Normal, true), PriorityAction::Keep);
    }

    // ---------------------------------------------------------------------
    // Ported from jetsam-extminer (names kept), adapted to the persistent
    // workers: the "cursor" is the per-epoch counter of each worker.
    // ---------------------------------------------------------------------

    fn test_profile(pads: usize, kernel: u8, pipe: bool, seed_batch: usize) -> Profile {
        let cpu = *sys::allowed_cpus().iter().next().unwrap();
        Profile {
            cpus: vec![cpu],
            pads,
            prefetch: false,
            huge: true,
            l2_kib: 512,
            l3_kib: 0,
            per_core: 1,
            kernel,
            seed_batch,
            pipe,
            policy: Policy::Hashrate,
            source: "test".into(),
            tune_key: String::new(),
            quota: None,
            uncapped: 1,
        }
    }

    const FIELDS0: [u128; FIELDS] = [0x1234_5678_9abc_def0; FIELDS];

    fn job(epoch: u64, base: u128, walk: bool, target: [u8; 32]) -> Arc<Job> {
        Arc::new(Job {
            epoch,
            template_id: format!("tpl{epoch}"),
            height: 7,
            fields: FIELDS0.map(Block128::from),
            target,
            walk,
            base,
        })
    }

    fn shared(j: Option<Arc<Job>>, deadline_ns: u64) -> Arc<Shared> {
        Arc::new(Shared::new(j, deadline_ns, Arc::new(Thermal::new(Instant::now(), false)), 1))
    }

    /// Run one worker until `n` solutions are in (or `max` elapsed).
    fn collect(prof: Profile, sh: &Arc<Shared>, n: usize, max: Duration) -> (Vec<Found>, Vec<std::thread::JoinHandle<()>>) {
        let (rx, hs) = start_workers(&Arc::new(prof), sh);
        let t = Instant::now();
        let mut v = Vec::new();
        while v.len() < n && t.elapsed() < max {
            if let Ok(f) = rx.recv_timeout(Duration::from_millis(20)) {
                v.push(f);
            }
        }
        (v, hs)
    }

    fn stop(sh: &Arc<Shared>, hs: Vec<std::thread::JoinHandle<()>>) {
        sh.stop.store(true, Ordering::Relaxed);
        for h in hs {
            h.join().unwrap();
        }
    }

    const FAR: u64 = u64::MAX;

    #[test]
    fn nonce_submission_is_canonical_little_endian_hex() {
        let nonce = 0x0123_4567_89ab_cdef_fedc_ba98_7654_3210u128;
        let encoded = hex::encode(nonce.to_le_bytes());
        assert_eq!(encoded.len(), 32);
        assert_eq!(u128::from_le_bytes(hex::decode(encoded).unwrap().try_into().unwrap()), nonce);
    }

    #[test]
    fn template_deadline_reserves_submit_margin() {
        let received = 5_000_000_000u64;
        assert_eq!(template_deadline_ns(received, 30) - received, 29_000_000_000);
        assert_eq!(template_deadline_ns(received, 1), received);
        assert_eq!(template_deadline_ns(received, 0), received);
    }

    #[test]
    fn expired_template_stops_before_hashing_and_keeps_its_place() {
        let base = 3u128 << NONCE_REGION_SHIFT;
        let sh = shared(Some(job(1, base, true, [0xFF; 32])), 0);
        let (v, hs) = collect(test_profile(1, walk::K_FAST, true, 8), &sh, 1, Duration::from_millis(150));
        assert!(v.is_empty(), "an expired template must not be hashed");
        assert_eq!(sh.hashed.load(Ordering::Relaxed), 0);
        stop(&sh, hs);
        // Same epoch, deadline pushed back: the search starts where it was, at 0.
        let sh = shared(Some(job(1, base, true, [0xFF; 32])), FAR);
        let (v, hs) = collect(test_profile(1, walk::K_FAST, true, 8), &sh, 1, Duration::from_secs(5));
        stop(&sh, hs);
        assert_eq!(v[0].nonce, nonce_at(base, 0, 0), "an expired pass hashed nothing, so it must not skip that range");
    }

    #[test]
    fn the_cursor_never_re_searches_a_range_it_already_covered() {
        let base = 9u128 << NONCE_REGION_SHIFT;
        let sh = shared(Some(job(1, base, true, [0xFF; 32])), FAR);
        let (v, hs) = collect(test_profile(1, walk::K_FAST, true, 8), &sh, 24, Duration::from_secs(10));
        stop(&sh, hs);
        assert_eq!(v.len(), 24);
        for w in v.windows(2) {
            assert_eq!(w[1].nonce, w[0].nonce + 1, "every nonce once, in order");
        }
    }

    #[test]
    fn target_changes_keep_nonce_cursor_and_rebuild_seed_ring() {
        for (pads, pipe, ring) in [(2, false, 2), (1, true, 8)] {
            let sh = shared(Some(job(1, 0, true, [0xFF; 32])), FAR);
            let (rx, hs) = start_workers(&Arc::new(test_profile(pads, walk::K_FAST, pipe, ring)), &sh);
            let first = rx.recv_timeout(Duration::from_secs(5)).unwrap();
            *sh.job.write().unwrap() = Some(job(2, 0, true, [0xFE; 32]));
            let mut old_last = first.nonce;
            let next = loop {
                let f = rx.recv_timeout(Duration::from_secs(5)).unwrap();
                if f.epoch == 2 { break f; }
                old_last = old_last.max(f.nonce);
            };
            stop(&sh, hs);
            assert!(next.nonce > old_last, "new target must not restart prior nonce range");
            let mut scratch = Scratch::new();
            assert_eq!(next.digest, gate::oracle(&mut scratch, &gate::seed_of(&FIELDS0.map(Block128::from), next.nonce)));
        }
    }

    #[test]
    fn a_pass_cut_short_by_the_deadline_still_moves_the_cursor_forward() {
        let base = 11u128 << NONCE_REGION_SHIFT;
        let sh = shared(Some(job(1, base, true, [0xFF; 32])), FAR);
        let (rx, hs) = start_workers(&Arc::new(test_profile(1, walk::K_FAST, true, 8)), &sh);
        let mut last = None;
        let t = Instant::now();
        while t.elapsed() < Duration::from_millis(100) {
            if let Ok(f) = rx.recv_timeout(Duration::from_millis(10)) {
                last = Some(f.nonce);
            }
        }
        // The deadline passes mid-ring: the worker stops between two hashes.
        sh.deadline_ns.store(0, Ordering::Relaxed);
        std::thread::sleep(Duration::from_millis(50));
        while let Ok(f) = rx.try_recv() {
            last = Some(f.nonce);
        }
        let last = last.expect("some solutions before the deadline");
        sh.deadline_ns.store(FAR, Ordering::Relaxed);
        let next = rx.recv_timeout(Duration::from_secs(5)).expect("resumes").nonce;
        stop(&sh, hs);
        assert_eq!(next, last + 1, "resumed at {next}, the pass before ended at {last}");
    }

    #[test]
    fn a_solution_surfaces_as_soon_as_one_thread_finds_it() {
        let sh = shared(Some(job(1, 0, true, [0xFF; 32])), FAR);
        let t = Instant::now();
        let (v, hs) = collect(test_profile(1, walk::K_FAST, true, 8), &sh, 1, Duration::from_secs(5));
        let dt = t.elapsed();
        stop(&sh, hs);
        assert_eq!(v.len(), 1);
        // One walk is ~1 ms; the solution is sent from the worker the moment
        // its hash is checked, not at the end of a batch or a poll.
        assert!(dt < Duration::from_millis(500), "first solution after {dt:?}");
    }

    #[test]
    fn a_second_miner_in_the_same_region_starts_somewhere_else() {
        let region = u128::from(7u32) << NONCE_REGION_SHIFT;
        let first = region | process_offset(1_111, 4_242);
        let second = region | process_offset(1_111, 9_999);
        assert_ne!(first, second, "same clock, different pid must diverge");
        // A worker covers 2^52 nonces per job: the offsets are 2^64 apart.
        assert!(first.abs_diff(second) >= 1u128 << 64);
        let highest = region | process_offset(u128::MAX, u128::MAX);
        assert_eq!(highest >> NONCE_REGION_SHIFT, 7, "no worker can walk out of its region");
    }

    #[test]
    fn a_pool_region_is_wider_than_any_machine_can_search() {
        let first = u128::from(0u32) << NONCE_REGION_SHIFT;
        let second = u128::from(1u32) << NONCE_REGION_SHIFT;
        assert_eq!(second - first, 1u128 << 96);
        // 4096 workers x 2^52 nonces fit in one process offset (2^64).
        assert_eq!(4096u128 << 52, 1u128 << 64);
        assert_eq!(u128::from(u32::MAX) << NONCE_REGION_SHIFT, u128::MAX - ((1u128 << 96) - 1));
    }

    #[test]
    fn a_template_without_a_pool_region_still_parses() {
        let solo = r#"{"template_id":"ab","pow_fields_hex":"00","nonce_field_index":0,
            "difficulty_target_hex":"ff","height":7,"expires_in_seconds":120,"n_txs":0}"#;
        let parsed: BlockTemplateResponse = serde_json::from_str(solo).expect("node template");
        assert_eq!(parsed.nonce_prefix, None);
        let pooled = r#"{"template_id":"ab","pow_fields_hex":"00","nonce_field_index":0,
            "difficulty_target_hex":"ff","height":7,"expires_in_seconds":120,"n_txs":0,
            "nonce_prefix":3}"#;
        let parsed: BlockTemplateResponse = serde_json::from_str(pooled).expect("pool template");
        assert_eq!(parsed.nonce_prefix, Some(3));
    }

    #[test]
    fn the_walk_is_off_unless_the_node_asks_for_it() {
        let without = r#"{"template_id":"ab","pow_fields_hex":"00","nonce_field_index":0,
            "difficulty_target_hex":"ff","height":7,"expires_in_seconds":120,"n_txs":0}"#;
        let parsed: BlockTemplateResponse = serde_json::from_str(without).expect("old node");
        assert!(!parsed.pow_walk, "absent must mean off");
        let with = r#"{"template_id":"ab","pow_fields_hex":"00","nonce_field_index":0,
            "difficulty_target_hex":"ff","height":7,"expires_in_seconds":120,"n_txs":0,
            "pow_walk":true}"#;
        let parsed: BlockTemplateResponse = serde_json::from_str(with).expect("forked node");
        assert!(parsed.pow_walk);
    }

    #[test]
    fn the_walked_search_finds_a_nonce_under_a_trivial_target() {
        let sh = shared(Some(job(1, 0, true, [0xFF; 32])), FAR);
        let (v, hs) = collect(test_profile(1, walk::K_FAST, true, 8), &sh, 1, Duration::from_secs(5));
        stop(&sh, hs);
        let f = &v[0];
        let seed = gate::seed_of(&FIELDS0.map(Block128::from), f.nonce);
        let walked = jetsam_poseidon2b::towerwalk::towerwalk_digest(&seed);
        assert_eq!(walked, f.digest, "the reported digest is the reference walk of that nonce");
        assert_ne!(walked, seed, "the walk must not be the identity");
        assert_eq!(f.height, 7, "a solution carries the height of its job");
    }

    // ---------------------------------------------------------------------
    // towerminer's own
    // ---------------------------------------------------------------------

    #[test]
    fn nonce_layout_worker_bits_and_region() {
        let base = (0xDEAD_BEEFu128 << 96) | (0x0123_4567u128 << 64);
        let n = nonce_at(base, 0xABC, 0x000F_FFFF_FFFF_FFFF);
        assert_eq!(n >> 96, 0xDEAD_BEEF, "pool region");
        assert_eq!((n >> 64) & 0xFFFF_FFFF, 0x0123_4567, "process offset");
        assert_eq!((n >> 52) & 0xFFF, 0xABC, "worker id");
        assert_eq!(n & ((1 << 52) - 1), 0x000F_FFFF_FFFF_FFFF, "counter");
        // The counter wraps inside its 52 bits instead of spilling into the id.
        assert_eq!(nonce_at(base, 1, 1u128 << 52), nonce_at(base, 1, 0));
    }

    #[test]
    fn le256_lt_bounds() {
        let mut a = [0u8; 32];
        let mut b = [0u8; 32];
        assert!(!le256_lt(&a, &b), "equal is not below");
        b[31] = 1;
        assert!(le256_lt(&a, &b));
        assert!(!le256_lt(&b, &a));
        // The most significant byte is the last one (little-endian).
        a[0] = 0xFF;
        assert!(le256_lt(&a, &b));
        a[31] = 1;
        assert!(!le256_lt(&a, &b), "0xFF in byte 0 outweighs nothing at byte 31");
    }

    #[test]
    fn seed_ring_yields_consecutive_nonces() {
        let fields = FIELDS0.map(Block128::from);
        let mut sc = Scratch::new();
        // (pads, kernel, pipe, ring, prefetch): piped double ring, the same
        // with prefetch, odd piped ring, plain ring of 8 at 1 pad, grouped
        // fold at 2 pads, 3 pads ring 6.
        for (pads, k, pipe, ring, pf) in [
            (1, walk::K_FAST, true, 8, false),
            (1, walk::K_FAST, true, 8, true),
            (1, walk::K_FAST, true, 3, false),
            (1, walk::K_BASE, false, 8, false),
            (2, walk::K_FAST, false, 2, false),
            (3, walk::K_FAST, false, 4, false),
        ] {
            let base = 5u128 << NONCE_REGION_SHIFT;
            let sh = shared(Some(job(1, base, true, [0xFF; 32])), FAR);
            let mut prof = test_profile(pads, k, pipe, ring);
            prof.prefetch = pf;
            let (v, hs) = collect(prof, &sh, 20, Duration::from_secs(20));
            stop(&sh, hs);
            assert_eq!(v.len(), 20);
            assert_eq!(v[0].nonce, nonce_at(base, 0, 0));
            for (i, f) in v.iter().enumerate() {
                assert_eq!(f.nonce, nonce_at(base, 0, i as u128), "pads={pads} pipe={pipe} ring={ring}");
                let d = gate::oracle(&mut sc, &gate::seed_of(&fields, f.nonce));
                assert_eq!(d, f.digest, "pads={pads} pipe={pipe} ring={ring}: digest reported under the wrong nonce");
            }
        }
    }

    fn tpl(id: &str, fields: &str, height: u64, prefix: Option<u32>) -> BlockTemplateResponse {
        BlockTemplateResponse {
            template_id: id.into(),
            pow_fields_hex: fields.into(),
            nonce_field_index: 0,
            difficulty_target_hex: "ff".into(),
            height,
            expires_in_seconds: 12,
            n_txs: 0,
            nonce_prefix: prefix,
            pow_walk: true,
        }
    }

    #[test]
    fn content_key_ignores_template_id_and_includes_prefix() {
        assert_eq!(content_key(&tpl("a", "00", 7, Some(3))), content_key(&tpl("b", "00", 7, Some(3))));
        assert_ne!(content_key(&tpl("a", "00", 7, Some(3))), content_key(&tpl("a", "00", 7, Some(4))));
        assert_ne!(content_key(&tpl("a", "00", 7, Some(3))), content_key(&tpl("a", "00", 7, None)));
        assert_ne!(content_key(&tpl("a", "00", 7, None)), content_key(&tpl("a", "01", 7, None)));
    }

    #[test]
    fn same_key_new_id_swaps_id_keeps_epoch() {
        let mut p = Poller::default();
        assert_eq!(p.on_template("k1", 0), TplAction::NewJob(1));
        assert_eq!(p.on_template("k1", 0), TplAction::Same);
        let lock = RwLock::new(Some(Arc::new(Job {
            epoch: 1,
            template_id: "old".into(),
            height: 7,
            fields: [Block128::from(1u128); FIELDS],
            target: [0x80; 32],
            walk: true,
            base: 42,
        })));
        assert!(refresh_template_id(&lock, 1, "new"));
        let j = lock.read().unwrap().clone().unwrap();
        assert_eq!((j.epoch, j.template_id.as_str(), j.base, j.height), (1, "new", 42, 7));
        assert!(!refresh_template_id(&lock, 1, "new"), "same id: nothing to do");
        assert!(!refresh_template_id(&lock, 2, "other"), "another epoch's job is never touched");
        *lock.write().unwrap() = None;
        assert!(!refresh_template_id(&lock, 1, "x"), "a won (cleared) job stays cleared");
    }

    #[test]
    fn solved_key_idles_same_content_and_mines_new_content_at_same_height() {
        let mut p = Poller::default();
        assert_eq!(p.on_template("h7-a", 0), TplAction::NewJob(1));
        // Epoch 1 won: the same content re-served is idle...
        assert_eq!(p.on_template("h7-a", 1), TplAction::Idle);
        assert_eq!(p.on_template("h7-a", 1), TplAction::Idle);
        // ...new content at the same height (our block lost the race) is mined.
        assert_eq!(p.on_template("h7-b", 1), TplAction::NewJob(2));
        assert_eq!(p.on_template("h7-b", 1), TplAction::Same, "an old win never idles new work");
        assert_eq!(p.on_template("h8", 1), TplAction::NewJob(3));
    }

    #[test]
    fn refusal_classification() {
        assert_eq!(classify_refusal("RPC error: template expired"), "stale");
        assert_eq!(classify_refusal("RPC error: unknown template"), "stale");
        assert_eq!(classify_refusal("RPC error: template already consumed"), "stale");
        assert_eq!(classify_refusal("RPC error: node busy, retry"), "busy");
        assert_eq!(classify_refusal("RPC error: invalid proof of work"), "refused");
        assert_eq!(classify_refusal("HTTP 500 Internal Server Error"), "refused");
    }

    #[test]
    fn submitter_forwards_live_solutions_and_drops_replaced_ones() {
        let lock_job = Arc::new(Job {
            epoch: 2,
            template_id: "t2".into(),
            height: 7,
            fields: [Block128::from(1u128); FIELDS],
            target: [0x80; 32],
            walk: true,
            base: 0,
        });
        let sh = Arc::new(Shared::new(Some(lock_job), u64::MAX, Arc::new(Thermal::new(Instant::now(), false)), 1));
        let (tx, rx) = mpsc::channel();
        let (vtx, vrx) = mpsc::channel();
        let h = start_submitter(rx, Sink::Check(vtx), &sh);
        let f = |epoch, nonce| Found { epoch, template_id: "x".into(), height: 7, nonce, digest: [0; 32], t_found: Instant::now() };
        tx.send(f(1, 10)).unwrap(); // replaced epoch: dropped
        tx.send(f(2, 11)).unwrap(); // live: forwarded
        drop(tx);
        h.join().unwrap();
        let got: Vec<(Found, Duration)> = vrx.try_iter().collect();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].0.nonce, 11);
        assert!(got[0].1 < Duration::from_millis(100), "found -> submit took {:?}", got[0].1);
        assert_eq!(sh.found.load(Ordering::Relaxed), 2);
    }

    /// Test double for the pool: records when each submission starts and how
    /// many run at once, answers after `delay`.
    struct SlowSink {
        delay: Duration,
        answer: fn() -> std::result::Result<String, CallErr>,
        starts: std::sync::Mutex<Vec<Instant>>,
        now: std::sync::atomic::AtomicUsize,
        peak: std::sync::atomic::AtomicUsize,
    }

    impl SlowSink {
        fn new(delay: Duration, answer: fn() -> std::result::Result<String, CallErr>) -> Arc<SlowSink> {
            Arc::new(SlowSink { delay, answer, starts: Default::default(), now: Default::default(), peak: Default::default() })
        }
    }

    impl Submit for SlowSink {
        fn submit(&self, _tid: &str, _nonce_hex: &str) -> std::result::Result<String, CallErr> {
            self.starts.lock().unwrap().push(Instant::now());
            let n = self.now.fetch_add(1, Ordering::SeqCst) + 1;
            self.peak.fetch_max(n, Ordering::SeqCst);
            std::thread::sleep(self.delay);
            self.now.fetch_sub(1, Ordering::SeqCst);
            (self.answer)()
        }
    }

    fn found(nonce: u128) -> Found {
        Found { epoch: 1, template_id: "tpl1".into(), height: 7, nonce, digest: [0; 32], t_found: Instant::now() }
    }

    #[test]
    fn pool_share_acceptance_keeps_the_job_and_accepts_the_next_share() {
        let sink = SlowSink::new(Duration::ZERO, || Ok("accepted".into()));
        let sh = shared(Some(job(1, 0, true, [0x80; 32])), FAR);
        submit_one(&*sink, "tpl1", found(1), &sh);
        assert_eq!(sh.solved_epoch.load(Ordering::Relaxed), 0);
        assert_eq!(sh.job.read().unwrap().as_ref().unwrap().epoch, 1);
        submit_one(&*sink, "tpl1", found(2), &sh);
        assert_eq!(sh.accepted.load(Ordering::Relaxed), 2);
        assert!(sh.job.read().unwrap().is_some());
    }

    #[test]
    fn node_block_acceptance_still_retires_the_solved_job() {
        let sink = SlowSink::new(Duration::ZERO, || Ok("ab".repeat(32)));
        let sh = shared(Some(job(1, 0, true, [0x80; 32])), FAR);
        submit_one(&*sink, "tpl1", found(1), &sh);
        assert_eq!(sh.solved_epoch.load(Ordering::Relaxed), 1);
        assert!(sh.job.read().unwrap().is_none());
        assert_eq!(sh.accepted.load(Ordering::Relaxed), 1);
    }

    /// Run the dispatcher on `founds` against `sink`, wait for every answer.
    fn submit_all(sink: &Arc<SlowSink>, founds: Vec<Found>) -> Arc<Shared> {
        let sh = shared(Some(job(1, 0, true, [0x80; 32])), FAR);
        let (tx, rx) = mpsc::channel();
        let h = start_submitter(rx, Sink::Net(sink.clone()), &sh);
        for f in founds {
            tx.send(f).unwrap();
        }
        drop(tx);
        h.join().unwrap();
        sh
    }

    #[test]
    fn gozero_share_ack_keeps_current_job_mining() {
        let sink = SlowSink::new(Duration::ZERO, || Ok("@gozero-share".into()));
        let sh = submit_all(&sink, vec![found(1), found(2), found(3)]);
        assert_eq!(sh.accepted.load(Ordering::Relaxed), 3);
        assert_eq!(sh.job.read().unwrap().as_ref().unwrap().epoch, 1);
        assert!(sh.now_ns() < sh.deadline_ns.load(Ordering::Relaxed));
    }

    #[test]
    fn gozero_pause_and_resume_preserves_job_epoch() {
        let sh = shared(Some(job(1, 0, true, [0x80; 32])), FAR);
        gozero_pause_epoch(&sh, 1);
        assert_eq!(sh.deadline_ns.load(Ordering::Relaxed), 0);
        assert_eq!(sh.job.read().unwrap().as_ref().unwrap().epoch, 1);
        sh.deadline_ns.store(FAR, Ordering::Relaxed);
        gozero_pause_epoch(&sh, 999);
        assert_eq!(sh.deadline_ns.load(Ordering::Relaxed), FAR);
    }

    #[test]
    fn gozero_stale_response_pauses_old_work() {
        let sink = SlowSink::new(Duration::ZERO, || Err(CallErr::Answer(
            "RPC error: {\"code\":21,\"message\":\"stale parent\"}".into())));
        let sh = submit_all(&sink, vec![found(1)]);
        assert_eq!(sh.refused.load(Ordering::Relaxed), 1);
        assert_eq!(sh.deadline_ns.load(Ordering::Relaxed), 0);
        assert!(sh.job.read().unwrap().is_some());
    }

    #[test]
    fn gozero_paused_solution_never_reaches_network() {
        let sink = SlowSink::new(Duration::ZERO, || Ok("@gozero-share".into()));
        let sh = shared(Some(job(1, 0, true, [0x80; 32])), FAR);
        gozero_pause_epoch(&sh, 1);
        submit_one(&*sink, "tpl1", found(1), &sh);
        assert!(sink.starts.lock().unwrap().is_empty());
        assert_eq!(sh.accepted.load(Ordering::Relaxed), 0);
        assert!(!gozero_stale_answer("RPC error: {\"code\":28}"));
    }

    #[test]
    fn a_second_block_goes_out_while_the_first_waits_for_its_answer() {
        let sink = SlowSink::new(Duration::from_secs(2), || Ok("ab".repeat(32)));
        let sh = shared(Some(job(1, 0, true, [0x80; 32])), FAR);
        let (tx, rx) = mpsc::channel();
        let h = start_submitter(rx, Sink::Net(sink.clone()), &sh);
        tx.send(found(10)).unwrap();
        let second = found(11);
        let sent = second.t_found;
        tx.send(second).unwrap();
        let t = Instant::now();
        while sink.starts.lock().unwrap().len() < 2 && t.elapsed() < Duration::from_secs(1) {
            std::thread::sleep(Duration::from_millis(2));
        }
        let starts = sink.starts.lock().unwrap().clone();
        assert_eq!(starts.len(), 2, "the second block waited for the first one's answer");
        let lag = starts[1].duration_since(sent);
        assert!(lag < Duration::from_millis(100), "second submission started {lag:?} after it was found");
        drop(tx);
        h.join().unwrap();
        assert_eq!(sh.accepted.load(Ordering::Relaxed), 2, "both answered yes");
        assert_eq!((sh.refused.load(Ordering::Relaxed), sh.unknown.load(Ordering::Relaxed)), (0, 0));
        assert_eq!(sh.inflight.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn no_answer_is_unknown_not_refused_and_never_retried() {
        let sink = SlowSink::new(Duration::ZERO, || Err(CallErr::Transport("operation timed out".into())));
        let sh = submit_all(&sink, vec![found(1)]);
        assert_eq!(sink.starts.lock().unwrap().len(), 1, "one attempt only: the pool retries on its side");
        assert_eq!(sh.accepted.load(Ordering::Relaxed), 0);
        assert_eq!(sh.refused.load(Ordering::Relaxed), 0);
        assert_eq!(sh.unknown.load(Ordering::Relaxed), 1);
        assert!(sh.job.read().unwrap().is_some(), "an unanswered block does not end the job");

        let sink = SlowSink::new(Duration::ZERO, || Err(CallErr::Answer("RPC error: template expired".into())));
        let sh = submit_all(&sink, vec![found(2)]);
        assert_eq!(sink.starts.lock().unwrap().len(), 1);
        assert_eq!((sh.accepted.load(Ordering::Relaxed), sh.refused.load(Ordering::Relaxed)), (0, 1));
        assert_eq!(sh.unknown.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn at_most_four_submissions_in_flight() {
        // Refusals keep the job live, so all six go out; 4 at a time.
        let sink = SlowSink::new(Duration::from_millis(300), || Err(CallErr::Answer("RPC error: busy".into())));
        let sh = submit_all(&sink, (0..6).map(found).collect());
        assert_eq!(sink.starts.lock().unwrap().len(), 6);
        assert_eq!(sink.peak.load(Ordering::SeqCst), SUBMIT_MAX_INFLIGHT);
        assert_eq!(sh.refused.load(Ordering::Relaxed), 6);
    }

    #[test]
    fn amd_table_rows_unchanged() {
        const F: u8 = walk::K_FAST;
        for solo in [false, true] {
            let s = |fam, l2, p| table(false, fam, l2, solo, p).0;
            for p in [Policy::Hashrate, Policy::Efficiency] {
                assert_eq!(s(23, 512, p), Shape::new(2, 1, true, F), "Zen 2");
                assert_eq!(s(25, 1024, p), Shape::new(2, 1, false, F), "Zen 4");
                assert_eq!(s(26, 1024, p), Shape::new(2, 1, false, F), "Zen 5 follows Zen 4");
            }
            // Zen 3 (L2 512 KiB) unchanged.
            assert_eq!(s(25, 512, Policy::Hashrate), Shape::new(1, 1, false, F));
            assert_eq!(s(25, 512, Policy::Efficiency), Shape::new(2, 2, true, F));
            // Unknown vendors / families keep the node shape.
            assert_eq!(s(24, 512, Policy::Hashrate), Shape::new(2, 1, false, F));
        }
    }

    #[test]
    fn intel_table_rows_measured_2026_09_30() {
        const F: u8 = walk::K_FAST;
        for p in [Policy::Hashrate, Policy::Efficiency] {
            let s = |l2, solo| table(true, 6, l2, solo, p).0;
            // One thread per core (no SMT, or a quota <= cores): 2 pads + prefetch.
            for l2 in [256, 512, 1280, 2048, 3072] {
                assert_eq!(s(l2, true), Shape::new(1, 2, true, F), "solo, L2 {l2}");
            }
            // SMT below 2 MiB of L2: the node shape (8700K, 11700F).
            for l2 in [256, 512, 1024, 1280] {
                assert_eq!(s(l2, false), Shape::new(2, 1, false, F), "SMT, L2 {l2}");
            }
            // SMT with 2 MiB of L2 or more: four pads per core.
            assert_eq!(s(2048, false), Shape::new(2, 2, true, F));
        }
        // Intel family 6 is only matched for Intel.
        assert_eq!(table(false, 6, 2048, true, Policy::Hashrate).0, Shape::new(2, 1, false, F));
    }

    /// The panel's machines, as they will run: every row picks the shape that
    /// the machine's own --tune measured best.
    #[test]
    fn intel_rows_pick_each_panel_machine_s_measured_best() {
        // (label, L2 KiB, SMT visible, cores, quota workers, measured best)
        let panel: [(&str, usize, bool, usize, Option<usize>, (usize, usize, bool)); 11] = [
            ("i7-8700K", 256, true, 6, Some(12), (2, 1, false)),
            ("i7-11700F", 512, true, 3, Some(6), (2, 1, false)),
            ("Ultra 9 285K", 3072, false, 24, None, (1, 2, true)),
            ("Gold 6430 VM", 2048, false, 128, None, (1, 2, true)),
            ("i7-12700", 1280, true, 8, Some(4), (1, 2, true)),
            ("Gold 6330", 1280, true, 56, Some(14), (1, 2, true)),
            ("E5-2670", 256, true, 16, Some(16), (1, 2, true)),
            ("E5-2620 v3", 256, true, 6, Some(6), (1, 2, true)),
            ("Gold 5115", 1024, true, 20, Some(5), (1, 2, true)),
            ("i7-13700", 2048, true, 8, Some(4), (1, 2, true)),
            ("Gold 6244", 1024, true, 16, Some(16), (1, 2, false)),
        ];
        for (label, l2, smt, cores, cap, best) in panel {
            let solo = !smt || cap.is_some_and(|c| c <= cores);
            let sh = table(true, 6, l2, solo, Policy::Hashrate).0;
            // The Gold 6244 run measured only 1x1x0 and 1x2x0 before it stopped:
            // pads and threads per core are what is checked there.
            if label == "Gold 6244" {
                assert_eq!((sh.tpc, sh.pads), (best.0, best.1), "{label}");
            } else {
                assert_eq!((sh.tpc, sh.pads, sh.pf), best, "{label}");
            }
        }
    }

    #[test]
    fn pipe_keeps_prefetch() {
        let prof = |a: &[&str]| profile(&cli(&[&["--no-tune-file"], a].concat()).unwrap());
        let p = prof(&["--pads", "1", "--prefetch", "1"]).unwrap();
        assert!(p.pipe && p.prefetch, "auto: piped at 1 pad, prefetch kept");
        let p = prof(&["--pads", "1", "--prefetch", "1", "--pipe", "1"]).unwrap();
        assert!(p.pipe && p.prefetch);
        let p = prof(&["--pads", "1", "--prefetch", "1", "--pipe", "0"]).unwrap();
        assert!(!p.pipe && p.prefetch);
        assert!(!prof(&["--pads", "2", "--prefetch", "1"]).unwrap().pipe);
        assert!(prof(&["--pads", "2", "--pipe", "1"]).is_err());
        assert!(prof(&["--pads", "1", "--kernel", "base", "--pipe", "1"]).is_err());
    }

    #[test]
    fn threads_is_a_number_of_logical_cpus_and_the_profile_applies_inside() {
        let prof = |a: &[&str]| profile(&cli(&[&["--no-tune-file"], a].concat()).unwrap()).unwrap();
        let all = sys::allowed_cpus();
        for n in 1..=all.len().min(4) {
            let ns = n.to_string();
            let p = prof(&["--threads", &ns, "--threads-per-core", "2"]);
            assert!(p.cpus.len() <= n, "--threads {n}: {} workers", p.cpus.len());
            assert!(p.cpus.iter().all(|c| all.contains(c)));
            // One thread per core never runs more workers than 2 per core would.
            let q = prof(&["--threads", &ns, "--threads-per-core", "1"]);
            assert!(q.cpus.len() <= p.cpus.len());
        }
        // A quota caps the workers whatever the profile.
        let p = prof(&["--threads-per-core", "2"]);
        if let Some(q) = &p.quota {
            assert!(p.cpus.len() <= q.max_workers());
        }
        assert!(validate(&cli(&["--threads", "0"]).unwrap()).is_err());
    }

    #[test]
    fn status_json_events_follow_the_contract() {
        let sh = shared(None, 0);
        sh.found.store(3, Ordering::Relaxed);
        sh.accepted.store(2, Ordering::Relaxed);
        sh.unknown.store(1, Ordering::Relaxed);
        let v = status_event(1234.56, Some(42), &sh, 17, "mining", "");
        let keys: BTreeSet<&str> = v.as_object().unwrap().keys().map(|k| k.as_str()).collect();
        assert_eq!(
            keys,
            ["type", "ts", "hps", "height", "found", "accepted", "refused", "unknown", "uptime_s", "state", "message"]
                .into_iter()
                .collect()
        );
        assert_eq!(v["type"], "status");
        assert_eq!(v["hps"].as_f64(), Some(1234.6));
        assert_eq!((v["height"].as_u64(), v["found"].as_u64(), v["accepted"].as_u64()), (Some(42), Some(3), Some(2)));
        assert!(status_event(0.0, None, &sh, 0, "waiting", "x")["height"].is_null());
        let b = block_event(9, "accepted", Some("ab12"));
        assert_eq!((b["type"].as_str(), b["height"].as_u64(), b["result"].as_str(), b["hash"].as_str()), (Some("block"), Some(9), Some("accepted"), Some("ab12")));
        assert!(block_event(9, "unknown", None)["hash"].is_null());
        let p = profile_event(&test_profile(2, walk::K_FAST, false, 2), true);
        let keys: BTreeSet<&str> = p.as_object().unwrap().keys().map(|k| k.as_str()).collect();
        assert_eq!(
            keys,
            ["type", "version", "backend", "cpu", "threads", "tpc", "pads", "prefetch", "kernel", "pages"].into_iter().collect()
        );
        assert_eq!(p["version"], env!("CARGO_PKG_VERSION"));
        #[cfg(target_os = "macos")]
        assert_eq!(p["pages"].as_str(), Some("native"));
        #[cfg(not(target_os = "macos"))]
        assert!(["2M", "large"].contains(&p["pages"].as_str().unwrap()));
        // Every event is a single line.
        assert!(!v.to_string().contains('\n') && !p.to_string().contains('\n'));
    }

    // ---------------------------------------------------------------------
    // X-Jetsam-Host: only a name the user chose, never the hostname by
    // default.
    // ---------------------------------------------------------------------

    #[test]
    fn worker_header_public_default_sends_nothing() {
        assert_eq!(worker_header(None, None), None);
        assert_eq!(cli(&[]).unwrap().worker_name, None);
    }

    #[test]
    fn worker_header_uses_the_worker_name() {
        assert_eq!(worker_header(Some("rig-1"), None).as_deref(), Some("rig-1"));
        let c = cli(&["--worker-name", "rig-1"]).unwrap();
        assert_eq!(c.worker_name.as_deref(), Some("rig-1"));
        // An explicit name wins over the fleet default.
        assert_eq!(worker_header(Some("rig-1"), Some("host-a")).as_deref(), Some("rig-1"));
    }

    #[test]
    fn worker_header_empty_sends_nothing() {
        assert_eq!(worker_header(Some(""), None), None);
        assert_eq!(worker_header(Some("   "), None), None);
        // Empty once cleaned: nothing printable is left.
        assert_eq!(worker_header(Some("\u{e9}\u{e8}\r\n\t"), None), None);
        // An explicit empty name also silences the fleet default.
        assert_eq!(worker_header(Some(""), Some("host-a")), None);
    }

    #[test]
    fn worker_header_is_cleaned_by_header_safe() {
        let long = "a".repeat(40);
        assert_eq!(worker_header(Some(&long), None), Some("a".repeat(32)));
        // No header injection: CR/LF and non-ASCII are dropped.
        assert_eq!(worker_header(Some("rig-1\r\nX-Evil: 1"), None).as_deref(), Some("rig-1X-Evil: 1"));
        assert_eq!(worker_header(Some("  caf\u{e9} 2 "), None).as_deref(), Some("caf 2"));
    }

    #[test]
    fn worker_header_fleet_default_is_the_fallback() {
        assert_eq!(worker_header(None, Some("host-a")).as_deref(), Some("host-a"));
        assert_eq!(worker_header(None, Some("")), None);
    }

    /// One JSON-RPC call against a local listener; returns the request's
    /// header lines, lower-cased.
    fn headers_sent(host: Option<String>) -> Vec<String> {
        use std::io::{Read, Write};
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/", l.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let mut buf = Vec::new();
            let mut chunk = [0u8; 4096];
            while !buf.windows(4).any(|w| w == b"\r\n\r\n") {
                let n = s.read(&mut chunk).unwrap();
                assert!(n > 0, "connection closed before the headers");
                buf.extend_from_slice(&chunk[..n]);
            }
            let body = r#"{"jsonrpc":"2.0","id":1,"result":7}"#;
            write!(s, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            let head = String::from_utf8_lossy(&buf).to_string();
            head.split("\r\n\r\n").next().unwrap().lines().skip(1).map(|h| h.to_ascii_lowercase()).collect::<Vec<_>>()
        });
        let rpc = Rpc {
            url,
            key: None,
            host,
            cpu: "test cpu".into(),
            http: reqwest::blocking::Client::builder().timeout(Duration::from_secs(10)).build().unwrap(),
            rate: Arc::new(AtomicU64::new(0)),
            th: None,
            eff: false,
        };
        let r: u64 = rpc.call_typed("ping", serde_json::json!([])).unwrap();
        assert_eq!(r, 7);
        server.join().unwrap()
    }

    #[test]
    fn rpc_sends_host_header_only_when_set() {
        let none = headers_sent(None);
        assert!(!none.iter().any(|h| h.starts_with("x-jetsam-host:")), "{none:?}");
        assert!(none.iter().any(|h| h.starts_with("x-jetsam-cpu:")), "{none:?}");
        let some = headers_sent(Some("rig-1".into()));
        assert!(some.iter().any(|h| h == "x-jetsam-host: rig-1"), "{some:?}");
    }
}
