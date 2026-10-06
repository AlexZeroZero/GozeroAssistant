// SPDX-License-Identifier: Apache-2.0
// Gozero Apple NOID experimental core. Consensus attribution: NOTICE.
// 32-bit GPU arithmetic, ARM64 PMULL CPU path, cached nonce-independent prefix.
#pragma once
#ifdef __METAL_VERSION__
#include <metal_stdlib>
using namespace metal;
#define GZ_CONSTANT constant
#define GZ_THREAD thread
#define GZ_TABLE constant
typedef uint W;
#else
#define GZ_CONSTANT static const
#define GZ_THREAD
#define GZ_TABLE const
typedef unsigned int W;
#if defined(__aarch64__) && defined(__ARM_FEATURE_CRYPTO) && !defined(GZ_FORCE_PORTABLE)
#include <arm_neon.h>
#define GZ_PMULL 1
#endif
#endif

struct U { W x, y, z, w; };
struct State { U v[4]; };
struct Prepared { State prefix; U suffix[5]; };
struct Digest { U a, b; };
#include "constants.h"

static inline U gx(U a, U b) { return {a.x ^ b.x, a.y ^ b.y, a.z ^ b.z, a.w ^ b.w}; }
static inline W hi(W a, W b) {
#ifdef __METAL_VERSION__
    return mulhi(a, b);
#else
    return W((static_cast<unsigned long long>(a) * b) >> 32);
#endif
}
struct Pair { W lo, hi; };
#if (defined(__METAL_VERSION__) || defined(GZ_TEST_METAL_ARITH)) && !defined(GZ_METAL_BASELINE)
// Three bit planes, spaced three bits apart: each integer product sums at
// most six terms, so carries cannot reach the next retained parity bit.
// 16x16 products fit in 32 bits. Karatsuba avoids GPU mulhi entirely.
static inline W cl16(W a, W b) {
    W a0=a&0x9249u, a1=a&0x2492u, a2=a&0x4924u;
    W b0=b&0x9249u, b1=b&0x2492u, b2=b&0x4924u;
    return ((a0*b0 ^ a1*b2 ^ a2*b1)&0x49249249u)
         | ((a0*b1 ^ a1*b0 ^ a2*b2)&0x92492492u)
         | ((a0*b2 ^ a1*b1 ^ a2*b0)&0x24924924u);
}
static inline Pair cl32(W a, W b) {
    W l=cl16(a,b), h=cl16(a>>16,b>>16);
    W m=cl16((a^(a>>16))&65535u,(b^(b>>16))&65535u)^l^h;
    return {l^(m<<16),h^(m>>16)};
}
#else
// Bit planes prevent integer-product carries crossing the retained parity bits.
static inline Pair cl32(W a, W b) {
    W av[4] = {a & 0x11111111u, a & 0x22222222u, a & 0x44444444u, a & 0x88888888u};
    W bv[4] = {b & 0x11111111u, b & 0x22222222u, b & 0x44444444u, b & 0x88888888u};
    Pair p = {0, 0};
    for (W plane = 0; plane < 4; ++plane) {
        W lo = 0, high = 0;
        for (W i = 0; i < 4; ++i) {
            W j = (plane - i) & 3;
            lo ^= av[i] * bv[j]; high ^= hi(av[i], bv[j]);
        }
        W mask = 0x11111111u << plane;
        p.lo |= lo & mask; p.hi |= high & mask;
    }
    return p;
}
#endif
static inline U cl64(W a0, W a1, W b0, W b1) {
    Pair l = cl32(a0, b0), h = cl32(a1, b1), m = cl32(a0 ^ a1, b0 ^ b1);
    return {l.lo, l.hi ^ m.lo ^ l.lo ^ h.lo, h.lo ^ m.hi ^ l.hi ^ h.hi, h.hi};
}
static inline U reduce(U l, U h) {
    W c = (h.w >> 31) ^ (h.w >> 30) ^ (h.w >> 25);
    return {l.x ^ h.x ^ (h.x << 1) ^ (h.x << 2) ^ (h.x << 7) ^ c ^ (c << 1) ^ (c << 2) ^ (c << 7),
            l.y ^ h.y ^ (h.y << 1) ^ (h.y << 2) ^ (h.y << 7) ^ (h.x >> 31) ^ (h.x >> 30) ^ (h.x >> 25),
            l.z ^ h.z ^ (h.z << 1) ^ (h.z << 2) ^ (h.z << 7) ^ (h.y >> 31) ^ (h.y >> 30) ^ (h.y >> 25),
            l.w ^ h.w ^ (h.w << 1) ^ (h.w << 2) ^ (h.w << 7) ^ (h.z >> 31) ^ (h.z >> 30) ^ (h.z >> 25)};
}
static inline U gm(U a, U b) {
#ifdef GZ_PMULL
    unsigned long long a0 = a.x | (static_cast<unsigned long long>(a.y) << 32);
    unsigned long long a1 = a.z | (static_cast<unsigned long long>(a.w) << 32);
    unsigned long long b0 = b.x | (static_cast<unsigned long long>(b.y) << 32);
    unsigned long long b1 = b.z | (static_cast<unsigned long long>(b.w) << 32);
    uint32x4_t l = vreinterpretq_u32_p128(vmull_p64(a0, b0));
    uint32x4_t h = vreinterpretq_u32_p128(vmull_p64(a1, b1));
    uint32x4_t m = veorq_u32(veorq_u32(vreinterpretq_u32_p128(vmull_p64(a0 ^ a1, b0 ^ b1)), l), h);
    return reduce({vgetq_lane_u32(l,0), vgetq_lane_u32(l,1), vgetq_lane_u32(l,2) ^ vgetq_lane_u32(m,0), vgetq_lane_u32(l,3) ^ vgetq_lane_u32(m,1)},
                  {vgetq_lane_u32(h,0) ^ vgetq_lane_u32(m,2), vgetq_lane_u32(h,1) ^ vgetq_lane_u32(m,3), vgetq_lane_u32(h,2), vgetq_lane_u32(h,3)});
#else
    U l = cl64(a.x,a.y,b.x,b.y), h = cl64(a.z,a.w,b.z,b.w);
    U m = gx(gx(cl64(a.x ^ a.z,a.y ^ a.w,b.x ^ b.z,b.y ^ b.w),l),h);
    return reduce({l.x,l.y,l.z ^ m.x,l.w ^ m.y},{h.x ^ m.z,h.y ^ m.w,h.z,h.w});
#endif
}
static inline W spread16(W x) {
    x &= 65535; x = (x | (x << 8)) & 0x00ff00ffu;
    x = (x | (x << 4)) & 0x0f0f0f0fu;
    x = (x | (x << 2)) & 0x33333333u;
    return (x | (x << 1)) & 0x55555555u;
}
static inline U square(U a) {
    return reduce({spread16(a.x),spread16(a.x >> 16),spread16(a.y),spread16(a.y >> 16)},
                  {spread16(a.z),spread16(a.z >> 16),spread16(a.w),spread16(a.w >> 16)});
}
static inline U linear(U a, W index) {
#ifdef GZ_PMULL
    return gm(a, MDS_COEFFICIENTS[index]);
#else
    U result = {0,0,0,0}; W words[4] = {a.x,a.y,a.z,a.w};
    for (W j = 0; j < 4; ++j)
        for (W i = 0; i < 8; ++i) result = gx(result, LINEAR[index][j * 8 + i][(words[j] >> (i * 4)) & 15]);
    return result;
#endif
}
static inline U basis(U a, GZ_TABLE U* table) {
    U result = {0,0,0,0}; W words[4] = {a.x,a.y,a.z,a.w};
    for (W j = 0; j < 4; ++j)
        for (W i = 0; i < 32; ++i) if ((words[j] >> i) & 1) result = gx(result,table[j * 32 + i]);
    return result;
}
static inline void mix(GZ_THREAD State& s, bool full) {
    if (!full) {
        U sum = gx(gx(s.v[0],s.v[1]),gx(s.v[2],s.v[3]));
        for (W i = 0; i < 4; ++i) s.v[i] = gx(sum,linear(s.v[i],i + 2));
        return;
    }
    U a = s.v[0], b = s.v[1], c = s.v[2], d = s.v[3];
    U a4 = linear(a,1), b2 = linear(b,0), b4 = linear(b,1);
    U c4 = linear(c,1), d2 = linear(d,0), d4 = linear(d,1);
    s.v[0] = gx(gx(gx(a4,a),gx(b4,b2)),gx(gx(b,c),gx(d2,d)));
    s.v[1] = gx(gx(a4,gx(b4,b2)),gx(c,d));
    s.v[2] = gx(gx(a,gx(b2,b)),gx(gx(c4,c),gx(gx(d4,d2),d)));
    s.v[3] = gx(gx(a,b),gx(c4,gx(d4,d2)));
}
static inline U sbox(U x) { U x2 = square(x); return gm(gm(x,x2),square(x2)); }
#if (defined(__METAL_VERSION__) || defined(GZ_TEST_METAL_ARITH)) && !defined(GZ_METAL_BASELINE) && !defined(GZ_METAL_FLAT)
#define GZ_HYBRID_TOWER 1
#include "tower_linear.h"
#endif
static inline void permute(GZ_THREAD State& s) {
    mix(s,true);
#if (defined(__METAL_VERSION__) || defined(GZ_TEST_METAL_ARITH)) && !defined(GZ_METAL_BASELINE)
    // Separate round types so the compiler can specialize state indexing.
    for (W r=0;r<4;++r) {
        for (W i=0;i<4;++i) s.v[i]=sbox(gx(s.v[i],RC[i][r]));
        mix(s,true);
    }
#ifdef GZ_HYBRID_TOWER
    // Only lane zero is nonlinear in the 58 middle rounds. Keep all four
    // lanes in tower coordinates so four dense MDS lookups become sparse
    // shift/XOR maps. Convert only the active S-box lane in each middle round.
    for(W i=0;i<4;++i) s.v[i]=towerBasis(s.v[i],HF2T);
    for(W r=4;r<62;++r) {
        s.v[0]=towerBasis(sbox(gx(towerBasis(s.v[0],HT2F),RC[0][r])),HF2T);
        U sum=gx(gx(s.v[0],s.v[1]),gx(s.v[2],s.v[3]));
        s.v[0]=gx(sum,towerDiagonal0(s.v[0]));s.v[1]=gx(sum,towerDiagonal1(s.v[1]));
        s.v[2]=gx(sum,towerDiagonal2(s.v[2]));s.v[3]=gx(sum,towerDiagonal3(s.v[3]));
    }
    for(W i=0;i<4;++i) s.v[i]=towerBasis(s.v[i],HT2F);
#else
    for (W r=4;r<62;++r) {s.v[0]=sbox(gx(s.v[0],RC[0][r]));mix(s,false);}
#endif
    for (W r=62;r<66;++r) {
        for (W i=0;i<4;++i) s.v[i]=sbox(gx(s.v[i],RC[i][r]));
        mix(s,true);
    }
#else
    for (W r = 0; r < 66; ++r) {
        bool full = r < 4 || r >= 62;
        for (W i = 0; i < (full ? 4u : 1u); ++i) s.v[i] = sbox(gx(s.v[i],RC[i][r]));
        mix(s,full);
    }
#endif
}
static inline Prepared prepare(GZ_THREAD const U* header) {
    Prepared p; p.prefix = {{{0,0,0,0},{0,0,0,0},IV[0],IV[1]}};
    for (W i = 0; i < 10; i += 2) {
        p.prefix.v[0] = gx(p.prefix.v[0],basis(header[i],T2F));
        p.prefix.v[1] = gx(p.prefix.v[1],basis(header[i+1],T2F));
        permute(p.prefix);
    }
    for (W i = 0; i < 5; ++i) p.suffix[i] = basis(header[i+11],T2F);
    return p;
}
static inline Digest hashPrepared(GZ_THREAD const Prepared& p, U nonce) {
    State s = p.prefix;
    s.v[0] = gx(s.v[0],basis(nonce,T2F)); s.v[1] = gx(s.v[1],p.suffix[0]); permute(s);
    for (W i = 1; i < 5; i += 2) { s.v[0] = gx(s.v[0],p.suffix[i]); s.v[1] = gx(s.v[1],p.suffix[i+1]); permute(s); }
    return {basis(s.v[0],F2T),basis(s.v[1],F2T)};
}
static inline bool below(Digest d, Digest target) {
    W a[8] = {d.a.x,d.a.y,d.a.z,d.a.w,d.b.x,d.b.y,d.b.z,d.b.w};
    W b[8] = {target.a.x,target.a.y,target.a.z,target.a.w,target.b.x,target.b.y,target.b.z,target.b.w};
    for (int i = 7; i >= 0; --i) if (a[i] != b[i]) return a[i] < b[i];
    return false;
}
