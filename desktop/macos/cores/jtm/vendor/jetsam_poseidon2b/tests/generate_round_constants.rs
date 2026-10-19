// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 the Jetsam developers.
// Portions derived from an Apache-2.0 licensed upstream; see NOTICE.

//! Derivation and verification of TowerHash's round constants.
//!
//! # Why these constants are regenerated
//!
//! The upstream table this fork started from holds only eight distinct values
//! across all 264 entries — every constant lies in `{0x0 ..= 0x7}`, three bits
//! of entropy each. `MDS_FULL` lies in the same range, and a subfield of
//! GF(2^128) is closed under multiplication, so the `x^7` S-box maps GF(2^4)
//! back into GF(2^4). The full rounds therefore map `GF(2^4)^4` into itself: an
//! invariant subspace. Only the partial rounds leave it, through `MDS_PARTIAL`
//! entries that reach bit 13.
//!
//! That is precisely the structure invariant-subspace cryptanalysis targets,
//! and the standard Poseidon guidance is that round constants be pseudorandom
//! over the whole field. Applying a constant costs a `add_const` term in the
//! circuit — a constant in a linear combination, with no multiplicative
//! constraint — so full-width constants are free both natively and in-circuit.
//! There is no reason to keep three-bit ones.
//!
//! `MDS_FULL` and `MDS_PARTIAL` are deliberately NOT touched: an MDS matrix has
//! to be proven maximum-distance-separable, and improvising one is exactly the
//! kind of change that silently weakens a permutation.
//!
//! # Derivation — FROZEN
//!
//! Nothing up my sleeve, and reproducible by anyone holding this repository:
//!
//! ```text
//! constant[lane][round] = first 16 bytes, little-endian, of
//!     Poseidon2b_ORIGINAL(domain = "ELIDERC_", SEED || lane_u8 || round_u8)
//! SEED = b"elide/towerhash/v1/round-constants"
//! ```
//!
//! `Poseidon2b_ORIGINAL` is the permutation **as inherited from upstream** —
//! the upstream three-bit round constants and the upstream `BYTEHASH` capacity
//! tag — NOT the live permutation of this crate. An earlier revision of this
//! tool derived the table through the crate's own
//! `poseidon2b_hash_byte_slices`, which reads the very `ROUND_CONSTANTS` being
//! generated: re-running it after the swap produced a different table, so the
//! stated reproducibility was false. The original derivation function is
//! therefore frozen below, in this file, in full, so the pinned
//! `embedded_table_matches_the_frozen_derivation` test can re-derive the
//! embedded table forever, whatever the live permutation becomes.
//!
//! A zero output is rejected and the round byte re-salted, since a zero
//! constant contributes nothing to that round.

use jetsam_poseidon2b::native::permutation::{ROUND_CONSTANTS, N_ROUNDS, STATE_SIZE};

const SEED: &[u8] = b"elide/towerhash/v1/round-constants";
const DOMAIN: &[u8] = b"ELIDERC_";

/// The permutation and byte-sponge exactly as they existed when the embedded
/// table was derived: upstream round constants, upstream `BYTEHASH` tag, the
/// (unchanged) MDS matrices. Everything here is frozen — it must never track
/// the live implementation, or the derivation becomes circular again.
mod frozen {
    use jetsam_core::hardware::{
        clmul_gcm, flat_to_tower_u128, square_flat_u128, tower_to_flat_u128,
    };

    pub const STATE_SIZE: usize = 4;
    pub const F_ROUNDS: usize = 8;
    pub const P_ROUNDS: usize = 58;
    pub const N_ROUNDS: usize = F_ROUNDS + P_ROUNDS;
    const RATE: usize = 2;
    const PADDING_START: u8 = 0x80;
    const PADDING_END: u8 = 0x01;

    /// Upstream capacity tag for variable-length byte hashing ("BYTEHASH");
    /// the live crate has moved to "E_BYTEHS".
    const TAG_BYTEHASH: [u8; 8] = *b"BYTEHASH";

