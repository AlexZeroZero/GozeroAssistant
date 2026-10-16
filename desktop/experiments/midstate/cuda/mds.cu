// SPDX-License-Identifier: GPL-3.0-only
// Generated from Gozero/Midstate WGSL consensus compression. Do not edit.
struct Hash { unsigned x0; unsigned x1; unsigned x2; unsigned x3; unsigned x4; unsigned x5; unsigned x6; unsigned x7; };
__device__ __forceinline__ unsigned rotr(unsigned x,unsigned n) { return __funnelshift_r(x,x,n); }
// Runtime multiplier is supplied as exactly 1 by the host. This compares
// alternate integer instruction scheduling without changing modular addition.
__device__ __forceinline__ unsigned madd(unsigned a,unsigned b,unsigned one){unsigned out; asm("mad.lo.u32 %0, %1, %2, %3;":"=r"(out):"r"(b),"r"(one),"r"(a));return out;}
__device__ __forceinline__ Hash iterate(Hash h,unsigned one) { 
    unsigned v0 = 0x6A09E667u; unsigned v1 = 0xBB67AE85u; unsigned v2 = 0x3C6EF372u; unsigned v3 = 0xA54FF53Au;
    unsigned v4 = 0x510E527Fu; unsigned v5 = 0x9B05688Cu; unsigned v6 = 0x1F83D9ABu; unsigned v7 = 0x5BE0CD19u;
    unsigned v8 = 0x6A09E667u; unsigned v9 = 0xBB67AE85u; unsigned v10 = 0x3C6EF372u; unsigned v11 = 0xA54FF53Au;
    unsigned v12 = 0u; unsigned v13 = 0u; unsigned v14 = 32u; unsigned v15 = 11u;
  // round 0
  v0 = madd(v0 + h.x0,v4,one); v12 = rotr(v12 ^ v0, 16u); v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 12u);
  v0 = madd(v0 + h.x1,v4,one); v12 = rotr(v12 ^ v0, 8u);  v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 7u);
  v1 = madd(v1 + h.x2,v5,one); v13 = rotr(v13 ^ v1, 16u); v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 12u);
  v1 = madd(v1 + h.x3,v5,one); v13 = rotr(v13 ^ v1, 8u);  v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 7u);
  v2 = madd(v2 + h.x4,v6,one); v14 = rotr(v14 ^ v2, 16u); v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 12u);
  v2 = madd(v2 + h.x5,v6,one); v14 = rotr(v14 ^ v2, 8u);  v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 7u);
  v3 = madd(v3 + h.x6,v7,one); v15 = rotr(v15 ^ v3, 16u); v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 12u);
  v3 = madd(v3 + h.x7,v7,one); v15 = rotr(v15 ^ v3, 8u);  v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 7u);
  v0 = madd(v0,v5,one) + 0u; v15 = rotr(v15 ^ v0, 16u); v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 12u);
  v0 = madd(v0,v5,one) + 0u; v15 = rotr(v15 ^ v0, 8u);  v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 7u);
  v1 = madd(v1,v6,one) + 0u; v12 = rotr(v12 ^ v1, 16u); v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 12u);
  v1 = madd(v1,v6,one) + 0u; v12 = rotr(v12 ^ v1, 8u);  v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 7u);
  v2 = madd(v2,v7,one) + 0u; v13 = rotr(v13 ^ v2, 16u); v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 12u);
  v2 = madd(v2,v7,one) + 0u; v13 = rotr(v13 ^ v2, 8u);  v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 7u);
  v3 = madd(v3,v4,one) + 0u; v14 = rotr(v14 ^ v3, 16u); v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 12u);
  v3 = madd(v3,v4,one) + 0u; v14 = rotr(v14 ^ v3, 8u);  v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 7u);
  // round 1
  v0 = madd(v0 + h.x2,v4,one); v12 = rotr(v12 ^ v0, 16u); v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 12u);
  v0 = madd(v0 + h.x6,v4,one); v12 = rotr(v12 ^ v0, 8u);  v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 7u);
  v1 = madd(v1 + h.x3,v5,one); v13 = rotr(v13 ^ v1, 16u); v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 12u);
  v1 = madd(v1,v5,one) + 0u; v13 = rotr(v13 ^ v1, 8u);  v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 7u);
  v2 = madd(v2 + h.x7,v6,one); v14 = rotr(v14 ^ v2, 16u); v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 12u);
  v2 = madd(v2 + h.x0,v6,one); v14 = rotr(v14 ^ v2, 8u);  v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 7u);
  v3 = madd(v3 + h.x4,v7,one); v15 = rotr(v15 ^ v3, 16u); v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 12u);
  v3 = madd(v3,v7,one) + 0u; v15 = rotr(v15 ^ v3, 8u);  v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 7u);
  v0 = madd(v0 + h.x1,v5,one); v15 = rotr(v15 ^ v0, 16u); v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 12u);
  v0 = madd(v0,v5,one) + 0u; v15 = rotr(v15 ^ v0, 8u);  v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 7u);
  v1 = madd(v1,v6,one) + 0u; v12 = rotr(v12 ^ v1, 16u); v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 12u);
  v1 = madd(v1 + h.x5,v6,one); v12 = rotr(v12 ^ v1, 8u);  v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 7u);
  v2 = madd(v2,v7,one) + 0u; v13 = rotr(v13 ^ v2, 16u); v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 12u);
  v2 = madd(v2,v7,one) + 0u; v13 = rotr(v13 ^ v2, 8u);  v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 7u);
  v3 = madd(v3,v4,one) + 0u; v14 = rotr(v14 ^ v3, 16u); v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 12u);
  v3 = madd(v3,v4,one) + 0u; v14 = rotr(v14 ^ v3, 8u);  v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 7u);
  // round 2
  v0 = madd(v0 + h.x3,v4,one); v12 = rotr(v12 ^ v0, 16u); v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 12u);
  v0 = madd(v0 + h.x4,v4,one); v12 = rotr(v12 ^ v0, 8u);  v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 7u);
  v1 = madd(v1,v5,one) + 0u; v13 = rotr(v13 ^ v1, 16u); v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 12u);
  v1 = madd(v1,v5,one) + 0u; v13 = rotr(v13 ^ v1, 8u);  v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 7u);
  v2 = madd(v2,v6,one) + 0u; v14 = rotr(v14 ^ v2, 16u); v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 12u);
  v2 = madd(v2 + h.x2,v6,one); v14 = rotr(v14 ^ v2, 8u);  v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 7u);
  v3 = madd(v3 + h.x7,v7,one); v15 = rotr(v15 ^ v3, 16u); v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 12u);
  v3 = madd(v3,v7,one) + 0u; v15 = rotr(v15 ^ v3, 8u);  v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 7u);
  v0 = madd(v0 + h.x6,v5,one); v15 = rotr(v15 ^ v0, 16u); v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 12u);
  v0 = madd(v0 + h.x5,v5,one); v15 = rotr(v15 ^ v0, 8u);  v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 7u);
  v1 = madd(v1,v6,one) + 0u; v12 = rotr(v12 ^ v1, 16u); v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 12u);
  v1 = madd(v1 + h.x0,v6,one); v12 = rotr(v12 ^ v1, 8u);  v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 7u);
  v2 = madd(v2,v7,one) + 0u; v13 = rotr(v13 ^ v2, 16u); v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 12u);
  v2 = madd(v2,v7,one) + 0u; v13 = rotr(v13 ^ v2, 8u);  v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 7u);
  v3 = madd(v3,v4,one) + 0u; v14 = rotr(v14 ^ v3, 16u); v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 12u);
  v3 = madd(v3 + h.x1,v4,one); v14 = rotr(v14 ^ v3, 8u);  v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 7u);
  // round 3
  v0 = madd(v0,v4,one) + 0u; v12 = rotr(v12 ^ v0, 16u); v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 12u);
  v0 = madd(v0 + h.x7,v4,one); v12 = rotr(v12 ^ v0, 8u);  v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 7u);
  v1 = madd(v1,v5,one) + 0u; v13 = rotr(v13 ^ v1, 16u); v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 12u);
  v1 = madd(v1,v5,one) + 0u; v13 = rotr(v13 ^ v1, 8u);  v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 7u);
  v2 = madd(v2,v6,one) + 0u; v14 = rotr(v14 ^ v2, 16u); v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 12u);
  v2 = madd(v2 + h.x3,v6,one); v14 = rotr(v14 ^ v2, 8u);  v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 7u);
  v3 = madd(v3,v7,one) + 0u; v15 = rotr(v15 ^ v3, 16u); v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 12u);
  v3 = madd(v3,v7,one) + 0u; v15 = rotr(v15 ^ v3, 8u);  v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 7u);
  v0 = madd(v0 + h.x4,v5,one); v15 = rotr(v15 ^ v0, 16u); v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 12u);
  v0 = madd(v0 + h.x0,v5,one); v15 = rotr(v15 ^ v0, 8u);  v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 7u);
  v1 = madd(v1,v6,one) + 0u; v12 = rotr(v12 ^ v1, 16u); v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 12u);
  v1 = madd(v1 + h.x2,v6,one); v12 = rotr(v12 ^ v1, 8u);  v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 7u);
  v2 = madd(v2 + h.x5,v7,one); v13 = rotr(v13 ^ v2, 16u); v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 12u);
  v2 = madd(v2,v7,one) + 0u; v13 = rotr(v13 ^ v2, 8u);  v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 7u);
  v3 = madd(v3 + h.x1,v4,one); v14 = rotr(v14 ^ v3, 16u); v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 12u);
  v3 = madd(v3 + h.x6,v4,one); v14 = rotr(v14 ^ v3, 8u);  v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 7u);
  // round 4
  v0 = madd(v0,v4,one) + 0u; v12 = rotr(v12 ^ v0, 16u); v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 12u);
  v0 = madd(v0,v4,one) + 0u; v12 = rotr(v12 ^ v0, 8u);  v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 7u);
  v1 = madd(v1,v5,one) + 0u; v13 = rotr(v13 ^ v1, 16u); v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 12u);
  v1 = madd(v1,v5,one) + 0u; v13 = rotr(v13 ^ v1, 8u);  v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 7u);
  v2 = madd(v2,v6,one) + 0u; v14 = rotr(v14 ^ v2, 16u); v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 12u);
  v2 = madd(v2,v6,one) + 0u; v14 = rotr(v14 ^ v2, 8u);  v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 7u);
  v3 = madd(v3,v7,one) + 0u; v15 = rotr(v15 ^ v3, 16u); v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 12u);
  v3 = madd(v3,v7,one) + 0u; v15 = rotr(v15 ^ v3, 8u);  v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 7u);
  v0 = madd(v0 + h.x7,v5,one); v15 = rotr(v15 ^ v0, 16u); v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 12u);
  v0 = madd(v0 + h.x2,v5,one); v15 = rotr(v15 ^ v0, 8u);  v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 7u);
  v1 = madd(v1 + h.x5,v6,one); v12 = rotr(v12 ^ v1, 16u); v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 12u);
  v1 = madd(v1 + h.x3,v6,one); v12 = rotr(v12 ^ v1, 8u);  v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 7u);
  v2 = madd(v2 + h.x0,v7,one); v13 = rotr(v13 ^ v2, 16u); v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 12u);
  v2 = madd(v2 + h.x1,v7,one); v13 = rotr(v13 ^ v2, 8u);  v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 7u);
  v3 = madd(v3 + h.x6,v4,one); v14 = rotr(v14 ^ v3, 16u); v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 12u);
  v3 = madd(v3 + h.x4,v4,one); v14 = rotr(v14 ^ v3, 8u);  v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 7u);
  // round 5
  v0 = madd(v0,v4,one) + 0u; v12 = rotr(v12 ^ v0, 16u); v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 12u);
  v0 = madd(v0,v4,one) + 0u; v12 = rotr(v12 ^ v0, 8u);  v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 7u);
  v1 = madd(v1,v5,one) + 0u; v13 = rotr(v13 ^ v1, 16u); v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 12u);
  v1 = madd(v1 + h.x5,v5,one); v13 = rotr(v13 ^ v1, 8u);  v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 7u);
  v2 = madd(v2,v6,one) + 0u; v14 = rotr(v14 ^ v2, 16u); v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 12u);
  v2 = madd(v2,v6,one) + 0u; v14 = rotr(v14 ^ v2, 8u);  v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 7u);
  v3 = madd(v3,v7,one) + 0u; v15 = rotr(v15 ^ v3, 16u); v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 12u);
  v3 = madd(v3 + h.x1,v7,one); v15 = rotr(v15 ^ v3, 8u);  v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 7u);
  v0 = madd(v0,v5,one) + 0u; v15 = rotr(v15 ^ v0, 16u); v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 12u);
  v0 = madd(v0 + h.x3,v5,one); v15 = rotr(v15 ^ v0, 8u);  v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 7u);
  v1 = madd(v1 + h.x0,v6,one); v12 = rotr(v12 ^ v1, 16u); v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 12u);
  v1 = madd(v1,v6,one) + 0u; v12 = rotr(v12 ^ v1, 8u);  v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 7u);
  v2 = madd(v2 + h.x2,v7,one); v13 = rotr(v13 ^ v2, 16u); v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 12u);
  v2 = madd(v2 + h.x6,v7,one); v13 = rotr(v13 ^ v2, 8u);  v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 7u);
  v3 = madd(v3 + h.x4,v4,one); v14 = rotr(v14 ^ v3, 16u); v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 12u);
  v3 = madd(v3 + h.x7,v4,one); v14 = rotr(v14 ^ v3, 8u);  v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 7u);
  // round 6
  v0 = madd(v0,v4,one) + 0u; v12 = rotr(v12 ^ v0, 16u); v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 12u);
  v0 = madd(v0,v4,one) + 0u; v12 = rotr(v12 ^ v0, 8u);  v8 = madd(v8,v12,one); v4 = rotr(v4 ^ v8, 7u);
  v1 = madd(v1 + h.x5,v5,one); v13 = rotr(v13 ^ v1, 16u); v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 12u);
  v1 = madd(v1 + h.x0,v5,one); v13 = rotr(v13 ^ v1, 8u);  v9 = madd(v9,v13,one); v5 = rotr(v5 ^ v9, 7u);
  v2 = madd(v2 + h.x1,v6,one); v14 = rotr(v14 ^ v2, 16u); v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 12u);
  v2 = madd(v2,v6,one) + 0u; v14 = rotr(v14 ^ v2, 8u);  v10 = madd(v10,v14,one); v6 = rotr(v6 ^ v10, 7u);
  v3 = madd(v3,v7,one) + 0u; v15 = rotr(v15 ^ v3, 16u); v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 12u);
  v3 = madd(v3 + h.x6,v7,one); v15 = rotr(v15 ^ v3, 8u);  v11 = madd(v11,v15,one); v7 = rotr(v7 ^ v11, 7u);
  v0 = madd(v0,v5,one) + 0u; v15 = rotr(v15 ^ v0, 16u); v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 12u);
  v0 = madd(v0,v5,one) + 0u; v15 = rotr(v15 ^ v0, 8u);  v10 = madd(v10,v15,one); v5 = rotr(v5 ^ v10, 7u);
  v1 = madd(v1 + h.x2,v6,one); v12 = rotr(v12 ^ v1, 16u); v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 12u);
  v1 = madd(v1,v6,one) + 0u; v12 = rotr(v12 ^ v1, 8u);  v11 = madd(v11,v12,one); v6 = rotr(v6 ^ v11, 7u);
  v2 = madd(v2 + h.x3,v7,one); v13 = rotr(v13 ^ v2, 16u); v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 12u);
  v2 = madd(v2 + h.x4,v7,one); v13 = rotr(v13 ^ v2, 8u);  v8 = madd(v8,v13,one); v7 = rotr(v7 ^ v8, 7u);
  v3 = madd(v3 + h.x7,v4,one); v14 = rotr(v14 ^ v3, 16u); v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 12u);
  v3 = madd(v3,v4,one) + 0u; v14 = rotr(v14 ^ v3, 8u);  v9 = madd(v9,v14,one); v4 = rotr(v4 ^ v9, 7u);
    return Hash{v0 ^ v8, v1 ^ v9, v2 ^ v10, v3 ^ v11, v4 ^ v12, v5 ^ v13, v6 ^ v14, v7 ^ v15}; }
