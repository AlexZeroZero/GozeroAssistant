// SPDX-License-Identifier: GPL-3.0-only
// Generated from Gozero/Midstate WGSL consensus compression. Do not edit.
struct Hash { unsigned x0; unsigned x1; unsigned x2; unsigned x3; unsigned x4; unsigned x5; unsigned x6; unsigned x7; };
__device__ __forceinline__ unsigned rotr(unsigned x,unsigned n) { return __funnelshift_r(x,x,n); }
__device__ __forceinline__ Hash iterate(Hash h) { 
    unsigned v0 = 0x6A09E667u; unsigned v1 = 0xBB67AE85u; unsigned v2 = 0x3C6EF372u; unsigned v3 = 0xA54FF53Au;
    unsigned v4 = 0x510E527Fu; unsigned v5 = 0x9B05688Cu; unsigned v6 = 0x1F83D9ABu; unsigned v7 = 0x5BE0CD19u;
    unsigned v8 = 0x6A09E667u; unsigned v9 = 0xBB67AE85u; unsigned v10 = 0x3C6EF372u; unsigned v11 = 0xA54FF53Au;
    unsigned v12 = 0u; unsigned v13 = 0u; unsigned v14 = 32u; unsigned v15 = 11u;
  // round 0
  v0 = v0 + v4 + h.x0; v12 = rotr(v12 ^ v0, 16u); v8 = v8 + v12; v4 = rotr(v4 ^ v8, 12u);
  v0 = v0 + v4 + h.x1; v12 = rotr(v12 ^ v0, 8u);  v8 = v8 + v12; v4 = rotr(v4 ^ v8, 7u);
  v1 = v1 + v5 + h.x2; v13 = rotr(v13 ^ v1, 16u); v9 = v9 + v13; v5 = rotr(v5 ^ v9, 12u);
  v1 = v1 + v5 + h.x3; v13 = rotr(v13 ^ v1, 8u);  v9 = v9 + v13; v5 = rotr(v5 ^ v9, 7u);
  v2 = v2 + v6 + h.x4; v14 = rotr(v14 ^ v2, 16u); v10 = v10 + v14; v6 = rotr(v6 ^ v10, 12u);
  v2 = v2 + v6 + h.x5; v14 = rotr(v14 ^ v2, 8u);  v10 = v10 + v14; v6 = rotr(v6 ^ v10, 7u);
  v3 = v3 + v7 + h.x6; v15 = rotr(v15 ^ v3, 16u); v11 = v11 + v15; v7 = rotr(v7 ^ v11, 12u);
  v3 = v3 + v7 + h.x7; v15 = rotr(v15 ^ v3, 8u);  v11 = v11 + v15; v7 = rotr(v7 ^ v11, 7u);
  v0 = v0 + v5 + 0u; v15 = rotr(v15 ^ v0, 16u); v10 = v10 + v15; v5 = rotr(v5 ^ v10, 12u);
  v0 = v0 + v5 + 0u; v15 = rotr(v15 ^ v0, 8u);  v10 = v10 + v15; v5 = rotr(v5 ^ v10, 7u);
  v1 = v1 + v6 + 0u; v12 = rotr(v12 ^ v1, 16u); v11 = v11 + v12; v6 = rotr(v6 ^ v11, 12u);
  v1 = v1 + v6 + 0u; v12 = rotr(v12 ^ v1, 8u);  v11 = v11 + v12; v6 = rotr(v6 ^ v11, 7u);
  v2 = v2 + v7 + 0u; v13 = rotr(v13 ^ v2, 16u); v8 = v8 + v13; v7 = rotr(v7 ^ v8, 12u);
  v2 = v2 + v7 + 0u; v13 = rotr(v13 ^ v2, 8u);  v8 = v8 + v13; v7 = rotr(v7 ^ v8, 7u);
  v3 = v3 + v4 + 0u; v14 = rotr(v14 ^ v3, 16u); v9 = v9 + v14; v4 = rotr(v4 ^ v9, 12u);
  v3 = v3 + v4 + 0u; v14 = rotr(v14 ^ v3, 8u);  v9 = v9 + v14; v4 = rotr(v4 ^ v9, 7u);
  // round 1
  v0 = v0 + v4 + h.x2; v12 = rotr(v12 ^ v0, 16u); v8 = v8 + v12; v4 = rotr(v4 ^ v8, 12u);
  v0 = v0 + v4 + h.x6; v12 = rotr(v12 ^ v0, 8u);  v8 = v8 + v12; v4 = rotr(v4 ^ v8, 7u);
  v1 = v1 + v5 + h.x3; v13 = rotr(v13 ^ v1, 16u); v9 = v9 + v13; v5 = rotr(v5 ^ v9, 12u);
  v1 = v1 + v5 + 0u; v13 = rotr(v13 ^ v1, 8u);  v9 = v9 + v13; v5 = rotr(v5 ^ v9, 7u);
  v2 = v2 + v6 + h.x7; v14 = rotr(v14 ^ v2, 16u); v10 = v10 + v14; v6 = rotr(v6 ^ v10, 12u);
  v2 = v2 + v6 + h.x0; v14 = rotr(v14 ^ v2, 8u);  v10 = v10 + v14; v6 = rotr(v6 ^ v10, 7u);
  v3 = v3 + v7 + h.x4; v15 = rotr(v15 ^ v3, 16u); v11 = v11 + v15; v7 = rotr(v7 ^ v11, 12u);
  v3 = v3 + v7 + 0u; v15 = rotr(v15 ^ v3, 8u);  v11 = v11 + v15; v7 = rotr(v7 ^ v11, 7u);
  v0 = v0 + v5 + h.x1; v15 = rotr(v15 ^ v0, 16u); v10 = v10 + v15; v5 = rotr(v5 ^ v10, 12u);
  v0 = v0 + v5 + 0u; v15 = rotr(v15 ^ v0, 8u);  v10 = v10 + v15; v5 = rotr(v5 ^ v10, 7u);
  v1 = v1 + v6 + 0u; v12 = rotr(v12 ^ v1, 16u); v11 = v11 + v12; v6 = rotr(v6 ^ v11, 12u);
  v1 = v1 + v6 + h.x5; v12 = rotr(v12 ^ v1, 8u);  v11 = v11 + v12; v6 = rotr(v6 ^ v11, 7u);
  v2 = v2 + v7 + 0u; v13 = rotr(v13 ^ v2, 16u); v8 = v8 + v13; v7 = rotr(v7 ^ v8, 12u);
  v2 = v2 + v7 + 0u; v13 = rotr(v13 ^ v2, 8u);  v8 = v8 + v13; v7 = rotr(v7 ^ v8, 7u);
  v3 = v3 + v4 + 0u; v14 = rotr(v14 ^ v3, 16u); v9 = v9 + v14; v4 = rotr(v4 ^ v9, 12u);
  v3 = v3 + v4 + 0u; v14 = rotr(v14 ^ v3, 8u);  v9 = v9 + v14; v4 = rotr(v4 ^ v9, 7u);
  // round 2
  v0 = v0 + v4 + h.x3; v12 = rotr(v12 ^ v0, 16u); v8 = v8 + v12; v4 = rotr(v4 ^ v8, 12u);
  v0 = v0 + v4 + h.x4; v12 = rotr(v12 ^ v0, 8u);  v8 = v8 + v12; v4 = rotr(v4 ^ v8, 7u);
  v1 = v1 + v5 + 0u; v13 = rotr(v13 ^ v1, 16u); v9 = v9 + v13; v5 = rotr(v5 ^ v9, 12u);
  v1 = v1 + v5 + 0u; v13 = rotr(v13 ^ v1, 8u);  v9 = v9 + v13; v5 = rotr(v5 ^ v9, 7u);
  v2 = v2 + v6 + 0u; v14 = rotr(v14 ^ v2, 16u); v10 = v10 + v14; v6 = rotr(v6 ^ v10, 12u);
  v2 = v2 + v6 + h.x2; v14 = rotr(v14 ^ v2, 8u);  v10 = v10 + v14; v6 = rotr(v6 ^ v10, 7u);
  v3 = v3 + v7 + h.x7; v15 = rotr(v15 ^ v3, 16u); v11 = v11 + v15; v7 = rotr(v7 ^ v11, 12u);
  v3 = v3 + v7 + 0u; v15 = rotr(v15 ^ v3, 8u);  v11 = v11 + v15; v7 = rotr(v7 ^ v11, 7u);
  v0 = v0 + v5 + h.x6; v15 = rotr(v15 ^ v0, 16u); v10 = v10 + v15; v5 = rotr(v5 ^ v10, 12u);
  v0 = v0 + v5 + h.x5; v15 = rotr(v15 ^ v0, 8u);  v10 = v10 + v15; v5 = rotr(v5 ^ v10, 7u);
  v1 = v1 + v6 + 0u; v12 = rotr(v12 ^ v1, 16u); v11 = v11 + v12; v6 = rotr(v6 ^ v11, 12u);
  v1 = v1 + v6 + h.x0; v12 = rotr(v12 ^ v1, 8u);  v11 = v11 + v12; v6 = rotr(v6 ^ v11, 7u);
  v2 = v2 + v7 + 0u; v13 = rotr(v13 ^ v2, 16u); v8 = v8 + v13; v7 = rotr(v7 ^ v8, 12u);
  v2 = v2 + v7 + 0u; v13 = rotr(v13 ^ v2, 8u);  v8 = v8 + v13; v7 = rotr(v7 ^ v8, 7u);
  v3 = v3 + v4 + 0u; v14 = rotr(v14 ^ v3, 16u); v9 = v9 + v14; v4 = rotr(v4 ^ v9, 12u);
  v3 = v3 + v4 + h.x1; v14 = rotr(v14 ^ v3, 8u);  v9 = v9 + v14; v4 = rotr(v4 ^ v9, 7u);
  // round 3
  v0 = v0 + v4 + 0u; v12 = rotr(v12 ^ v0, 16u); v8 = v8 + v12; v4 = rotr(v4 ^ v8, 12u);
  v0 = v0 + v4 + h.x7; v12 = rotr(v12 ^ v0, 8u);  v8 = v8 + v12; v4 = rotr(v4 ^ v8, 7u);
  v1 = v1 + v5 + 0u; v13 = rotr(v13 ^ v1, 16u); v9 = v9 + v13; v5 = rotr(v5 ^ v9, 12u);
  v1 = v1 + v5 + 0u; v13 = rotr(v13 ^ v1, 8u);  v9 = v9 + v13; v5 = rotr(v5 ^ v9, 7u);
  v2 = v2 + v6 + 0u; v14 = rotr(v14 ^ v2, 16u); v10 = v10 + v14; v6 = rotr(v6 ^ v10, 12u);
  v2 = v2 + v6 + h.x3; v14 = rotr(v14 ^ v2, 8u);  v10 = v10 + v14; v6 = rotr(v6 ^ v10, 7u);
  v3 = v3 + v7 + 0u; v15 = rotr(v15 ^ v3, 16u); v11 = v11 + v15; v7 = rotr(v7 ^ v11, 12u);
  v3 = v3 + v7 + 0u; v15 = rotr(v15 ^ v3, 8u);  v11 = v11 + v15; v7 = rotr(v7 ^ v11, 7u);
  v0 = v0 + v5 + h.x4; v15 = rotr(v15 ^ v0, 16u); v10 = v10 + v15; v5 = rotr(v5 ^ v10, 12u);
  v0 = v0 + v5 + h.x0; v15 = rotr(v15 ^ v0, 8u);  v10 = v10 + v15; v5 = rotr(v5 ^ v10, 7u);
  v1 = v1 + v6 + 0u; v12 = rotr(v12 ^ v1, 16u); v11 = v11 + v12; v6 = rotr(v6 ^ v11, 12u);
  v1 = v1 + v6 + h.x2; v12 = rotr(v12 ^ v1, 8u);  v11 = v11 + v12; v6 = rotr(v6 ^ v11, 7u);
  v2 = v2 + v7 + h.x5; v13 = rotr(v13 ^ v2, 16u); v8 = v8 + v13; v7 = rotr(v7 ^ v8, 12u);
  v2 = v2 + v7 + 0u; v13 = rotr(v13 ^ v2, 8u);  v8 = v8 + v13; v7 = rotr(v7 ^ v8, 7u);
  v3 = v3 + v4 + h.x1; v14 = rotr(v14 ^ v3, 16u); v9 = v9 + v14; v4 = rotr(v4 ^ v9, 12u);
  v3 = v3 + v4 + h.x6; v14 = rotr(v14 ^ v3, 8u);  v9 = v9 + v14; v4 = rotr(v4 ^ v9, 7u);
  // round 4
  v0 = v0 + v4 + 0u; v12 = rotr(v12 ^ v0, 16u); v8 = v8 + v12; v4 = rotr(v4 ^ v8, 12u);
  v0 = v0 + v4 + 0u; v12 = rotr(v12 ^ v0, 8u);  v8 = v8 + v12; v4 = rotr(v4 ^ v8, 7u);
  v1 = v1 + v5 + 0u; v13 = rotr(v13 ^ v1, 16u); v9 = v9 + v13; v5 = rotr(v5 ^ v9, 12u);
  v1 = v1 + v5 + 0u; v13 = rotr(v13 ^ v1, 8u);  v9 = v9 + v13; v5 = rotr(v5 ^ v9, 7u);
  v2 = v2 + v6 + 0u; v14 = rotr(v14 ^ v2, 16u); v10 = v10 + v14; v6 = rotr(v6 ^ v10, 12u);
  v2 = v2 + v6 + 0u; v14 = rotr(v14 ^ v2, 8u);  v10 = v10 + v14; v6 = rotr(v6 ^ v10, 7u);
  v3 = v3 + v7 + 0u; v15 = rotr(v15 ^ v3, 16u); v11 = v11 + v15; v7 = rotr(v7 ^ v11, 12u);
  v3 = v3 + v7 + 0u; v15 = rotr(v15 ^ v3, 8u);  v11 = v11 + v15; v7 = rotr(v7 ^ v11, 7u);
  v0 = v0 + v5 + h.x7; v15 = rotr(v15 ^ v0, 16u); v10 = v10 + v15; v5 = rotr(v5 ^ v10, 12u);
  v0 = v0 + v5 + h.x2; v15 = rotr(v15 ^ v0, 8u);  v10 = v10 + v15; v5 = rotr(v5 ^ v10, 7u);
  v1 = v1 + v6 + h.x5; v12 = rotr(v12 ^ v1, 16u); v11 = v11 + v12; v6 = rotr(v6 ^ v11, 12u);
  v1 = v1 + v6 + h.x3; v12 = rotr(v12 ^ v1, 8u);  v11 = v11 + v12; v6 = rotr(v6 ^ v11, 7u);
  v2 = v2 + v7 + h.x0; v13 = rotr(v13 ^ v2, 16u); v8 = v8 + v13; v7 = rotr(v7 ^ v8, 12u);
  v2 = v2 + v7 + h.x1; v13 = rotr(v13 ^ v2, 8u);  v8 = v8 + v13; v7 = rotr(v7 ^ v8, 7u);
  v3 = v3 + v4 + h.x6; v14 = rotr(v14 ^ v3, 16u); v9 = v9 + v14; v4 = rotr(v4 ^ v9, 12u);
  v3 = v3 + v4 + h.x4; v14 = rotr(v14 ^ v3, 8u);  v9 = v9 + v14; v4 = rotr(v4 ^ v9, 7u);
  // round 5
  v0 = v0 + v4 + 0u; v12 = rotr(v12 ^ v0, 16u); v8 = v8 + v12; v4 = rotr(v4 ^ v8, 12u);
  v0 = v0 + v4 + 0u; v12 = rotr(v12 ^ v0, 8u);  v8 = v8 + v12; v4 = rotr(v4 ^ v8, 7u);
  v1 = v1 + v5 + 0u; v13 = rotr(v13 ^ v1, 16u); v9 = v9 + v13; v5 = rotr(v5 ^ v9, 12u);
  v1 = v1 + v5 + h.x5; v13 = rotr(v13 ^ v1, 8u);  v9 = v9 + v13; v5 = rotr(v5 ^ v9, 7u);
  v2 = v2 + v6 + 0u; v14 = rotr(v14 ^ v2, 16u); v10 = v10 + v14; v6 = rotr(v6 ^ v10, 12u);
  v2 = v2 + v6 + 0u; v14 = rotr(v14 ^ v2, 8u);  v10 = v10 + v14; v6 = rotr(v6 ^ v10, 7u);
  v3 = v3 + v7 + 0u; v15 = rotr(v15 ^ v3, 16u); v11 = v11 + v15; v7 = rotr(v7 ^ v11, 12u);
  v3 = v3 + v7 + h.x1; v15 = rotr(v15 ^ v3, 8u);  v11 = v11 + v15; v7 = rotr(v7 ^ v11, 7u);
  v0 = v0 + v5 + 0u; v15 = rotr(v15 ^ v0, 16u); v10 = v10 + v15; v5 = rotr(v5 ^ v10, 12u);
  v0 = v0 + v5 + h.x3; v15 = rotr(v15 ^ v0, 8u);  v10 = v10 + v15; v5 = rotr(v5 ^ v10, 7u);
  v1 = v1 + v6 + h.x0; v12 = rotr(v12 ^ v1, 16u); v11 = v11 + v12; v6 = rotr(v6 ^ v11, 12u);
  v1 = v1 + v6 + 0u; v12 = rotr(v12 ^ v1, 8u);  v11 = v11 + v12; v6 = rotr(v6 ^ v11, 7u);
  v2 = v2 + v7 + h.x2; v13 = rotr(v13 ^ v2, 16u); v8 = v8 + v13; v7 = rotr(v7 ^ v8, 12u);
  v2 = v2 + v7 + h.x6; v13 = rotr(v13 ^ v2, 8u);  v8 = v8 + v13; v7 = rotr(v7 ^ v8, 7u);
  v3 = v3 + v4 + h.x4; v14 = rotr(v14 ^ v3, 16u); v9 = v9 + v14; v4 = rotr(v4 ^ v9, 12u);
  v3 = v3 + v4 + h.x7; v14 = rotr(v14 ^ v3, 8u);  v9 = v9 + v14; v4 = rotr(v4 ^ v9, 7u);
  // round 6
  v0 = v0 + v4 + 0u; v12 = rotr(v12 ^ v0, 16u); v8 = v8 + v12; v4 = rotr(v4 ^ v8, 12u);
  v0 = v0 + v4 + 0u; v12 = rotr(v12 ^ v0, 8u);  v8 = v8 + v12; v4 = rotr(v4 ^ v8, 7u);
  v1 = v1 + v5 + h.x5; v13 = rotr(v13 ^ v1, 16u); v9 = v9 + v13; v5 = rotr(v5 ^ v9, 12u);
  v1 = v1 + v5 + h.x0; v13 = rotr(v13 ^ v1, 8u);  v9 = v9 + v13; v5 = rotr(v5 ^ v9, 7u);
  v2 = v2 + v6 + h.x1; v14 = rotr(v14 ^ v2, 16u); v10 = v10 + v14; v6 = rotr(v6 ^ v10, 12u);
  v2 = v2 + v6 + 0u; v14 = rotr(v14 ^ v2, 8u);  v10 = v10 + v14; v6 = rotr(v6 ^ v10, 7u);
  v3 = v3 + v7 + 0u; v15 = rotr(v15 ^ v3, 16u); v11 = v11 + v15; v7 = rotr(v7 ^ v11, 12u);
  v3 = v3 + v7 + h.x6; v15 = rotr(v15 ^ v3, 8u);  v11 = v11 + v15; v7 = rotr(v7 ^ v11, 7u);
  v0 = v0 + v5 + 0u; v15 = rotr(v15 ^ v0, 16u); v10 = v10 + v15; v5 = rotr(v5 ^ v10, 12u);
  v0 = v0 + v5 + 0u; v15 = rotr(v15 ^ v0, 8u);  v10 = v10 + v15; v5 = rotr(v5 ^ v10, 7u);
  v1 = v1 + v6 + h.x2; v12 = rotr(v12 ^ v1, 16u); v11 = v11 + v12; v6 = rotr(v6 ^ v11, 12u);
  v1 = v1 + v6 + 0u; v12 = rotr(v12 ^ v1, 8u);  v11 = v11 + v12; v6 = rotr(v6 ^ v11, 7u);
  v2 = v2 + v7 + h.x3; v13 = rotr(v13 ^ v2, 16u); v8 = v8 + v13; v7 = rotr(v7 ^ v8, 12u);
  v2 = v2 + v7 + h.x4; v13 = rotr(v13 ^ v2, 8u);  v8 = v8 + v13; v7 = rotr(v7 ^ v8, 7u);
  v3 = v3 + v4 + h.x7; v14 = rotr(v14 ^ v3, 16u); v9 = v9 + v14; v4 = rotr(v4 ^ v9, 12u);
  v3 = v3 + v4 + 0u; v14 = rotr(v14 ^ v3, 8u);  v9 = v9 + v14; v4 = rotr(v4 ^ v9, 7u);
    return Hash{v0 ^ v8, v1 ^ v9, v2 ^ v10, v3 ^ v11, v4 ^ v12, v5 ^ v13, v6 ^ v14, v7 ^ v15}; }
