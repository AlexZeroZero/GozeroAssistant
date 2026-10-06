// SPDX-License-Identifier: Apache-2.0
// Freestanding ABI for independent Python tests, never connects to a pool.
#include "core.h"
#ifdef _WIN32
#define EXPORT extern "C" __declspec(dllexport)
#else
#define EXPORT extern "C"
#endif
EXPORT void gz_mul(const U* a,const U* b,U* out) { *out = gm(*a,*b); }
EXPORT void gz_square(const U* a,U* out) { *out = square(*a); }
EXPORT void gz_basis(const U* a,U* out,W reverse) { *out = basis(*a,reverse ? F2T : T2F); }
EXPORT void gz_permute(State* state) { permute(*state); }
EXPORT void gz_hash(const U* header,Digest* out) { Prepared p = prepare(header); *out = hashPrepared(p,header[10]); }
EXPORT void gz_cached(const U* header,const U* nonce,Digest* out) { Prepared p = prepare(header); *out = hashPrepared(p,*nonce); }
EXPORT int gz_below(const Digest* digest,const Digest* target) { return below(*digest,*target); }
