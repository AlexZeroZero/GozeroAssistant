// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 the Jetsam developers.
// Portions derived from an Apache-2.0 licensed upstream; see NOTICE.
// Adapted from binius_poseidon2b circuit reference.

//! Native Poseidon2b permutation over GF(2^128).
//!
//! Parameters: state size t=4, x^7 S-box, 8 full rounds + 58 partial rounds.

use std::sync::OnceLock;

use jetsam_core::{
    hardware::{clmul_gcm, flat_to_tower_u128, square_flat_u128, tower_to_flat_u128},
    Block128,
};
use zeroize::Zeroize;

pub const STATE_SIZE: usize = 4;
pub const SBOX_EXPONENT: usize = 7;
pub const F_ROUNDS: usize = 8;
pub const P_ROUNDS: usize = 58;
pub const N_ROUNDS: usize = F_ROUNDS + P_ROUNDS;

/// Poseidon2b permutation over GF(2^128).
#[derive(Debug, Clone, Copy, Default)]
pub struct Poseidon2bPermutation;

impl Poseidon2bPermutation {
    /// Apply the full permutation to `state` in-place.
    pub fn permute_mut(&self, state: &mut [Block128; STATE_SIZE]) {
        let mut flat = [0u128; STATE_SIZE];
        for i in 0..STATE_SIZE {
            flat[i] = tower_to_flat_u128(state[i].0);
        }
        permute_flat_u128(&mut flat);
        for i in 0..STATE_SIZE {
            state[i] = Block128(flat_to_tower_u128(flat[i]));
        }
        flat.zeroize();
    }
}

/// The Poseidon2b permutation acting directly on a **flat (GCM) basis**
/// state, with no basis conversion at the boundaries.
///
/// [`Poseidon2bPermutation::permute_mut`] is exactly
/// `tower→flat → permute_flat_u128 → flat→tower`: the round schedule always
/// runs in the flat basis internally. Callers whose data already lives in
/// the flat basis (lane-oriented transcripts, the proof-core PCS Merkle
/// primitives) use this entry point and skip both conversions.
pub fn permute_flat_u128(flat: &mut [u128; STATE_SIZE]) {
    #[cfg(target_arch = "x86_64")]
    if crate::batch::avx2_vpclmul_runtime() {
        // SAFETY: gated on runtime AVX2+VPCLMULQDQ detection.
        return unsafe {
            crate::batch_avx2::permute_flat_single_u128(flat, crate::batch::kernel_tables())
        };
    }
    #[cfg(target_arch = "x86_64")]
    if crate::batch::pclmul_runtime() {
        // SAFETY: gated on runtime SSE4.1+PCLMULQDQ detection.
        return unsafe {
            crate::batch_pclmul::permute_flat_single_u128(flat, crate::batch::kernel_tables())
        };
    }
    #[cfg(target_arch = "aarch64")]
    if crate::batch::pmull_runtime() {
        // SAFETY: gated on runtime/static PMULL detection.
        return unsafe {
            crate::batch_aarch64::permute_flat_single_u128(flat, crate::batch::kernel_tables())
        };
    }
    #[allow(unreachable_code)]
    let tables = flat_tables();

    // Initial MDS_FULL multiplication.
    apply_mds_full_flat(flat, tables);

    // Full and partial rounds, entirely in flat/GCM basis. This is
    // algebraically identical to the tower schedule but avoids a
    // tower<->flat conversion around every CLMUL multiplication.
    #[allow(clippy::needless_range_loop)]
    for r in 0..N_ROUNDS {
        if !(F_ROUNDS / 2..F_ROUNDS / 2 + P_ROUNDS).contains(&r) {
            // Full round.
            for i in 0..STATE_SIZE {
                flat[i] ^= tables.rc[i][r];
                flat[i] = sbox_x7_flat_u128(flat[i]);
            }
            apply_mds_full_flat(flat, tables);
        } else {
            // Partial round.
            flat[0] ^= tables.rc[0][r];
            flat[0] = sbox_x7_flat_u128(flat[0]);
            apply_mds_partial_flat(flat, tables);
        }
    }
}

#[derive(Debug)]
struct FlatTables {
    rc: [[u128; N_ROUNDS]; STATE_SIZE],
    mds_full: [[u128; STATE_SIZE]; STATE_SIZE],
    mds_partial: [[u128; STATE_SIZE]; STATE_SIZE],
    mds_full_is_one: [[bool; STATE_SIZE]; STATE_SIZE],
    mds_partial_is_one: [[bool; STATE_SIZE]; STATE_SIZE],
}

