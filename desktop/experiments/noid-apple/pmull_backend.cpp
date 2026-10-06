// SPDX-License-Identifier: Apache-2.0
// Separate translation unit: caller MUST check runtime PMULL support first.
#include "cpu_batch.h"
#ifndef GZ_PMULL
#error Compile this unit with ARM crypto enabled
#endif
extern "C" Digest gz_pmull_hash(const Prepared* p, U nonce) { return hashPrepared(*p, nonce); }
extern "C" void gz_pmull_hash4(const Prepared* p, const U* nonces, Digest* out) { hashPrepared4(*p, nonces, out); }
