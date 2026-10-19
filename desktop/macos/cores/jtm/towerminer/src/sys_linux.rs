// SPDX-License-Identifier: Apache-2.0
//! Linux side of `sys`: facts read from the kernel (/proc, /sys, cgroups),
//! scratchpads in transparent 2 MiB pages, affinity through sched_*.
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use super::{parse_cfs, parse_cpu_max, parse_list, Quota, STOP};
use crate::walk::PAD_BYTES;

const HUGE: usize = 2 << 20;
const PAGE: usize = 4096;

/// One region of `pads` contiguous 512 KiB pads, 2 MiB aligned and advised
/// for transparent huge pages. A pad set in 4 KiB pages misses the dTLB on
/// almost every read [MEASURED 2026-09-26: 2 pads/core, THP vs 4K = 21.5 vs
/// 13.9 kH/s on a 7900X; +21 % single-thread on an EPYC 7742; 2026-09-28:
/// -24 % on a 5950X thread].
///
/// The mapping carries one PROT_NONE page at each end, so the kernel can
/// never merge it with a neighbour: the VMA that holds `base` in
/// /proc/self/smaps is this region's and nobody else's (see [`Region::huge_kb`]).
pub struct Region {
    map: *mut u8,
    map_len: usize,
    base: *mut u8,
    /// Length of the advised (huge) span starting at `base`.
    span: usize,
    pub pads: Vec<*mut u64>,
}

unsafe impl Send for Region {}

impl Region {
    /// Allocated and first-touched by the calling thread, so its pages land on
    /// that thread's NUMA node.
    pub fn new(pads: usize, huge: bool) -> std::io::Result<Region> {
        unsafe {
            let span = (pads * PAD_BYTES).div_ceil(HUGE) * HUGE;
            // span + 2M of alignment slack, + one guard page at each end.
            let map_len = span + HUGE + 2 * PAGE;
            let p = libc::mmap(
                std::ptr::null_mut(),
                map_len,
                libc::PROT_READ | libc::PROT_WRITE,
                libc::MAP_PRIVATE | libc::MAP_ANONYMOUS,
                -1,
                0,
            );
            if p == libc::MAP_FAILED {
                return Err(std::io::Error::last_os_error());
            }
            let map = p as *mut u8;
            if libc::mprotect(map as *mut _, PAGE, libc::PROT_NONE) != 0
                || libc::mprotect(map.add(map_len - PAGE) as *mut _, PAGE, libc::PROT_NONE) != 0
            {
                let e = std::io::Error::last_os_error();
                libc::munmap(p, map_len);
                return Err(e);
            }
            let first = map as usize + PAGE;
            let base = ((first + HUGE - 1) & !(HUGE - 1)) as *mut u8;
            debug_assert!(base as usize + span <= map as usize + map_len - PAGE);
            let advice = if huge { libc::MADV_HUGEPAGE } else { libc::MADV_NOHUGEPAGE };
            libc::madvise(base as *mut _, span, advice);
            std::ptr::write_bytes(base, 0, pads * PAD_BYTES);
            let v = (0..pads).map(|k| base.add(k * PAD_BYTES) as *mut u64).collect();
            Ok(Region { map, map_len, base, span, pads: v })
        }
    }

    /// AnonHugePages (KiB) of the VMA holding this region, read from
    /// /proc/self/smaps. `None` if smaps cannot be read.
    pub fn huge_kb(&self) -> Option<u64> {
        let s = fs::read_to_string("/proc/self/smaps").ok()?;
        smaps_anon_huge_kb(&s, self.base as usize)
    }

    /// What `huge_kb` reads when every pad sits in 2 MiB pages.
    pub fn expected_huge_kb(&self) -> u64 {
        (self.span / 1024) as u64
    }
}

impl Drop for Region {
    fn drop(&mut self) {
        unsafe {
            libc::munmap(self.map as *mut _, self.map_len);
        }
    }
}

/// `AnonHugePages` of the smaps block whose `[start, end)` contains `addr`.
pub fn smaps_anon_huge_kb(smaps: &str, addr: usize) -> Option<u64> {
    let mut inside = false;
    for line in smaps.lines() {
        let head = line.split(' ').next().unwrap_or("");
        if let Some((a, b)) = head.split_once('-') {
            if let (Ok(a), Ok(b)) = (usize::from_str_radix(a, 16), usize::from_str_radix(b, 16)) {
                if inside {
                    // Next VMA without an AnonHugePages line in ours.
                    return Some(0);
                }
                inside = a <= addr && addr < b;
                continue;
            }
        }
        if inside {
            if let Some(v) = line.strip_prefix("AnonHugePages:") {
                return v.split_whitespace().next()?.parse().ok();
            }
        }
    }
    if inside {
        Some(0)
    } else {
        None
    }
}

