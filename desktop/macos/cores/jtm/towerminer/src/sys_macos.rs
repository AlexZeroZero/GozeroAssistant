// SPDX-License-Identifier: Apache-2.0
// Local Apple Silicon test port. Scheduler-managed workers, native pages;
// no claim of CPU pinning or huge-page allocation on Darwin.
use std::{collections::BTreeSet, path::PathBuf, sync::atomic::Ordering};
use super::{Quota, STOP};
use crate::walk::PAD_BYTES;

pub fn sysctl_string(key: &str) -> Option<String> {
    let out = std::process::Command::new("/usr/sbin/sysctl").args(["-n", key]).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}
pub struct Region { map: *mut libc::c_void, len: usize, pub pads: Vec<*mut u64> }
unsafe impl Send for Region {}
impl Region {
    pub fn new(pads: usize, _huge: bool) -> std::io::Result<Self> {
        if pads == 0 || pads > 64 { return Err(std::io::Error::other("invalid scratchpad count")); }
        let page = unsafe { libc::sysconf(libc::_SC_PAGESIZE) } as usize;
        let span = (pads * PAD_BYTES).div_ceil(page) * page;
        let len = span + 2 * page;
        unsafe {
            let map = libc::mmap(std::ptr::null_mut(), len, libc::PROT_READ | libc::PROT_WRITE,
                libc::MAP_PRIVATE | libc::MAP_ANON, -1, 0);
            if map == libc::MAP_FAILED { return Err(std::io::Error::last_os_error()); }
            let base = map.cast::<u8>().add(page);
            if libc::mprotect(map, page, libc::PROT_NONE) != 0 ||
                libc::mprotect(base.add(span).cast(), page, libc::PROT_NONE) != 0 {
                let e = std::io::Error::last_os_error(); libc::munmap(map, len); return Err(e);
            }
            std::ptr::write_bytes(base, 0, span);
            Ok(Self { map, len, pads: (0..pads).map(|i| base.add(i * PAD_BYTES).cast()).collect() })
        }
    }
    pub fn huge_kb(&self) -> Option<u64> { Some(0) }
    pub fn expected_huge_kb(&self) -> u64 { (self.pads.len() * PAD_BYTES / 1024) as u64 }
}
impl Drop for Region { fn drop(&mut self) { unsafe { libc::munmap(self.map, self.len); } } }
pub fn anon_huge_kb() -> Option<u64> { None }
pub fn page_env() -> String { format!("Darwin native pages: {} bytes; OS-managed scheduling", unsafe { libc::sysconf(libc::_SC_PAGESIZE) }) }
pub fn pages_label(_: bool) -> &'static str { "native" }
pub fn huge_hint() -> String { "Darwin uses native pages; huge pages are not requested by this port".into() }
pub fn huge_disabled() -> Option<String> { None }
pub fn allowed_cpus() -> BTreeSet<usize> { (0..std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1)).collect() }
pub fn pin_current(_: usize) -> std::io::Result<()> { Err(std::io::Error::new(std::io::ErrorKind::Unsupported, "Darwin schedules workers; hard affinity unavailable")) }
pub fn siblings_of(cpu: usize) -> Option<BTreeSet<usize>> { Some([cpu].into_iter().collect()) }
// Cluster-shared L2 is not per-core cache: retain the conservative 512KiB fallback.
pub fn cache_kib(_: usize, _: u32) -> Option<usize> { None }
pub fn cpu_ticks(_: &[usize]) -> Option<(u64,u64)> { None }
pub const FOREIGN_SCOPE: &str = "unavailable on this macOS test port; inspect external process samples";
pub fn self_ticks() -> Option<u64> { None }
pub fn other_miners() -> Vec<String> { Vec::new() }
pub fn exe_bytes() -> std::io::Result<Vec<u8>> { std::fs::read(std::env::current_exe()?) }
pub fn hostname() -> String { sysctl_string("kern.hostname").unwrap_or_default() }
pub fn lower_thread_priority() { unsafe { if libc::getpriority(libc::PRIO_PROCESS, 0) < 10 { libc::setpriority(libc::PRIO_PROCESS, 0, 10); } } }
pub const LOW_PRIORITY_LABEL: &str = "low (nice 19)";
pub fn priority_at_or_below_low() -> bool { unsafe { libc::getpriority(libc::PRIO_PROCESS, 0) >= 19 } }
pub fn set_low_priority() -> Result<(),String> { if unsafe { libc::setpriority(libc::PRIO_PROCESS, 0, 19) } == 0 { Ok(()) } else { Err(std::io::Error::last_os_error().to_string()) } }
pub fn libc_version() -> Option<String> { None }
pub fn config_dir() -> PathBuf { std::env::var_os("TOWERMINER_TEST_CONFIG").map(PathBuf::from).unwrap_or_else(|| std::env::temp_dir().join("towerminer-mac-test")) }
extern "C" fn stop(_: libc::c_int) { if STOP.swap(true, Ordering::SeqCst) { unsafe { libc::_exit(130); } } }
pub fn install_stop_handler() { unsafe {
    let mut sa: libc::sigaction = std::mem::zeroed(); sa.sa_sigaction = stop as *const () as usize;
    libc::sigemptyset(&mut sa.sa_mask); sa.sa_flags = libc::SA_RESTART;
    libc::sigaction(libc::SIGINT, &sa, std::ptr::null_mut()); libc::sigaction(libc::SIGTERM, &sa, std::ptr::null_mut());
} }
pub fn enable_ansi() -> bool { false }
pub fn cpu_quota() -> Option<Quota> { None }
pub fn platform_checks() -> Vec<(bool,&'static str,String)> { vec![(true,"macOS",page_env())] }
