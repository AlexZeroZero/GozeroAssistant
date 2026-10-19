// SPDX-License-Identifier: Apache-2.0
//! Windows side of `sys`: topology and caches from
//! GetLogicalProcessorInformationEx, pads in large pages (VirtualAlloc with
//! MEM_LARGE_PAGES once SeLockMemoryPrivilege is enabled), threads pinned
//! with SetThreadGroupAffinity (processor groups, so more than 64 CPUs).
//!
//! CPUs are numbered densely across processor groups: group 0's active
//! processors first, then group 1's, and so on. On a machine with at most 64
//! logical processors this is Windows' own numbering.
use std::collections::BTreeSet;
use std::mem::{offset_of, size_of};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::OnceLock;

use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_NOT_ALL_ASSIGNED, FILETIME, HANDLE, LUID};
use windows_sys::Win32::Security::{
    AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES, SE_PRIVILEGE_ENABLED, TOKEN_ADJUST_PRIVILEGES,
    TOKEN_PRIVILEGES, TOKEN_QUERY,
};
use windows_sys::Win32::System::Console::{
    GetConsoleMode, GetStdHandle, SetConsoleCtrlHandler, SetConsoleMode, CTRL_CLOSE_EVENT,
    ENABLE_VIRTUAL_TERMINAL_PROCESSING, STD_ERROR_HANDLE,
};
use windows_sys::Win32::System::Memory::{
    GetLargePageMinimum, VirtualAlloc, VirtualFree, MEM_COMMIT, MEM_LARGE_PAGES, MEM_RELEASE, MEM_RESERVE,
    PAGE_READWRITE,
};
use windows_sys::Win32::System::SystemInformation::{
    GetLogicalProcessorInformationEx, RelationAll, RelationCache, RelationGroup, RelationProcessorCore,
    CACHE_RELATIONSHIP, GROUP_AFFINITY, GROUP_RELATIONSHIP, PROCESSOR_GROUP_INFO, PROCESSOR_RELATIONSHIP,
    SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX,
};
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, GetCurrentThread, GetPriorityClass, GetProcessAffinityMask, GetProcessGroupAffinity,
    GetProcessTimes, GetSystemTimes, OpenProcessToken, SetPriorityClass, SetThreadGroupAffinity, SetThreadPriority,
    BELOW_NORMAL_PRIORITY_CLASS, IDLE_PRIORITY_CLASS, THREAD_PRIORITY_BELOW_NORMAL,
};

use super::{Quota, STOP};
use crate::walk::PAD_BYTES;

const HUGE: usize = 2 << 20;

// ---------------------------------------------------------------------------
// Processor topology (GetLogicalProcessorInformationEx, read once)
// ---------------------------------------------------------------------------

struct Cache {
    level: u32,
    kib: usize,
    cpus: BTreeSet<usize>,
}

struct Topo {
    /// Dense CPU index -> (group, bit).
    cpus: Vec<(u16, u8)>,
    /// First dense index of each group, and the group's active mask.
    groups: Vec<(usize, usize)>,
    /// Physical cores (dense indices of their logical processors).
    cores: Vec<BTreeSet<usize>>,
    caches: Vec<Cache>,
}

fn slpi(rel: i32) -> Vec<u8> {
    let mut len: u32 = 0;
    unsafe {
        GetLogicalProcessorInformationEx(rel, std::ptr::null_mut(), &mut len);
    }
    if len == 0 {
        return Vec::new();
    }
    // u64 storage: the records hold 8-byte fields.
    let mut buf = vec![0u64; (len as usize).div_ceil(8)];
    let ok = unsafe {
        GetLogicalProcessorInformationEx(rel, buf.as_mut_ptr() as *mut SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX, &mut len)
    };
    if ok == 0 {
        return Vec::new();
    }
    let bytes: Vec<u8> = buf.iter().flat_map(|w| w.to_le_bytes()).collect();
    bytes[..len as usize].to_vec()
}

fn rd<T: Copy>(b: &[u8], off: usize) -> Option<T> {
    (off + size_of::<T>() <= b.len()).then(|| unsafe { std::ptr::read_unaligned(b.as_ptr().add(off) as *const T) })
}

