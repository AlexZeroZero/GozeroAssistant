// Based on Quantus-Network/quantus-miner c7838cbc86f7d74477da1771139f377a8e438072; Apache-2.0.
// Modified by Gozer: added bounded search entry; upstream functions retained.
typedef unsigned int u32;
typedef unsigned long long u64;

#define MAX_HITS 8

struct MiningParams {
    u32 prestate[24];
    u32 start_nonce[16];
    u32 difficulty_target[16];
    u32 dispatch_config[3];
};

const u64 P64 = 0xFFFFFFFF00000001ULL;
const u64 EPS64 = 0xFFFFFFFFULL;
const u32 EPS32 = 0xFFFFFFFFu;

// Round-constant tables carry one extra zero row (RC_INITIAL's last row holds
// the first internal constant in slot 0) so the round loops index them
// without per-round selects.
__constant__ u64 RC_INTERNAL[23] = {
    0x97f7798a784ad863ULL, 0xd1d2bf082f60d4f0ULL, 0x69a377a79f9ad206ULL,
    0xa9d06906a3858e24ULL, 0x295275001eede5b5ULL, 0x5874e441117bd746ULL,
    0x8a084bbba8ed86ccULL, 0x3defd7645cde6425ULL, 0x3998cfe6871cc137ULL,
    0x3e52ef8bca48314aULL, 0x964a209f85dc9eccULL, 0x3fcc9ee82cc4577eULL,
    0x8e79b4a5d0096d6dULL, 0x8492362ad2392556ULL, 0xee72f470262574d6ULL,
    0x1e0e18496da2444aULL, 0x0f3a74bf215eaac6ULL, 0x1b061b76a1c0ded3ULL,
    0x192c42d86803d7a6ULL, 0xf6d49ff997ae0260ULL, 0x3ec372e7a0fa3786ULL,
    0x5538cdf4f23445d3ULL, 0ULL};

__constant__ u64 RC_INITIAL[5][12] = {
    {0xc002e770975b1607ULL, 0xbca51a8dfe14593aULL, 0x72938dfbe774f7f9ULL,
     0xe4f2fe29e03234acULL, 0xd5e0ba2f541b6449ULL, 0xec33b868f3cc46c1ULL,
     0x486dcb55419d475aULL, 0x6c1cb2a358cc24f1ULL, 0xe3f30d509a1436bbULL,
     0xd9a64f068dca7c29ULL, 0xe59b3f57aabba1aeULL, 0x2a3dd4505b478fdcULL},
    {0xada1f8dc7676ed25ULL, 0x2711aa8b5509d516ULL, 0x4ae6acd0c9c92897ULL,
     0x56eb3d6b5256d67aULL, 0x1f7a9d55923bf51eULL, 0x3600427d397a7f68ULL,
     0xe5076df75b72c3d0ULL, 0xfcd59aa12c6090adULL, 0xcd895e8c68b57a9eULL,
     0x41df7ef9d730ae3eULL, 0xee3e2b889abe977dULL, 0xd29bb7edbeb9c405ULL},
    {0x7d5c08eef608e382ULL, 0x89ae889caaf0802cULL, 0xb35a8e976d2af617ULL,
     0xdb14234eafaf5173ULL, 0x78f04462d48b1c98ULL, 0x265293b0e47ce88aULL,
     0x999a649b69b9d32fULL, 0x64b0a186698e01d3ULL, 0xee0b22d0dfae8bb8ULL,
     0x4fd53e50ca04a7eeULL, 0x5762bfe181f25047ULL, 0xf51593e2beb5e3bdULL},
    {0x1e5e2b5760e32477ULL, 0x622462a1f9aaaeedULL, 0xaa284b3ecdb222aeULL,
     0x63c8e72f542bf3fcULL, 0x3ba588cacb43b5e0ULL, 0x23eda6f3c99150ddULL,
     0xaad3bea4baac9a5aULL, 0xe9da8d699b94184aULL, 0xcdb13f4cd93e024cULL,
     0x902cbd0956f655e3ULL, 0x5b4e40ffc759532fULL, 0xde795c20a2357af7ULL},
    {0x97f7798a784ad863ULL, 0ULL, 0ULL, 0ULL, 0ULL, 0ULL, 0ULL, 0ULL, 0ULL, 0ULL,
     0ULL, 0ULL}};