fn flat_tables() -> &'static FlatTables {
    static TABLES: OnceLock<FlatTables> = OnceLock::new();
    TABLES.get_or_init(|| {
        let mut rc = [[0u128; N_ROUNDS]; STATE_SIZE];
        for i in 0..STATE_SIZE {
            for r in 0..N_ROUNDS {
                rc[i][r] = tower_to_flat_u128(ROUND_CONSTANTS[i][r]);
            }
        }

        let mut mds_full = [[0u128; STATE_SIZE]; STATE_SIZE];
        let mut mds_partial = [[0u128; STATE_SIZE]; STATE_SIZE];
        let mut mds_full_is_one = [[false; STATE_SIZE]; STATE_SIZE];
        let mut mds_partial_is_one = [[false; STATE_SIZE]; STATE_SIZE];
        for i in 0..STATE_SIZE {
            for j in 0..STATE_SIZE {
                mds_full[i][j] = tower_to_flat_u128(MDS_FULL[i][j]);
                mds_partial[i][j] = tower_to_flat_u128(MDS_PARTIAL[i][j]);
                mds_full_is_one[i][j] = MDS_FULL[i][j] == 1;
                mds_partial_is_one[i][j] = MDS_PARTIAL[i][j] == 1;
            }
        }

        FlatTables {
            rc,
            mds_full,
            mds_partial,
            mds_full_is_one,
            mds_partial_is_one,
        }
    })
}

#[inline(always)]
fn apply_mds_full_flat(state: &mut [u128; STATE_SIZE], tables: &FlatTables) {
    let mut input = *state;
    for (i, state_i) in state.iter_mut().enumerate() {
        let mut out = 0u128;
        for (j, input_j) in input.iter().enumerate() {
            if tables.mds_full_is_one[i][j] {
                out ^= *input_j;
            } else {
                out ^= clmul_gcm(*input_j, tables.mds_full[i][j]);
            }
        }
        *state_i = out;
    }
    input.zeroize();
}

#[inline(always)]
fn apply_mds_partial_flat(state: &mut [u128; STATE_SIZE], tables: &FlatTables) {
    let mut input = *state;
    for (i, state_i) in state.iter_mut().enumerate() {
        let mut out = 0u128;
        for (j, input_j) in input.iter().enumerate() {
            if tables.mds_partial_is_one[i][j] {
                out ^= *input_j;
            } else {
                out ^= clmul_gcm(*input_j, tables.mds_partial[i][j]);
            }
        }
        *state_i = out;
    }
    input.zeroize();
}

/// The x^7 S-box in GF(2^128).
/// x^7 = x * x^2 * x^4.
#[inline(always)]
pub fn sbox_x7(x: Block128) -> Block128 {
    let x_flat = tower_to_flat_u128(x.0);
    Block128(flat_to_tower_u128(sbox_x7_flat_u128(x_flat)))
}

#[inline(always)]
fn sbox_x7_flat_u128(x: u128) -> u128 {
    let x2 = square_flat_u128(x);
    let x4 = square_flat_u128(x2);
    let x6 = clmul_gcm(x, x2);
    clmul_gcm(x6, x4)
}

