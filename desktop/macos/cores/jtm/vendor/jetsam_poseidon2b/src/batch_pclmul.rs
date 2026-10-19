// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 the Jetsam developers.
// Portions derived from an Apache-2.0 licensed upstream; see NOTICE.

//! Register-domain Poseidon2b permutation kernel for the SSE4.1 + PCLMULQDQ
//! tier — the production floor, and the widest tier available on every CPU
//! from Westmere/Bulldozer up to and including Zen 2.
//!
//! Without this kernel that tier had no register-domain path at all: it fell
//! through to the generic `PackedBlock128` loop, where every field multiply is
//! an opaque call to `jetsam_core::hardware::x86_64_clmul::clmul_block128`.
//! That function is `#[target_feature(enable = "pclmulqdq")]`, so it cannot be
//! inlined into a caller that lacks the feature — 502 target-feature boundary
//! crossings per permutation, with the carry-less products computed in XMM and
//! the GCM reduction executed back in general-purpose registers.
//!
//! This kernel crosses the boundary **once per call** and then keeps the whole
//! 66-round schedule in XMM:
//!
//! * the GCM reduction stays in XMM (two `pclmul` by the modulus tail 0x87)
//!   instead of six `movq` plus a scalar `u128` reduction;
//! * squaring is two `pclmul` instead of the branch-free bit-spread, which is
//!   a good idea on a GPU (no CLMUL unit there) and a pessimisation here;
//! * `MDS_FULL` is factored into four constant products instead of six (the
//!   CUDA kernel's scheme) or the generic ten;
//! * `MDS_PARTIAL` uses the shared ones-sum plus a diagonal product.
//!
//! Bit-identical to `native::permutation::permute_flat_u128` per lane: the
//! round schedule, the constants and the field arithmetic are unchanged, only
//! the instruction selection differs.

#![cfg(target_arch = "x86_64")]
// Same reason as `batch.rs`: these loops index several parallel buffers
// (state words, round constants, diagonal constants) and the index is used
// arithmetically. Iterator chains hurt readability without changing codegen.
#![allow(clippy::needless_range_loop)]

use core::arch::x86_64::*;

use crate::batch::KernelTables;
use crate::native::permutation::{F_ROUNDS, N_ROUNDS, P_ROUNDS, STATE_SIZE};
use jetsam_core::packed::{PackedBlock128, PACKED_LANES};

/// Independent leaf sponges kept in XMM registers per leaf-kernel call.
///
/// The wider ISA kernels interleave four groups because one permutation is a
/// serial multiply chain and a lone group leaves the carry-less-multiply unit
/// waiting on latency. That reasoning does not carry here: with only sixteen
/// architectural XMM registers, four state words per lane and five `pclmul`
/// per field multiply, this kernel is already **throughput**-bound on the
/// CLMUL port, not latency-bound. Measured on EPYC 7742 (Zen 2), `perf stat`,
/// median of 5, one PoW hash = 8 permutations: widening the interleave leaves
/// cycles flat and only adds spill traffic.
///
/// | LEAF_LANES | instr / PoW hash | cycles / PoW hash |
/// |-----------:|-----------------:|------------------:|
/// |          1 |          116 193 |            67 157 |
/// |      **2** |      **116 532** |        **65 907** |
/// |          4 |          118 985 |            65 928 |
///
/// So the kernel stays narrow. `permute_flat_groups` uses exactly one
/// `PackedBlock128` (PACKED_LANES = 2) per call for the same reason.
const LEAF_LANES: usize = 2;

/// Load a 128-bit constant into an XMM register.
#[inline]
#[target_feature(enable = "sse4.1,pclmulqdq")]
unsafe fn konst(value: u128) -> __m128i {
    core::mem::transmute::<u128, __m128i>(value)
}