__constant__ u64 RC_TERMINAL[5][12] = {
    {0x7b72c539e0ea4c6eULL, 0x144573dae2ce9976ULL, 0x802028b68f35fc88ULL,
     0x6d36c5022c4fe7c2ULL, 0xa205d0ffa9b9def3ULL, 0xf6e7e38b1ea6ba2fULL,
     0x34f7909ae5258d64ULL, 0xb0464d9d77b97fcaULL, 0x64ddb9d5de7e00a6ULL,
     0x0ed0d75c27975d97ULL, 0x1cbb36f11127338bULL, 0x6673e505cfd0b6baULL},
    {0x605f902830872e01ULL, 0x3fd5eb927e95fe4fULL, 0xe81025b5a24c69cdULL,
     0xf7d0ce75de23f74eULL, 0xf39942b6a8585089ULL, 0x6d808a08f7b71df6ULL,
     0xf8806b6588f49a8bULL, 0x57df2d8c2a32107aULL, 0x16e7c2074d654a2dULL,
     0x213de241fcf33835ULL, 0xb0f2b8905a0976f6ULL, 0xd8e3cf2bbd355417ULL},
    {0xe498691679d9330fULL, 0x763b45d2a3821b28ULL, 0x0908bf65eb0a1f0dULL,
     0x7691eb2d194b24f4ULL, 0x0e43551233ae13b2ULL, 0x93c393dbfc2fe76fULL,
     0x98f607485d48cdeaULL, 0xe3d95f30309819c0ULL, 0x1ef581a93eaf6acfULL,
     0x0b24c1b7a030fca4ULL, 0x624370be5670b327ULL, 0x5f1e28615a11e486ULL},
    {0xfe04051f909e042bULL, 0x7257e5b147fd3803ULL, 0xe6ae134bb82f2e78ULL,
     0x5711fd5cf4784511ULL, 0xf83a42660c08c0bcULL, 0x2cd8c96d9a3ce855ULL,
     0x7d2ffb1bb0e17271ULL, 0x85ae1528caea3811ULL, 0x52a345d5c7adb0b8ULL,
     0x504c4c51f3faee94ULL, 0xbce34a649cfccaf9ULL, 0xe0a3389266fb6dc9ULL},
    {0ULL, 0ULL, 0ULL, 0ULL, 0ULL, 0ULL, 0ULL, 0ULL, 0ULL, 0ULL, 0ULL, 0ULL}};

__constant__ u64 MDS_DIAG[12] = {
    0xc3b6c08e23ba9300ULL, 0xd84b5de94a324fb6ULL, 0x0d0c371c5b35b84fULL,
    0x7964f570e7188037ULL, 0x5daf18bbd996604bULL, 0x6743bc47b9595257ULL,
    0x5528b9362c59bb70ULL, 0xac45e25b7127b68bULL, 0xa2077d7dfbb606b5ULL,
    0xf3faac6faee378aeULL, 0x0c6388b51545e883ULL, 0xd27dbb6944917b60ULL};

// Sum in [0, 2^64) with a single 2^64 -> EPS fold. The fold itself can only
// wrap when both inputs are within 2^32 of 2^64, which reducer outputs never are
// in practice; that case is left uncorrected (see reduce128).
__device__ __forceinline__ u64 gf64_add(u64 a, u64 b) {
    u32 a0 = (u32)a, a1 = (u32)(a >> 32), b0 = (u32)b, b1 = (u32)(b >> 32);
    u32 o0, o1;
    asm("{\n\t"
        ".reg .u32 c;\n\t"
        "add.cc.u32 %0, %2, %4;\n\t"
        "addc.cc.u32 %1, %3, %5;\n\t"
        "addc.u32 c, 0, 0;\n\t"
        "mad.lo.cc.u32 %0, c, %6, %0;\n\t"
        "madc.hi.u32 %1, c, %6, %1;\n\t"
        "}"
        : "=&r"(o0), "=&r"(o1)
        : "r"(a0), "r"(a1), "r"(b0), "r"(b1), "r"(EPS32));
    return ((u64)o1 << 32) | (u64)o0;
}

__device__ __forceinline__ void mul64wide(u64 a, u64 b, u32 &r0, u32 &r1,
                                          u32 &r2, u32 &r3) {
    u64 lo = a * b;
    u64 hi = __umul64hi(a, b);
    r0 = (u32)lo;
    r1 = (u32)(lo >> 32);
    r2 = (u32)hi;
    r3 = (u32)(hi >> 32);
}

