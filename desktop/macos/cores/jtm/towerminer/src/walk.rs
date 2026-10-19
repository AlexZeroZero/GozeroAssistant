// SPDX-License-Identifier: Apache-2.0
//! TowerWalk kernel: `P` independent seeds walked in lockstep, one pad each.
//!
//! Bit-exact with `jetsam_poseidon2b::towerwalk::towerwalk_digest_with` — that
//! function is the oracle, and every gate in this binary compares against it.
//!
//! Why interleave: one walk is a single chain of dependent L2 reads (~25
//! cycles a round on Zen 3, ~27 on Zen 4, measured), so a core sits mostly
//! idle. Two chains per core hide each other's latency as long as their pads
//! fit the private L2 [MEASURED 2026-09-26: 1 thread x 2 pads = +43 % per core
//! on a 7900X]. Inside one pad the four lanes stay in program order
//! (invariant 2): lane l+1 reads what lane l just wrote. Pads never share a
//! cell, so the interleaving cannot change a digest.
//!
//! Two kernels, chosen per profile (`K`):
//!
//! - `K_BASE`: the v0.1 kernel (same arithmetic, same instruction shape).
//! - `K_FAST`: the levers the kernel lab measured on a 5950X (Zen 3), each
//!   gated end to end before it was timed [2026-09-28, R1]:
//!   - P = 1: byte-offset addressing `((n<<3) ^ (n>>29)) & 0x7FFF8` (simple
//!     AGU, one cycle off the loop-carried chain) and a one-add fill chain
//!     `x*C + i*C` (distributivity mod 2^64): +1.9 % a thread. With the
//!     pipelined fill anchors ([`walk_pipe`], +3.9 %) and an 8-seed sponge
//!     batch (+0.9-1.3 %): +6.6 % whole machine.
//!   - P >= 2: grouped fold, two pad states per 2-lane packed permutation
//!     (+4.3 % at 1 thread x 2 pads, +3.8 % at 2 x 2 x prefetch). The P = 1
//!     tricks LOSE 3.1 % there (8 chains spill the 15 GPRs), so the flags are
//!     derived from (K, P) at compile time and cannot be combined wrongly.
use jetsam_core::packed::{PackedBlock128, PACKED_LANES};
use jetsam_core::Block128;
use jetsam_poseidon2b::batch::packed_poseidon2b_permute_flat_many;
use jetsam_poseidon2b::native::permutation::permute_flat_u128;
use jetsam_poseidon2b::towerwalk::{CAP_INIT, CELLS, FILL_PERM_PERIOD, INDEX_MASK, MULT_C, PERM_PERIOD, ROUNDS};

pub const PAD_BYTES: usize = CELLS * 8;
pub const MAX_PADS: usize = 4;

pub const K_BASE: u8 = 0;
pub const K_FAST: u8 = 1;

pub fn kernel_name(k: u8) -> &'static str {
    if k == K_FAST {
        "fast"
    } else {
        "base"
    }
}

/// Byte-offset mask: cell index (16 bits) times 8.
const OFF_MASK: u64 = INDEX_MASK << 3;

// The xorshift and the lane order are the two invariants a kernel is most
// likely to get wrong; the mutant builds (cargo features, never a release)
// break exactly one of them so the gate can prove it bites.
#[cfg(not(feature = "mutant-xorshift28"))]
const XS: u32 = jetsam_poseidon2b::towerwalk::XORSHIFT;
#[cfg(feature = "mutant-xorshift28")]
const XS: u32 = jetsam_poseidon2b::towerwalk::XORSHIFT - 1;
#[cfg(not(feature = "mutant-lane-order"))]
const LANES: [usize; 4] = [0, 1, 2, 3];
#[cfg(feature = "mutant-lane-order")]
const LANES: [usize; 4] = [1, 0, 2, 3];

pub const MUTANT: bool = cfg!(any(feature = "mutant-xorshift28", feature = "mutant-lane-order"));