    /// The inherited upstream table this fork replaced: eight distinct
    /// three-bit values over 264 slots — the very weakness the regeneration
    /// fixed, and the constants under which the new table was derived.
    #[rustfmt::skip]
    const UPSTREAM_ROUND_CONSTANTS: [[u128; N_ROUNDS]; STATE_SIZE] = [
        [0x0, 0x1, 0x0, 0x3, 0x7, 0x7, 0x6, 0x6, 0x2, 0x1, 0x7, 0x2, 0x2, 0x3, 0x3, 0x2, 0x6, 0x5, 0x7, 0x5, 0x0, 0x2, 0x2, 0x3, 0x1, 0x5, 0x2, 0x6, 0x1, 0x4, 0x1, 0x0, 0x3, 0x7, 0x2, 0x0, 0x1, 0x2, 0x4, 0x1, 0x0, 0x0, 0x2, 0x5, 0x7, 0x2, 0x0, 0x4, 0x1, 0x5, 0x5, 0x1, 0x2, 0x7, 0x3, 0x1, 0x0, 0x1, 0x3, 0x7, 0x1, 0x6, 0x1, 0x6, 0x6, 0x2],
        [0x3, 0x3, 0x0, 0x6, 0x7, 0x1, 0x1, 0x2, 0x7, 0x3, 0x7, 0x5, 0x7, 0x1, 0x7, 0x3, 0x6, 0x1, 0x7, 0x5, 0x5, 0x5, 0x7, 0x1, 0x6, 0x5, 0x1, 0x2, 0x6, 0x3, 0x5, 0x4, 0x4, 0x6, 0x3, 0x2, 0x3, 0x0, 0x4, 0x1, 0x0, 0x6, 0x1, 0x7, 0x6, 0x7, 0x1, 0x6, 0x4, 0x1, 0x4, 0x0, 0x4, 0x3, 0x4, 0x0, 0x3, 0x0, 0x0, 0x7, 0x3, 0x2, 0x3, 0x5, 0x0, 0x2],
        [0x6, 0x0, 0x5, 0x3, 0x2, 0x5, 0x6, 0x5, 0x6, 0x7, 0x2, 0x7, 0x6, 0x4, 0x1, 0x0, 0x6, 0x3, 0x2, 0x6, 0x2, 0x1, 0x5, 0x3, 0x1, 0x7, 0x7, 0x6, 0x7, 0x1, 0x1, 0x4, 0x4, 0x4, 0x6, 0x2, 0x5, 0x4, 0x0, 0x3, 0x1, 0x4, 0x1, 0x6, 0x1, 0x6, 0x7, 0x7, 0x6, 0x2, 0x7, 0x3, 0x3, 0x3, 0x0, 0x2, 0x6, 0x4, 0x0, 0x0, 0x0, 0x3, 0x1, 0x4, 0x1, 0x5],
        [0x7, 0x1, 0x1, 0x5, 0x1, 0x2, 0x2, 0x7, 0x5, 0x0, 0x5, 0x5, 0x1, 0x4, 0x6, 0x5, 0x2, 0x4, 0x0, 0x1, 0x0, 0x4, 0x6, 0x4, 0x3, 0x7, 0x3, 0x2, 0x4, 0x0, 0x1, 0x6, 0x3, 0x3, 0x2, 0x6, 0x3, 0x4, 0x6, 0x3, 0x2, 0x3, 0x5, 0x1, 0x1, 0x2, 0x4, 0x5, 0x5, 0x6, 0x0, 0x5, 0x5, 0x6, 0x4, 0x1, 0x2, 0x1, 0x5, 0x7, 0x1, 0x3, 0x1, 0x2, 0x2, 0x2],
    ];

    /// MDS matrices — identical in upstream and in the live crate (they were
    /// deliberately never touched), but frozen here regardless.
    #[rustfmt::skip]
    const MDS_FULL: [[u128; STATE_SIZE]; STATE_SIZE] = [
        [0x5, 0x7, 0x1, 0x3],
        [0x4, 0x6, 0x1, 0x1],
        [0x1, 0x3, 0x5, 0x7],
        [0x1, 0x1, 0x4, 0x6],
    ];
    #[rustfmt::skip]
    const MDS_PARTIAL: [[u128; STATE_SIZE]; STATE_SIZE] = [
        [0x20, 0x1, 0x1, 0x1],
        [0x1, 0x2000, 0x1, 0x1],
        [0x1, 0x1, 0x200, 0x1],
        [0x1, 0x1, 0x1, 0x800],
    ];