// 128 -> 64 bit fold using 2^64 = EPS and 2^96 = -1 (mod p):
//   (r1:r0) + r2*EPS with carry c, then + c*2^32 - (r3 + c).
// The final borrow and the two 32-bit wraps are deliberately not corrected;
// each occurs with probability about 2^-33 per multiply on reducer-distributed
// inputs and shifts the result by +-EPS (mod p). A hash built on a slipped
// value is simply wrong for that nonce, and the host re-verifies every
// candidate on the CPU. This is the same trade as a lazy Montgomery reduction:
// bit-exact results are not required for mining, only for verification.
__device__ __forceinline__ u64 reduce128(u32 r0, u32 r1, u32 r2, u32 r3) {
    u32 o0, o1;
    asm("{\n\t"
        ".reg .u32 c;\n\t"
        "mad.lo.cc.u32 %0, %4, %6, %2;\n\t"
        "madc.hi.cc.u32 %1, %4, %6, %3;\n\t"
        "addc.u32 c, %5, 0;\n\t"
        "addc.u32 %1, %1, 0;\n\t"
        "sub.cc.u32 %0, %0, c;\n\t"
        "subc.u32 %1, %1, 0;\n\t"
        "}"
        : "=&r"(o0), "=&r"(o1)
        : "r"(r0), "r"(r1), "r"(r2), "r"(r3), "r"(EPS32));
    return ((u64)o1 << 32) | (u64)o0;
}

__device__ __forceinline__ u64 gf64_mul(u64 a, u64 b) {
    u32 r0, r1, r2, r3;
    mul64wide(a, b, r0, r1, r2, r3);
    return reduce128(r0, r1, r2, r3);
}

// Three partial products instead of four: (a1:a0)^2 = a0^2 + 2*a0*a1*2^32 + a1^2*2^64.
__device__ __forceinline__ u64 gf64_sqr(u64 a) {
    u32 a0 = (u32)a, a1 = (u32)(a >> 32);
    u64 ll = (u64)a0 * a0;
    u64 lh = (u64)a0 * a1;
    u64 hh = (u64)a1 * a1;
    u64 mid = lh << 1;
    u32 mid_top = (u32)(lh >> 63);
    u32 r0 = (u32)ll, r1, r2, r3;
    asm("{\n\t"
        "add.cc.u32 %0, %3, %4;\n\t"
        "addc.cc.u32 %1, %5, %6;\n\t"
        "addc.u32 %2, %7, %8;\n\t"
        "}"
        : "=&r"(r1), "=&r"(r2), "=&r"(r3)
        : "r"((u32)(ll >> 32)), "r"((u32)mid), "r"((u32)hh),
          "r"((u32)(mid >> 32)), "r"((u32)(hh >> 32)), "r"(mid_top));
    return reduce128(r0, r1, r2, r3);
}

// x^7 with a depth-3 chain: x3 and x4 come from x2 in parallel.
__device__ __forceinline__ u64 gf64_sbox(u64 x) {
    u64 x2 = gf64_sqr(x);
    u64 x3 = gf64_mul(x2, x);
    u64 x4 = gf64_sqr(x2);
    return gf64_mul(x4, x3);
}

__device__ __forceinline__ u64 gf64_canon(u64 a) {
    return a - ((a >= P64) ? P64 : 0ULL);
}

struct Wide {
    u32 l0;
    u32 l1;
    u32 h;
};

__device__ __forceinline__ Wide wide_from(u64 x) {
    Wide w;
    w.l0 = (u32)x;
    w.l1 = (u32)(x >> 32);
    w.h = 0;
    return w;
}

__device__ __forceinline__ void wide_add(Wide &w, u64 x) {
    u32 x0 = (u32)x, x1 = (u32)(x >> 32);
    asm("{\n\t"
        "add.cc.u32 %0, %0, %3;\n\t"
        "addc.cc.u32 %1, %1, %4;\n\t"
        "addc.u32 %2, %2, 0;\n\t"
        "}"
        : "+r"(w.l0), "+r"(w.l1), "+r"(w.h)
        : "r"(x0), "r"(x1));
}

