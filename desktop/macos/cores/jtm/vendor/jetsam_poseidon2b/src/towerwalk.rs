// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 the Jetsam developers.
// Portions derived from an Apache-2.0 licensed upstream; see NOTICE.

//! TowerWalk — the cache-resident hash built on Poseidon2b.
//!
//! This crate owns the function; `jetsam_chain::consensus::pow_walk` re-exports it
//! and owns the *rule* that says from which height a block must satisfy it.
//!
//! It lives here, and not beside that rule, for one reason: **`jetsam-extminer`
//! ships to third parties and deliberately does not depend on `jetsam_chain`.**
//! A second copy of this walk in the external miner is a consensus divergence
//! waiting for one of the two to be edited alone, which is exactly the class of
//! defect that stops a chain at a height nobody is watching.
//!
//! # Why
//!
//! The live PoW is a Poseidon2b sponge over the header: pure field arithmetic, no
//! memory, embarrassingly parallel. NVIDIA cards have carry-less multiply-add from
//! Ampere onward, so that sponge is GPU territory and always was — one RTX 3090
//! sustains 202 M permutations per second where an EPYC 7742 core sustains 397 k.
//!
//! This replaces the compute wall with a **memory** wall: derive a seed from the
//! header, fill a 512 KiB scratchpad, then walk it with 524 288 data-dependent
//! reads, each one writing back. A CPU keeps that scratchpad in its private L2; a
//! GPU cannot — a pad is larger than an SM's whole shared memory — and its ceiling
//! becomes random-transaction throughput, not bandwidth or capacity.
//!
//! # What is honest to claim, and what is not
//!
//! Measured on rented hardware on 2026-09-23, same C kernel compiled for both
//! sides, one thread per pad:
//!
//! | | H/s | W | H/s per $1000 of capital |
//! |---|---:|---:|---:|
//! | H100 NVL | 21 709 | ~400 | ~776 |
//! | A100 PCIE 40 GB | 9 951 | 250 | — |
//! | EPYC 7742, one socket | ~34 600 | 225 | ~13 400 |
//!
//! So a datacenter GPU is **within a factor of two of a server CPU socket**, not
//! forty times behind it. This construction is not "ASIC-resistant" and it is not
//! "anti-GPU". What it is: **mining that does not reward capital** — an ordinary
//! processor returns about seventeen times more work per euro invested than an
//! accelerator. Say that, and nothing stronger.
//!
//! # Invariants a re-implementation must not break
//!
//! Each of these has been measured to break the construction silently, passing
//! statistical batteries while destroying the property the PoW rests on:
//!
//! 1. **The xorshift in [`cheap_mix`] is load-bearing.** Multiplication mod 2^64 is
//!    lower-triangular at the bit level — bit `i` of the product depends only on
//!    bits `0..=i` — so without `y ^ (y >> 29)` the high bits never reach the low
//!    bits and the low 16 bits, the ones the address consumes, collapse to a
//!    period-65536 bijection.
//! 2. **The four lanes are sequential within a round.** Lane 1 must read what lane 0
//!    has just written back. Evaluating them as a batch — the natural SIMD or GPU
//!    port — changes the digest on any round where two lanes address the same cell.
//! 3. **All arithmetic wraps.** No saturation, no wider intermediate, no float.
//! 4. **The scratchpad is `u64`-indexed.** No byte serialisation inside the walk,
//!    so no endianness dependency in the hot path.
//!
//! # Why the walk stays 64-bit when Poseidon2b is 128-bit
//!
//! The recipe this is ported from keeps 8 words of 64 bits: four lane accumulators
//! and four capacity words. Poseidon2b is `t = 4` over GF(2^128) — four words of
//! 128 bits. `8 * 64 == 4 * 128`, so the state fits exactly, and the port changes
//! **only the fold**: pack `a[i] | (c[i] << 64)`, permute, unpack.
//!
//! That is deliberate. The two security properties of this construction — write
//! coverage and access uniformity — belong to the access pattern, not to the
//! permutation. Keeping the pattern bit-identical to the one already measured in
//! production elsewhere means those measurements transfer verbatim instead of
//! having to be re-established for a pattern nobody has run.

use crate::native::permutation::permute_flat_u128;

/// Scratchpad cells, `u64` each: 65 536 * 8 = 512 KiB.
///
/// Sized to sit inside one core's private L2 and to make multi-nonce interleaving
/// unprofitable on both Zen 2 (512 KiB L2) and Zen 4 (1 MiB). Deliberately NOT
/// L3-sized: an L3-capacity-bound PoW hands an edge to large-cache parts and splits
/// CPUs into haves and have-nots.
pub const CELLS: usize = 65_536;

