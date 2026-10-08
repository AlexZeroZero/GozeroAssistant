/* Windows CPU-set topology and optional large-page allocation support.
 * No driver, persistent privilege changes, clock settings, or elevation. */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct { uint32_t id; uint16_t group; uint8_t logical, core, cache, numa, efficiency, flags; } cpu_row;
typedef BOOL (WINAPI *cpu_sets_fn)(void*,ULONG,ULONG*,HANDLE,ULONG);

uint32_t gozero_cpu_rows(cpu_row *out, uint32_t capacity) {
    cpu_sets_fn query=(cpu_sets_fn)GetProcAddress(GetModuleHandleA("kernel32.dll"),"GetSystemCpuSetInformation");
    ULONG bytes=0; if(!query)return 0;
    query(NULL,0,&bytes,NULL,0); if(!bytes || bytes>1024*1024)return 0;
    uint8_t *buf=(uint8_t*)malloc(bytes); if(!buf)return 0;
    if(!query(buf,bytes,&bytes,NULL,0)){free(buf);return 0;}
    uint32_t count=0;
    for(ULONG offset=0;offset+8<=bytes;){
        uint32_t size,kind;memcpy(&size,buf+offset,4);memcpy(&kind,buf+offset+4,4);
        if(size<8 || size>bytes-offset)break;
        if(kind==0 && size>=20 && count<capacity){
            cpu_row r;memcpy(&r,buf+offset+8,sizeof(r));
            /* CPU sets exclusively allocated to another process are unavailable. */
            if(!(r.flags&2) || (r.flags&4))out[count++]=r;
        }
        offset+=size;
    }
    free(buf);return count;
}

/* Bind before allocation/first touch. GROUP_AFFINITY handles >64 logical CPUs. */
int gozero_bind(uint16_t group, uint8_t logical){
    if(logical>=64)return 0;
    GROUP_AFFINITY target={0};target.Group=group;target.Mask=((KAFFINITY)1)<<logical;
    return SetThreadGroupAffinity(GetCurrentThread(),&target,NULL)!=0;
}
uint32_t gozero_current_node(void){
    PROCESSOR_NUMBER p;USHORT node=0xffff;GetCurrentProcessorNumberEx(&p);
    return GetNumaProcessorNodeEx(&p,&node)?node:0xffffffff;
}
size_t gozero_large_page_minimum(void){return GetLargePageMinimum();}
int gozero_enable_large_pages(void){
    HANDLE token=NULL;TOKEN_PRIVILEGES privilege={0};
    if(!OpenProcessToken(GetCurrentProcess(),TOKEN_ADJUST_PRIVILEGES|TOKEN_QUERY,&token))return 0;
    privilege.PrivilegeCount=1;
    if(!LookupPrivilegeValueA(NULL,"SeLockMemoryPrivilege",&privilege.Privileges[0].Luid)){CloseHandle(token);return 0;}
    privilege.Privileges[0].Attributes=SE_PRIVILEGE_ENABLED;
    SetLastError(ERROR_SUCCESS);
    BOOL ok=AdjustTokenPrivileges(token,FALSE,&privilege,0,NULL,NULL);
    DWORD error=GetLastError();CloseHandle(token);
    return ok && error==ERROR_SUCCESS;
}
