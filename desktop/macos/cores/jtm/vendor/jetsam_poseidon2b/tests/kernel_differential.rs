// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 the Jetsam developers.

//! Differential tests for the register-domain permutation kernels.
//!
//! Every ISA tier that ships is consensus-critical: a kernel that differs from
//! the oracle by one bit makes the node that runs it fork silently. The
//! in-crate unit tests compare batch entry points against the *scalar* entry
//! points, but on x86-64 both now route to the same kernel, so they can no
//! longer see a kernel bug. These tests carry their own oracle.
//!
//! Two oracles, deliberately:
//!
//! * `oracle_hw` rebuilds the permutation from `jetsam_core::hardware`'s
//!   `clmul_gcm` (Karatsuba with the GCM reduction executed in general-purpose
//!   registers) and `square_flat_u128` (branch-free bit spread). Both differ
//!   in construction from what the kernels do — XMM-resident reduction and a
//!   two-`pclmul` square — so agreement is real evidence, not a tautology.
//! * `oracle_soft` replaces the field arithmetic with a pure-software
//!   carry-less multiply. Nothing in it touches PCLMULQDQ, PMULL or a
//!   conversion table, so it also pins `clmul_gcm` itself. It is ~400× slower,
//!   so it runs over a smaller sample.
//!
//! Run these on every ISA tier you intend to ship to. `JETSAM_CPU_BACKEND`
//! restricts the selection: `scalar`, `pclmul`, `avx2`, `avx512`.

// These loops walk a state word index across several parallel buffers.
#![allow(clippy::needless_range_loop)]

use jetsam_core::hardware::{clmul_gcm, square_flat_u128, tower_to_flat_u128};
use jetsam_core::packed::{PackedBlock128, PACKED_LANES};
use jetsam_core::Block128;
use jetsam_poseidon2b::batch::{
    leaf_sponge_flat_batch_with_iv_into, packed_poseidon2b_permute_flat,
    packed_poseidon2b_permute_flat_many,
};
use jetsam_poseidon2b::native::domain::{capacity_iv_flat, DomainTag};
use jetsam_poseidon2b::native::permutation::{
    permute_flat_u128, F_ROUNDS, MDS_FULL, MDS_PARTIAL, N_ROUNDS, P_ROUNDS, ROUND_CONSTANTS,
    STATE_SIZE,
};
use jetsam_poseidon2b::native::Poseidon2bFlatSponge;

// --------------------------------------------------------------------------
// Deterministic input generation (no rand dependency, reproducible reports)
// --------------------------------------------------------------------------

struct SplitMix(u64);

impl SplitMix {
    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    fn next_u128(&mut self) -> u128 {
        (u128::from(self.next_u64()) << 64) | u128::from(self.next_u64())
    }
    fn next_state(&mut self) -> [u128; STATE_SIZE] {
        std::array::from_fn(|_| self.next_u128())
    }
}

// --------------------------------------------------------------------------
// Software GF(2^128) arithmetic — no CLMUL instruction anywhere
// --------------------------------------------------------------------------

fn soft_clmul64(a: u64, b: u64) -> u128 {
    let mut result = 0u128;
    let a = u128::from(a);
    let mut b = u128::from(b);
    while b != 0 {
        let lowest = b & b.wrapping_neg();
        result ^= a * lowest;
        b ^= lowest;
    }
    result
}

/// Schoolbook reduction of `hi·x^128 + lo` modulo x^128 + x^7 + x^2 + x + 1.
///
/// For every set bit at position `128 + k`, substitute `x^(128+k) ≡ 0x87·x^k`.
/// `0x87` has degree 7, so for `k ≥ 121` the substitution spills back above
/// `x^128`; those spilled positions are all below `k`, so walking `k` downward
/// terminates. Deliberately naive — it shares no line with either production
/// reduction.
fn soft_reduce(hi: u128, lo: u128) -> u128 {
    const TAIL: u128 = 0x87;
    let mut hi = hi;
    let mut lo = lo;
    for bit in (0..128u32).rev() {
        if (hi >> bit) & 1 == 1 {
            hi ^= 1u128 << bit;
            lo ^= TAIL << bit;
            if bit > 0 {
                hi ^= TAIL >> (128 - bit);
            }
        }
    }
    lo
}

fn soft_mul(a: u128, b: u128) -> u128 {
    let (a_lo, a_hi) = (a as u64, (a >> 64) as u64);
    let (b_lo, b_hi) = (b as u64, (b >> 64) as u64);
    let v0 = soft_clmul64(a_lo, b_lo);
    let v1 = soft_clmul64(a_hi, b_hi);
    let mid = soft_clmul64(a_lo ^ a_hi, b_lo ^ b_hi) ^ v0 ^ v1;
    let lo = v0 ^ (mid << 64);
    let hi = v1 ^ (mid >> 64);
    soft_reduce(hi, lo)
}

fn soft_square(a: u128) -> u128 {
    soft_mul(a, a)
}

