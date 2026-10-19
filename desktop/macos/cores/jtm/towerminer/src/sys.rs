// SPDX-License-Identifier: Apache-2.0
//! Machine facts: cache sizes, SMT siblings, affinity, large pages, CPU quota,
//! CPU identity. Nothing here guesses from a CPU model name.
//!
//! The operating-system side lives in `sys_linux.rs` / `sys_windows.rs`; both
//! export the same functions, re-exported from here.
use std::collections::BTreeSet;

#[cfg(target_os = "linux")]
#[path = "sys_linux.rs"]
mod os;
#[cfg(windows)]
#[path = "sys_windows.rs"]
mod os;
#[cfg(target_os = "macos")]
#[path = "sys_macos.rs"]
mod os;
#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
compile_error!("towerminer supports Linux and Windows on x86-64");
#[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
compile_error!("towerminer supports x86-64 only");

pub use os::*;

/// Set by Ctrl-C / SIGTERM (see `install_stop_handler`): a clean stop.
pub static STOP: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn stop_requested() -> bool {
    STOP.load(std::sync::atomic::Ordering::SeqCst)
}

pub fn parse_list(s: &str) -> BTreeSet<usize> {
    let mut out = BTreeSet::new();
    for part in s.trim().split(',').filter(|p| !p.is_empty()) {
        if let Some((a, b)) = part.split_once('-') {
            if let (Ok(a), Ok(b)) = (a.trim().parse::<usize>(), b.trim().parse::<usize>()) {
                out.extend(a..=b);
            }
        } else if let Ok(v) = part.trim().parse() {
            out.insert(v);
        }
    }
    out
}

// ---------------------------------------------------------------------------
// CPU identity (cpuid, the same on every OS)
// ---------------------------------------------------------------------------

pub struct CpuId {
    pub vendor: String,
    /// Display family (base + extended), as Linux prints `cpu family`.
    pub family: u32,
    pub model: u32,
    pub brand: String,
}

impl CpuId {
    pub fn intel(&self) -> bool {
        self.vendor == "GenuineIntel"
    }
}

#[allow(unused_unsafe)]
#[cfg(target_arch = "x86_64")]
fn cpuid_leaf(leaf: u32) -> [u32; 4] {
    // SAFETY: cpuid exists on every x86-64 CPU.
    let r = unsafe { core::arch::x86_64::__cpuid(leaf) };
    [r.eax, r.ebx, r.ecx, r.edx]
}

#[cfg(target_arch = "x86_64")]
pub fn cpuid() -> &'static CpuId {
    static ID: std::sync::OnceLock<CpuId> = std::sync::OnceLock::new();
    ID.get_or_init(|| {
        let l0 = cpuid_leaf(0);
        let mut v = Vec::with_capacity(12);
        for r in [l0[1], l0[3], l0[2]] {
            v.extend_from_slice(&r.to_le_bytes());
        }
        let vendor = String::from_utf8_lossy(&v).trim_end_matches('\0').to_string();
        let eax = cpuid_leaf(1)[0];
        let base = (eax >> 8) & 0xF;
        let family = if base == 0xF { base + ((eax >> 20) & 0xFF) } else { base };
        let model = ((eax >> 4) & 0xF) | if base == 6 || base == 0xF { ((eax >> 16) & 0xF) << 4 } else { 0 };
        let mut brand = String::new();
        if cpuid_leaf(0x8000_0000)[0] >= 0x8000_0004 {
            let mut b = Vec::with_capacity(48);
            for leaf in 0x8000_0002..=0x8000_0004u32 {
                for r in cpuid_leaf(leaf) {
                    b.extend_from_slice(&r.to_le_bytes());
                }
            }
            brand = String::from_utf8_lossy(&b).trim_matches(|c: char| c == '\0' || c.is_whitespace()).to_string();
            // Some parts pad the middle of the string; the kernel prints it as is.
            while brand.contains("  ") {
                brand = brand.replace("  ", " ");
            }
        }
        CpuId { vendor, family, model, brand }
    })
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub fn cpuid() -> &'static CpuId {
    static ID: std::sync::OnceLock<CpuId> = std::sync::OnceLock::new();
    ID.get_or_init(|| CpuId {
        vendor: "Apple".into(), family: 0, model: 0,
        brand: os::sysctl_string("machdep.cpu.brand_string").unwrap_or_else(|| "Apple Silicon".into()),
    })
}

// ---------------------------------------------------------------------------
// Topology
// ---------------------------------------------------------------------------

pub struct Topology {
    /// Physical cores: sibling groups restricted to the allowed CPUs, each
    /// ordered, groups ordered by their first CPU.
    pub cores: Vec<Vec<usize>>,
    pub l2_kib: usize,
    pub l3_kib: usize,
}

impl Topology {
    pub fn detect(allowed: &BTreeSet<usize>) -> Topology {
        let mut groups: Vec<Vec<usize>> = Vec::new();
        let mut seen = BTreeSet::new();
        for &c in allowed {
            if seen.contains(&c) {
                continue;
            }
            let sib = os::siblings_of(c).unwrap_or_else(|| [c].into_iter().collect());
            let mut g: Vec<usize> = sib.into_iter().filter(|x| allowed.contains(x)).collect();
            if !g.contains(&c) {
                g.insert(0, c);
            }
            seen.extend(g.iter().copied());
            groups.push(g);
        }
        let first = *allowed.iter().next().unwrap_or(&0);
        // Level 2 = the unified L2 on every x86 part this targets.
        Topology {
            cores: groups,
            l2_kib: os::cache_kib(first, 2).unwrap_or(512),
            l3_kib: os::cache_kib(first, 3).unwrap_or(0),
        }
    }