/// AnonHugePages of the whole process (KiB).
pub fn anon_huge_kb() -> Option<u64> {
    fs::read_to_string("/proc/self/smaps_rollup").ok().and_then(|s| {
        s.lines().find(|l| l.starts_with("AnonHugePages:")).and_then(|l| l.split_whitespace().nth(1)?.parse().ok())
    })
}

pub fn thp_mode() -> String {
    fs::read_to_string("/sys/kernel/mm/transparent_hugepage/enabled")
        .map(|s| {
            s.split_whitespace()
                .find(|w| w.starts_with('['))
                .unwrap_or("?")
                .trim_matches(|c| c == '[' || c == ']')
                .to_string()
        })
        .unwrap_or_else(|_| "unavailable".into())
}

/// Page environment for the banner.
pub fn page_env() -> String {
    format!("THP={}", thp_mode())
}

/// Page size label of a profile: huge pages in place or not.
pub fn pages_label(huge: bool) -> &'static str {
    if huge {
        "2M"
    } else {
        "4K"
    }
}

/// Why pads are not in huge pages, and what it costs.
pub fn huge_hint() -> String {
    format!(
        "THP={}: 4 KiB pads cost ~24 % of the rate (echo madvise | sudo tee /sys/kernel/mm/transparent_hugepage/enabled)",
        thp_mode()
    )
}

/// Huge pages impossible by configuration (the miner then refuses to start
/// unless --no-huge): THP disabled.
pub fn huge_disabled() -> Option<String> {
    (thp_mode() == "never").then(|| {
        "THP is disabled on this machine (transparent_hugepage/enabled = never): the pads would sit in 4 KiB pages \
         (~24 % slower). Enable THP (echo madvise | sudo tee /sys/kernel/mm/transparent_hugepage/enabled) or pass \
         --no-huge"
            .to_string()
    })
}

pub fn allowed_cpus() -> BTreeSet<usize> {
    unsafe {
        let mut set: libc::cpu_set_t = std::mem::zeroed();
        if libc::sched_getaffinity(0, std::mem::size_of::<libc::cpu_set_t>(), &mut set) != 0 {
            return (0..std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1)).collect();
        }
        (0..libc::CPU_SETSIZE as usize).filter(|&c| libc::CPU_ISSET(c, &set)).collect()
    }
}

pub fn pin_current(cpu: usize) -> std::io::Result<()> {
    unsafe {
        let mut set: libc::cpu_set_t = std::mem::zeroed();
        libc::CPU_SET(cpu, &mut set);
        if libc::sched_setaffinity(0, std::mem::size_of::<libc::cpu_set_t>(), &set) == 0 {
            Ok(())
        } else {
            Err(std::io::Error::last_os_error())
        }
    }
}

/// The SMT siblings of `cpu` (itself included).
pub fn siblings_of(cpu: usize) -> Option<BTreeSet<usize>> {
    fs::read_to_string(format!("/sys/devices/system/cpu/cpu{cpu}/topology/thread_siblings_list"))
        .ok()
        .map(|s| parse_list(&s))
        .filter(|s| !s.is_empty())
}

/// Size (KiB) of the unified cache of `level` that `cpu` uses.
pub fn cache_kib(cpu: usize, level: u32) -> Option<usize> {
    let dir = format!("/sys/devices/system/cpu/cpu{cpu}/cache");
    for e in fs::read_dir(&dir).ok()?.flatten() {
        let p = e.path();
        let lv = fs::read_to_string(p.join("level")).ok().and_then(|s| s.trim().parse::<u32>().ok());
        let ty = fs::read_to_string(p.join("type")).unwrap_or_default();
        if lv == Some(level) && ty.trim() != "Instruction" {
            return fs::read_to_string(p.join("size")).ok().and_then(|s| parse_size_kib(s.trim()));
        }
    }
    None
}

fn parse_size_kib(s: &str) -> Option<usize> {
    if let Some(k) = s.strip_suffix('K') {
        k.parse().ok()
    } else if let Some(m) = s.strip_suffix('M') {
        m.parse::<usize>().ok().map(|m| m * 1024)
    } else {
        s.parse().ok()
    }
}

/// Busy and total jiffies of `cpus` since boot, from /proc/stat. Busy = user
/// + nice + system + irq + softirq + steal; total adds idle + iowait.
pub fn cpu_ticks(cpus: &[usize]) -> Option<(u64, u64)> {
    cpu_ticks_in(&fs::read_to_string("/proc/stat").ok()?, cpus)
}