// --------------------------------------------------------------------------
// Oracles: the round schedule written out with pluggable field arithmetic
// --------------------------------------------------------------------------

struct FlatConstants {
    rc: [[u128; N_ROUNDS]; STATE_SIZE],
    mds_full: [[u128; STATE_SIZE]; STATE_SIZE],
    mds_partial: [[u128; STATE_SIZE]; STATE_SIZE],
}

fn flat_constants() -> FlatConstants {
    let mut rc = [[0u128; N_ROUNDS]; STATE_SIZE];
    for (i, row) in rc.iter_mut().enumerate() {
        for (r, slot) in row.iter_mut().enumerate() {
            *slot = tower_to_flat_u128(ROUND_CONSTANTS[i][r]);
        }
    }
    let mut mds_full = [[0u128; STATE_SIZE]; STATE_SIZE];
    let mut mds_partial = [[0u128; STATE_SIZE]; STATE_SIZE];
    for i in 0..STATE_SIZE {
        for j in 0..STATE_SIZE {
            mds_full[i][j] = tower_to_flat_u128(MDS_FULL[i][j]);
            mds_partial[i][j] = tower_to_flat_u128(MDS_PARTIAL[i][j]);
        }
    }
    FlatConstants {
        rc,
        mds_full,
        mds_partial,
    }
}

fn apply_mds(
    state: &mut [u128; STATE_SIZE],
    matrix: &[[u128; STATE_SIZE]; STATE_SIZE],
    mul: &dyn Fn(u128, u128) -> u128,
) {
    let input = *state;
    for i in 0..STATE_SIZE {
        let mut acc = 0u128;
        for (j, value) in input.iter().enumerate() {
            acc ^= mul(*value, matrix[i][j]);
        }
        state[i] = acc;
    }
}

fn oracle_permute(
    state: &mut [u128; STATE_SIZE],
    constants: &FlatConstants,
    mul: &dyn Fn(u128, u128) -> u128,
    square: &dyn Fn(u128) -> u128,
) {
    let sbox = |x: u128| {
        let x2 = square(x);
        let x4 = square(x2);
        mul(mul(x, x2), x4)
    };
    apply_mds(state, &constants.mds_full, mul);
    for r in 0..N_ROUNDS {
        if !(F_ROUNDS / 2..F_ROUNDS / 2 + P_ROUNDS).contains(&r) {
            for i in 0..STATE_SIZE {
                state[i] = sbox(state[i] ^ constants.rc[i][r]);
            }
            apply_mds(state, &constants.mds_full, mul);
        } else {
            state[0] = sbox(state[0] ^ constants.rc[0][r]);
            apply_mds(state, &constants.mds_partial, mul);
        }
    }
}

fn oracle_hw(state: &mut [u128; STATE_SIZE], constants: &FlatConstants) {
    oracle_permute(state, constants, &clmul_gcm, &square_flat_u128);
}

fn oracle_soft(state: &mut [u128; STATE_SIZE], constants: &FlatConstants) {
    oracle_permute(state, constants, &soft_mul, &soft_square);
}