/// Byte-offset addressing and one-add fill: P = 1 only.
pub const fn simple(k: u8, p: usize) -> bool {
    k == K_FAST && p == 1
}
/// Grouped fold: P >= 2 only.
pub const fn gfold(k: u8, p: usize) -> bool {
    k == K_FAST && p >= 2
}

/// Human-readable shape of a kernel at `p` pads.
pub fn describe(k: u8, p: usize, pipe: bool) -> String {
    if k != K_FAST {
        return "base".into();
    }
    let mut v = Vec::new();
    if simple(k, p) {
        v.push("simple+fill1");
    }
    if gfold(k, p) {
        v.push("gfold");
    }
    if pipe {
        v.push("pipe");
    }
    format!("fast({})", v.join(","))
}

#[inline(always)]
fn mix(x: u64, ctr: u64) -> u64 {
    let y = x.wrapping_add(ctr).wrapping_mul(MULT_C);
    y ^ (y >> XS)
}

/// Same packing as the oracle's `fold`: flat basis, no T2F/F2T.
#[inline(always)]
pub fn fold(a: &mut [u64; 4], c: &mut [u64; 4]) {
    let mut flat = [0u128; 4];
    for i in 0..4 {
        flat[i] = (a[i] as u128) | ((c[i] as u128) << 64);
    }
    permute_flat_u128(&mut flat);
    for i in 0..4 {
        a[i] = flat[i] as u64;
        c[i] = (flat[i] >> 64) as u64;
    }
}

/// Fold all P states: one by one, or two per packed permutation (grouped).
/// Lane p of group p/2 carries pad p; each lane is bit-identical to
/// `permute_flat_u128` (the crate's differential test) and the gate checks it
/// end to end for P = 2, 3, 4.
#[inline(always)]
fn fold_all<const P: usize, const K: u8>(a: &mut [[u64; 4]; P], c: &mut [[u64; 4]; P]) {
    if !gfold(K, P) {
        for p in 0..P {
            fold(&mut a[p], &mut c[p]);
        }
        return;
    }
    let ng = P.div_ceil(PACKED_LANES);
    let mut groups = [[PackedBlock128::ZERO; 4]; MAX_PADS.div_ceil(PACKED_LANES)];
    for p in 0..P {
        let (g, lane) = (p / PACKED_LANES, p % PACKED_LANES);
        for i in 0..4 {
            let w = (a[p][i] as u128) | ((c[p][i] as u128) << 64);
            groups[g][i] = groups[g][i].set_lane(lane, Block128::from(w));
        }
    }
    packed_poseidon2b_permute_flat_many(&mut groups[..ng]);
    for p in 0..P {
        let (g, lane) = (p / PACKED_LANES, p % PACKED_LANES);
        for i in 0..4 {
            let w = groups[g][i].get_lane(lane).to_u128();
            a[p][i] = w as u64;
            c[p][i] = (w >> 64) as u64;
        }
    }
}

/// Byte offset of the cell `a` selects: `((a ^ a>>32) & MASK) * 8`.
#[inline(always)]
fn off_of(a: u64) -> usize {
    (((a ^ (a >> 32)) & INDEX_MASK) as usize) << 3
}

/// One lane step. `off` holds the byte offset of this lane's next cell.
/// `SIMPLE`: the next offset is formed directly in bytes,
/// `((n<<3) ^ (n>>29)) & 0x7FFF8` == `off_of(n)` (the three low bits of
/// `n>>29` are masked off), which lets the load use `[base + off]`.
#[inline(always)]
unsafe fn step<const SIMPLE: bool, const PF: bool>(v: *mut u8, off: &mut usize, a: &mut u64, rr: u64) {
    let ptr = v.add(*off) as *mut u64;
    let val = *ptr;
    let y = (*a ^ val).wrapping_add(rr).wrapping_mul(MULT_C);
    let n = y ^ (y >> XS);
    *a = n;
    *ptr = n.wrapping_add(val);
    let next = if SIMPLE { (((n << 3) ^ (n >> 29)) & OFF_MASK) as usize } else { off_of(n) };
    *off = next;
    if PF {
        #[cfg(target_arch = "x86_64")]
        core::arch::x86_64::_mm_prefetch::<{ core::arch::x86_64::_MM_HINT_T0 }>(v.add(next) as *const i8);
        #[cfg(target_arch = "aarch64")]
        core::arch::asm!("prfm pldl1keep, [{ptr}]", ptr = in(reg) v.add(next), options(readonly, nostack, preserves_flags));
    }
}