__device__ __forceinline__ void wide_add_wide(Wide &w, const Wide &x) {
    asm("{\n\t"
        "add.cc.u32 %0, %0, %3;\n\t"
        "addc.cc.u32 %1, %1, %4;\n\t"
        "addc.u32 %2, %2, %5;\n\t"
        "}"
        : "+r"(w.l0), "+r"(w.l1), "+r"(w.h)
        : "r"(x.l0), "r"(x.l1), "r"(x.h));
}

// A 96-bit lane is a 128-bit value with a zero top word.
__device__ __forceinline__ u64 wide_reduce(const Wide &w) {
    return reduce128(w.l0, w.l1, w.h, 0u);
}

__device__ __forceinline__ void add128_wide(u32 &r0, u32 &r1, u32 &r2,
                                            u32 &r3, const Wide &w) {
    asm("{\n\t"
        "add.cc.u32 %0, %0, %4;\n\t"
        "addc.cc.u32 %1, %1, %5;\n\t"
        "addc.cc.u32 %2, %2, %6;\n\t"
        "addc.u32 %3, %3, 0;\n\t"
        "}"
        : "+r"(r0), "+r"(r1), "+r"(r2), "+r"(r3)
        : "r"(w.l0), "r"(w.l1), "r"(w.h));
}

// a * b + w as a 128-bit value. The three words of the 96-bit addend ride in
// the 64-bit accumulators of the partial products, so the add costs nothing.
// Requires b < 2^64 - 2^59 (true for MDS_DIAG) and w.h small, so every partial
// sum and the total fit.
__device__ __forceinline__ void mul128_add_wide(u64 a, u64 b, const Wide &w,
                                                u32 &r0, u32 &r1, u32 &r2,
                                                u32 &r3) {
    u32 a0 = (u32)a, a1 = (u32)(a >> 32), b0 = (u32)b, b1 = (u32)(b >> 32);
    u64 w0 = w.l0, w1 = w.l1, w2 = w.h;
    asm("{\n\t"
        ".reg .b64 p0, m, m2, p3;\n\t"
        ".reg .b32 m0, m1, p0h, p3l, p3h, cw;\n\t"
        "mad.wide.u32 p0, %4, %6, %8;\n\t"
        "mad.wide.u32 m, %5, %6, %9;\n\t"
        "mul.wide.u32 m2, %4, %7;\n\t"
        "mad.wide.u32 p3, %5, %7, %10;\n\t"
        "mov.b64 {%0, p0h}, p0;\n\t"
        "mov.b64 {p3l, p3h}, p3;\n\t"
        "add.cc.u64 m, m, m2;\n\t"
        "addc.u32 cw, p3h, 0;\n\t"
        "mov.b64 {m0, m1}, m;\n\t"
        "add.cc.u32 %1, p0h, m0;\n\t"
        "addc.cc.u32 %2, p3l, m1;\n\t"
        "addc.u32 %3, cw, 0;\n\t"
        "}"
        : "=&r"(r0), "=&r"(r1), "=&r"(r2), "=&r"(r3)
        : "r"(a0), "r"(a1), "r"(b0), "r"(b1), "l"(w0), "l"(w1), "l"(w2));
}

__device__ __forceinline__ void ext_layer64(u64 *state, const u64 *rc12) {
    Wide y[12];
    #pragma unroll
    for (int chunk = 0; chunk < 3; chunk++) {
        int o = chunk * 4;
        u64 x0 = state[o];
        u64 x1 = state[o + 1];
        u64 x2 = state[o + 2];
        u64 x3 = state[o + 3];
        Wide t01 = wide_from(x0);
        wide_add(t01, x1);
        Wide t23 = wide_from(x2);
        wide_add(t23, x3);
        Wide t0123 = t01;
        wide_add_wide(t0123, t23);
        Wide t01123 = t0123;
        wide_add(t01123, x1);
        Wide t01233 = t0123;
        wide_add(t01233, x3);
        y[o + 3] = t01233;
        wide_add(y[o + 3], x0);
        wide_add(y[o + 3], x0);
        y[o + 1] = t01123;
        wide_add(y[o + 1], x2);
        wide_add(y[o + 1], x2);
        y[o] = t01123;
        wide_add_wide(y[o], t01);
        y[o + 2] = t01233;
        wide_add_wide(y[o + 2], t23);
    }
    Wide sums[4];
    #pragma unroll
    for (int k = 0; k < 4; k++) {
        sums[k] = y[k];
        wide_add_wide(sums[k], y[k + 4]);
        wide_add_wide(sums[k], y[k + 8]);
    }
    #pragma unroll
    for (int i = 0; i < 12; i++) {
        Wide w = y[i];
        wide_add_wide(w, sums[i % 4]);
        wide_add(w, rc12[i]);
        state[i] = wide_reduce(w);
    }
}

