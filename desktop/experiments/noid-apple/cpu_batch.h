// SPDX-License-Identifier: Apache-2.0
// Four independent states, following the schedule in upstream batch_aarch64.rs.
// This is a candidate optimization; speed must be measured on actual hardware.
#pragma once
#include "core.h"

static inline void permute4(State* states) {
    for (W g = 0; g < 4; ++g) mix(states[g], true);
    for (W r = 0; r < 66; ++r) {
        bool full = r < 4 || r >= 62;
        for (W g = 0; g < 4; ++g)
            for (W i = 0; i < (full ? 4u : 1u); ++i)
                states[g].v[i] = sbox(gx(states[g].v[i], RC[i][r]));
        for (W g = 0; g < 4; ++g) mix(states[g], full);
    }
}

static inline void hashPrepared4(const Prepared& p, const U* nonces, Digest* out) {
    State states[4];
    for (W g = 0; g < 4; ++g) {
        states[g] = p.prefix;
        states[g].v[0] = gx(states[g].v[0], basis(nonces[g], T2F));
        states[g].v[1] = gx(states[g].v[1], p.suffix[0]);
    }
    permute4(states);
    for (W i = 1; i < 5; i += 2) {
        for (W g = 0; g < 4; ++g) {
            states[g].v[0] = gx(states[g].v[0], p.suffix[i]);
            states[g].v[1] = gx(states[g].v[1], p.suffix[i + 1]);
        }
        permute4(states);
    }
    for (W g = 0; g < 4; ++g)
        out[g] = {basis(states[g].v[0], F2T), basis(states[g].v[1], F2T)};
}