extern "C" __global__ void mds_step_u1(unsigned* __restrict__ state,unsigned n,unsigned iters) {
    unsigned gid=blockIdx.x*blockDim.x+threadIdx.x;
    if(gid>=n)return;
    Hash h={state[0*n+gid], state[1*n+gid], state[2*n+gid], state[3*n+gid], state[4*n+gid], state[5*n+gid], state[6*n+gid], state[7*n+gid]};
    // Startup measurements select scheduling on the actual GPU. All variants
    // execute the same chain, including a non-divisible final remainder.
    #pragma unroll 1
    for(unsigned i=0;i<iters;++i)h=iterate(h);
    state[0*n+gid]=h.x0;
    state[1*n+gid]=h.x1;
    state[2*n+gid]=h.x2;
    state[3*n+gid]=h.x3;
    state[4*n+gid]=h.x4;
    state[5*n+gid]=h.x5;
    state[6*n+gid]=h.x6;
    state[7*n+gid]=h.x7;
}

extern "C" __global__ void mds_step_u2(unsigned* __restrict__ state,unsigned n,unsigned iters) {
    unsigned gid=blockIdx.x*blockDim.x+threadIdx.x;
    if(gid>=n)return;
    Hash h={state[0*n+gid], state[1*n+gid], state[2*n+gid], state[3*n+gid], state[4*n+gid], state[5*n+gid], state[6*n+gid], state[7*n+gid]};
    // Startup measurements select scheduling on the actual GPU. All variants
    // execute the same chain, including a non-divisible final remainder.
    #pragma unroll 2
    for(unsigned i=0;i<iters;++i)h=iterate(h);
    state[0*n+gid]=h.x0;
    state[1*n+gid]=h.x1;
    state[2*n+gid]=h.x2;
    state[3*n+gid]=h.x3;
    state[4*n+gid]=h.x4;
    state[5*n+gid]=h.x5;
    state[6*n+gid]=h.x6;
    state[7*n+gid]=h.x7;
}