/// Carry-less 128×128 product, unreduced, returned as `(hi, lo)`.
///
/// Karatsuba, exactly as `hardware::x86_64_clmul::clmul_block128` does it —
/// three `pclmul` — but the recombination stays in XMM (`slli_si128` /
/// `srli_si128`) instead of moving all three products out to general-purpose
/// registers for a `u128` shift.
#[inline]
#[target_feature(enable = "sse4.1,pclmulqdq")]
unsafe fn clmul_wide(a: __m128i, b: __m128i) -> (__m128i, __m128i) {
    let v0 = _mm_clmulepi64_si128(a, b, 0x00);
    let v1 = _mm_clmulepi64_si128(a, b, 0x11);
    // 0x4E swaps the two 64-bit halves, so both halves of `ax` hold
    // `a_lo ^ a_hi` and the 0x00 selector below picks the Karatsuba middle.
    let ax = _mm_xor_si128(a, _mm_shuffle_epi32(a, 0x4E));
    let bx = _mm_xor_si128(b, _mm_shuffle_epi32(b, 0x4E));
    let mid = _mm_xor_si128(
        _mm_xor_si128(_mm_clmulepi64_si128(ax, bx, 0x00), v0),
        v1,
    );
    (
        _mm_xor_si128(v1, _mm_srli_si128(mid, 8)),
        _mm_xor_si128(v0, _mm_slli_si128(mid, 8)),
    )
}

/// Reduce a 256-bit carry-less product modulo x^128 + x^7 + x^2 + x + 1.
///
/// Two `x^64` stages, entirely in XMM. Writing `hi = h1·x^64 + h0`:
/// `h1·x^192 ≡ (h1·0x87)·x^64 = t·x^64`, which folds `t`'s high word into the
/// low word of `hi` and `t`'s low word into the high word of `lo`; the second
/// `pclmul` then reduces the remaining `(h0 + t_hi)·x^128`. `hi2`'s high word
/// is deliberately unused — stage one already consumed it.
#[inline]
#[target_feature(enable = "sse4.1,pclmulqdq")]
unsafe fn reduce_gcm(hi: __m128i, lo: __m128i) -> __m128i {
    let poly = _mm_set_epi64x(0, 0x87);
    let t = _mm_clmulepi64_si128(hi, poly, 0x01);
    let hi2 = _mm_xor_si128(hi, _mm_srli_si128(t, 8));
    let lo2 = _mm_xor_si128(lo, _mm_slli_si128(t, 8));
    _mm_xor_si128(lo2, _mm_clmulepi64_si128(hi2, poly, 0x00))
}

#[inline]
#[target_feature(enable = "sse4.1,pclmulqdq")]
unsafe fn mul(a: __m128i, b: __m128i) -> __m128i {
    let (hi, lo) = clmul_wide(a, b);
    reduce_gcm(hi, lo)
}

/// Square in GF(2^128). In characteristic two `(a_hi·x^64 + a_lo)^2 =
/// a_hi²·x^128 + a_lo²`: no middle term, so two `pclmul` and one reduction.
#[inline]
#[target_feature(enable = "sse4.1,pclmulqdq")]
unsafe fn square(a: __m128i) -> __m128i {
    reduce_gcm(
        _mm_clmulepi64_si128(a, a, 0x11),
        _mm_clmulepi64_si128(a, a, 0x00),
    )
}

/// The x^7 S-box: `x^7 = x · x^2 · x^4`.
#[inline]
#[target_feature(enable = "sse4.1,pclmulqdq")]
unsafe fn sbox_x7(x: __m128i) -> __m128i {
    let x2 = square(x);
    let x4 = square(x2);
    mul(mul(x, x2), x4)
}

/// Full-round MDS in four constant products.
///
/// `M = [5 7 1 3; 4 6 1 1; 1 3 5 7; 1 1 4 6]`. In characteristic two the
/// entries decompose additively — `3 = 2+1`, `5 = 4+1`, `6 = 4+2`, `7 = 4+2+1`
/// — and the tower→flat change of basis is GF(2)-linear, so the decomposition
/// survives it. With `u0 = a+b` and `u1 = c+d` the whole map needs only
/// `2b`, `2d`, `4u0` and `4u1`:
///
/// ```text
/// y1 = 4u0 + 2b + u1
/// y0 = y1  + u0 + 2d
/// y3 = u0  + 4u1 + 2d
/// y2 = y3  + u1  + 2b
/// ```
///
/// Expanded, those are the four matrix rows. This is the CUDA kernel's scheme;
/// the older AVX2/NEON arrangement spends six products on the same map.
#[inline]
#[target_feature(enable = "sse4.1,pclmulqdq")]
unsafe fn mds_full(s: &mut [__m128i; STATE_SIZE], t: &KernelTables) {
    let [a, b, c, d] = *s;
    let two = konst(t.mds_full_two);
    let four = konst(t.mds_full_four);
    let u0 = _mm_xor_si128(a, b);
    let u1 = _mm_xor_si128(c, d);
    let b2 = mul(b, two);
    let d2 = mul(d, two);
    let u0x4 = mul(u0, four);
    let u1x4 = mul(u1, four);

    let y1 = _mm_xor_si128(_mm_xor_si128(u0x4, b2), u1);
    let y0 = _mm_xor_si128(_mm_xor_si128(y1, u0), d2);
    let y3 = _mm_xor_si128(_mm_xor_si128(u0, u1x4), d2);
    let y2 = _mm_xor_si128(_mm_xor_si128(y3, u1), b2);
    s[0] = y0;
    s[1] = y1;
    s[2] = y2;
    s[3] = y3;
}