    fn sbox_x7_flat(x: u128) -> u128 {
        let x2 = square_flat_u128(x);
        let x4 = square_flat_u128(x2);
        let x6 = clmul_gcm(x, x2);
        clmul_gcm(x6, x4)
    }

    fn apply_mds_flat(state: &mut [u128; STATE_SIZE], mds_flat: &[[u128; STATE_SIZE]; STATE_SIZE]) {
        let input = *state;
        for (i, lane) in state.iter_mut().enumerate() {
            let mut out = 0u128;
            for (j, value) in input.iter().enumerate() {
                out ^= clmul_gcm(*value, mds_flat[i][j]);
            }
            *lane = out;
        }
    }

    /// The original permutation over tower-basis lanes: convert to the flat
    /// (GCM) basis, run initial MDS_FULL + 8 full / 58 partial rounds with the
    /// UPSTREAM constants, convert back — exactly the inherited schedule.
    fn permute_tower(state: &mut [u128; STATE_SIZE]) {
        let mut rc_flat = [[0u128; N_ROUNDS]; STATE_SIZE];
        for i in 0..STATE_SIZE {
            for r in 0..N_ROUNDS {
                rc_flat[i][r] = tower_to_flat_u128(UPSTREAM_ROUND_CONSTANTS[i][r]);
            }
        }
        let mut mds_full_flat = [[0u128; STATE_SIZE]; STATE_SIZE];
        let mut mds_partial_flat = [[0u128; STATE_SIZE]; STATE_SIZE];
        for i in 0..STATE_SIZE {
            for j in 0..STATE_SIZE {
                mds_full_flat[i][j] = tower_to_flat_u128(MDS_FULL[i][j]);
                mds_partial_flat[i][j] = tower_to_flat_u128(MDS_PARTIAL[i][j]);
            }
        }

        let mut flat = [0u128; STATE_SIZE];
        for i in 0..STATE_SIZE {
            flat[i] = tower_to_flat_u128(state[i]);
        }

        apply_mds_flat(&mut flat, &mds_full_flat);
        for r in 0..N_ROUNDS {
            if !(F_ROUNDS / 2..F_ROUNDS / 2 + P_ROUNDS).contains(&r) {
                for i in 0..STATE_SIZE {
                    flat[i] ^= rc_flat[i][r];
                    flat[i] = sbox_x7_flat(flat[i]);
                }
                apply_mds_flat(&mut flat, &mds_full_flat);
            } else {
                flat[0] ^= rc_flat[0][r];
                flat[0] = sbox_x7_flat(flat[0]);
                apply_mds_flat(&mut flat, &mds_partial_flat);
            }
        }

        for i in 0..STATE_SIZE {
            state[i] = flat_to_tower_u128(flat[i]);
        }
    }

    /// The original t=4 / rate=2 byte sponge with the upstream BYTEHASH
    /// capacity IV, tower-basis lanes, little-endian byte encoding.
    struct Sponge {
        state: [u128; STATE_SIZE],
        buffer: [u8; 32],
        filled: usize,
    }

    impl Sponge {
        fn with_bytehash_iv() -> Self {
            let label = u64::from_be_bytes(TAG_BYTEHASH) as u128;
            Self {
                state: [0, 0, label << 64, label],
                buffer: [0u8; 32],
                filled: 0,
            }
        }

        fn permute_buffer(&mut self) {
            for i in 0..RATE {
                let word =
                    u128::from_le_bytes(self.buffer[i * 16..(i + 1) * 16].try_into().unwrap());
                self.state[i] ^= word; // GF(2^128) addition is XOR
            }
            permute_tower(&mut self.state);
        }