/// What `cpu_ticks` / the foreign-load check covers, for messages.
pub const FOREIGN_SCOPE: &str = "the targeted CPUs and their SMT siblings";

fn cpu_ticks_in(stat: &str, cpus: &[usize]) -> Option<(u64, u64)> {
    let (mut busy, mut total, mut seen) = (0u64, 0u64, 0usize);
    for l in stat.lines() {
        // "cpuN ..." only: the aggregate "cpu  ..." line is not a CPU.
        let Some(rest) = l.strip_prefix("cpu").filter(|r| r.starts_with(|c: char| c.is_ascii_digit())) else {
            continue;
        };
        let mut f = rest.split_whitespace();
        let Some(id) = f.next().and_then(|x| x.parse::<usize>().ok()) else { continue };
        if !cpus.contains(&id) {
            continue;
        }
        let v: Vec<u64> = f.take(8).map(|x| x.parse().unwrap_or(0)).collect();
        if v.len() < 8 {
            continue;
        }
        let b = v[0] + v[1] + v[2] + v[5] + v[6] + v[7];
        busy += b;
        total += b + v[3] + v[4];
        seen += 1;
    }
    (seen > 0).then_some((busy, total))
}

/// CPU time of this process, all threads (utime + stime), jiffies.
pub fn self_ticks() -> Option<u64> {
    let s = fs::read_to_string("/proc/self/stat").ok()?;
    let f: Vec<&str> = s.rsplit_once(')')?.1.split_whitespace().collect();
    Some(f.get(11)?.parse::<u64>().ok()? + f.get(12)?.parse::<u64>().ok()?)
}

/// Other miners on this machine, as `pid:exe`. Reported, never touched.
pub fn other_miners() -> Vec<String> {
    let mut others = Vec::new();
    let Ok(dir) = fs::read_dir("/proc") else { return others };
    let me = std::process::id().to_string();
    for e in dir.flatten() {
        let pid = e.file_name().to_string_lossy().to_string();
        if pid == me || !pid.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        if let Ok(cmd) = fs::read(e.path().join("cmdline")) {
            let cmd = String::from_utf8_lossy(&cmd).replace('\0', " ");
            let first = cmd.split_whitespace().next().unwrap_or("");
            let exe = first.rsplit('/').next().unwrap_or("");
            if ["towerminer", "jetsam-miner", "xmrig"].iter().any(|m| exe.starts_with(m)) || cmd.contains("--mode miner") {
                others.push(format!("{pid}:{exe}"));
            }
        }
    }
    others
}

pub fn exe_bytes() -> std::io::Result<Vec<u8>> {
    fs::read("/proc/self/exe")
}

pub fn hostname() -> String {
    fs::read_to_string("/proc/sys/kernel/hostname").unwrap_or_default().trim().to_string()
}

/// Lower this thread's priority to nice +10 (needs no privilege); a thread
/// already at +10 or lower (--priority low: nice 19) is left alone, never
/// raised.
pub fn lower_thread_priority() {
    unsafe {
        let tid = libc::syscall(libc::SYS_gettid) as libc::id_t;
        if libc::getpriority(libc::PRIO_PROCESS, tid) < 10 {
            libc::setpriority(libc::PRIO_PROCESS, tid, 10);
        }
    }
}

/// --priority low, as the start-up log shows it.
pub const LOW_PRIORITY_LABEL: &str = "low (nice 19)";

/// The calling thread already runs at nice 19 (the lowest).
pub fn priority_at_or_below_low() -> bool {
    unsafe { libc::getpriority(libc::PRIO_PROCESS, 0) >= 19 }
}

/// Nice 19, an absolute value, for the calling thread; threads created after
/// it inherit it (on Linux the nice value is per thread).
pub fn set_low_priority() -> Result<(), String> {
    if unsafe { libc::setpriority(libc::PRIO_PROCESS, 0, 19) } == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error().to_string())
    }
}

/// glibc version the process runs on.
pub fn libc_version() -> Option<String> {
    #[cfg(target_env = "gnu")]
    {
        let v = unsafe { std::ffi::CStr::from_ptr(libc::gnu_get_libc_version()) };
        Some(v.to_string_lossy().to_string())
    }
    #[cfg(not(target_env = "gnu"))]
    {
        None
    }
}

/// Where --tune stores its result: ~/.config/towerminer.
pub fn config_dir() -> PathBuf {
    let home = std::env::var_os("HOME").unwrap_or_else(|| ".".into());
    PathBuf::from(home).join(".config/towerminer")
}

