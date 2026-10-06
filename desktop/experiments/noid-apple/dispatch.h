// SPDX-License-Identifier: Apache-2.0
#pragma once
#include "core.h"

// Plain 32-bit fields deliberately have identical C++ / Metal layout.
struct Request { Prepared prepared; U nonce; W count; };

// Reject the WHOLE range if any candidate would carry into the namespace.
// Count is bounded to prevent unbounded allocations and dispatch latencies.
static inline bool validRange(U nonce, W count) {
    if (count == 0 || count > 1048576u) return false;
    W last = nonce.x + count - 1;
    return nonce.y != 0xffffffffu || last >= nonce.x;
}

static inline U nonceAt(U nonce, W index) {
    W previous = nonce.x;
    nonce.x += index;
    nonce.y += nonce.x < previous;
    return nonce;
}

#ifndef __METAL_VERSION__
static_assert(sizeof(W) == 4 && sizeof(U) == 16, "32-bit word ABI required");
static_assert(sizeof(State) == 64 && sizeof(Prepared) == 144, "Prepared ABI mismatch");
static_assert(sizeof(Digest) == 32 && sizeof(Request) == 164, "Metal request ABI mismatch");
#endif