        fn update(&mut self, mut data: &[u8]) {
            if self.filled != 0 {
                let to_copy = data.len().min(32 - self.filled);
                self.buffer[self.filled..self.filled + to_copy].copy_from_slice(&data[..to_copy]);
                data = &data[to_copy..];
                self.filled += to_copy;
                if self.filled == 32 {
                    self.permute_buffer();
                    self.filled = 0;
                }
            }
            for chunk in data.chunks_exact(32) {
                self.buffer.copy_from_slice(chunk);
                self.permute_buffer();
            }
            let remaining = data.chunks_exact(32).remainder();
            if !remaining.is_empty() {
                self.buffer[..remaining.len()].copy_from_slice(remaining);
                self.filled = remaining.len();
            }
        }

        fn finalize(mut self) -> [u8; 32] {
            let pad = &mut self.buffer[self.filled..];
            pad.fill(0);
            pad[0] |= PADDING_START;
            let last = pad.len() - 1;
            pad[last] |= PADDING_END;
            self.permute_buffer();
            let mut out = [0u8; 32];
            out[..16].copy_from_slice(&self.state[0].to_le_bytes());
            out[16..].copy_from_slice(&self.state[1].to_le_bytes());
            out
        }
    }

    /// The original `poseidon2b_hash_byte_slices` length-prefixed framing.
    pub fn hash_byte_slices(domain: &[u8], pieces: &[&[u8]]) -> [u8; 32] {
        let mut sponge = Sponge::with_bytehash_iv();
        sponge.update(&(domain.len() as u64).to_le_bytes());
        sponge.update(domain);
        sponge.update(&(pieces.len() as u64).to_le_bytes());
        for piece in pieces {
            sponge.update(&(piece.len() as u64).to_le_bytes());
            sponge.update(piece);
        }
        sponge.finalize()
    }
}

const _: () = assert!(frozen::STATE_SIZE == STATE_SIZE);
const _: () = assert!(frozen::N_ROUNDS == N_ROUNDS);

fn constant_for(lane: usize, round: usize) -> u128 {
    for salt in 0u8..=u8::MAX {
        let digest =
            frozen::hash_byte_slices(DOMAIN, &[SEED, &[lane as u8], &[round as u8], &[salt]]);
        let mut bytes = [0u8; 16];
        bytes.copy_from_slice(&digest[..16]);
        let value = u128::from_le_bytes(bytes);
        if value != 0 {
            return value;
        }
    }
    unreachable!("a non-zero constant is found long before the salt space runs out")
}

fn derived_table() -> Vec<Vec<u128>> {
    (0..STATE_SIZE)
        .map(|lane| (0..N_ROUNDS).map(|round| constant_for(lane, round)).collect())
        .collect()
}

/// THE reproducibility pin: the embedded `ROUND_CONSTANTS` are exactly what
/// the frozen derivation produces, all 264 are distinct, and none is small
/// enough to sit inside a proper subfield (every constant exceeds GF(2^16)).
#[test]
fn embedded_table_matches_the_frozen_derivation() {
    let derived = derived_table();

    let mut seen = std::collections::HashSet::new();
    for (lane, row) in derived.iter().enumerate() {
        for (round, value) in row.iter().enumerate() {
            assert_eq!(
                *value, ROUND_CONSTANTS[lane][round],
                "embedded constant [{lane}][{round}] does not match the frozen derivation"
            );
            assert!(seen.insert(*value), "duplicate constant {value:#x}");
            assert!(
                *value > 0xFFFF,
                "constant {value:#x} is small enough to stay inside a subfield"
            );
        }
    }
    assert_eq!(seen.len(), STATE_SIZE * N_ROUNDS, "expected 264 constants");
}

#[test]
#[ignore = "operator tool; prints the TowerHash round-constant table"]
fn print_round_constants() {
    let table = derived_table();

    println!(
        "\n// {} constants, all distinct, all wider than GF(2^16).",
        STATE_SIZE * N_ROUNDS
    );
    println!("#[rustfmt::skip]");
    println!("pub const ROUND_CONSTANTS: [[u128; N_ROUNDS]; STATE_SIZE] = [");
    for row in &table {
        println!("    [");
        for chunk in row.chunks(3) {
            let line: Vec<String> = chunk.iter().map(|v| format!("0x{v:032x}")).collect();
            println!("        {},", line.join(", "));
        }
        println!("    ],");
    }
    println!("];");
}