/// Partial-round MDS: diagonal `c_i`, every off-diagonal 1, so
/// `out_i = c_i·s_i + (S + s_i)` with `S` the XOR of the whole state.
#[inline]
#[target_feature(enable = "sse4.1,pclmulqdq")]
unsafe fn mds_partial(s: &mut [__m128i; STATE_SIZE], t: &KernelTables) {
    let sum = _mm_xor_si128(_mm_xor_si128(s[0], s[1]), _mm_xor_si128(s[2], s[3]));
    for i in 0..STATE_SIZE {
        let diagonal = mul(s[i], konst(t.mds_partial_diag[i]));
        s[i] = _mm_xor_si128(diagonal, _mm_xor_si128(sum, s[i]));
    }
}

/// The complete Poseidon2b schedule over `G` independent lanes held in XMM.
#[inline]
#[target_feature(enable = "sse4.1,pclmulqdq")]
unsafe fn permute_lanes<const G: usize>(st: &mut [[__m128i; STATE_SIZE]; G], t: &KernelTables) {
    for lane in st.iter_mut() {
        mds_full(lane, t);
    }
    for r in 0..N_ROUNDS {
        let is_full = !((F_ROUNDS / 2..F_ROUNDS / 2 + P_ROUNDS).contains(&r));
        if is_full {
            for lane in st.iter_mut() {
                for i in 0..STATE_SIZE {
                    lane[i] = sbox_x7(_mm_xor_si128(lane[i], konst(t.rc[i][r])));
                }
            }
            for lane in st.iter_mut() {
                mds_full(lane, t);
            }
        } else {
            let rc0 = konst(t.rc[0][r]);
            for lane in st.iter_mut() {
                lane[0] = sbox_x7(_mm_xor_si128(lane[0], rc0));
            }
            for lane in st.iter_mut() {
                mds_partial(lane, t);
            }
        }
    }
}

/// Load one `PackedBlock128` group as `PACKED_LANES` independent XMM lanes.
/// A pack is `[u128; 2]`, so lane `l` of word `i` sits at `&pack[i] + l`.
#[inline]
#[target_feature(enable = "sse4.1,pclmulqdq")]
unsafe fn load_pack(
    pack: &[PackedBlock128; STATE_SIZE],
) -> [[__m128i; STATE_SIZE]; PACKED_LANES] {
    std::array::from_fn(|l| {
        std::array::from_fn(|i| {
            _mm_loadu_si128((&pack[i] as *const PackedBlock128 as *const __m128i).add(l))
        })
    })
}

#[inline]
#[target_feature(enable = "sse4.1,pclmulqdq")]
unsafe fn store_pack(
    regs: &[[__m128i; STATE_SIZE]; PACKED_LANES],
    pack: &mut [PackedBlock128; STATE_SIZE],
) {
    for (l, lane) in regs.iter().enumerate() {
        for i in 0..STATE_SIZE {
            _mm_storeu_si128(
                (&mut pack[i] as *mut PackedBlock128 as *mut __m128i).add(l),
                lane[i],
            );
        }
    }
}

/// Permute `states.len()` independent packed groups, one pack per kernel call.
///
/// # Safety
/// The CPU must support SSE4.1 and PCLMULQDQ — callers gate on the runtime
/// backend selection in `jetsam_core::cpu`.
#[target_feature(enable = "sse4.1,pclmulqdq")]
pub(crate) unsafe fn permute_flat_groups(
    states: &mut [[PackedBlock128; STATE_SIZE]],
    t: &KernelTables,
) {
    unsafe {
        for pack in states.iter_mut() {
            let mut regs = load_pack(pack);
            permute_lanes(&mut regs, t);
            store_pack(&regs, pack);
        }
    }
}