// Software-pipelined internal round. `x` is this round's S-boxed element 0.
// Elements 1..11 are summed before x is needed, element 0's output comes out
// first so the caller can start the next S-box while the other 11 products
// retire, and the unreduced 96-bit row sum (plus rc0 for element 0) rides in
// the multiply accumulators. Returns the new element 0; updates state[1..11].
__device__ __forceinline__ u64 int_round_p(u64 *state, u64 x, u64 rc0) {
    Wide s = wide_from(state[1]);
    #pragma unroll
    for (int i = 2; i < 12; i++) {
        wide_add(s, state[i]);
    }
    wide_add(s, x);
    Wide s0 = s;
    wide_add(s0, rc0);
    u32 r0, r1, r2, r3;
    mul64wide(x, MDS_DIAG[0], r0, r1, r2, r3);
    add128_wide(r0, r1, r2, r3, s0);
    u64 out0 = reduce128(r0, r1, r2, r3);
    #pragma unroll
    for (int i = 1; i < 12; i++) {
        mul64wide(state[i], MDS_DIAG[i], r0, r1, r2, r3);
        add128_wide(r0, r1, r2, r3, s);
        state[i] = reduce128(r0, r1, r2, r3);
    }
    return out0;
}

__device__ __forceinline__ void permute64_after_initial(u64 *state) {
    #pragma unroll 1
    for (int r = 0; r < 4; r++) {
        #pragma unroll
        for (int i = 0; i < 12; i++) {
            state[i] = gf64_sbox(state[i]);
        }
        ext_layer64(state, RC_INITIAL[r + 1]);
    }
    u64 x = gf64_sbox(state[0]);
    #pragma unroll 1
    for (int r = 0; r < 21; r++) {
        x = gf64_sbox(int_round_p(state, x, RC_INTERNAL[r + 1]));
    }
    state[0] = int_round_p(state, x, 0ULL);
    #pragma unroll
    for (int i = 0; i < 12; i++) {
        state[i] = gf64_add(state[i], RC_TERMINAL[0][i]);
    }
    #pragma unroll 1
    for (int r = 0; r < 4; r++) {
        #pragma unroll
        for (int i = 0; i < 12; i++) {
            state[i] = gf64_sbox(state[i]);
        }
        ext_layer64(state, RC_TERMINAL[r + 1]);
    }
}

__device__ __forceinline__ void permute64(u64 *state) {
    ext_layer64(state, RC_INITIAL[0]);
    permute64_after_initial(state);
}

__device__ __forceinline__ void permute64_twice_after_initial(u64 *state) {
    #pragma unroll 1
    for (int pass = 0; pass < 2; pass++) {
        if (pass != 0) {
            ext_layer64(state, RC_INITIAL[0]);
        }
        permute64_after_initial(state);
        if (pass == 0) {
            state[0] = gf64_add(state[0], 1ULL);
            state[1] = gf64_add(state[1], 1ULL);
        }
    }
}

__device__ __forceinline__ u32 bswap32(u32 v) {
    return ((v & 0xFFu) << 24) | ((v & 0xFF00u) << 8) | ((v >> 8) & 0xFF00u) |
           (v >> 24);
}

__device__ __forceinline__ void nonce_from_index(const u32 *nonce_base,
                                                 u32 logical_index,
                                                 u32 *current_nonce) {
    u32 val0 = nonce_base[0];
    u32 sum0 = val0 + logical_index;
    current_nonce[0] = sum0;
    u32 carry = (sum0 < val0) ? 1u : 0u;
    #pragma unroll
    for (int i = 1; i < 8; i++) {
        u32 val = nonce_base[i];
        u32 sum = val + carry;
        current_nonce[i] = sum;
        carry = (sum < val) ? 1u : 0u;
    }
    #pragma unroll
    for (int i = 8; i < 16; i++) {
        current_nonce[i] = nonce_base[i];
    }
}