    /// At least one core with two CPUs in the set.
    pub fn smt(&self) -> bool {
        self.cores.iter().any(|g| g.len() > 1)
    }
}

/// `n` logical CPUs of `cores`, whole cores first (both siblings of the first
/// core, then of the second...), so the profile's per-core rule then applies
/// inside the set.
pub fn take_logical(cores: &[Vec<usize>], n: usize) -> BTreeSet<usize> {
    let mut out = BTreeSet::new();
    for g in cores {
        for &c in g {
            if out.len() >= n {
                return out;
            }
            out.insert(c);
        }
    }
    out
}

/// `set` plus the SMT siblings of every CPU in it, even outside it.
pub fn with_siblings(set: &BTreeSet<usize>) -> Vec<usize> {
    let mut all = set.clone();
    for &c in set {
        if let Some(s) = os::siblings_of(c) {
            all.extend(s);
        }
    }
    all.into_iter().collect()
}

// ---------------------------------------------------------------------------
// CPU quota (cgroup cpu.max / cfs_quota on Linux)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub struct Quota {
    /// CPUs' worth of time per period (quota / period).
    pub cpus: f64,
    pub source: String,
}

impl Quota {
    /// Worker threads that the quota can keep busy: ceil(quota / period).
    /// More threads than that only take turns, and are throttled together.
    pub fn max_workers(&self) -> usize {
        (self.cpus - 1e-9).ceil().max(1.0) as usize
    }
}

/// cgroup v2 `cpu.max`: "<quota> <period>" or "max <period>".
#[cfg(target_os = "linux")]
pub fn parse_cpu_max(s: &str) -> Option<f64> {
    let mut it = s.split_whitespace();
    let q = it.next()?;
    let p: f64 = it.next().and_then(|p| p.parse().ok()).unwrap_or(100_000.0);
    if q == "max" || p <= 0.0 {
        return None;
    }
    let q: f64 = q.parse().ok()?;
    (q > 0.0).then(|| q / p)
}

/// cgroup v1 `cpu.cfs_quota_us` / `cpu.cfs_period_us` (-1 = no limit).
#[cfg(target_os = "linux")]
pub fn parse_cfs(quota: &str, period: &str) -> Option<f64> {
    let q: i64 = quota.trim().parse().ok()?;
    let p: i64 = period.trim().parse().ok()?;
    (q > 0 && p > 0).then(|| q as f64 / p as f64)
}

// ---------------------------------------------------------------------------
// SHA-256 of the running binary (keys the stored --tune result)
// ---------------------------------------------------------------------------

/// SHA-256 (FIPS 180-4) of a byte string, lowercase hex.
pub fn sha256_hex(data: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
        0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
        0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
        0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
        0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
        0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut h: [u32; 8] =
        [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    let mut msg = data.to_vec();
    let bits = (data.len() as u64).wrapping_mul(8);
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bits.to_be_bytes());
    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes(chunk[4 * i..4 * i + 4].try_into().unwrap());
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let mut v = h;
        for i in 0..64 {
            let s1 = v[4].rotate_right(6) ^ v[4].rotate_right(11) ^ v[4].rotate_right(25);
            let ch = (v[4] & v[5]) ^ (!v[4] & v[6]);
            let t1 = v[7].wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = v[0].rotate_right(2) ^ v[0].rotate_right(13) ^ v[0].rotate_right(22);
            let maj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
            let t2 = s0.wrapping_add(maj);
            v = [t1.wrapping_add(t2), v[0], v[1], v[2], v[3].wrapping_add(t1), v[4], v[5], v[6]];
        }
        for i in 0..8 {
            h[i] = h[i].wrapping_add(v[i]);
        }
    }
    h.iter().map(|x| format!("{x:08x}")).collect()
}

/// SHA-256 of the running binary, cached.
pub fn self_sha256() -> String {
    static SHA: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    SHA.get_or_init(|| os::exe_bytes().map(|b| sha256_hex(&b)).unwrap_or_else(|_| "unknown".into())).clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_known_vectors() {
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(sha256_hex(b""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        let m = b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
        assert_eq!(sha256_hex(m), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn quota_parsers_and_worker_cap() {
        assert_eq!(parse_cpu_max("max 100000"), None);
        assert_eq!(parse_cpu_max("384000 100000"), Some(3.84));
        assert_eq!(parse_cpu_max("200000 100000\n"), Some(2.0));
        assert_eq!(parse_cfs("-1", "100000"), None);
        assert_eq!(parse_cfs("150000\n", "100000\n"), Some(1.5));
        let q = |c| Quota { cpus: c, source: String::new() };
        // Measured on rented machines: 112 threads for a quota of 13.4 CPUs.
        assert_eq!(q(13.44).max_workers(), 14);
        assert_eq!(q(3.84).max_workers(), 4);
        assert_eq!(q(2.0).max_workers(), 2, "an exact quota is not rounded up");
        assert_eq!(q(0.5).max_workers(), 1);
    }

    #[test]
    fn take_logical_fills_whole_cores_first() {
        let cores = vec![vec![0, 8], vec![1, 9], vec![2, 10]];
        assert_eq!(take_logical(&cores, 4), [0, 8, 1, 9].into_iter().collect());
        assert_eq!(take_logical(&cores, 3), [0, 8, 1].into_iter().collect());
        assert_eq!(take_logical(&cores, 99).len(), 6);
    }

    #[test]
    fn cpuid_reads_a_vendor_and_a_family() {
        let id = cpuid();
        assert!(!id.vendor.is_empty());
        #[cfg(target_arch = "x86_64")]
        assert!(id.family >= 6, "family {}", id.family);
    }
}