// JETSAM CHANGE - TowerHash round constants.
//
// Upstream's table held only eight distinct values across all 264 entries, all
// inside {0x0 ..= 0x7}. Together with MDS_FULL, which lies in the same range,
// and an x^7 S-box (subfields are closed under multiplication), the full rounds
// mapped GF(2^4)^4 into itself - an invariant subspace, which is exactly the
// structure invariant-subspace cryptanalysis targets. Only the partial rounds
// escaped it, through MDS_PARTIAL entries reaching bit 13.
//
// These constants are pseudorandom over the whole field, all distinct, and all
// wider than GF(2^16). Applying one costs an add_const term - a constant in a
// linear combination - so the extra width is free, natively and in-circuit.
//
// Derived from a public seed. Regenerate and verify with
// jetsam_poseidon2b/tests/generate_round_constants.rs, which documents the exact
// procedure. MDS_FULL and MDS_PARTIAL are deliberately unchanged: an MDS matrix
// must be proven maximum-distance-separable, never improvised.
#[rustfmt::skip]
pub const ROUND_CONSTANTS: [[u128; N_ROUNDS]; STATE_SIZE] = [
    [
        0xdd633f6e06a5c0817b27d2af33102762, 0xd18a77658c72389d7ede67313c9f7055, 0x997a6e96bd7d0dcab0d9b6f928800732,
        0x3da809279196c238bc0ea8a98abbc5e8, 0xee8cddb0be000bf6f60d0f8c4b6c8824, 0xb5b5142ba19e7199c862ffd941e2ba99,
        0x6217831dd51bd16647b901a579ae5372, 0x78235b2ac5b19c23964ff0a063b93f80, 0xe068ff9fe9823afd9b4a5f525b601946,
        0x2ee621f16a6c10ca5a39d7d3b916ddeb, 0x97297548473040d2488291e97a30bfcf, 0x73d08c988d8473753fa67e3f0c942e1d,
        0x3c58b0852ae898f3e95dad44a2761e94, 0xbcc9b81809744d356b39f47e70177302, 0x3989b857220c15b872082322c3c6a57e,
        0x5507a7fcd38c3f2efbf4177cfa10f969, 0x6a65f74212348f5fb01c9504240ab376, 0x632f003cd077fdb9c2503a2747f44377,
        0x2d274a1c69a5461bb20c137021b1c27b, 0x0f877eebba36fba915d8882f80e6c3db, 0xc2098299f65e49bdfc088775969afe43,
        0x09c8a4dcb33ca2cae26cb1d3b898c079, 0x98ffd7810c01b67ea604399e1b1fb0c2, 0x78590812ec6d5aa77213392c2e7ad97c,
        0xeb6ca360c831cc00fd3bde81a01d7b79, 0x986caf0abf5ab8a885d3dceb89aa212b, 0x287ba1672f701cea1676a324d2fc81c7,
        0x8f4c26277f0c39f09140a667b17b5f5d, 0x618142ad4cb4633f37eba97814672fdc, 0x9609ca2933115fc2174492e47a235409,
        0x784704873875fd8cd590eabd3df40f42, 0xaaabc2057d42edda2a9a41d964621d9f, 0x97bf40460e895725f9dec709b081815f,
        0xd108782b8859ced4fdc7da22137a4aa9, 0x0b91016d9effdaf58911fa1de525d78d, 0x58cb6663ddacd9e2cb4240fcd977b932,
        0x1b9087c1d7ccea7706d4adb77496033e, 0x215a86d98a49f2e81962acfa4998756b, 0x3bc2d02c1a186dd915cda7c20e1eb6b1,
        0x460df41f9d93ccba761fd9a6a2433f08, 0x621cd5c147a1add876c7f95bfb65aca8, 0xd141e0dbfb7b3b9eea22d63beb553cf7,
        0x7aa701c3e5042d0a0bb6c3ff0615bc34, 0xd731d18868d1f76827a553c52a39fc5b, 0x4401014d4879e4d01061b9e9c3a79c50,
        0x985398219fabe1f533aa6e5348ebf9a1, 0xfabd8e9eaac1ebef614ad3dcb001aa0d, 0xf5205275b41a75e340c272f0c7981334,
        0xdaeea95c0cc7e485596bfabf4dd7fa5a, 0x3cfa9e0eef0c63d6ecb67c1b1d8dde38, 0xbf8cdfda030fa3827efa9263dbc5185a,
        0xa7631f8aff18bffbaa06b6fd79a07978, 0x1de2e873fe1827f6808b01bc2d589838, 0xde80a17682dc489c2687b0415954b4c2,
        0x5e6e43a5f1086359ac92110075ccb453, 0xd61980d4a4b3780f66c2003d53d17fc3, 0xaff80dce55f27db192abc9b5f84909b9,
        0x1db0f6747d8a04a87d0687d94f84df40, 0xfa56eed1d8b1368ddf24564e167a8dd5, 0x10e59cabda38e348dcadf7bed69e52cf,
        0x512baf73001a99c97969fc258dd58272, 0x08acc22f3edd60d90aeccf5723c84521, 0xbe332a45164cceb7418e8c3b05c72a5b,
        0x6a2919e1dafd2022c6e2418bce11ca4d, 0xf10a29fcdc5bc05e3dc3730b5f759709, 0x3f8637d9957335e6158230cb9fe46c00,
    ],
    [
        0x1d0d63d6129df263c4b6a485569a4f2b, 0x5d2356c77f2f878f6a7e2715957abdb0, 0x08d4619b3f4fdb9e7bb63b8b2c9063fc,
        0x9f7e73286d12716d36d59b420ade4e60, 0x9a68f277965b0880957ce83d83ac5711, 0x2e586a754b342369183e0a043f9275a4,
        0x01381163278c5059c833463309bde37a, 0x0dcf364eea4f91badb9152d9f0abbfe5, 0x20b6a50f3079b4710304c4ea89fe08b5,
        0xf8bb25c43a6f52ad459b8cea23313be2, 0x09a329b41923c783cf2d907c8ccbc5ec, 0xfa67e42f683b1322aa743c240f9a28f2,
        0xb64ef6c1c961a1544aee031856fa856a, 0xd1ef370e82b51c986da3060ab97de4c4, 0x84741bd2fa8fe0cde717a53614adf127,
        0xa216220f58ea5f5656920ba504275f3e, 0x9167a8f141ff9575c4add9a99006e00b, 0x19fcba2feaf3a8ac5613e54af4afa18b,
        0xf40168aedd7515e4c35de0c335b518ca, 0x95762bfee4fbe8cdc94313814007eb48, 0x786dbea0aee0f5439c8391e24fdef054,
        0x0e1fdf4e339e34d39074eaf1feacd42e, 0xb2ec2c0cb5211a6c34a4ca42e36730c9, 0x227ae2795b8995ce5d39d1b014d87477,
        0x4457476158b221b536d33f5b9bcc4a3f, 0x1c4e1e02c3e4998ecccdcd0a5e51f337, 0xd4c3e5aa0bcdd8782ec73cd37fd9a878,
        0xe83bf60c4be09cd7b058b0a5030b3113, 0x420c01d4df7f019126d45bfd445c52a8, 0x4bbbbb5fd2b0998a611804d9c475bce1,
        0xfb7c5af02d6ae73fd5898a3e1cc00294, 0x62a46decd02e94a2df275ba3a1949a10, 0xa4bab1de8c576712d4f594040b10c361,
        0xa483b7e308d396d32bd0daf00932e532, 0x98b4e508b8b13a550693401bfd11eb84, 0x573704d688558393eb1fb06e4bf6a574,
        0xf875ecf8c57cde24d1867d11094f89ca, 0x4ef5caebb6dcffd82a613a5aa1a02837, 0xed679e5d82339df49ab7f411996dc68c,
        0xbf6ae00db5ca85fb97048e1c4a221b77, 0x04e05fc3edb9d6b1def601c4b0f42b16, 0xc4bd9ac4ff96924c3e9912cecd92ad4e,
        0x247e2f78f0c03d0c890c503976c15cc4, 0x8c05d025511479fd3d8ed077096f90f0, 0xc761d2de41f2cb5f41e2e4b626f09adc,
        0xac756b8a87b90b8482c303459e92ed7c, 0xfcd808cf36a403dd2ac611c5d305cd2a, 0x4d406d0cb19364498637b556e0798e3d,
        0x4107f92725c0f3eb17713cac57a1820d, 0xad2250eaad5213848ae09164e896e91a, 0x23b109d4af6efe5a4faf0d10d37f6a7b,
        0xb7441e6329a733be442757658a1cd4cb, 0x7bcdcacba88ca97286ec3ee0474ef729, 0xe0f9edd66a325ba61037520f76878e4d,
        0x36c1cfc047181be6f180262c4890de16, 0xdff27741e3330946a29168c7a94e153c, 0xad5cd55e64c24c56c51310440f46f343,
        0x5935f2eb3094101af559a70d3f28992f, 0xf45ab3df32418f73848b09f1a773ecfe, 0x7e83bf11ce5891b2a251bad5fb87a23d,
        0x5c12bbd89c38d09fa02c1508ee44190d, 0x782dade21e7959d801f4d7488d1e51ed, 0x4f71ab4cc0baec0b67eeb504b5167ad3,
        0x11e938ad3b6807646ec3b5350d5e8d37, 0x79a1c38a289242a8f0c1f98780966be3, 0x2a52f1eb1565faf68b63feca9671e2df,
    ],
    [
        0xf5f3937f7893728894f69b439bb97e47, 0x20ad737e276b5c4ff565d18427ec8a8c, 0xb27d7735f8a7c5241bf101f9692c7296,
        0x8ad3e04d6ec95bfb5b3e207a3a75ce26, 0xb01ccc4c46d525a4b791c702b85ca160, 0xa58f5f390878ae0b8bea2e0737e25c76,
        0xb977a28baf50c227f73fe8ab401d8a28, 0x4dd0b088d7414f746bb3244e058bd3e8, 0x1ca44138cb625d9b16ebbcbffc57a31b,
        0x5b1bb112a988eb1469fe9b916c2600ef, 0xf07fe66b73e49aba27ea77cc97115c36, 0xc7ba631c7760c5ba11b602b9df56e735,
        0xceff1f8dc056947a863a36ff1a7dd4df, 0xf85c01c1b08336559dc12fb288bd571f, 0x7d70db9d92c969b74658f5d119717175,
        0x834adb94af4d18021e79bb4269d70b8a, 0xd8c01dc7f58ad25d1bcd2e89eea3e2b0, 0x8eb3e8be313b2a51a6f25c4d090813af,
        0x383de326701d12ff4afe5ad011c21721, 0xd5c9e25ef6902bdce354a425c2f190e5, 0x0d2ddcf5073d75a36c182f9e4b5bc077,
        0x6dbe7203612207c4802697cb5caadccc, 0xe0e35dc72a00c815c69022887f39fa9b, 0xec0d4d00c24b10c6da46f3a413edc2d0,
        0x2e8b8cd37b590ade02328d03c74108fd, 0x9fe3be419d622f40741eb5e7afe85b1b, 0x6b5c741935a2f1e891ee7489eec32267,
        0xc543334d6117e12d3507376b552abe5c, 0x365338b8fc3c8a922297803919b956ed, 0xf481109c84d5367fe3fc5049b360595a,
        0x64f84008251279a252cdd43e7b528c22, 0x90e8979a15d1a7118d2cb469d3705fcf, 0x2aca96769c54a5b16520c7351587daba,
        0x84d18eea5afee09a6acda613f9e48cb2, 0x050cca03e9a821cdb8d1a6f518222146, 0xb69c7deb76fef6d8be12ec3fedccdded,
        0xfa61984f7d3360a62197ec825c74a932, 0xb428df4f1be0053b98f9dec8f6e9ff42, 0xe27e4230c9c3e7dbd3f4cf8cebb280b8,
        0x0c981da8e2fc2e48f5d83c2f1ffa5f04, 0x1e96aa86f51004537e21ab65e16c5cbc, 0x2f0249f953d8499f045a07d23a418345,
        0x7940e03d5e101106ea59044d61b1760a, 0x9e258a46481b0561c7cf5ece46c8015a, 0x4421317f34b44137a3877444a3f2168a,
        0x8bcb37f5aed303b4470a006b60b04760, 0x9e63e3a8589c05b3eec74f4ebd5928f5, 0xf314d091c3a64a6678a485095a7d7e4b,
        0x9d7c540c4eb34eb7f125f2b43fd3918d, 0x1b29d1818b5523c0c60dfb3e10655893, 0x437c3c1637525c84edc249fde588c506,
        0x877bc0632c2fa29653b4332d990311fc, 0xa1f7cce8e2b69fae7d919233b0fb5abd, 0x0fe1856d70704af5b48b6d2aac9efd41,
        0xac3236d30e8ea2f472637c2b135b07f5, 0x78002a1d9e7c1e76ce853ef039e18344, 0xb8b6d3f0bc090cf31a6e0868c68014b4,
        0xc261fce621f394afb5e649e92acc27d8, 0xf51cd21b6313f58ae2d9457081f313e6, 0x810d999bcf1d5114065905e42c7fc2fb,
        0xfffb2cca36c6a78a8aee9759661b009f, 0x8820b3beaca00967974ccc4f4429d75d, 0xb09cace3ce1966962b6ec29a24c42524,
        0xd8d77eb12912bed91628f71439ec66b8, 0xbba6ab6bd4cae21e14c260fbb4df002b, 0xf6a13143475b6a3dc57efce3583156c8,
    ],
    [
        0xe122668c9c2c7bb8e4018b5c4711335f, 0x50373667849ce5d4b22247e79b2748e5, 0x5982a4c83b956cd4383ebccd0ac4a84e,
        0xf5a04ef535c80104350205905f0a2fec, 0x46c46043423009f113dea4b987049997, 0xa7e3c342f4662efc26aa16cfa4c1bfa0,
        0x520aebe71106638c6a7640f91269427e, 0xce52ece128e1ceca628f8cbf2a67cee4, 0x196e1fe7c1da2ad7fe249d786fa17d65,
        0xa99e0fbcbc9d8d31b7774bb9a6507c83, 0x4b27146542b6e072343c28ed0e18f380, 0x90e3bfd0d91156f2a3facfcabfe15793,
        0xd360d9a76426a718c813d7724c09481e, 0x667294d8fac4e5bb71cc5f4d680a98b2, 0xc2fd28f9c85a88c9d30887f54f09534d,
        0xf0db651a4ff92d467e6562bd22c93578, 0xbc50d03132aa73f1136d72a2f388f7f9, 0xf8472fefff225f569f09f15c6103e476,
        0x3dd3ad1e601eb83c35e1b14a17f569d1, 0xaa248f97e722388115d6261dda24a3c0, 0x7d8cea24d06c3e4366703c3538866bcd,
        0xef673bc2a136ba2a78540dbaed6a45bb, 0x0330b6a43a113b17a8fc4d4032eeddae, 0xc8ef198d62cdbf2a807d80af93d893f3,
        0xe326d058cca4aa26a1ef4dae039a610f, 0x1651bd9a676a77d4369930fc27ba69c8, 0x6b679acde232e4235234ac91220dff28,
        0x131918b847ff6924aa444e4e8efd4bab, 0x3ad310f56622d666d62c04342b3cc5a5, 0x2edec79aa53a53d562141b46b99b2058,
        0x34e5cb9101446b2b5c499762f7d46abe, 0x52513e22dba808efbb3bf47a94a88f81, 0xc0f29e45315271c45796faf732efc43c,
        0x65e5552f40f61fb208287137f2de45b5, 0xe6197aa1dd4a706defb96091af828a29, 0x67d02f3792a56a458861b9af6acf362c,
        0x73a80fe745b392c3d89660e121e712e4, 0x41a879ac1addfaf71d3b26c53790194e, 0x6f844109900b207dca4617a2d7043979,
        0xd0cb1cad47706002e8b4d35f40e8dcc8, 0x13905117321464b0d3cbbfe943b2eb98, 0x3d5d31d5d5b349214924daa0ba21ba30,
        0xb384cb1abae18e331f3b53a8a49f7d97, 0x511e6eb04095b91d383743139c51a8f2, 0xa6ec01ff36466378b24ad7a03f16fdb9,
        0xce698232d87dfab15cb5b9b53e3cebc8, 0xfbc1cbfcce458d5dfd4185cfba042eea, 0x9108463790bb81d14ac79900ca47cecc,
        0x26bfd320e892875406e5778829379745, 0x1f623849a583a1e7362988bd9009f18c, 0xc9c126e940223f2cd111bae28a01a99d,
        0x26446912691a6dfe437bfe6a9d26e1e9, 0x74a4c62b19e82a089d6d918d808bf579, 0x9921b8b9793e933109500004d54e74eb,
        0xe7cf2900b28e43c5e29b1f39bb93a4d8, 0xf9df17307a9e1265a179ebbb42242f66, 0x20274a8176c96df4816780c0ef70e3df,
        0x4820279fb04ff14e1617f93aead3bba9, 0x65b92e904cfff0c12fffbb08e5ddee37, 0xb1cf02f0f40139dad4786c00c1a048d6,
        0x9b4de5e819f0345a80ad8c0c38d1b945, 0x74399521e8dec010cf78fedd0cacdef0, 0x759bd308ba3b2f781207f6a7699f2d16,
        0x1e11c605797dfaf3d9889678cd3a2405, 0xac9f2be9042607db49f27e9877f17355, 0x824c314328aef398060428811fb5d4b0,
    ],
];

