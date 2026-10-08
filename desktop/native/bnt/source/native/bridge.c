/* Gozero Blocknet PoW bridge. Public block headers/nonces only; NOT a password KDF.
 * Each calling thread owns its reusable, 64-byte-aligned 2 GiB scratch buffer.
 * No global allocator, clock change, driver, privilege or background service.
 */
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif
#include "argon2.h"
#include "core.h"

static _Thread_local uint8_t *workspace;
static _Thread_local size_t workspace_size;
static _Thread_local int selected;
static _Thread_local int page_mode, memory_kind;
static _Thread_local uint32_t numa_node=0xffffffff;
int gozero_enable_large_pages(void);
uint32_t gozero_current_node(void);
void gozero_memory_options(int large_pages,int prefer_numa){page_mode=large_pages;numa_node=prefer_numa?gozero_current_node():0xffffffff;}
int gozero_memory_kind(void){return memory_kind;}
uint32_t gozero_memory_node(void){return numa_node;}

void gozero_stream_release(void);
void fill_segment_stream(const argon2_instance_t *, argon2_position_t);
void fill_segment_sse2(const argon2_instance_t *, argon2_position_t);
void fill_segment_avx2(const argon2_instance_t *, argon2_position_t);
void fill_segment_gozero(const argon2_instance_t *, argon2_position_t);
void fill_segment_prefetch(const argon2_instance_t *, argon2_position_t);
void fill_segment_avx512(const argon2_instance_t *, argon2_position_t);
void fill_segment_gozero512(const argon2_instance_t *, argon2_position_t);
void fill_segment_prefetch512(const argon2_instance_t *, argon2_position_t);

void fill_segment(const argon2_instance_t *inst, argon2_position_t pos) {
    if (selected == 8) fill_segment_stream(inst, pos);
    else if (selected == 7) fill_segment_prefetch512(inst, pos);
    else if (selected == 6) fill_segment_gozero512(inst, pos);
    else if (selected == 5) fill_segment_avx512(inst, pos);
    else if (selected == 4) fill_segment_prefetch(inst, pos);
    else if (selected == 3) fill_segment_gozero(inst, pos);
    else if (selected == 2) fill_segment_avx2(inst, pos);
    else fill_segment_sse2(inst, pos);
}
static int reuse_allocate(uint8_t **out, size_t bytes) {
    *out = bytes == workspace_size ? workspace : NULL;
    return *out ? 0 : -1;
}
static void reuse_free(uint8_t *ptr, size_t bytes) { (void)ptr; (void)bytes; }

void gozero_release(void) {
    /* The stream TU is built with AVX2. Compatibility workers must never
     * enter it, including cleanup on a CPU without AVX2 support. */
    if (selected == 8) gozero_stream_release();
#ifdef _WIN32
    if(memory_kind)VirtualFree(workspace,0,MEM_RELEASE);else _aligned_free(workspace);
#else
    free(workspace);
#endif
    workspace = NULL; workspace_size = 0;memory_kind=0;
}
int gozero_prepare(uint32_t kib, int engine) {
    if (kib < 8 || kib > 2097152 || kib % 4 || engine < 1 || engine > 8) return -1;
    /* Rust gates SIMD on CPU features AND OS-enabled vector register state. */
    size_t bytes = (size_t)kib * 1024;
    if (workspace_size != bytes || !workspace) {
        gozero_release();
#ifdef _WIN32
        DWORD flags=MEM_RESERVE|MEM_COMMIT;
        SIZE_T large=GetLargePageMinimum();
        if(page_mode && large && bytes%large==0 && gozero_enable_large_pages()){
            workspace=numa_node!=0xffffffff?VirtualAllocExNuma(GetCurrentProcess(),NULL,bytes,flags|MEM_LARGE_PAGES,PAGE_READWRITE,numa_node):VirtualAlloc(NULL,bytes,flags|MEM_LARGE_PAGES,PAGE_READWRITE);
            if(workspace)memory_kind=2;
        }
        if(!workspace && numa_node!=0xffffffff){workspace=VirtualAllocExNuma(GetCurrentProcess(),NULL,bytes,flags,PAGE_READWRITE,numa_node);if(workspace)memory_kind=1;}
        if(!workspace)workspace = _aligned_malloc(bytes, 64);
#else
        workspace = aligned_alloc(64, bytes);
#endif
        if (!workspace) return -2;
        workspace_size = bytes;
    }
    selected = engine;
    return 0;
}
int gozero_hash(const uint8_t *header, size_t header_len, uint64_t nonce, uint8_t *out, uint32_t kib) {
    if (!header || !out || header_len != 92 || workspace_size != (size_t)kib * 1024) return -1;
    uint8_t password[8];
    for (unsigned i = 0; i < 8; i++) password[i] = (uint8_t)(nonce >> (8 * i));
    argon2_context c = {0};
    c.out = out; c.outlen = 32; c.pwd = password; c.pwdlen = 8;
    c.salt = (uint8_t *)header; c.saltlen = (uint32_t)header_len;
    c.t_cost = 1; c.m_cost = kib; c.lanes = 1; c.threads = 1;
    c.version = ARGON2_VERSION_13;
    c.allocate_cbk = reuse_allocate; c.free_cbk = reuse_free;
    return argon2_ctx(&c, Argon2_id);
}