fn backend() -> String {
    jetsam_core::cpu::selected_backend().to_string()
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

/// The software oracle must agree with the hardware oracle. This pins
/// `clmul_gcm` and `square_flat_u128` themselves, so the larger tests below
/// can lean on them.
#[test]
fn software_and_hardware_oracles_agree() {
    let constants = flat_constants();
    let mut rng = SplitMix(0x0BAD_C0DE_0BAD_C0DE);
    for index in 0..512 {
        let start = rng.next_state();
        let mut a = start;
        let mut b = start;
        oracle_hw(&mut a, &constants);
        oracle_soft(&mut b, &constants);
        assert_eq!(a, b, "oracle mismatch at sample {index}, state {start:?}");
    }
}

/// `permute_flat_u128` — dispatch point 1. On x86-64 this reaches the
/// PCLMULQDQ kernel (or the AVX2 kernel on a VPCLMUL part).
#[test]
fn permute_flat_u128_matches_oracle() {
    let count: usize = std::env::var("JETSAM_KERNEL_DIFF_COUNT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(200_000);
    let constants = flat_constants();
    let mut rng = SplitMix(0xFEED_FACE_CAFE_BEEF);
    let mut mismatches = 0usize;
    for index in 0..count {
        let start = rng.next_state();
        let mut got = start;
        let mut want = start;
        permute_flat_u128(&mut got);
        oracle_hw(&mut want, &constants);
        if got != want {
            if mismatches == 0 {
                eprintln!("first divergence at {index}: in={start:?} got={got:?} want={want:?}");
            }
            mismatches += 1;
        }
    }
    assert_eq!(
        mismatches, 0,
        "{mismatches}/{count} states diverged on backend {}",
        backend()
    );
    eprintln!("permute_flat_u128: {count} states bit-exact on backend {}", backend());
}

/// `packed_poseidon2b_permute_flat` — dispatch point 2. Every lane of the
/// pack must independently match the oracle.
#[test]
fn packed_permute_flat_matches_oracle() {
    let constants = flat_constants();
    let mut rng = SplitMix(0x5EED_0001_5EED_0001);
    for index in 0..20_000 {
        let lanes: [[u128; STATE_SIZE]; PACKED_LANES] =
            std::array::from_fn(|_| rng.next_state());
        let mut packed: [PackedBlock128; STATE_SIZE] = std::array::from_fn(|i| {
            let mut value = PackedBlock128::ZERO;
            for lane in 0..PACKED_LANES {
                value = value.set_lane(lane, Block128::from(lanes[lane][i]));
            }
            value
        });
        packed_poseidon2b_permute_flat(&mut packed);
        for lane in 0..PACKED_LANES {
            let mut want = lanes[lane];
            oracle_hw(&mut want, &constants);
            for i in 0..STATE_SIZE {
                assert_eq!(
                    packed[i].get_lane(lane).to_u128(),
                    want[i],
                    "sample {index} lane {lane} word {i} on backend {}",
                    backend()
                );
            }
        }
    }
}

/// `packed_poseidon2b_permute_flat_many` — dispatch point 3. Group counts are
/// chosen to hit the wide chunk, the pair remainder and the odd tail of the
/// chunking kernels: AVX2 chunks by 4 packs, AVX-512 by 8.
///
/// The PCLMULQDQ kernel does **not** chunk — it walks one pack per iteration,
/// because with sixteen architectural XMM registers it is already bound by the
/// CLMUL port rather than by latency. These counts therefore prove nothing about
/// a tail path on that tier, for the good reason that it has none. If an
/// interleave is ever added there, add the counts that exercise its remainder at
/// the same time; do not assume this list already does.
#[test]
fn packed_permute_flat_many_matches_oracle() {
    let constants = flat_constants();
    let mut rng = SplitMix(0x5EED_0002_5EED_0002);
    for &groups in &[1usize, 2, 3, 4, 5, 7, 8, 9, 16, 17] {
        for _ in 0..40 {
            let lanes: Vec<[[u128; STATE_SIZE]; PACKED_LANES]> = (0..groups)
                .map(|_| std::array::from_fn(|_| rng.next_state()))
                .collect();
            let mut packed: Vec<[PackedBlock128; STATE_SIZE]> = lanes
                .iter()
                .map(|group| {
                    std::array::from_fn(|i| {
                        let mut value = PackedBlock128::ZERO;
                        for lane in 0..PACKED_LANES {
                            value = value.set_lane(lane, Block128::from(group[lane][i]));
                        }
                        value
                    })
                })
                .collect();
            packed_poseidon2b_permute_flat_many(&mut packed);
            for (g, group) in lanes.iter().enumerate() {
                for lane in 0..PACKED_LANES {
                    let mut want = group[lane];
                    oracle_hw(&mut want, &constants);
                    for i in 0..STATE_SIZE {
                        assert_eq!(
                            packed[g][i].get_lane(lane).to_u128(),
                            want[i],
                            "groups={groups} g={g} lane={lane} word={i} backend {}",
                            backend()
                        );
                    }
                }
            }
        }
    }
}

/// `leaf_sponge_flat_batch_with_iv_into` — dispatch point 4, no-pad mode, the
/// one the PoW hasher uses. The oracle here is the scalar flat sponge, which
/// on x86-64 still crosses `permute_flat_u128`; the independent check is the
/// permutation test above, this one pins the absorb schedule, the lane
/// mapping and the chunk/tail bookkeeping of each leaf kernel.
#[test]
fn leaf_sponge_no_pad_matches_scalar_sponge() {
    let tag = DomainTag::new(b"KDIFFTST");
    let iv = capacity_iv_flat(tag);
    let mut rng = SplitMix(0x5EED_0003_5EED_0003);
    // Leaf counts straddle every kernel's chunk width (PCLMULQDQ 4,
    // AVX2 8, AVX-512 16) and leaf sizes straddle the block count the PoW
    // sponge uses (256 bytes = 8 rate blocks).
    for &(count, leaf_size) in &[
        (1usize, 256usize),
        (2, 256),
        (3, 256),
        (4, 256),
        (5, 256),
        (8, 256),
        (15, 256),
        (16, 256),
        (17, 256),
        (31, 32),
        (64, 512),
        (256, 256),
    ] {
        let mut data = vec![0u8; count * leaf_size];
        for byte in data.iter_mut() {
            *byte = rng.next_u64() as u8;
        }
        let mut got = vec![[0u8; 32]; count];
        leaf_sponge_flat_batch_with_iv_into(iv, false, &data, leaf_size, &mut got);
        for i in 0..count {
            let mut sponge = Poseidon2bFlatSponge::with_iv_flat(iv);
            sponge.update(&data[i * leaf_size..(i + 1) * leaf_size]);
            let want = sponge.finalize_no_pad();
            assert_eq!(
                got[i], want,
                "count={count} leaf_size={leaf_size} leaf={i} backend {}",
                backend()
            );
        }
    }
}