extern "C" fn on_stop_signal(_: libc::c_int) {
    // A second Ctrl-C while shutting down: leave at once.
    if STOP.swap(true, Ordering::SeqCst) {
        unsafe { libc::_exit(130) };
    }
}

/// SIGINT / SIGTERM request a clean stop (`stop_requested`).
pub fn install_stop_handler() {
    unsafe {
        let mut sa: libc::sigaction = std::mem::zeroed();
        sa.sa_sigaction = on_stop_signal as *const () as usize;
        libc::sigemptyset(&mut sa.sa_mask);
        sa.sa_flags = libc::SA_RESTART;
        libc::sigaction(libc::SIGINT, &sa, std::ptr::null_mut());
        libc::sigaction(libc::SIGTERM, &sa, std::ptr::null_mut());
    }
}

/// ANSI colours work on any terminal here.
pub fn enable_ansi() -> bool {
    true
}

// ---------------------------------------------------------------------------
// CPU quota
// ---------------------------------------------------------------------------

/// `root` + every ancestor of `path` below it, deepest first, that exists.
fn cgroup_dirs(root: &Path, path: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut p = PathBuf::from(path.trim_start_matches('/'));
    loop {
        let d = root.join(&p);
        if d.is_dir() {
            out.push(d);
        }
        if !p.pop() {
            break;
        }
    }
    if !out.iter().any(|d| d == root) && root.is_dir() {
        out.push(root.to_path_buf());
    }
    out
}

/// The tightest CPU quota over this process's cgroup and its ancestors:
/// cgroup v2 `cpu.max`, or v1 `cpu.cfs_quota_us / cpu.cfs_period_us`. Inside
/// a container the cgroup root is the container's own.
pub fn cpu_quota() -> Option<Quota> {
    cpu_quota_in(Path::new("/sys/fs/cgroup"), &fs::read_to_string("/proc/self/cgroup").unwrap_or_default())
}

fn cpu_quota_in(root: &Path, self_cgroup: &str) -> Option<Quota> {
    let mut best: Option<Quota> = None;
    let mut keep = |cpus: Option<f64>, source: String| {
        if let Some(c) = cpus {
            if best.as_ref().map_or(true, |b| c < b.cpus) {
                best = Some(Quota { cpus: c, source });
            }
        }
    };
    let mut lines: Vec<(String, String)> = self_cgroup
        .lines()
        .filter_map(|l| {
            let mut it = l.splitn(3, ':');
            let (_id, ctrl, path) = (it.next()?, it.next()?, it.next()?);
            Some((ctrl.to_string(), path.to_string()))
        })
        .collect();
    if lines.is_empty() {
        lines.push((String::new(), "/".into()));
    }
    for (ctrl, path) in &lines {
        if ctrl.is_empty() {
            // cgroup v2 (unified): cpu.max at every level.
            for d in cgroup_dirs(root, path) {
                if let Ok(s) = fs::read_to_string(d.join("cpu.max")) {
                    keep(parse_cpu_max(&s), format!("cgroup v2 cpu.max {}", s.trim()));
                }
            }
        } else if ctrl.split(',').any(|c| c == "cpu") {
            for mount in ["cpu,cpuacct", "cpu", "cpuacct,cpu"] {
                let m = root.join(mount);
                for d in cgroup_dirs(&m, path) {
                    if let (Ok(q), Ok(p)) =
                        (fs::read_to_string(d.join("cpu.cfs_quota_us")), fs::read_to_string(d.join("cpu.cfs_period_us")))
                    {
                        keep(parse_cfs(&q, &p), format!("cgroup v1 cfs_quota {}/{}", q.trim(), p.trim()));
                    }
                }
            }
        }
    }
    best
}