/// Single-group register-domain permutation (the
/// `packed_poseidon2b_permute_flat` fast path).
///
/// # Safety
/// See [`permute_flat_groups`].
#[target_feature(enable = "sse4.1,pclmulqdq")]
pub(crate) unsafe fn permute_flat_one(states: &mut [PackedBlock128; STATE_SIZE], t: &KernelTables) {
    unsafe {
        let mut regs = load_pack(states);
        permute_lanes(&mut regs, t);
        store_pack(&regs, states);
    }
}

/// One scalar permutation through the register-domain kernel.
///
/// # Safety
/// See [`permute_flat_groups`].
#[target_feature(enable = "sse4.1,pclmulqdq")]
pub(crate) unsafe fn permute_flat_single_u128(flat: &mut [u128; STATE_SIZE], t: &KernelTables) {
    unsafe {
        let mut regs: [[__m128i; STATE_SIZE]; 1] = [std::array::from_fn(|i| {
            _mm_loadu_si128(&flat[i] as *const u128 as *const __m128i)
        })];
        permute_lanes(&mut regs, t);
        for i in 0..STATE_SIZE {
            _mm_storeu_si128(&mut flat[i] as *mut u128 as *mut __m128i, regs[0][i]);
        }
    }
}

/// Absorb one 32-byte rate block into `G` leaf sponges and run the schedule.
#[inline]
#[target_feature(enable = "sse4.1,pclmulqdq")]
unsafe fn leaf_chunk<const G: usize>(
    iv: [u128; 2],
    data: &[u8],
    leaf_size: usize,
    leaf_base: usize,
    out: &mut [[u8; 32]],
    t: &KernelTables,
) {
    unsafe {
        let zero = _mm_setzero_si128();
        let iv_hi = konst(iv[0]);
        let iv_lo = konst(iv[1]);
        let mut states: [[__m128i; STATE_SIZE]; G] = [[zero, zero, iv_hi, iv_lo]; G];

        for block_offset in (0..leaf_size).step_by(32) {
            for (g, state) in states.iter_mut().enumerate() {
                let p = data.as_ptr().add((leaf_base + g) * leaf_size + block_offset);
                state[0] = _mm_xor_si128(state[0], _mm_loadu_si128(p.cast::<__m128i>()));
                state[1] = _mm_xor_si128(state[1], _mm_loadu_si128(p.add(16).cast::<__m128i>()));
            }
            permute_lanes(&mut states, t);
        }

        for (g, state) in states.iter().enumerate() {
            let dst = out.as_mut_ptr().add(leaf_base + g).cast::<__m128i>();
            _mm_storeu_si128(dst, state[0]);
            _mm_storeu_si128(dst.add(1), state[1]);
        }
    }
}

/// Fixed-length, no-pad leaf sponges over leaf-major bytes.
///
/// Only an execution shortcut: initial state, byte-to-lane mapping, per-block
/// XOR, permutation schedule and final flat-basis bytes are identical to
/// `Poseidon2bFlatSponge::finalize_no_pad`. Unlike the AVX2 and AVX-512 leaf
/// kernels this one carries its own tail loop, so any leaf count is served.
///
/// # Safety
/// The CPU must support SSE4.1 and PCLMULQDQ. `data.len()` must equal
/// `leaf_size * out.len()` and `leaf_size` must be a positive multiple of 32.
/// Callers check both.
#[target_feature(enable = "sse4.1,pclmulqdq")]
pub(crate) unsafe fn leaf_sponge_flat_no_pad_into(
    iv: [u128; 2],
    data: &[u8],
    leaf_size: usize,
    out: &mut [[u8; 32]],
    t: &KernelTables,
) {
    debug_assert!(leaf_size > 0 && leaf_size.is_multiple_of(32));
    debug_assert_eq!(data.len(), leaf_size * out.len());

    unsafe {
        let n = out.len();
        let mut leaf = 0usize;
        while leaf + LEAF_LANES <= n {
            leaf_chunk::<LEAF_LANES>(iv, data, leaf_size, leaf, out, t);
            leaf += LEAF_LANES;
        }
        while leaf < n {
            leaf_chunk::<1>(iv, data, leaf_size, leaf, out, t);
            leaf += 1;
        }
    }
}