__device__ __forceinline__ void hash_from_midstate(const u64 *mid,
                                                   const u32 *current_nonce,
                                                   u32 *hash_le) {
    u64 st[12];
    #pragma unroll
    for (int i = 0; i < 12; i++) {
        st[i] = mid[i];
    }
    #pragma unroll
    for (int i = 0; i < 8; i++) {
        st[i] = gf64_add(st[i], (u64)bswap32(current_nonce[7 - i]));
    }
    permute64(st);
    st[0] = gf64_add(st[0], 1ULL);
    st[1] = gf64_add(st[1], 1ULL);
    permute64(st);
    u32 first[8];
    #pragma unroll
    for (int i = 0; i < 4; i++) {
        u64 c = gf64_canon(st[i]);
        first[2 * i] = (u32)(c & EPS64);
        first[2 * i + 1] = (u32)(c >> 32);
    }
    #pragma unroll
    for (int i = 0; i < 8; i++) {
        hash_le[15 - i] = bswap32(first[i]);
    }
    permute64(st);
    #pragma unroll
    for (int i = 0; i < 4; i++) {
        u64 c = gf64_canon(st[i]);
        hash_le[7 - 2 * i] = bswap32((u32)(c & EPS64));
        hash_le[6 - 2 * i] = bswap32((u32)(c >> 32));
    }
}

extern "C" __global__ void __launch_bounds__(256, 4) hash_nonces(u32 *hashes, const u32 *midstate,
                                       const u32 *start_nonce, u32 count) {
    u32 tid = blockIdx.x * blockDim.x + threadIdx.x;
    if (tid >= count) {
        return;
    }
    u64 mid[12];
    #pragma unroll
    for (int i = 0; i < 12; i++) {
        mid[i] = ((u64)midstate[2 * i + 1] << 32) | (u64)midstate[2 * i];
    }
    u32 nonce_base[16];
    #pragma unroll
    for (int i = 0; i < 16; i++) {
        nonce_base[i] = start_nonce[i];
    }
    u32 current_nonce[16];
    nonce_from_index(nonce_base, tid, current_nonce);
    u32 hash_le[16];
    hash_from_midstate(mid, current_nonce, hash_le);
    #pragma unroll
    for (int i = 0; i < 16; i++) {
        hashes[tid * 16u + (u32)i] = hash_le[i];
    }
}

extern "C" __global__ void __launch_bounds__(256, 4) mining_main(u32 *results,
                                       const MiningParams params) {
    u32 thread_id = blockIdx.x * blockDim.x + threadIdx.x;
    u32 total_threads = params.dispatch_config[0];
    u32 nonces_per_thread = params.dispatch_config[1];
    u32 total_nonces = params.dispatch_config[2];
    if (thread_id >= total_threads) {
        return;
    }
    u32 base_index = thread_id * nonces_per_thread;

    u64 mid[12];
    #pragma unroll
    for (int i = 0; i < 12; i++) {
        mid[i] = ((u64)params.prestate[2 * i + 1] << 32) | (u64)params.prestate[2 * i];
    }
    u32 tgt_hi[8];
    #pragma unroll
    for (int i = 0; i < 8; i++) {
        tgt_hi[i] = params.difficulty_target[8 + i];
    }
    u64 nonce_base_low = ((u64)params.start_nonce[1] << 32) |
                         (u64)params.start_nonce[0];

    #pragma unroll

    for (u32 j = 0; j < nonces_per_thread; j++) {
        u32 logical_index = base_index + j;
        if (logical_index >= total_nonces) {
            break;
        }
        u64 st[12];
        #pragma unroll
        for (int i = 0; i < 12; i++) {
            st[i] = mid[i];
        }
        u64 nonce_low = nonce_base_low + (u64)logical_index;
        u64 x6 = (u64)bswap32((u32)(nonce_low >> 32));
        u64 x7 = (u64)bswap32((u32)nonce_low);
        u64 x6_2 = x6 + x6;
        u64 x6_3 = x6_2 + x6;
        u64 x6_4 = x6_2 + x6_2;
        u64 x6_6 = x6_3 + x6_3;
        u64 x7_2 = x7 + x7;
        u64 x7_3 = x7_2 + x7;
        u64 x7_4 = x7_2 + x7_2;
        u64 x7_6 = x7_3 + x7_3;
        u64 c0 = x6 + x7;
        u64 c1 = x6_3 + x7;
        u64 c2 = x6_2 + x7_3;
        u64 c3 = x6 + x7_2;
        st[0] = gf64_add(st[0], c0);
        st[1] = gf64_add(st[1], c1);
        st[2] = gf64_add(st[2], c2);
        st[3] = gf64_add(st[3], c3);
        st[4] = gf64_add(st[4], x6_2 + x7_2);
        st[5] = gf64_add(st[5], x6_6 + x7_2);
        st[6] = gf64_add(st[6], x6_4 + x7_6);
        st[7] = gf64_add(st[7], x6_2 + x7_4);
        st[8] = gf64_add(st[8], c0);
        st[9] = gf64_add(st[9], c1);
        st[10] = gf64_add(st[10], c2);
        st[11] = gf64_add(st[11], c3);
        permute64_twice_after_initial(st);

        u32 first[8];
        #pragma unroll
        for (int i = 0; i < 4; i++) {
            u64 c = gf64_canon(st[i]);
            first[2 * i] = (u32)(c & EPS64);
            first[2 * i + 1] = (u32)(c >> 32);
        }
        u32 cmp = 0u;
        #pragma unroll
        for (int i = 0; i < 8; i++) {
            u32 h = bswap32(first[i]);
            u32 t = tgt_hi[7 - i];
            if (h != t) {
                cmp = (h > t) ? 1u : 2u;
                break;
            }
        }
        if (cmp == 1u) {
            continue;
        }
        // Record the candidate and keep going: no thread ever stops early, so a
        // launch always evaluates its whole rectangle. The host verifies every
        // recorded index on the CPU.
        u32 slot = atomicAdd(&results[0], 1u);
        if (slot < MAX_HITS) {
            results[1 + slot] = logical_index;
        }
    }
}