/// Platform lines of --check-hardware: (ok, what, detail).
pub fn platform_checks() -> Vec<(bool, &'static str, String)> {
    let mut v = Vec::new();
    if let Some(g) = libc_version() {
        v.push((true, "glibc", format!("runtime {g} (the release needs 2.34 or newer)")));
    }
    let thp = thp_mode();
    v.push((thp != "never", "thp", thp));
    match Region::new(1, true) {
        Ok(r) => {
            let kb = r.huge_kb();
            let good = kb.map(|k| k >= r.expected_huge_kb()).unwrap_or(false);
            v.push((
                good,
                "hugepage",
                format!(
                    "test region: AnonHugePages {} KiB of {}",
                    kb.map(|k| k.to_string()).unwrap_or_else(|| "n/a".into()),
                    r.expected_huge_kb()
                ),
            ));
        }
        Err(e) => v.push((false, "hugepage", format!("mmap: {e}"))),
    }
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    const SMAPS: &str = "\
7f0000000000-7f0000001000 ---p 00000000 00:00 0
Size:                  4 kB
AnonHugePages:         0 kB
7f0000200000-7f0000400000 rw-p 00000000 00:00 0
Size:               2048 kB
Rss:                2048 kB
AnonHugePages:      2048 kB
THPeligible:           1
7f0000400000-7f00005ff000 rw-p 00000000 00:00 0
Size:               2044 kB
AnonHugePages:         0 kB
7ffd00000000-7ffd00021000 rw-p 00000000 00:00 0                          [stack]
Size:                132 kB
";

    #[test]
    fn smaps_parser_fixture() {
        // Inside the huge VMA, at its start and in the middle.
        assert_eq!(smaps_anon_huge_kb(SMAPS, 0x7f00_0020_0000), Some(2048));
        assert_eq!(smaps_anon_huge_kb(SMAPS, 0x7f00_0030_0000), Some(2048));
        // The VMA right after it is someone else's: 0, not ours.
        assert_eq!(smaps_anon_huge_kb(SMAPS, 0x7f00_0040_0000), Some(0));
        // A VMA without an AnonHugePages line reads 0.
        assert_eq!(smaps_anon_huge_kb(SMAPS, 0x7ffd_0000_0000), Some(0));
        // An address in no VMA.
        assert_eq!(smaps_anon_huge_kb(SMAPS, 0x1000), None);
    }

    #[test]
    fn cpu_ticks_reads_only_the_named_cpus() {
        let stat = "cpu  100 0 100 800 0 0 0 0 0 0\n\
                    cpu0 10 1 5 80 4 1 1 0 0 0\n\
                    cpu1 50 0 0 50 0 0 0 0 0 0\n\
                    intr 12345\n";
        // cpu0: busy 10+1+5+1+1+0 = 18, total 18+80+4 = 102.
        assert_eq!(cpu_ticks_in(stat, &[0]), Some((18, 102)));
        assert_eq!(cpu_ticks_in(stat, &[0, 1]), Some((68, 202)));
        assert_eq!(cpu_ticks_in(stat, &[7]), None, "a CPU absent from /proc/stat reads nothing");
        assert!(cpu_ticks(&[0]).is_some() && self_ticks().is_some());
    }

    #[test]
    fn region_is_its_own_vma_and_huge_when_thp_allows() {
        let r = Region::new(1, true).expect("map");
        assert_eq!(r.expected_huge_kb(), 2048);
        let kb = r.huge_kb().expect("smaps readable");
        // THP may be off where the tests run; the VMA must still be found and
        // hold no more than the advised span.
        assert!(kb <= r.expected_huge_kb(), "{kb} KiB counted: the VMA merged with a neighbour");
        let r4 = Region::new(2, false).expect("map");
        assert_eq!(r4.huge_kb(), Some(0));
    }

    #[test]
    fn cgroup_quota_v2_v1_and_nesting() {
        let root = std::env::temp_dir().join(format!("tm-cgroup-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let w = |p: &str, s: &str| {
            let f = root.join(p);
            fs::create_dir_all(f.parent().unwrap()).unwrap();
            fs::write(f, s).unwrap();
        };
        // v2: the service is limited to 1.5 CPUs, its slice to 4, the root has none.
        w("system.slice/cpu.max", "400000 100000\n");
        w("system.slice/x.service/cpu.max", "150000 100000\n");
        let q = cpu_quota_in(&root, "0::/system.slice/x.service\n").unwrap();
        assert_eq!(q.cpus, 1.5);
        assert_eq!(q.max_workers(), 2);
        // Unlimited everywhere.
        w("system.slice/x.service/cpu.max", "max 100000\n");
        w("system.slice/cpu.max", "max 100000\n");
        assert_eq!(cpu_quota_in(&root, "0::/system.slice/x.service\n"), None);
        // A container: its cgroup path does not exist under its own root.
        w("cpu.max", "384000 100000\n");
        assert_eq!(cpu_quota_in(&root, "0::/docker/abc\n").unwrap().max_workers(), 4);
        // v1.
        let _ = fs::remove_dir_all(&root);
        w("cpu,cpuacct/cpu.cfs_quota_us", "1344000\n");
        w("cpu,cpuacct/cpu.cfs_period_us", "100000\n");
        let q = cpu_quota_in(&root, "4:cpu,cpuacct:/\n2:memory:/\n").unwrap();
        assert_eq!(q.max_workers(), 14);
        let _ = fs::remove_dir_all(&root);
    }
}