/// `CELLS` is a power of two, so the index is a mask, not a modulo: no branch, no
/// division, identical on every platform.
pub const INDEX_MASK: u64 = (CELLS as u64) - 1;

/// Independent accumulator chains sharing one scratchpad.
pub const LANES: usize = 4;

/// Walk rounds. `LANES * ROUNDS = 524 288` dependent reads per hash.
///
/// This is a security parameter, not a speed knob. Lowering it degrades three
/// things at once: write coverage (the time-memory defence), the attacker's real
/// memory need, and the fixed streamable share of the hash.
pub const ROUNDS: usize = 131_072;

/// Poseidon2b fold every `PERM_PERIOD` rounds.
///
/// **8192, not the 1024 of the recipe this is ported from.** That value is tuned
/// for a Goldilocks permutation costing ~1 500 cycles. Poseidon2b costs **2.519 µs**
/// — about 5 700 cycles on an EPYC 7742 — measured on 2026-09-23 against the
/// PCLMULQDQ register-domain kernel.
///
/// | `PERM_PERIOD` | folds | hash | pure-compute share (DERIVED) |
/// |---:|---:|---:|---:|
/// | 1024 | 145 | ~2.14 ms | ~17 % |
/// | **8192** | **33** | **~1.86 ms** | **~4.5 %** |
///
/// Those shares are **derived**, not measured: isolating them by subtraction on a
/// loaded machine is too noisy to publish, with readings from "unmeasurable" to
/// 14.8 %. What holds without reservation is **at most 15 %**.
///
/// **The argument that actually decides it is the knee, and that one is measured on
/// two machines**: going from 8192 to 16384 buys only 0–1.6 %, and going to 32768 at
/// most 3.5 %. There is nothing left past 8192. Meanwhile 1024 throws away about
/// 15 % of CPU throughput and inconveniences nobody on the other side — at
/// 21 709 H/s an H100 would need 0.72 M permutations per second, about 0.2 % of its
/// capacity.
pub const PERM_PERIOD: usize = 8_192;

/// Poseidon2b re-anchor every `FILL_PERM_PERIOD` cells during the fill.
pub const FILL_PERM_PERIOD: usize = 4_096;

/// Odd multiplier (golden-ratio constant) — odd implies a bijection mod 2^64, so
/// the mix loses no entropy.
pub const MULT_C: u64 = 0x9E37_79B9_7F4A_7C15;

/// Xorshift amount. Not free to choose: at 20 and 21 the mix never reaches
/// avalanche, and 0 breaks the construction outright.
pub const XORSHIFT: u32 = 29;

/// Capacity words are seeded from the header seed XOR these, so the fold's hidden
/// state is header-dependent rather than constant.
pub const CAP_INIT: [u64; 4] = [
    0xA5A5_A5A5_A5A5_A5A5,
    0x5A5A_5A5A_5A5A_5A5A,
    0x3C3C_3C3C_3C3C_3C3C,
    0xC3C3_C3C3_C3C3_C3C3,
];

/// Cheap non-cryptographic diffusion: add the counter, multiply by an odd constant,
/// then fold the high bits down.
///
/// `+ctr` breaks the `x = 0` fixed point for every `ctr != 0`. At `ctr = 0` zero
/// maps to zero, which is reachable with probability 2^-64 and escapes on the next
/// step; the spec should not claim more than it does.
#[inline(always)]
pub fn cheap_mix(x: u64, ctr: u64) -> u64 {
    let y = x.wrapping_add(ctr).wrapping_mul(MULT_C);
    y ^ (y >> XORSHIFT)
}