/// One block of FILL_PERM_PERIOD fill cells starting at cell `i`, all pads.
#[inline(always)]
unsafe fn fill_block<const P: usize, const FILL1: bool>(pads: &[*mut u64; P], x: &mut [u64; P], i: usize) {
    if FILL1 {
        // (x + ii) * C == x*C + ii*C (mod 2^64); ii*C carried as `ic`.
        let mut ic = (i as u64).wrapping_mul(MULT_C);
        for ii in i..i + FILL_PERM_PERIOD {
            for p in 0..P {
                let y = x[p].wrapping_mul(MULT_C).wrapping_add(ic);
                x[p] = y ^ (y >> XS);
                *pads[p].add(ii) = x[p];
            }
            ic = ic.wrapping_add(MULT_C);
        }
    } else {
        for ii in i..i + FILL_PERM_PERIOD {
            for p in 0..P {
                x[p] = mix(x[p], ii as u64);
                *pads[p].add(ii) = x[p];
            }
        }
    }
}

/// Walk `P` seeds, one per pad.
///
/// `PF`: software-prefetch each lane's next address as soon as it is known. Pays
/// where pads spill to L3 (Zen 2, +5.7 % at 2 threads x 2 pads; Zen 3 +17.7 %
/// at 2 x 2) and costs where they fit L2 (Zen 4, -10 %) [MEASURED] — hence a
/// parameter.
///
/// # Safety
/// Each `pads[p]` points to `CELLS` writable `u64`, pads pairwise disjoint.
#[inline(never)]
pub unsafe fn walk<const P: usize, const PF: bool, const K: u8>(
    pads: &[*mut u64; P],
    seeds: &[[u8; 32]; P],
    out: &mut [[u8; 32]; P],
) {
    let mut a = [[0u64; 4]; P];
    let mut c = [[0u64; 4]; P];
    let mut x = [0u64; P];
    for p in 0..P {
        for i in 0..4 {
            a[p][i] = u64::from_le_bytes(seeds[p][i * 8..(i + 1) * 8].try_into().unwrap());
            c[p][i] = a[p][i] ^ CAP_INIT[i];
        }
        x[p] = a[p][0] ^ a[p][1] ^ a[p][2] ^ a[p][3];
    }
    // Fill, re-anchored every FILL_PERM_PERIOD cells exactly like the oracle.
    let mut i = 0usize;
    while i < CELLS {
        if simple(K, P) {
            fill_block::<P, true>(pads, &mut x, i);
        } else {
            fill_block::<P, false>(pads, &mut x, i);
        }
        i += FILL_PERM_PERIOD;
        fold_all::<P, K>(&mut a, &mut c);
        for p in 0..P {
            x[p] ^= a[p][0] ^ a[p][1] ^ a[p][2] ^ a[p][3];
        }
    }
    // Walk.
    let mut off = [[0usize; 4]; P];
    for p in 0..P {
        for l in 0..4 {
            off[p][l] = off_of(a[p][l]);
        }
    }
    let mut r = 0usize;
    while r < ROUNDS {
        for rr in r..r + PERM_PERIOD {
            for p in 0..P {
                let v = pads[p] as *mut u8;
                if K == K_FAST {
                    step_quad::<PF>(v, &mut a[p], rr as u64);
                } else {
                    for l in 0..4 { step::<false, PF>(v, &mut off[p][l], &mut a[p][l], rr as u64); }
                }
            }
        }
        r += PERM_PERIOD;
        fold_all::<P, K>(&mut a, &mut c);
        for p in 0..P {
            for l in 0..4 {
                off[p][l] = off_of(a[p][l]);
            }
        }
    }
    // Mandatory final fold, then squeeze little-endian.
    fold_all::<P, K>(&mut a, &mut c);
    for p in 0..P {
        for i in 0..4 {
            out[p][i * 8..(i + 1) * 8].copy_from_slice(&a[p][i].to_le_bytes());
        }
    }
}