#[rustfmt::skip]
pub const MDS_FULL: [[u128; STATE_SIZE]; STATE_SIZE] = [
    [0x5, 0x7, 0x1, 0x3],
    [0x4, 0x6, 0x1, 0x1],
    [0x1, 0x3, 0x5, 0x7],
    [0x1, 0x1, 0x4, 0x6],
];

#[rustfmt::skip]
pub const MDS_PARTIAL: [[u128; STATE_SIZE]; STATE_SIZE] = [
    [0x20, 0x00000001, 0x00000001, 0x00000001],
    [0x00000001, 0x2000, 0x00000001, 0x00000001],
    [0x00000001, 0x00000001, 0x200, 0x00000001],
    [0x00000001, 0x00000001, 0x00000001, 0x800],
];

#[cfg(test)]
mod tests {
    use super::*;
    use jetsam_core::TowerField;

    #[test]
    fn test_permutation_deterministic() {
        let perm = Poseidon2bPermutation;
        let mut state1 = [Block128::ONE, Block128::ZERO, Block128::ONE, Block128::ZERO];
        let mut state2 = state1;
        perm.permute_mut(&mut state1);
        perm.permute_mut(&mut state2);
        assert_eq!(state1, state2);
    }

    #[test]
    fn test_permutation_changes_state() {
        let perm = Poseidon2bPermutation;
        let mut state = [Block128::ONE, Block128::ZERO, Block128::ONE, Block128::ZERO];
        let original = state;
        perm.permute_mut(&mut state);
        assert_ne!(state, original);
    }