/// The records of one buffer: (relationship, payload offset, record end).
fn records(b: &[u8]) -> Vec<(i32, usize, usize)> {
    let payload = offset_of!(SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX, Anonymous);
    let mut out = Vec::new();
    let mut off = 0usize;
    while let (Some(rel), Some(size)) = (rd::<i32>(b, off), rd::<u32>(b, off + 4)) {
        let size = size as usize;
        if size == 0 || off + size > b.len() {
            break;
        }
        out.push((rel, off + payload, off + size));
        off += size;
    }
    out
}

fn topo() -> &'static Topo {
    static T: OnceLock<Topo> = OnceLock::new();
    T.get_or_init(|| {
        let buf = slpi(RelationAll);
        let recs = records(&buf);
        // Groups first: they define the dense numbering.
        let mut groups = Vec::new();
        let mut cpus = Vec::new();
        for &(rel, p, _) in &recs {
            if rel != RelationGroup {
                continue;
            }
            let active: u16 = rd(&buf, p + offset_of!(GROUP_RELATIONSHIP, ActiveGroupCount)).unwrap_or(0);
            let info0 = p + offset_of!(GROUP_RELATIONSHIP, GroupInfo);
            for g in 0..active as usize {
                let gi = info0 + g * size_of::<PROCESSOR_GROUP_INFO>();
                let mask: usize = rd(&buf, gi + offset_of!(PROCESSOR_GROUP_INFO, ActiveProcessorMask)).unwrap_or(0);
                groups.push((cpus.len(), mask));
                for bit in 0..usize::BITS as u8 {
                    if mask >> bit & 1 == 1 {
                        cpus.push((g as u16, bit));
                    }
                }
            }
        }
        if cpus.is_empty() {
            // No group record (should not happen): one group of every CPU.
            let n = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1).min(64);
            let mask = if n == 64 { usize::MAX } else { (1usize << n) - 1 };
            groups.push((0, mask));
            cpus = (0..n as u8).map(|b| (0u16, b)).collect();
        }
        let dense = |g: u16, mask: usize| -> BTreeSet<usize> {
            cpus.iter().enumerate().filter(|(_, c)| c.0 == g && mask >> c.1 & 1 == 1).map(|(i, _)| i).collect()
        };
        // Group masks of a record: `count` GROUP_AFFINITY from `at`.
        let masks = |at: usize, count: usize| -> BTreeSet<usize> {
            let mut s = BTreeSet::new();
            for i in 0..count.max(1) {
                let ga = at + i * size_of::<GROUP_AFFINITY>();
                let mask: usize = rd(&buf, ga + offset_of!(GROUP_AFFINITY, Mask)).unwrap_or(0);
                let group: u16 = rd(&buf, ga + offset_of!(GROUP_AFFINITY, Group)).unwrap_or(0);
                s.extend(dense(group, mask));
            }
            s
        };
        let mut cores = Vec::new();
        let mut caches = Vec::new();
        for &(rel, p, _) in &recs {
            if rel == RelationProcessorCore {
                let n: u16 = rd(&buf, p + offset_of!(PROCESSOR_RELATIONSHIP, GroupCount)).unwrap_or(1);
                let s = masks(p + offset_of!(PROCESSOR_RELATIONSHIP, GroupMask), n as usize);
                if !s.is_empty() {
                    cores.push(s);
                }
            } else if rel == RelationCache {
                let level: u8 = rd(&buf, p + offset_of!(CACHE_RELATIONSHIP, Level)).unwrap_or(0);
                let size: u32 = rd(&buf, p + offset_of!(CACHE_RELATIONSHIP, CacheSize)).unwrap_or(0);
                let ty: i32 = rd(&buf, p + offset_of!(CACHE_RELATIONSHIP, Type)).unwrap_or(0);
                // Before Windows 10 1809 GroupCount is reserved (0): one mask.
                let n: u16 = rd(&buf, p + offset_of!(CACHE_RELATIONSHIP, GroupCount)).unwrap_or(0);
                // PROCESSOR_CACHE_TYPE: 0 unified, 1 instruction, 2 data, 3 trace.
                if ty == 1 || ty == 3 {
                    continue;
                }
                let s = masks(p + offset_of!(CACHE_RELATIONSHIP, Anonymous), n as usize);
                caches.push(Cache { level: level as u32, kib: size as usize / 1024, cpus: s });
            }
        }
        cores.sort_by_key(|c| *c.iter().next().unwrap_or(&usize::MAX));
        Topo { cpus, groups, cores, caches }
    })
}

/// The SMT siblings of `cpu` (itself included).
pub fn siblings_of(cpu: usize) -> Option<BTreeSet<usize>> {
    topo().cores.iter().find(|c| c.contains(&cpu)).cloned()
}