/// Runtime dispatch over the compiled (P, PF, K) grid.
///
/// # Safety
/// `pads[..p]` as for [`walk`]; `seeds`/`out` hold at least `p` entries.
pub unsafe fn walk_dyn(p: usize, pf: bool, k: u8, pads: &[*mut u64], seeds: &[[u8; 32]], out: &mut [[u8; 32]]) {
    macro_rules! go {
        ($n:literal, $pf:literal, $k:expr) => {{
            let pd: &[*mut u64; $n] = pads[..$n].try_into().unwrap();
            let sd: &[[u8; 32]; $n] = seeds[..$n].try_into().unwrap();
            let od: &mut [[u8; 32]; $n] = (&mut out[..$n]).try_into().unwrap();
            walk::<$n, $pf, $k>(pd, sd, od)
        }};
    }
    macro_rules! pk {
        ($n:literal, $pf:literal) => {
            if k == K_FAST {
                go!($n, $pf, K_FAST)
            } else {
                go!($n, $pf, K_BASE)
            }
        };
    }
    match (p, pf) {
        (1, false) => pk!(1, false),
        (1, true) => pk!(1, true),
        (2, false) => pk!(2, false),
        (2, true) => pk!(2, true),
        (3, false) => pk!(3, false),
        (3, true) => pk!(3, true),
        (4, false) => pk!(4, false),
        (4, true) => pk!(4, true),
        _ => panic!("pads per thread must be 1..=4, got {p}"),
    }
}

// ---------------------------------------------------------------------------
// Pipelined fill anchors (P = 1, fast kernel). The 16 fill folds of a seed
// depend only on the seed, never on the pad, so they can be computed ahead of
// time — in the second lane of the packed permutation while the PREVIOUS seed
// does its 16 walk folds in lane 0 [MICRO 2026-09-28, 5950X: a 2-lane packed
// fold costs +10 % over a 1-lane one; a fill fold is 3.4 % of the hash x 16;
// measured +3.9 % a thread].
// ---------------------------------------------------------------------------

/// What a seed needs before its walk: the 16 injections and the fold state.
#[derive(Clone, Copy)]
pub struct Pre {
    pub inj: [u64; 16],
    pub a: [u64; 4],
    pub c: [u64; 4],
}

fn state_of(seed: &[u8; 32]) -> ([u64; 4], [u64; 4]) {
    let mut a = [0u64; 4];
    let mut c = [0u64; 4];
    for i in 0..4 {
        a[i] = u64::from_le_bytes(seed[i * 8..(i + 1) * 8].try_into().unwrap());
        c[i] = a[i] ^ CAP_INIT[i];
    }
    (a, c)
}

/// Serial anchors (the first seed of a worker or of a job, and the gate's
/// reference).
pub fn pre_of(seed: &[u8; 32]) -> Pre {
    let (mut a, mut c) = state_of(seed);
    let mut inj = [0u64; 16];
    for b in inj.iter_mut() {
        fold(&mut a, &mut c);
        *b = a[0] ^ a[1] ^ a[2] ^ a[3];
    }
    Pre { inj, a, c }
}

#[inline(always)]
fn pack(a: &[u64; 4], c: &[u64; 4], an: &[u64; 4], cn: &[u64; 4]) -> [[PackedBlock128; 4]; 2usize.div_ceil(PACKED_LANES)] {
    let mut g = [[PackedBlock128::ZERO; 4]; 2usize.div_ceil(PACKED_LANES)];
    for i in 0..4 {
        g[0][i] = g[0][i].set_lane(0, Block128::from((a[i] as u128) | ((c[i] as u128) << 64)));
        g[1 / PACKED_LANES][i] = g[1 / PACKED_LANES][i].set_lane(1 % PACKED_LANES, Block128::from((an[i] as u128) | ((cn[i] as u128) << 64)));
    }
    g
}