extern "C" __global__ void mds_step_u1(unsigned* __restrict__ state,unsigned n,unsigned iters,unsigned one) {
    unsigned gid=blockIdx.x*blockDim.x+threadIdx.x;
    if(gid>=n)return;
    Hash h={state[0*n+gid], state[1*n+gid], state[2*n+gid], state[3*n+gid], state[4*n+gid], state[5*n+gid], state[6*n+gid], state[7*n+gid]};
    // Startup measurements select scheduling on the actual GPU. All variants
    // execute the same chain, including a non-divisible final remainder.
    #pragma unroll 1
    for(unsigned i=0;i<iters;++i)h=iterate(h,one);
    state[0*n+gid]=h.x0;
    state[1*n+gid]=h.x1;
    state[2*n+gid]=h.x2;
    state[3*n+gid]=h.x3;
    state[4*n+gid]=h.x4;
    state[5*n+gid]=h.x5;
    state[6*n+gid]=h.x6;
    state[7*n+gid]=h.x7;
}

extern "C" __global__ void mds_step_u2(unsigned* __restrict__ state,unsigned n,unsigned iters,unsigned one) {
    unsigned gid=blockIdx.x*blockDim.x+threadIdx.x;
    if(gid>=n)return;
    Hash h={state[0*n+gid], state[1*n+gid], state[2*n+gid], state[3*n+gid], state[4*n+gid], state[5*n+gid], state[6*n+gid], state[7*n+gid]};
    // Startup measurements select scheduling on the actual GPU. All variants
    // execute the same chain, including a non-divisible final remainder.
    #pragma unroll 2
    for(unsigned i=0;i<iters;++i)h=iterate(h,one);
    state[0*n+gid]=h.x0;
    state[1*n+gid]=h.x1;
    state[2*n+gid]=h.x2;
    state[3*n+gid]=h.x3;
    state[4*n+gid]=h.x4;
    state[5*n+gid]=h.x5;
    state[6*n+gid]=h.x6;
    state[7*n+gid]=h.x7;
}