extern "C" __global__ void mds_step_u4(unsigned* __restrict__ state,unsigned n,unsigned iters) {
    unsigned gid=blockIdx.x*blockDim.x+threadIdx.x;
    if(gid>=n)return;
    Hash h={state[0*n+gid], state[1*n+gid], state[2*n+gid], state[3*n+gid], state[4*n+gid], state[5*n+gid], state[6*n+gid], state[7*n+gid]};
    // Startup measurements select scheduling on the actual GPU. All variants
    // execute the same chain, including a non-divisible final remainder.
    #pragma unroll 4
    for(unsigned i=0;i<iters;++i)h=iterate(h);
    state[0*n+gid]=h.x0;
    state[1*n+gid]=h.x1;
    state[2*n+gid]=h.x2;
    state[3*n+gid]=h.x3;
    state[4*n+gid]=h.x4;
    state[5*n+gid]=h.x5;
    state[6*n+gid]=h.x6;
    state[7*n+gid]=h.x7;
}

extern "C" __global__ void mds_step_u8(unsigned* __restrict__ state,unsigned n,unsigned iters) {
    unsigned gid=blockIdx.x*blockDim.x+threadIdx.x;
    if(gid>=n)return;
    Hash h={state[0*n+gid], state[1*n+gid], state[2*n+gid], state[3*n+gid], state[4*n+gid], state[5*n+gid], state[6*n+gid], state[7*n+gid]};
    // Startup measurements select scheduling on the actual GPU. All variants
    // execute the same chain, including a non-divisible final remainder.
    #pragma unroll 8
    for(unsigned i=0;i<iters;++i)h=iterate(h);
    state[0*n+gid]=h.x0;
    state[1*n+gid]=h.x1;
    state[2*n+gid]=h.x2;
    state[3*n+gid]=h.x3;
    state[4*n+gid]=h.x4;
    state[5*n+gid]=h.x5;
    state[6*n+gid]=h.x6;
    state[7*n+gid]=h.x7;
}