/// Size (KiB) of the data/unified cache of `level` that `cpu` uses.
pub fn cache_kib(cpu: usize, level: u32) -> Option<usize> {
    topo().caches.iter().find(|c| c.level == level && c.cpus.contains(&cpu)).map(|c| c.kib)
}

/// The CPUs this process may run on. A process restricted inside one group
/// (`start /affinity`, a job object) keeps that restriction; otherwise every
/// active processor of every group (threads are then placed explicitly).
pub fn allowed_cpus() -> BTreeSet<usize> {
    let t = topo();
    let all: BTreeSet<usize> = (0..t.cpus.len()).collect();
    unsafe {
        let mut count: u16 = 0;
        GetProcessGroupAffinity(GetCurrentProcess(), &mut count, std::ptr::null_mut());
        let mut gs = vec![0u16; count.max(1) as usize];
        let mut n = gs.len() as u16;
        if GetProcessGroupAffinity(GetCurrentProcess(), &mut n, gs.as_mut_ptr()) == 0 || n != 1 {
            return all;
        }
        let (mut pm, mut sm) = (0usize, 0usize);
        if GetProcessAffinityMask(GetCurrentProcess(), &mut pm, &mut sm) == 0 {
            return all;
        }
        let g = gs[0];
        let Some(&(_, gmask)) = t.groups.get(g as usize) else { return all };
        if pm == 0 || pm & gmask == gmask {
            return all;
        }
        let set: BTreeSet<usize> =
            t.cpus.iter().enumerate().filter(|(_, c)| c.0 == g && pm >> c.1 & 1 == 1).map(|(i, _)| i).collect();
        if set.is_empty() {
            all
        } else {
            set
        }
    }
}

pub fn pin_current(cpu: usize) -> std::io::Result<()> {
    let Some(&(group, bit)) = topo().cpus.get(cpu) else {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, format!("no logical processor {cpu}")));
    };
    let ga = GROUP_AFFINITY { Mask: 1usize << bit, Group: group, Reserved: [0; 3] };
    if unsafe { SetThreadGroupAffinity(GetCurrentThread(), &ga, std::ptr::null_mut()) } != 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

// ---------------------------------------------------------------------------
// Large pages
// ---------------------------------------------------------------------------

/// Enable SeLockMemoryPrivilege ("Lock pages in memory") in this process's
/// token, once. Err = why large pages cannot be used.
fn lock_memory_privilege() -> &'static Result<usize, String> {
    static P: OnceLock<Result<usize, String>> = OnceLock::new();
    P.get_or_init(|| unsafe {
        let lp = GetLargePageMinimum();
        if lp == 0 {
            return Err("this system does not support large pages".into());
        }
        let mut tok: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &mut tok) == 0 {
            return Err(format!("OpenProcessToken: {}", std::io::Error::last_os_error()));
        }
        let name: Vec<u16> = "SeLockMemoryPrivilege".encode_utf16().chain(Some(0)).collect();
        let mut luid = LUID { LowPart: 0, HighPart: 0 };
        if LookupPrivilegeValueW(std::ptr::null(), name.as_ptr(), &mut luid) == 0 {
            let e = std::io::Error::last_os_error();
            CloseHandle(tok);
            return Err(format!("LookupPrivilegeValue: {e}"));
        }
        let tp = TOKEN_PRIVILEGES {
            PrivilegeCount: 1,
            Privileges: [LUID_AND_ATTRIBUTES { Luid: luid, Attributes: SE_PRIVILEGE_ENABLED }],
        };
        let ok = AdjustTokenPrivileges(tok, 0, &tp, 0, std::ptr::null_mut(), std::ptr::null_mut());
        let err = GetLastError();
        CloseHandle(tok);
        if ok == 0 {
            return Err(format!("AdjustTokenPrivileges: {}", std::io::Error::from_raw_os_error(err as i32)));
        }
        if err == ERROR_NOT_ALL_ASSIGNED {
            return Err("this account does not hold the 'Lock pages in memory' right".into());
        }
        Ok(lp)
    })
}

/// Why the last large-page allocation failed (when the privilege is held but
/// the allocation is refused: memory too fragmented).
static LARGE_FAIL: OnceLock<String> = OnceLock::new();