// Gozer additions 2026-10-02: bounded batches with full 512-bit target comparison.
// The host reuses buffers and inserts cooperative idle time between dispatches.
extern "C" __global__ void gozer_search_reference(u32 *results, const u32 *midstate, const u32 *start_nonce, const u32 *target, u32 count) {
 u32 tid=blockIdx.x*blockDim.x+threadIdx.x;if(tid>=count)return;
 u64 mid[12];for(int i=0;i<12;i++)mid[i]=((u64)midstate[2*i+1]<<32)|midstate[2*i];
 u32 nonce[16],hash[16];nonce_from_index(start_nonce,tid,nonce);hash_from_midstate(mid,nonce,hash);
 bool hit=true;for(int i=15;i>=0;i--){if(hash[i]<target[i])break;if(hash[i]>target[i]){hit=false;break;}}
 if(hit){u32 slot=atomicAdd(&results[0],1u);if(slot<MAX_HITS)results[slot+1]=tid;}
}

// Gozer optimization: compare the high 256 bits before squeezing the low half.
// Most difficult-target rejections avoid one entire Poseidon2 permutation.
// Equality continues through all 512 bits; covered by reference boundary tests.
__device__ __forceinline__ bool gozer_below(const u64 *mid,const u32 *nonce,const u32 *target){
 u64 st[12];for(int i=0;i<12;i++)st[i]=mid[i];
 for(int i=0;i<8;i++)st[i]=gf64_add(st[i],(u64)bswap32(nonce[7-i]));
 permute64(st);st[0]=gf64_add(st[0],1ULL);st[1]=gf64_add(st[1],1ULL);permute64(st);
 for(int i=0;i<4;i++){u64 c=gf64_canon(st[i]);u32 a=bswap32((u32)c),b=bswap32((u32)(c>>32));if(a!=target[15-2*i])return a<target[15-2*i];if(b!=target[14-2*i])return b<target[14-2*i];}
 permute64(st);
 for(int i=0;i<4;i++){u64 c=gf64_canon(st[i]);u32 a=bswap32((u32)c),b=bswap32((u32)(c>>32));if(a!=target[7-2*i])return a<target[7-2*i];if(b!=target[6-2*i])return b<target[6-2*i];}return true;
}
extern "C" __global__ void gozer_search(u32 *results,const u32 *midstate,const u32 *start_nonce,const u32 *target,u32 count){
 u32 tid=blockIdx.x*blockDim.x+threadIdx.x;if(tid>=count)return;u64 mid[12];for(int i=0;i<12;i++)mid[i]=((u64)midstate[2*i+1]<<32)|midstate[2*i];u32 nonce[16];nonce_from_index(start_nonce,tid,nonce);
 if(gozer_below(mid,nonce,target)){u32 slot=atomicAdd(&results[0],1u);if(slot<MAX_HITS)results[slot+1]=tid;}
}