extern "C" __global__ void mds_step_u4(unsigned* __restrict__ state,unsigned n,unsigned iters,unsigned one) {
    unsigned gid=blockIdx.x*blockDim.x+threadIdx.x;
    if(gid>=n)return;
    Hash h={state[0*n+gid], state[1*n+gid], state[2*n+gid], state[3*n+gid], state[4*n+gid], state[5*n+gid], state[6*n+gid], state[7*n+gid]};
    // Startup measurements select scheduling on the actual GPU. All variants
    // execute the same chain, including a non-divisible final remainder.
    #pragma unroll 4
    for(unsigned i=0;i<iters;++i)h=iterate(h,one);
    state[0*n+gid]=h.x0;
    state[1*n+gid]=h.x1;
    state[2*n+gid]=h.x2;
    state[3*n+gid]=h.x3;
    state[4*n+gid]=h.x4;
    state[5*n+gid]=h.x5;
    state[6*n+gid]=h.x6;
    state[7*n+gid]=h.x7;
}

extern "C" __global__ void mds_step_u8(unsigned* __restrict__ state,unsigned n,unsigned iters,unsigned one) {
    unsigned gid=blockIdx.x*blockDim.x+threadIdx.x;
    if(gid>=n)return;
    Hash h={state[0*n+gid], state[1*n+gid], state[2*n+gid], state[3*n+gid], state[4*n+gid], state[5*n+gid], state[6*n+gid], state[7*n+gid]};
    // Startup measurements select scheduling on the actual GPU. All variants
    // execute the same chain, including a non-divisible final remainder.
    #pragma unroll 8
    for(unsigned i=0;i<iters;++i)h=iterate(h,one);
    state[0*n+gid]=h.x0;
    state[1*n+gid]=h.x1;
    state[2*n+gid]=h.x2;
    state[3*n+gid]=h.x3;
    state[4*n+gid]=h.x4;
    state[5*n+gid]=h.x5;
    state[6*n+gid]=h.x6;
    state[7*n+gid]=h.x7;
}