/// Fold the eight-word state through Poseidon2b.
///
/// `a[i] | (c[i] << 64)` is a bijection onto the four flat GF(2^128) words, so no
/// state is lost and every 128-bit word carries one visible accumulator and one
/// hidden capacity word.
///
/// # The basis, which is where a re-implementation forks in silence
///
/// [`permute_flat_u128`] is the **core** of the protocol permutation — the part that
/// `stratum.md §3.2` describes as "all arithmetic below is in the flat basis". It is
/// applied here to the four packed words **as flat-basis elements, bit `i` being the
/// coefficient of `x^i`, with no `T2F`/`F2T` conversion at all**.
///
/// That is what makes it different from the header sponge, where the sixteen inputs
/// arrive on the wire in the *tower* basis and are converted in, and the two output
/// lanes converted out. Here there is nothing to convert: these words are not field
/// elements on any wire, they are 64-bit accumulators packed two to a slot.
///
/// Converting them would change the digest — measured: `df14bab5…` instead of
/// `1e2d34c7…` on the first reference vector. Anyone reading "the protocol
/// permutation" and reaching for the dressed version produces blocks nobody accepts,
/// with no error message, until the activation height splits their chain off.
#[inline]
fn fold(a: &mut [u64; LANES], c: &mut [u64; LANES]) {
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

/// A reusable scratchpad.
///
/// Allocating 512 KiB per nonce would dominate the hash; miners hold one of these
/// per thread. The fill overwrites it completely, so no state leaks between nonces
/// — `fill_overwrites_every_cell` is the guard.
pub struct Scratch {
    v: Vec<u64>,
}

impl Scratch {
    pub fn new() -> Self {
        Self {
            v: vec![0u64; CELLS],
        }
    }
}

impl Default for Scratch {
    fn default() -> Self {
        Self::new()
    }
}

/// The TowerWalk digest of a 32-byte seed, reusing a caller-owned scratchpad.
///
/// The caller passes the Poseidon2b header digest — the very digest that *is* the
/// PoW below the activation height. Every miner-controlled field therefore replays
/// the entire memory work when it changes, and the nonce still appears nowhere in
/// the circuit.
///
/// Verification cost is symmetric with mining cost: checking one header is exactly
/// one hash, **1.85 ms on an EPYC 7742 core** [MEASURED 2026-09-23, one core with
/// the machine to itself, mean of five runs of 150 headers — the *unit cost*, not
/// the 4.66 ms a thread sees once every core is busy;
/// `jetsam_chain::consensus::pow::pow_digest` is the table of record for both].
/// There is no short proof for a memory-hard function without a SNARK, and that was
/// given up deliberately. The asymmetry that makes PoW work still exists at the
/// block level: the miner tries about `D` nonces, the verifier checks one.
pub fn towerwalk_digest_with(scratch: &mut Scratch, seed: &[u8; 32]) -> [u8; 32] {
    let mut s = [0u64; 4];
    for i in 0..4 {
        s[i] = u64::from_le_bytes(seed[i * 8..(i + 1) * 8].try_into().unwrap());
    }

    let mut a = s;
    let mut c = [
        s[0] ^ CAP_INIT[0],
        s[1] ^ CAP_INIT[1],
        s[2] ^ CAP_INIT[2],
        s[3] ^ CAP_INIT[3],
    ];

    // Fill, re-anchored on the folded state so the pad is not a plain PRNG stream
    // an attacker could seek into.
    let v = &mut scratch.v;
    let mut x = s[0] ^ s[1] ^ s[2] ^ s[3];
    for i in 0..CELLS {
        x = cheap_mix(x, i as u64);
        v[i] = x;
        if (i + 1) % FILL_PERM_PERIOD == 0 {
            fold(&mut a, &mut c);
            x ^= a[0] ^ a[1] ^ a[2] ^ a[3];
        }
    }

    // The walk. Serial, data-dependent, write-back.
    //
    // The write-back is what kills the time-memory trade-off: it dirties 54.97 % of
    // the pad within the first tenth of the walk and 99.97 % by the end, and a dirty
    // cell cannot be recomputed from the fill chain — only replayed. An attacker
    // holding half the pad, chosen with foreknowledge of the trace, hits a cell he
    // cannot reconstruct within the first thousand steps of 524 288: step 457 on the
    // seed first measured, **616 as the mean over eight seeds**
    // [MEASURED 2026-09-23]. Quote the mean; one seed is an anecdote.
    //
    // Lanes run in fixed program order 0..3 — see invariant 2 in the module docs.
    // That costs real throughput and it is the price of the resistance above.
    for r in 0..ROUNDS {
        for l in 0..LANES {
            let j = ((a[l] ^ (a[l] >> 32)) & INDEX_MASK) as usize;
            let val = v[j];
            a[l] ^= val;
            a[l] = cheap_mix(a[l], r as u64);
            v[j] = a[l].wrapping_add(val);
        }
        if (r + 1) % PERM_PERIOD == 0 {
            fold(&mut a, &mut c);
        }
    }

    // Mandatory final fold, then squeeze.
    fold(&mut a, &mut c);
    let mut out = [0u8; 32];
    for i in 0..4 {
        out[i * 8..(i + 1) * 8].copy_from_slice(&a[i].to_le_bytes());
    }
    out
}

/// Allocating convenience wrapper. Fine for verification — one header at a time —
/// but a miner must reuse a [`Scratch`].
pub fn towerwalk_digest(seed: &[u8; 32]) -> [u8; 32] {
    towerwalk_digest_with(&mut Scratch::new(), seed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed_n(k: usize) -> [u8; 32] {
        let mut s = [0u8; 32];
        for (i, b) in s.iter_mut().enumerate() {
            *b = ((k * 31 + i * 7 + 1) & 0xFF) as u8;
        }
        s
    }

    /// Frozen reference vectors.
    ///
    /// These are the contract. A kernel, a compiler or a refactor that changes one
    /// bit of the walk changes these, and every node on the network would disagree
    /// about which blocks are valid. Regenerating them is a consensus change, not a
    /// test fix.
    const VECTORS: [(usize, &str); 4] = [
        (
            0,
            "1e2d34c710848385513d80cae38bef93190a7868458ae8ce975b7e64a1ec74a3",
        ),
        (
            1,
            "643434b9ddcb5ec8ca9311349ffb3965b2a9994aa6c592836193906181ff1561",
        ),
        (
            2,
            "d7a0d6163a6634500c864fec4d539b46a17924ad126b28102b4ac917250ebec2",
        ),
        (
            3,
            "107f5574679f3e2ec028222e2cc6fa2a61aa5943c53eaa7758fd457887ae6634",
        ),
    ];

    fn hex(b: &[u8]) -> String {
        b.iter().map(|x| format!("{x:02x}")).collect()
    }

    #[test]
    fn matches_the_frozen_reference_vectors() {
        let mut sc = Scratch::new();
        for (k, expected) in VECTORS {
            let got = towerwalk_digest_with(&mut sc, &seed_n(k));
            assert_eq!(hex(&got), expected, "vector {k} changed");
        }
    }

    /// A reused scratchpad must give the same digest as a fresh one, or a miner and
    /// a verifier would disagree about the same header.
    #[test]
    fn a_reused_scratchpad_leaks_no_state() {
        let mut sc = Scratch::new();
        let _ = towerwalk_digest_with(&mut sc, &seed_n(7));
        let reused = towerwalk_digest_with(&mut sc, &seed_n(0));
        let fresh = towerwalk_digest(&seed_n(0));
        assert_eq!(reused, fresh);
    }

    /// One bit of seed must change the digest completely: the walk is the whole
    /// point, and a seed that only perturbs the tail would be re-groundable.
    #[test]
    fn one_seed_bit_changes_the_digest() {
        let mut sc = Scratch::new();
        let base = seed_n(0);
        let mut flipped = base;
        flipped[17] ^= 0x01;
        let a = towerwalk_digest_with(&mut sc, &base);
        let b = towerwalk_digest_with(&mut sc, &flipped);
        assert_ne!(a, b);
        let differing: u32 = a
            .iter()
            .zip(b.iter())
            .map(|(x, y)| (x ^ y).count_ones())
            .sum();
        // 256 independent bits: anything below 90 would be a red flag, not a fluke.
        assert!(differing > 90, "only {differing} of 256 bits changed");
    }

    /// `cheap_mix` without the xorshift collapses the low 16 bits — the ones the
    /// address consumes — to a period-65536 bijection. This asserts the shift is
    /// actually doing that work, so nobody "simplifies" it away.
    #[test]
    fn the_xorshift_is_load_bearing() {
        // Without the shift, the low 16 bits of the product depend only on the low
        // 16 bits of the input.
        let lo_only = |x: u64| x.wrapping_mul(MULT_C) & 0xFFFF;
        assert_eq!(lo_only(0x0000_0000_0000_1234), lo_only(0xFFFF_FFFF_0000_1234));
        // With the shift, the same two inputs separate.
        assert_ne!(
            cheap_mix(0x0000_0000_0000_1234, 0) & 0xFFFF,
            cheap_mix(0xFFFF_FFFF_0000_1234, 0) & 0xFFFF
        );
    }

    /// The fold is a bijection on the packed state: pack, unpack, nothing lost.
    #[test]
    fn packing_the_state_loses_nothing() {
        let a = [1u64, 2, 3, 4];
        let c = [5u64, 6, 7, 8];
        let mut flat = [0u128; 4];
        for i in 0..4 {
            flat[i] = (a[i] as u128) | ((c[i] as u128) << 64);
        }
        for i in 0..4 {
            assert_eq!(flat[i] as u64, a[i]);
            assert_eq!((flat[i] >> 64) as u64, c[i]);
        }
    }

    /// Exactly 33 folds per hash: 16 during the fill, 16 during the walk, one final.
    /// The count is what `PERM_PERIOD`'s cost table is computed from, so it is
    /// asserted rather than trusted.
    #[test]
    fn the_fold_count_is_thirty_three() {
        assert_eq!(CELLS / FILL_PERM_PERIOD + ROUNDS / PERM_PERIOD + 1, 33);
    }
}