#[inline(always)]
fn unpack(g: &[[PackedBlock128; 4]; 2usize.div_ceil(PACKED_LANES)], a: &mut [u64; 4], c: &mut [u64; 4], an: &mut [u64; 4], cn: &mut [u64; 4]) {
    for i in 0..4 {
        let w = g[0][i].get_lane(0).to_u128();
        a[i] = w as u64;
        c[i] = (w >> 64) as u64;
        let w = g[1 / PACKED_LANES][i].get_lane(1 % PACKED_LANES).to_u128();
        an[i] = w as u64;
        cn[i] = (w >> 64) as u64;
    }
}

/// Walk `seed` (fast kernel, P = 1) from its anchors `pre`; while folding,
/// advance the fill-fold chain of `next` in lane 1 and return its anchors.
///
/// `PF`: the same software prefetch as [`walk`] at one pad (each lane's next
/// address, as soon as it is known). It only touches the load schedule; the
/// gate checks both variants end to end.
///
/// # Safety
/// `pad` points to `CELLS` writable `u64`.
#[inline(never)]
pub unsafe fn walk_pipe<const PF: bool>(
    pad: *mut u64,
    seed: &[u8; 32],
    pre: &Pre,
    next: Option<&[u8; 32]>,
) -> ([u8; 32], Option<Pre>) {
    let (s, _) = state_of(seed);
    let mut x = [s[0] ^ s[1] ^ s[2] ^ s[3]];
    let pads = [pad];
    // Fill with the precomputed injections (same positions as the oracle).
    let mut i = 0usize;
    let mut b = 0usize;
    while i < CELLS {
        fill_block::<1, true>(&pads, &mut x, i);
        i += FILL_PERM_PERIOD;
        x[0] ^= pre.inj[b];
        b += 1;
    }
    let mut a = pre.a;
    let mut c = pre.c;
    // Next seed's chain rides in lane 1.
    let (mut an, mut cn) = match next {
        Some(n) => state_of(n),
        None => ([0u64; 4], [0u64; 4]),
    };
    let mut injn = [0u64; 16];
    let mut off = [0usize; 4];
    for l in 0..4 {
        off[l] = off_of(a[l]);
    }
    let v = pad as *mut u8;
    let mut r = 0usize;
    let mut k = 0usize;
    while r < ROUNDS {
        for rr in r..r + PERM_PERIOD {
            for li in 0..4 {
                let l = LANES[li];
                step::<true, PF>(v, &mut off[l], &mut a[l], rr as u64);
            }
        }
        r += PERM_PERIOD;
        if next.is_some() {
            let mut g = pack(&a, &c, &an, &cn);
            packed_poseidon2b_permute_flat_many(&mut g);
            unpack(&g, &mut a, &mut c, &mut an, &mut cn);
            injn[k] = an[0] ^ an[1] ^ an[2] ^ an[3];
            k += 1;
        } else {
            fold(&mut a, &mut c);
        }
        for l in 0..4 {
            off[l] = off_of(a[l]);
        }
    }
    // Final fold: lane 1 has nothing left to do (16 of 16 done), keep it single.
    fold(&mut a, &mut c);
    let mut out = [0u8; 32];
    for i in 0..4 {
        out[i * 8..(i + 1) * 8].copy_from_slice(&a[i].to_le_bytes());
    }
    let pn = next.map(|_| Pre { inj: injn, a: an, c: cn });
    (out, pn)
}

