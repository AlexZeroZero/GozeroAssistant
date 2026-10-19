// SPDX-License-Identifier: Apache-2.0
//! Bit-exact gates. The oracle is the vendored reference walk
//! (`jetsam_poseidon2b::towerwalk::towerwalk_digest_with`), and the seed path is
//! the one the miner itself uses (`FixedFieldNonceBatch`). A gate that cannot
//! find its vectors FAILS — the golden file is compiled in, so it cannot go
//! missing at runtime.
use jetsam_core::Block128;
use jetsam_poseidon2b::batch::FixedFieldNonceBatch;
use jetsam_poseidon2b::native::domain::TAG_POWHDR;
use jetsam_poseidon2b::towerwalk::{towerwalk_digest_with, Scratch};

use crate::sys::Region;
use crate::thermal::{self, Thermal};
use crate::walk::{kernel_name, pre_of, walk_dyn, walk_pipe_dyn, K_BASE, K_FAST, MAX_PADS};

pub const FIELDS: usize = 16;
pub const NONCE_FIELD: usize = 0;

const GOLDEN: &str = include_str!("../../vendor/docs/mining/jetsam-towerwalk-golden-v1.txt");

pub struct Vector {
    pub fields: [Block128; FIELDS],
    pub nonce: u128,
    pub digest: [u8; 32],
}

pub fn golden() -> Vec<Vector> {
    let mut out = Vec::new();
    for line in GOLDEN.lines().filter(|l| l.starts_with("V ")) {
        let p: Vec<&str> = line.split_whitespace().collect();
        assert_eq!(p.len(), 1 + FIELDS + 5 + 1, "malformed golden line");
        let raw: Vec<u128> = (0..FIELDS).map(|i| u128::from_str_radix(p[1 + i], 16).unwrap()).collect();
        let mut fields = [Block128::from(0u128); FIELDS];
        for i in 0..FIELDS {
            fields[i] = Block128::from(raw[i]);
        }
        let h = p[p.len() - 1];
        let mut digest = [0u8; 32];
        for i in 0..32 {
            digest[i] = u8::from_str_radix(&h[2 * i..2 * i + 2], 16).unwrap();
        }
        out.push(Vector { fields, nonce: raw[NONCE_FIELD], digest });
    }
    assert!(out.len() >= 256, "golden holds {} vectors, the contract is 256", out.len());
    out
}

/// Seed exactly as the mining loop computes it.
pub fn seed_of(fields: &[Block128; FIELDS], nonce: u128) -> [u8; 32] {
    let mut h = FixedFieldNonceBatch::new(TAG_POWHDR, fields, NONCE_FIELD);
    let mut s = [[0u8; 32]; 1];
    h.hash_into(nonce, &mut s);
    s[0]
}

/// Oracle digest for a seed (reference walk, its own scratchpad).
pub fn oracle(scratch: &mut Scratch, seed: &[u8; 32]) -> [u8; 32] {
    towerwalk_digest_with(scratch, seed)
}