/// One region of `pads` contiguous 512 KiB pads: in large pages when the
/// account may lock pages, else in normal 4 KiB pages. First-touched by the
/// calling (already pinned) thread.
pub struct Region {
    base: *mut u8,
    large: bool,
    /// Bytes the pads would take in 2 MiB pages.
    expect: usize,
    pub pads: Vec<*mut u64>,
}

unsafe impl Send for Region {}

impl Region {
    pub fn new(pads: usize, huge: bool) -> std::io::Result<Region> {
        let need = pads * PAD_BYTES;
        let expect = need.div_ceil(HUGE) * HUGE;
        unsafe {
            if huge {
                if let Ok(lp) = lock_memory_privilege() {
                    let span = need.div_ceil(*lp) * *lp;
                    let p = VirtualAlloc(std::ptr::null(), span, MEM_RESERVE | MEM_COMMIT | MEM_LARGE_PAGES, PAGE_READWRITE);
                    if !p.is_null() {
                        return Ok(Region::with(p as *mut u8, true, expect, pads, need));
                    }
                    let _ = LARGE_FAIL.set(format!(
                        "the large-page allocation was refused ({}): not enough contiguous free memory",
                        std::io::Error::last_os_error()
                    ));
                }
            }
            let p = VirtualAlloc(std::ptr::null(), need, MEM_RESERVE | MEM_COMMIT, PAGE_READWRITE);
            if p.is_null() {
                return Err(std::io::Error::last_os_error());
            }
            Ok(Region::with(p as *mut u8, false, expect, pads, need))
        }
    }

    unsafe fn with(base: *mut u8, large: bool, expect: usize, pads: usize, need: usize) -> Region {
        std::ptr::write_bytes(base, 0, need);
        let v = (0..pads).map(|k| base.add(k * PAD_BYTES) as *mut u64).collect();
        Region { base, large, expect, pads: v }
    }

    /// KiB of this region in large pages (all of it or nothing).
    pub fn huge_kb(&self) -> Option<u64> {
        Some(if self.large { (self.expect / 1024) as u64 } else { 0 })
    }

    pub fn expected_huge_kb(&self) -> u64 {
        (self.expect / 1024) as u64
    }
}

impl Drop for Region {
    fn drop(&mut self) {
        unsafe {
            VirtualFree(self.base as *mut _, 0, MEM_RELEASE);
        }
    }
}

pub fn anon_huge_kb() -> Option<u64> {
    None
}

pub fn page_env() -> String {
    match lock_memory_privilege() {
        Ok(_) => "large pages: available".into(),
        Err(e) => format!("large pages: unavailable ({e})"),
    }
}

pub fn pages_label(huge: bool) -> &'static str {
    if huge {
        "large"
    } else {
        "normal"
    }
}

pub fn huge_hint() -> String {
    let why = match lock_memory_privilege() {
        Err(e) => e.clone(),
        Ok(_) => LARGE_FAIL.get().cloned().unwrap_or_else(|| "large-page allocation refused".into()),
    };
    format!(
        "large pages unavailable ({why}): the pads sit in 4 KiB pages, about 20-25 % slower. Grant 'Lock pages in \
         memory' to your account (secpol.msc, see README), sign out and in again"
    )
}

/// Large pages are never a reason to refuse to start on Windows.
pub fn huge_disabled() -> Option<String> {
    None
}

// ---------------------------------------------------------------------------
// Load, identity, misc.
// ---------------------------------------------------------------------------

fn ft(f: &FILETIME) -> u64 {
    (f.dwHighDateTime as u64) << 32 | f.dwLowDateTime as u64
}

/// Busy and total time of the whole machine (100 ns units), from
/// GetSystemTimes: Windows has no cheap per-CPU counter, so the foreign-load
/// check of --tune covers every CPU.
pub fn cpu_ticks(_cpus: &[usize]) -> Option<(u64, u64)> {
    let z = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
    let (mut idle, mut kernel, mut user) = (z, z, z);
    if unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) } == 0 {
        return None;
    }
    // Kernel time includes idle time.
    let total = ft(&kernel) + ft(&user);
    Some((total.saturating_sub(ft(&idle)), total))
}

pub const FOREIGN_SCOPE: &str = "the whole machine (Windows)";

/// CPU time of this process (100 ns units).
pub fn self_ticks() -> Option<u64> {
    let z = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
    let (mut c, mut e, mut k, mut u) = (z, z, z, z);
    if unsafe { GetProcessTimes(GetCurrentProcess(), &mut c, &mut e, &mut k, &mut u) } == 0 {
        return None;
    }
    Some(ft(&k) + ft(&u))
}