/// Runtime dispatch of [`walk_pipe`] on the prefetch flag.
///
/// # Safety
/// As for [`walk_pipe`].
#[inline]
pub unsafe fn walk_pipe_dyn(pf: bool, pad: *mut u64, seed: &[u8; 32], pre: &Pre, next: Option<&[u8; 32]>) -> ([u8; 32], Option<Pre>) {
    if pf {
        walk_pipe::<true>(pad, seed, pre, next)
    } else {
        walk_pipe::<false>(pad, seed, pre, next)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_offset_is_the_scaled_index() {
        let mut s = 0x1234_5678_9abc_def0u64;
        for _ in 0..100_000 {
            s = s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let n = s ^ (s >> 17);
            assert_eq!((((n << 3) ^ (n >> 29)) & OFF_MASK) as usize, off_of(n));
        }
    }

    #[test]
    fn kernel_flags_follow_the_measured_rule() {
        assert!(simple(K_FAST, 1) && !gfold(K_FAST, 1));
        for p in 2..=MAX_PADS {
            assert!(!simple(K_FAST, p) && gfold(K_FAST, p), "fast at P = {p} must be the grouped fold only");
        }
        for p in 1..=MAX_PADS {
            assert!(!simple(K_BASE, p) && !gfold(K_BASE, p));
        }
    }
}

// Keep only accumulator state live across iterations; derive its address
// immediately before use to reduce the register pressure of multiple pads.
#[inline(always)]
unsafe fn step_lazy<const PF: bool>(v: *mut u8, a: &mut u64, rr: u64) {
    let ptr = v.add(off_of(*a)) as *mut u64;
    let val = *ptr;
    let y = (*a ^ val).wrapping_add(rr).wrapping_mul(MULT_C);
    let n = y ^ (y >> XS);
    *a = n;
    *ptr = n.wrapping_add(val);
    if PF {
        #[cfg(target_arch = "aarch64")]
        core::arch::asm!("prfm pldl1keep, [{ptr}]", ptr = in(reg) v.add(off_of(n)), options(readonly, nostack, preserves_flags));
    }
}

// Parallel loads are legal only when all four cells are distinct. Any
// collision takes the original sequential path, including write forwarding.
#[inline(always)]
unsafe fn step_quad<const PF: bool>(v: *mut u8, a: &mut [u64;4], rr:u64) {
    let mut off = a.map(off_of);
    let unique = off[0]!=off[1] && off[0]!=off[2] && off[0]!=off[3]
        && off[1]!=off[2] && off[1]!=off[3] && off[2]!=off[3];
    if !unique {
        for l in 0..4 { step::<false,PF>(v, &mut off[l], &mut a[l], rr); }
        return;
    }
    let vals: [u64;4] = std::array::from_fn(|i| *(v.add(off[i]) as *mut u64));
    for i in 0..4 {
        let y=(a[i]^vals[i]).wrapping_add(rr).wrapping_mul(MULT_C);
        let n=y^(y>>XS);
        a[i]=n;
        *(v.add(off[i]) as *mut u64)=n.wrapping_add(vals[i]);
        if PF {
            #[cfg(target_arch = "aarch64")]
            core::arch::asm!("prfm pldl1keep, [{ptr}]", ptr = in(reg) v.add(off_of(n)), options(readonly, nostack, preserves_flags));
        }
    }
}

#[cfg(test)]
#[test]
fn quad_matches_sequential_including_deliberate_collisions() {
    for initial in [[0,0,0,0],[5,5,7,5],[1,2,3,4],[u64::MAX;4],[5,7,7,9]] {
        for rr in [0,1,131071,u64::MAX] {
            let mut memory:Vec<u64>=(0..CELLS as u64).map(|i|i.wrapping_mul(MULT_C)).collect();
            let mut reference=memory.clone(); let mut a=initial; let mut b=initial;
            let mut off=b.map(off_of);
            unsafe {
                step_quad::<false>(memory.as_mut_ptr().cast(),&mut a,rr);
                for l in 0..4 {step::<false,false>(reference.as_mut_ptr().cast(),&mut off[l],&mut b[l],rr);}
            }
            assert_eq!(a,b);assert_eq!(memory,reference);
        }
    }
}