fn splitmix(s: &mut u64) -> u64 {
    *s = s.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *s;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// The mining workers' thermal watchdog, applied before every walk of a gate:
/// no hashing on a reading older than 1 s, exit 82 after 3 s without one
/// (see `thermal::worker_may_hash`). Returns at once without a guard.
fn guard_ok(th: &Thermal) {
    while !thermal::worker_may_hash(th) {}
}

/// Gate threads run at a lower priority (nice +10 on Linux), so the thermal
/// guard thread of the thermal-guard build wins the CPU whenever it wakes,
/// however many shapes run at once, and the machine stays usable. Lowering
/// one's own priority needs no privilege; a failure only costs that margin.
fn lower_priority() {
    crate::sys::lower_thread_priority();
}

/// Run `seeds` through the kernel at (p, pf, k) — every seed visits every
/// slot — and count mismatches against `want`.
fn kernel_mismatches(p: usize, pf: bool, k: u8, huge: bool, seeds: &[[u8; 32]], want: &[[u8; 32]], th: &Thermal) -> usize {
    let region = Region::new(p, huge).expect("scratchpad region");
    let mut bad = 0;
    for rot in 0..p {
        let mut i = rot;
        while i + p <= seeds.len() {
            guard_ok(th);
            let mut s = [[0u8; 32]; MAX_PADS];
            let mut o = [[0u8; 32]; MAX_PADS];
            s[..p].copy_from_slice(&seeds[i..i + p]);
            unsafe { walk_dyn(p, pf, k, &region.pads, &s[..p], &mut o[..p]) };
            for j in 0..p {
                if o[j] != want[i + j] {
                    bad += 1;
                }
            }
            i += p;
        }
        if seeds.len() < 2 * p {
            break;
        }
    }
    bad
}

/// Pipelined walk over a chain of seeds: anchors of seed i+1 are produced
/// while seed i walks, exactly as the worker does. The first seed uses the
/// serial anchors; the last seed runs with no successor. Every digest is
/// compared to `want`. Then the fallback path (serial anchors, no successor)
/// on the first seeds. `pf`: the prefetching variant of the piped walk.
fn pipe_mismatches(huge: bool, pf: bool, seeds: &[[u8; 32]], want: &[[u8; 32]], th: &Thermal) -> usize {
    let region = Region::new(1, huge).expect("scratchpad region");
    let mut bad = 0;
    let mut pre = pre_of(&seeds[0]);
    for i in 0..seeds.len() {
        guard_ok(th);
        let next = seeds.get(i + 1);
        let (d, pn) = unsafe { walk_pipe_dyn(pf, region.pads[0], &seeds[i], &pre, next) };
        if d != want[i] {
            bad += 1;
        }
        if let Some(pn) = pn {
            pre = pn;
        }
    }
    for i in 0..seeds.len().min(8) {
        guard_ok(th);
        let pr = pre_of(&seeds[i]);
        let (d, _) = unsafe { walk_pipe_dyn(pf, region.pads[0], &seeds[i], &pr, None) };
        if d != want[i] {
            bad += 1;
        }
    }
    bad
}

/// Startup self-test for the exact configuration about to mine: the first
/// `n` golden vectors end to end (fields + nonce -> seed -> walk -> digest).
pub fn self_test(p: usize, pf: bool, k: u8, huge: bool, pipe: bool, n: usize, th: &Thermal) -> Result<usize, String> {
    let g = golden();
    let n = n.min(g.len()).max(p);
    let seeds: Vec<[u8; 32]> = g[..n].iter().map(|v| seed_of(&v.fields, v.nonce)).collect();
    let want: Vec<[u8; 32]> = g[..n].iter().map(|v| v.digest).collect();
    let bad = if pipe {
        pipe_mismatches(huge, pf, &seeds, &want, th)
    } else {
        kernel_mismatches(p, pf, k, huge, &seeds, &want, th)
    };
    if bad == 0 {
        Ok(n)
    } else {
        Err(format!(
            "{bad} golden mismatches at kernel={} pads={p} prefetch={pf} huge={huge} pipe={pipe}",
            kernel_name(k)
        ))
    }
}

/// Full gate: oracle vs all 256 golden, then every compiled kernel shape
/// (kernel base/fast x pads 1..=4 x prefetch x page size) and the pipelined
/// chain (prefetch 0/1, 2M and 4K) vs golden + `nrand` random seeds checked
/// by the oracle. Shapes run on parallel threads (nice +10, under the thermal
/// watchdog), each with its own region. Returns false on any mismatch.
pub fn full(nrand: usize, th: &Thermal) -> bool {
    let g = golden();
    let mut sc = Scratch::new();
    let mut seeds: Vec<[u8; 32]> = g.iter().map(|v| seed_of(&v.fields, v.nonce)).collect();
    let mut want: Vec<[u8; 32]> = g.iter().map(|v| v.digest).collect();
    let oracle_ok = seeds.iter().zip(&want).filter(|(s, w)| oracle(&mut sc, s) == **w).count();
    println!("oracle + seed path vs golden : {oracle_ok}/{}", g.len());
    let mut ok = oracle_ok == g.len();
    let mut st = 0x7465_7374_6761_7465u64;
    for _ in 0..nrand {
        let mut s = [0u8; 32];
        for w in 0..4 {
            s[w * 8..w * 8 + 8].copy_from_slice(&splitmix(&mut st).to_le_bytes());
        }
        want.push(oracle(&mut sc, &s));
        seeds.push(s);
    }
    // (p, pf, k, huge); p = 0 marks the pipelined chain.
    let mut jobs: Vec<(usize, bool, u8, bool)> = Vec::new();
    for huge in [true, false] {
        for k in [K_BASE, K_FAST] {
            for pf in [false, true] {
                for p in 1..=MAX_PADS {
                    jobs.push((p, pf, k, huge));
                }
            }
        }
        for pf in [false, true] {
            jobs.push((0, pf, K_FAST, huge));
        }
    }
    let (seeds, want) = (&seeds, &want);
    let results: Vec<(usize, bool, u8, bool, usize)> = std::thread::scope(|s| {
        let hs: Vec<_> = jobs
            .iter()
            .map(|&(p, pf, k, huge)| {
                s.spawn(move || {
                    lower_priority();
                    let bad = if p == 0 {
                        pipe_mismatches(huge, pf, seeds, want, th)
                    } else {
                        kernel_mismatches(p, pf, k, huge, seeds, want, th)
                    };
                    (p, pf, k, huge, bad)
                })
            })
            .collect();
        hs.into_iter().map(|h| h.join().unwrap()).collect()
    });
    for (p, pf, k, huge, bad) in results {
        let pages = if huge { "2M" } else { "4K" };
        if p == 0 {
            println!(
                "kernel=fast PIPE (chained anchors, 1 pad) prefetch={} pages={pages} : {bad} mismatches over {} seeds",
                pf as u8,
                seeds.len()
            );
        } else {
            println!(
                "kernel={} pads={p} prefetch={} pages={pages} : {bad} mismatches over {} seeds x {p} slot rotations",
                kernel_name(k),
                pf as u8,
                seeds.len()
            );
        }
        ok &= bad == 0;
    }
    println!("GATE {}", if ok { "PASS" } else { "FAIL" });
    ok
}
