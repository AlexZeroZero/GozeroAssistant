// SPDX-License-Identifier: Apache-2.0
#include "dispatch.h"

// Hash batches are bounded by the host. Low 64 bits are counter; upper 64
// bits are supplied by the pool verbatim. Only the host changes jobs.

kernel void noid_hash(constant Request& job [[buffer(0)]],
                      device Digest* output [[buffer(1)]], uint index [[thread_position_in_grid]]) {
    if (index >= job.count || !validRange(job.nonce, job.count)) return;
    U nonce = nonceAt(job.nonce, index);
    Prepared p = job.prepared;
    output[index] = hashPrepared(p,nonce);
}

// Unlike returning every digest, pool search only returns matching candidates.
// Overflow is explicit; host must split/retry before advancing its counter.
kernel void noid_search(constant Request& job [[buffer(0)]],
                        constant Digest& target [[buffer(1)]],
                        device U* candidates [[buffer(2)]],
                        device atomic_uint& matches [[buffer(3)]],
                        constant uint& capacity [[buffer(4)]],
                        uint index [[thread_position_in_grid]]) {
    if (index >= job.count || !validRange(job.nonce, job.count)) return;
    U nonce = nonceAt(job.nonce, index);
    Prepared p = job.prepared;
    if (below(hashPrepared(p,nonce),target)) {
        uint slot = atomic_fetch_add_explicit(&matches,1u,memory_order_relaxed);
        if (slot < capacity) candidates[slot] = nonce;
    }
}
