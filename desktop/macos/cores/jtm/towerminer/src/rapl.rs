// SPDX-License-Identifier: Apache-2.0
//! Package energy from RAPL (`/sys/class/powercap/intel-rapl:*`, also exposed
//! by the kernel on AMD Zen). Read-only, never re-permissioned: the counters
//! are root-only (0400) on current kernels, so the chain is direct read ->
//! `sudo -n cat` (tested once) -> none (`rapl=n/a`).
use std::ffi::CString;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Direct,
    Sudo,
}

impl Mode {
    pub fn name(self) -> &'static str {
        match self {
            Mode::Direct => "direct",
            Mode::Sudo => "sudo",
        }
    }
}

#[derive(Debug, Clone)]
struct Domain {
    energy: PathBuf,
    range_uj: u64,
    /// true = package-N, false = core
    package: bool,
}

pub struct Rapl {
    domains: Vec<Domain>,
    pub mode: Mode,
}

#[derive(Debug, Clone)]
pub struct Sample {
    pub t: Instant,
    uj: Vec<u64>,
}

fn read_u64(p: &PathBuf) -> Option<u64> {
    fs::read_to_string(p).ok()?.trim().parse().ok()
}

/// Energy delta in uJ between two counter readings, with one wrap at `range`.
pub fn delta_uj(a: u64, b: u64, range_uj: u64) -> u64 {
    if b >= a {
        b - a
    } else {
        b + range_uj.saturating_sub(a)
    }
}

impl Rapl {
    pub fn open() -> Option<Rapl> {
        let root = PathBuf::from("/sys/class/powercap");
        let mut dirs: Vec<PathBuf> = fs::read_dir(&root)
            .ok()?
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.file_name().map(|n| n.to_string_lossy().starts_with("intel-rapl:")).unwrap_or(false))
            .collect();
        dirs.sort();
        // The "core" domain is a sum over cores on Intel only; on AMD Zen the
        // kernel reads the core-energy MSR of whichever CPU services the read
        // (one core), so it is left out there [5950X: "core" read 5.9 W with
        // 16 cores hashing at 137 W package].
        let intel = fs::read_to_string("/proc/cpuinfo").map(|s| s.contains("GenuineIntel")).unwrap_or(false);
        let mut domains = Vec::new();
        for d in dirs {
            let name = fs::read_to_string(d.join("name")).unwrap_or_default();
            let name = name.trim();
            let package = name.starts_with("package");
            if !package && !(intel && name == "core") {
                continue;
            }
            let range_uj = read_u64(&d.join("max_energy_range_uj")).unwrap_or(u64::MAX);
            domains.push(Domain { energy: d.join("energy_uj"), range_uj, package });
        }
        if !domains.iter().any(|d| d.package) {
            return None;
        }
        let mut r = Rapl { domains, mode: Mode::Direct };
        if r.read_direct().is_some() {
            return Some(r);
        }
        r.mode = Mode::Sudo;
        if r.read_sudo().is_some() {
            return Some(r);
        }
        None
    }

    fn read_direct(&self) -> Option<Vec<u64>> {
        self.domains.iter().map(|d| read_u64(&d.energy)).collect()
    }

    fn read_sudo(&self) -> Option<Vec<u64>> {
        let mut argv = vec!["sudo".to_string(), "-n".into(), "cat".into()];
        argv.extend(self.domains.iter().map(|d| d.energy.to_string_lossy().to_string()));
        let out = spawn_capture(&argv)?;
        let v: Vec<u64> = out.lines().filter_map(|l| l.trim().parse().ok()).collect();
        (v.len() == self.domains.len()).then_some(v)
    }

    pub fn sample(&self) -> Option<Sample> {
        let uj = match self.mode {
            Mode::Direct => self.read_direct()?,
            Mode::Sudo => self.read_sudo()?,
        };
        Some(Sample { t: Instant::now(), uj })
    }

    /// (package W summed over sockets, core W summed, if any core domain).
    pub fn watts(&self, a: &Sample, b: &Sample) -> (f64, Option<f64>) {
        let dt = b.t.duration_since(a.t).as_secs_f64().max(1e-9);
        let (mut pkg, mut core, mut has_core) = (0u64, 0u64, false);
        for (i, d) in self.domains.iter().enumerate() {
            let e = delta_uj(a.uj[i], b.uj[i], d.range_uj);
            if d.package {
                pkg += e;
            } else {
                core += e;
                has_core = true;
            }
        }
        (pkg as f64 / 1e6 / dt, has_core.then_some(core as f64 / 1e6 / dt))
    }
}

