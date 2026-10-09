/* Apple ARM64 platform bridge for public Blocknet PoW (not password hashing).
 * PHC Argon2 compression/consensus parameters are unchanged. */
#include <stdint.h>
#include <stdlib.h>
#include <mach/mach.h>
#include <sys/sysctl.h>
#include "argon2.h"
static _Thread_local uint8_t *workspace;
static const size_t bytes = (size_t)2097152 * 1024;
uint64_t gozero_available(void) {
    vm_statistics64_data_t v; mach_msg_type_number_t n=HOST_VM_INFO64_COUNT;
    mach_port_t host=mach_host_self(); vm_size_t page;
    int ok=host_page_size(host,&page)==KERN_SUCCESS &&
        host_statistics64(host,HOST_VM_INFO64,(host_info64_t)&v,&n)==KERN_SUCCESS;
    mach_port_deallocate(mach_task_self(),host);
    /* free_count includes speculative pages; do not count them twice. */
    return ok?((uint64_t)v.free_count+v.inactive_count)*page:0;
}
uint64_t gozero_total(void) {uint64_t n=0;size_t size=sizeof(n);sysctlbyname("hw.memsize",&n,&size,NULL,0);return n;}
int gozero_prepare(void) {if(workspace)return -1;return posix_memalign((void**)&workspace,64,bytes);}
void gozero_release(void) {free(workspace);workspace=NULL;}
static int alloc(uint8_t **out,size_t n) {*out=n==bytes?workspace:NULL;return *out?0:-1;}
static void release(uint8_t *p,size_t n) {(void)p;(void)n;}
int gozero_hash(const uint8_t *header,uint64_t nonce,uint8_t *out) {
    uint8_t password[8];for(unsigned i=0;i<8;i++)password[i]=(uint8_t)(nonce>>(8*i));
    argon2_context c={0};c.out=out;c.outlen=32;c.pwd=password;c.pwdlen=8;
    c.salt=(uint8_t*)header;c.saltlen=92;c.t_cost=1;c.m_cost=2097152;
    c.lanes=1;c.threads=1;c.version=ARGON2_VERSION_13;c.allocate_cbk=alloc;c.free_cbk=release;
    return argon2_ctx(&c,Argon2_id);
}
