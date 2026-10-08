/*
 * Argon2 reference source code package - reference C implementations
 *
 * Copyright 2015
 * Daniel Dinu, Dmitry Khovratovich, Jean-Philippe Aumasson, and Samuel Neves
 *
 * You may use this work under the terms of a Creative Commons CC0 1.0
 * License/Waiver or the Apache Public License 2.0, at your option. The terms of
 * these licenses can be found at:
 *
 * - CC0 1.0 Universal : http://creativecommons.org/publicdomain/zero/1.0
 * - Apache 2.0        : http://www.apache.org/licenses/LICENSE-2.0
 *
 * You should have received a copy of both of these licenses along with this
 * software. If not, they may be obtained at the above URLs.
 */

#if !defined(__AVX2__) || defined(__AVX512F__)
#error "stream is an AVX2-only translation unit"
#endif

#include <stdint.h>
#include <string.h>
#include <stdlib.h>

#include "argon2.h"
#include "core.h"

#include "blake2/blake2.h"
#include "blake2/blamka-round-opt.h"

/*
 * Function fills a new memory block and optionally XORs the old block over the new one.
 * Memory must be initialized.
 * @param state Pointer to the just produced block. Content will be updated(!)
 * @param ref_block Pointer to the reference block
 * @param next_block Pointer to the block to be XORed over. May coincide with @ref_block
 * @param with_xor Whether to XOR into the new block (1) or just overwrite (0)
 * @pre all block pointers must be valid
 */