    #[test]
    fn test_sbox_x7_basic() {
        let x = Block128::from(2u8);
        let x7 = sbox_x7(x);
        let manual = tower_sbox_x7_reference(x);
        assert_eq!(x7, manual);
    }

    #[test]
    fn flat_permutation_matches_tower_reference() {
        let perm = Poseidon2bPermutation;
        let fixtures = [
            [
                Block128::ZERO,
                Block128::ZERO,
                Block128::ZERO,
                Block128::ZERO,
            ],
            [Block128::ONE, Block128::ZERO, Block128::ONE, Block128::ZERO],
            [
                Block128(0x0123_4567_89ab_cdef_fedc_ba98_7654_3210),
                Block128(0xffff_0000_ffff_0000_aaaa_5555_aaaa_5555),
                Block128(0x1111_2222_3333_4444_5555_6666_7777_8888),
                Block128(0xdead_beef_cafe_babe_0123_4567_89ab_cdef),
            ],
        ];

        for mut actual in fixtures {
            let mut expected = actual;
            perm.permute_mut(&mut actual);
            permute_mut_tower_reference(&mut expected);
            assert_eq!(actual, expected);
        }
    }

    fn permute_mut_tower_reference(state: &mut [Block128; STATE_SIZE]) {
        apply_mds_full_tower_reference(state);
        for (r, _) in ROUND_CONSTANTS[0].iter().enumerate() {
            if !(F_ROUNDS / 2..F_ROUNDS / 2 + P_ROUNDS).contains(&r) {
                for i in 0..STATE_SIZE {
                    state[i] += Block128::from(ROUND_CONSTANTS[i][r]);
                }
                for elem in state.iter_mut() {
                    *elem = tower_sbox_x7_reference(*elem);
                }
                apply_mds_full_tower_reference(state);
            } else {
                state[0] += Block128::from(ROUND_CONSTANTS[0][r]);
                state[0] = tower_sbox_x7_reference(state[0]);
                apply_mds_partial_tower_reference(state);
            }
        }
    }

    fn apply_mds_full_tower_reference(state: &mut [Block128; STATE_SIZE]) {
        let input = *state;
        for i in 0..STATE_SIZE {
            let mut out = Block128::ZERO;
            for j in 0..STATE_SIZE {
                if MDS_FULL[i][j] == 1 {
                    out += input[j];
                } else {
                    out += Block128::from(MDS_FULL[i][j]) * input[j];
                }
            }
            state[i] = out;
        }
    }

    fn apply_mds_partial_tower_reference(state: &mut [Block128; STATE_SIZE]) {
        let input = *state;
        for i in 0..STATE_SIZE {
            let mut out = Block128::ZERO;
            for j in 0..STATE_SIZE {
                if MDS_PARTIAL[i][j] == 1 {
                    out += input[j];
                } else {
                    out += Block128::from(MDS_PARTIAL[i][j]) * input[j];
                }
            }
            state[i] = out;
        }
    }

    fn tower_sbox_x7_reference(x: Block128) -> Block128 {
        let x2 = x * x;
        let x4 = x2 * x2;
        let x3 = x2 * x;
        x4 * x3
    }
}