extern "C" {
    static environ: *const *const libc::c_char;
}

/// Run `argv` (PATH lookup) and return its stdout if it exits 0.
///
/// posix_spawnp directly, not std::process::Command: Command links glibc's
/// pidfd_spawnp/pidfd_getpid, which made the binary require GLIBC_2.39
/// (v0.1 needed 2.34) — a miner that no longer starts on older distributions.
fn spawn_capture(argv: &[String]) -> Option<String> {
    let cargs: Vec<CString> = argv.iter().map(|a| CString::new(a.as_str()).ok()).collect::<Option<_>>()?;
    let mut ptrs: Vec<*mut libc::c_char> = cargs.iter().map(|c| c.as_ptr() as *mut libc::c_char).collect();
    ptrs.push(std::ptr::null_mut());
    unsafe {
        let mut fds = [0i32; 2];
        if libc::pipe2(fds.as_mut_ptr(), libc::O_CLOEXEC) != 0 {
            return None;
        }
        let mut fa: libc::posix_spawn_file_actions_t = std::mem::zeroed();
        libc::posix_spawn_file_actions_init(&mut fa);
        libc::posix_spawn_file_actions_adddup2(&mut fa, fds[1], 1);
        let devnull = CString::new("/dev/null").unwrap();
        libc::posix_spawn_file_actions_addopen(&mut fa, 2, devnull.as_ptr(), libc::O_WRONLY, 0);
        libc::posix_spawn_file_actions_addopen(&mut fa, 0, devnull.as_ptr(), libc::O_RDONLY, 0);
        let mut pid: libc::pid_t = 0;
        let rc = libc::posix_spawnp(&mut pid, ptrs[0], &fa, std::ptr::null(), ptrs.as_ptr(), environ as *const *mut libc::c_char);
        libc::posix_spawn_file_actions_destroy(&mut fa);
        libc::close(fds[1]);
        if rc != 0 {
            libc::close(fds[0]);
            return None;
        }
        let mut out = Vec::new();
        let mut buf = [0u8; 4096];
        loop {
            let n = libc::read(fds[0], buf.as_mut_ptr() as *mut libc::c_void, buf.len());
            if n > 0 {
                out.extend_from_slice(&buf[..n as usize]);
            } else if n == 0 || *libc::__errno_location() != libc::EINTR {
                break;
            }
        }
        libc::close(fds[0]);
        let mut status = 0;
        while libc::waitpid(pid, &mut status, 0) < 0 && *libc::__errno_location() == libc::EINTR {}
        (libc::WIFEXITED(status) && libc::WEXITSTATUS(status) == 0).then(|| String::from_utf8_lossy(&out).to_string())
    }
}

/// Mean current frequency (MHz) of `cpus`, from scaling_cur_freq (read-only).
pub fn mean_freq_mhz(cpus: &[usize]) -> Option<f64> {
    let v: Vec<f64> = cpus
        .iter()
        .filter_map(|c| {
            fs::read_to_string(format!("/sys/devices/system/cpu/cpu{c}/cpufreq/scaling_cur_freq"))
                .ok()?
                .trim()
                .parse::<f64>()
                .ok()
        })
        .collect();
    (!v.is_empty()).then(|| v.iter().sum::<f64>() / v.len() as f64 / 1000.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawn_capture_reads_stdout_and_status() {
        assert_eq!(spawn_capture(&["echo".into(), "12345".into()]).as_deref(), Some("12345\n"));
        assert_eq!(spawn_capture(&["false".into()]), None, "non-zero exit is no reading");
        assert_eq!(spawn_capture(&["/nonexistent/binary".into()]), None);
    }

    #[test]
    fn rapl_wrap() {
        assert_eq!(delta_uj(100, 350, 1_000), 250);
        // Counter wrapped once: 900 -> (range 1000) -> 150 is 250 uJ.
        assert_eq!(delta_uj(900, 150, 1_000), 250);
        // The 5950X range (65 532 J): one lap every ~8 min at 137 W.
        let r = 65_532_610_987u64;
        assert_eq!(delta_uj(r - 1_000_000, 2_000_000, r), 3_000_000);
    }
}