#if defined(__AVX512F__)
static inline __attribute__((always_inline)) void fill_block(__m512i *state, const block *ref_block,
                       block *next_block, int with_xor, const block *memory, uint32_t next_area) {
    __m512i block_XY[ARGON2_512BIT_WORDS_IN_BLOCK];
    unsigned int i;

    if (with_xor) {
        for (i = 0; i < ARGON2_512BIT_WORDS_IN_BLOCK; i++) {
            state[i] = _mm512_xor_si512(
                state[i], _mm512_loadu_si512((const __m512i *)ref_block->v + i));
            block_XY[i] = _mm512_xor_si512(
                state[i], _mm512_loadu_si512((const __m512i *)next_block->v + i));
        }
    } else {
        for (i = 0; i < ARGON2_512BIT_WORDS_IN_BLOCK; i++) {
            block_XY[i] = state[i] = _mm512_xor_si512(
                state[i], _mm512_loadu_si512((const __m512i *)ref_block->v + i));
        }
    }

    for (i = 0; i < 2; ++i) {
        BLAKE2_ROUND_1(
            state[8 * i + 0], state[8 * i + 1], state[8 * i + 2], state[8 * i + 3],
            state[8 * i + 4], state[8 * i + 5], state[8 * i + 6], state[8 * i + 7]);
    }

    for (i = 0; i < 2; ++i) {
        BLAKE2_ROUND_2(
            state[2 * 0 + i], state[2 * 1 + i], state[2 * 2 + i], state[2 * 3 + i],
            state[2 * 4 + i], state[2 * 5 + i], state[2 * 6 + i], state[2 * 7 + i]);
    }

    for (i = 0; i < ARGON2_512BIT_WORDS_IN_BLOCK; i++) {
        state[i] = _mm512_xor_si512(state[i], block_XY[i]);
        _mm512_storeu_si512((__m512i *)next_block->v + i, state[i]);
    }
}
#elif defined(__AVX2__)
static inline __attribute__((always_inline)) void fill_block(__m256i *state, const block *ref_block,
                       block *next_block, int with_xor, const block *memory, uint32_t next_area) {
    __m256i block_XY[ARGON2_HWORDS_IN_BLOCK];
    unsigned int i;

    if (with_xor) {
        for (i = 0; i < ARGON2_HWORDS_IN_BLOCK; i++) {
            state[i] = _mm256_xor_si256(
                state[i], _mm256_loadu_si256((const __m256i *)ref_block->v + i));
            block_XY[i] = _mm256_xor_si256(
                state[i], _mm256_loadu_si256((const __m256i *)next_block->v + i));
        }
    } else {
        for (i = 0; i < ARGON2_HWORDS_IN_BLOCK; i++) {
            block_XY[i] = state[i] = _mm256_xor_si256(
                state[i], _mm256_loadu_si256((const __m256i *)ref_block->v + i));
        }
    }

    for (i = 0; i < 4; ++i) {
        BLAKE2_ROUND_1(state[8 * i + 0], state[8 * i + 4], state[8 * i + 1], state[8 * i + 5],
                       state[8 * i + 2], state[8 * i + 6], state[8 * i + 3], state[8 * i + 7]);
    }

    for (i = 0; i < 4; ++i) {
        BLAKE2_ROUND_2(state[ 0 + i], state[ 4 + i], state[ 8 + i], state[12 + i],
                       state[16 + i], state[20 + i], state[24 + i], state[28 + i]);
        if (i == 0 && next_area) {
            uint64_t x = (uint32_t)_mm256_extract_epi64(
                _mm256_xor_si256(state[0], block_XY[0]), 0);
            uint64_t square = (x * x) >> 32;
            uint32_t index = next_area - 1 - (uint32_t)(((uint64_t)next_area * square) >> 32);
            const char *ptr = (const char *)(memory + index);
            for (unsigned line = 0; line < ARGON2_BLOCK_SIZE; line += 64)
                __builtin_prefetch(ptr + line, 0, 3);
        }
    }

    for (i = 0; i < ARGON2_HWORDS_IN_BLOCK; i++) {
        state[i] = _mm256_xor_si256(state[i], block_XY[i]);
        _mm256_storeu_si256((__m256i *)next_block->v + i, state[i]);
    }
}
#else
static inline __attribute__((always_inline)) void fill_block(__m128i *state, const block *ref_block,
                       block *next_block, int with_xor, const block *memory, uint32_t next_area) {
    __m128i block_XY[ARGON2_OWORDS_IN_BLOCK];
    unsigned int i;

    if (with_xor) {
        for (i = 0; i < ARGON2_OWORDS_IN_BLOCK; i++) {
            state[i] = _mm_xor_si128(
                state[i], _mm_loadu_si128((const __m128i *)ref_block->v + i));
            block_XY[i] = _mm_xor_si128(
                state[i], _mm_loadu_si128((const __m128i *)next_block->v + i));
        }
    } else {
        for (i = 0; i < ARGON2_OWORDS_IN_BLOCK; i++) {
            block_XY[i] = state[i] = _mm_xor_si128(
                state[i], _mm_loadu_si128((const __m128i *)ref_block->v + i));
        }
    }

    for (i = 0; i < 8; ++i) {
        BLAKE2_ROUND(state[8 * i + 0], state[8 * i + 1], state[8 * i + 2],
            state[8 * i + 3], state[8 * i + 4], state[8 * i + 5],
            state[8 * i + 6], state[8 * i + 7]);
    }

    for (i = 0; i < 8; ++i) {
        BLAKE2_ROUND(state[8 * 0 + i], state[8 * 1 + i], state[8 * 2 + i],
            state[8 * 3 + i], state[8 * 4 + i], state[8 * 5 + i],
            state[8 * 6 + i], state[8 * 7 + i]);
    }

    for (i = 0; i < ARGON2_OWORDS_IN_BLOCK; i++) {
        state[i] = _mm_xor_si128(state[i], block_XY[i]);
        _mm_storeu_si128((__m128i *)next_block->v + i, state[i]);
    }
}
#endif

static void next_addresses(block *address_block, block *input_block) {
    /*Temporary zero-initialized blocks*/
#if defined(__AVX512F__)
    __m512i zero_block[ARGON2_512BIT_WORDS_IN_BLOCK];
    __m512i zero2_block[ARGON2_512BIT_WORDS_IN_BLOCK];
#elif defined(__AVX2__)
    __m256i zero_block[ARGON2_HWORDS_IN_BLOCK];
    __m256i zero2_block[ARGON2_HWORDS_IN_BLOCK];
#else
    __m128i zero_block[ARGON2_OWORDS_IN_BLOCK];
    __m128i zero2_block[ARGON2_OWORDS_IN_BLOCK];
#endif

    memset(zero_block, 0, sizeof(zero_block));
    memset(zero2_block, 0, sizeof(zero2_block));

    /*Increasing index counter*/
    input_block->v[6]++;

    /*First iteration of G*/
    fill_block(zero_block, input_block, address_block, 0, NULL, 0);

    /*Second iteration of G*/
    fill_block(zero2_block, address_block, address_block, 0, NULL, 0);
}