pub fn other_miners() -> Vec<String> {
    Vec::new()
}

pub fn exe_bytes() -> std::io::Result<Vec<u8>> {
    std::fs::read(std::env::current_exe()?)
}

pub fn hostname() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_default()
}

pub fn lower_thread_priority() {
    unsafe {
        SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);
    }
}

/// --priority low, as the start-up log shows it.
pub const LOW_PRIORITY_LABEL: &str = "below normal";

/// The process already runs in the below-normal or idle priority class.
pub fn priority_at_or_below_low() -> bool {
    let c = unsafe { GetPriorityClass(GetCurrentProcess()) };
    c == BELOW_NORMAL_PRIORITY_CLASS || c == IDLE_PRIORITY_CLASS
}

/// Below-normal priority class for the whole process (every thread).
pub fn set_low_priority() -> Result<(), String> {
    if unsafe { SetPriorityClass(GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS) } != 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error().to_string())
    }
}

/// Where --tune stores its result: %APPDATA%\towerminer.
pub fn config_dir() -> PathBuf {
    match std::env::var_os("APPDATA").filter(|x| !x.is_empty()) {
        Some(a) => PathBuf::from(a).join("towerminer"),
        None => PathBuf::from("towerminer"),
    }
}

unsafe extern "system" fn on_console_ctrl(ctrl: u32) -> windows_sys::core::BOOL {
    if STOP.swap(true, Ordering::SeqCst) {
        // Second Ctrl-C while shutting down: leave at once.
        std::process::exit(130);
    }
    if ctrl == CTRL_CLOSE_EVENT {
        // The console is closing: Windows ends the process when this handler
        // returns; give the main loop a moment to stop cleanly.
        std::thread::sleep(std::time::Duration::from_secs(3));
    }
    1
}

/// Ctrl-C / Ctrl-Break / console close request a clean stop.
pub fn install_stop_handler() {
    unsafe {
        SetConsoleCtrlHandler(Some(on_console_ctrl), 1);
    }
}

/// Turn on ANSI escape processing on the console behind stderr; false when
/// stderr is not a console or the console refuses (colours are then off).
pub fn enable_ansi() -> bool {
    unsafe {
        let h = GetStdHandle(STD_ERROR_HANDLE);
        if h.is_null() || h == windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE {
            return false;
        }
        let mut mode = 0;
        if GetConsoleMode(h, &mut mode) == 0 {
            return false;
        }
        mode & ENABLE_VIRTUAL_TERMINAL_PROCESSING != 0 || SetConsoleMode(h, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING) != 0
    }
}

/// No cgroup quota on Windows (a job-object CPU rate limit is not read).
pub fn cpu_quota() -> Option<Quota> {
    None
}

pub fn platform_checks() -> Vec<(bool, &'static str, String)> {
    let mut v = Vec::new();
    let t = topo();
    v.push((
        true,
        "groups",
        format!("{} processor group(s), {} logical processors, {} cores", t.groups.len(), t.cpus.len(), t.cores.len()),
    ));
    match lock_memory_privilege() {
        Err(_) => v.push((false, "largepage", huge_hint())),
        Ok(lp) => match Region::new(1, true) {
            Ok(r) if r.huge_kb().unwrap_or(0) >= r.expected_huge_kb() => v.push((
                true,
                "largepage",
                format!("Lock pages in memory held; test region in large pages ({} KiB pages)", lp / 1024),
            )),
            Ok(_) => v.push((false, "largepage", huge_hint())),
            Err(e) => v.push((false, "largepage", format!("VirtualAlloc: {e}"))),
        },
    }
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn topology_is_consistent() {
        let t = topo();
        assert!(!t.cpus.is_empty());
        let all: BTreeSet<usize> = t.cores.iter().flatten().copied().collect();
        assert_eq!(all.len(), t.cpus.len(), "every logical processor in exactly one core");
        assert!(cache_kib(0, 2).is_some() || cache_kib(0, 3).is_some() || t.caches.is_empty());
        assert!(pin_current(0).is_ok());
    }

    #[test]
    fn region_allocates_and_frees() {
        let r = Region::new(2, true).expect("VirtualAlloc");
        assert_eq!(r.expected_huge_kb(), 2048);
        unsafe {
            *r.pads[1].add(10) = 7;
            assert_eq!(*r.pads[1].add(10), 7);
        }
    }
}