/* Fixed p=1/t=1 PoW only. Data-independent addresses depend on parameters,
 * never on the header/nonce, so retain their 32-bit indexes across hashes.
 * Schedule inspiration: Seine v0.2.15 (BSD-3-Clause); compression remains PHC.
 */
static _Thread_local uint32_t *cached_indexes;
static _Thread_local uint32_t cached_blocks;

void gozero_stream_release(void) {
    free(cached_indexes);
    cached_indexes = NULL;
    cached_blocks = 0;
}

static uint32_t reference_index(uint32_t area, uint64_t random) {
    uint64_t x = (uint32_t)random;
    uint64_t square = (x * x) >> 32;
    return area - 1 - (uint32_t)(((uint64_t)area * square) >> 32);
}

static int prepare_indexes(const argon2_instance_t *instance) {
    if (cached_indexes && cached_blocks == instance->memory_blocks) return 1;
    gozero_stream_release();
    uint32_t half = instance->memory_blocks / 2;
    cached_indexes = malloc((size_t)half * sizeof(uint32_t));
    if (!cached_indexes) return 0;
    for (uint32_t slice = 0; slice < 2; ++slice) {
        block addresses, input;
        init_block_value(&input, 0);
        input.v[2] = slice;
        input.v[3] = instance->memory_blocks;
        input.v[4] = 1;
        input.v[5] = Argon2_id;
        uint32_t start = slice == 0 ? 2 : 0;
        if (slice == 0) next_addresses(&addresses, &input);
        for (uint32_t i = start; i < instance->segment_length; ++i) {
            if ((i & 127) == 0) next_addresses(&addresses, &input);
            uint32_t at = slice * instance->segment_length + i;
            cached_indexes[at] = reference_index(at - 1, addresses.v[i & 127]);
        }
    }
    cached_blocks = instance->memory_blocks;
    return 1;
}

static void prefetch_block(const block *b) {
    const char *ptr = (const char *)b;
    for (unsigned line = 0; line < ARGON2_BLOCK_SIZE; line += 64)
        __builtin_prefetch(ptr + line, 0, 3);
}

void fill_segment_gozero(const argon2_instance_t *, argon2_position_t);
void fill_segment(const argon2_instance_t *instance, argon2_position_t position) {
    /* Only the bridge's fixed consensus parameters enter this specialization.
     * Allocation failure uses the existing allocation-free specialized path. */
    if (!prepare_indexes(instance)) {
        fill_segment_gozero(instance, position);
        return;
    }
    uint32_t start = position.slice * instance->segment_length;
    uint32_t end = start + instance->segment_length;
    if (position.slice == 0) start = 2;
    __m256i state[ARGON2_HWORDS_IN_BLOCK];
    memcpy(state, instance->memory[start - 1].v, ARGON2_BLOCK_SIZE);
    if (position.slice < 2) {
        for (uint32_t at = start; at < start + 4 && at < end; ++at)
            prefetch_block(instance->memory + cached_indexes[at]);
        for (uint32_t at = start; at < end; ++at) {
            if (at + 4 < end) prefetch_block(instance->memory + cached_indexes[at + 4]);
            fill_block(state, instance->memory + cached_indexes[at],
                       instance->memory + at, 0, NULL, 0);
        }
    } else {
        for (uint32_t at = start; at < end; ++at) {
            uint64_t random = (uint64_t)_mm256_extract_epi64(state[0], 0);
            uint32_t index = reference_index(at - 1, random);
            fill_block(state, instance->memory + index, instance->memory + at,
                       0, instance->memory, at + 1 < end ? at : 0);
        }
    }
}
