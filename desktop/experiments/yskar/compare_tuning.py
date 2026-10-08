"""Bounded offline launch/instruction experiments; never opens a pool session.

Keep production untouched until the measured candidate passes differential tests.
Each launch is bounded and temperature is checked between timed batches.
"""
import ctypes as C
import hashlib
import json
import os
from pathlib import Path
import random
import statistics
import subprocess
import sys
import time
from validate_cuda import ROOT, bind, check, compile_ptx
from generate_fast_sha import generate

workspace = ROOT.parents[2]
pair_mode = '--pair' in sys.argv
out = workspace / ('.local/yskar-research/pair-013.json' if pair_mode else '.local/yskar-research/tuning-013.json')
helpers = '''
__device__ __forceinline__ uint32_t instr_ch(uint32_t a,uint32_t b,uint32_t c){uint32_t r;asm("lop3.b32 %0, %1, %2, %3, 0xca;":"=r"(r):"r"(a),"r"(b),"r"(c));return r;}
__device__ __forceinline__ uint32_t instr_maj(uint32_t a,uint32_t b,uint32_t c){uint32_t r;asm("lop3.b32 %0, %1, %2, %3, 0xe8;":"=r"(r):"r"(a),"r"(b),"r"(c));return r;}
__device__ __forceinline__ uint32_t instr_xor(uint32_t a,uint32_t b,uint32_t c){uint32_t r;asm("lop3.b32 %0, %1, %2, %3, 0x96;":"=r"(r):"r"(a),"r"(b),"r"(c));return r;}
'''

def instruction_source():
    s = generate()
    # Replace only generated, known round expressions; the schedule is unchanged.
    for i in range(64):
        a,b,c,d,e,f,g,h = ['abcdefgh'[(j-i)%8] for j in range(8)]
        s = s.replace(f'(({e}&{f})^(~{e}&{g}))', f'instr_ch({e},{f},{g})')
        s = s.replace(f'(({a}&{b})^({a}&{c})^({b}&{c}))', f'instr_maj({a},{b},{c})')
    return s

base = generate()
lop = instruction_source()
words = base.replace('void gz_hash_nonce(uint8_t out[32]', 'void gz_hash_nonce(uint32_t out[8]')
begin = words.index('  for (int i = 0; i < 8; i++) {\n    out[i*4]')
words = words[:begin] + '  for(int i=0;i<8;i++)out[i]=t[i];\n}\n'
variants = {'base':base, 'lop':lop, 'words':words}
if pair_mode: variants = {'base':base}
source = helpers + '__constant__ uint32_t tune_mid[8];\n__constant__ uint8_t tune_target[32];\n'
for label, body in variants.items():
    source += body.replace('gz_',label+'_')
    kernels = f'''
extern "C" __global__ void verify_{label}(const uint8_t* headers,uint8_t* output,unsigned count){{
 unsigned i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=count)return;
 const uint8_t* h=headers+i*136;uint32_t mid[8];yskar_midstate(mid,h);uint64_t n=0;
 for(int k=0;k<8;k++)n|=((uint64_t)h[128+k])<<(8*k);
 {label}_hash_nonce(output+i*32,mid,n);
}}
extern "C" __global__ void search_{label}(uint64_t start,uint32_t count,uint32_t* found,uint64_t* nonces){{
 uint32_t stride=blockDim.x*gridDim.x;
 for(uint32_t i=blockIdx.x*blockDim.x+threadIdx.x;i<count;i+=stride){{
  uint8_t digest[32];uint64_t nonce=start+i;{label}_hash_nonce(digest,tune_mid,nonce);
  if(yskar_meets_target(digest,tune_target)){{uint32_t slot=atomicAdd(found,1u);if(slot<64)nonces[slot]=nonce;}}
 }}
}}
'''
    if label == 'words':
        kernels = kernels.replace(f'{label}_hash_nonce(output+i*32,mid,n);',f'uint32_t d[8];{label}_hash_nonce(d,mid,n);for(int k=0;k<32;k++)output[i*32+k]=(uint8_t)(d[k/4]>>(24-(k%4)*8));')
        kernels = kernels.replace('uint8_t digest[32];','uint32_t digest[8];').replace('yskar_meets_target(digest,tune_target)','words_meets(digest)')
        source += '''
__device__ __forceinline__ int words_meets(const uint32_t d[8]){
 for(int k=0;k<8;k++){uint32_t t=((uint32_t)tune_target[k*4]<<24)|((uint32_t)tune_target[k*4+1]<<16)|((uint32_t)tune_target[k*4+2]<<8)|tune_target[k*4+3];if(d[k]<t)return 1;if(d[k]>t)return 0;}return 1;
}
'''
    source += kernels
if pair_mode:
    from generate_pair_sha import generate_pair
    source += generate_pair() + '''
extern "C" __global__ void verify_pair(const uint8_t* headers,uint8_t* output,unsigned count){
 unsigned i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=count)return;
 const uint8_t* h=headers+i*136;uint32_t mid[8];yskar_midstate(mid,h);uint64_t n=0;
 for(int k=0;k<8;k++)n|=((uint64_t)h[128+k])<<(8*k);
 uint8_t d[2][32];pair_hash(d,mid,n,~n);
 for(int k=0;k<32;k++){output[i*64+k]=d[0][k];output[i*64+32+k]=d[1][k];}
}
extern "C" __global__ void search_pair(uint64_t start,uint32_t count,uint32_t* found,uint64_t* nonces){
 uint32_t stride=blockDim.x*gridDim.x;
 for(uint32_t i=blockIdx.x*blockDim.x+threadIdx.x;i<count;i+=stride*2){
  uint8_t d[2][32];uint64_t n0=start+i,n1=n0+stride;pair_hash(d,tune_mid,n0,n1);
  if(yskar_meets_target(d[0],tune_target)){uint32_t slot=atomicAdd(found,1u);if(slot<64)nonces[slot]=n0;}
  if(i+stride<count&&yskar_meets_target(d[1],tune_target)){uint32_t slot=atomicAdd(found,1u);if(slot<64)nonces[slot]=n1;}
 }
}
'''
source += 'extern "C" __global__ void prepare(const uint8_t* h,uint32_t* m){if(threadIdx.x==0)yskar_midstate(m,h);}\n'

ptx = compile_ptx(workspace/'.local/gozer-build/nvrtc13',extra_source=source)
dll = C.WinDLL(str(Path(os.environ['SystemRoot'])/'System32/nvcuda.dll'))
ptr,u64,uint = C.c_void_p,C.c_uint64,C.c_uint
check(bind(dll,'cuInit',[uint])(0));dev=C.c_int()
check(bind(dll,'cuDeviceGet',[C.POINTER(C.c_int),C.c_int])(C.byref(dev),0))
ctx,module = ptr(),ptr();allocations=[];results=[]
check(bind(dll,'cuDevicePrimaryCtxRetain',[C.POINTER(ptr),C.c_int])(C.byref(ctx),dev))
check(bind(dll,'cuCtxSetCurrent',[ptr])(ctx))
try:
    image=C.create_string_buffer(ptx)
    check(bind(dll,'cuModuleLoadDataEx',[C.POINTER(ptr),ptr,uint,ptr,ptr])(C.byref(module),image,0,None,None))
    sm=C.c_int();check(bind(dll,'cuDeviceGetAttribute',[C.POINTER(C.c_int),C.c_int,C.c_int])(C.byref(sm),16,dev))
    malloc=bind(dll,'cuMemAlloc_v2',[C.POINTER(u64),C.c_size_t]);upload=bind(dll,'cuMemcpyHtoD_v2',[u64,ptr,C.c_size_t]);download=bind(dll,'cuMemcpyDtoH_v2',[ptr,u64,C.c_size_t]);sync=bind(dll,'cuCtxSynchronize',[])
    launch=bind(dll,'cuLaunchKernel',[ptr,uint,uint,uint,uint,uint,uint,uint,ptr,C.POINTER(ptr),ptr]);funcs={}
    def put(p,data):check(upload(p,C.create_string_buffer(data),len(data)))
    def buf(data):
        p=u64();check(malloc(C.byref(p),len(data)));allocations.append(p);put(p,data);return p
    def get(p,n):
        b=C.create_string_buffer(n);check(download(b,p,n));return b.raw
    def run(name,grid,block,*params):
        if name not in funcs:
            f=ptr();check(bind(dll,'cuModuleGetFunction',[C.POINTER(ptr),ptr,C.c_char_p])(C.byref(f),module,name.encode()));funcs[name]=f
        argv=(ptr*len(params))(*[C.cast(C.pointer(x),ptr) for x in params])
        check(launch(funcs[name],grid,1,1,block,1,1,0,None,argv,None));check(sync())
    def symbol(name,data):
        p=u64();size=C.c_size_t();check(bind(dll,'cuModuleGetGlobal_v2',[C.POINTER(u64),C.POINTER(C.c_size_t),ptr,C.c_char_p])(C.byref(p),C.byref(size),module,name.encode()));assert size.value==len(data);put(p,data)
    def temperature():
        return int(subprocess.check_output(['nvidia-smi','--query-gpu=temperature.gpu','--format=csv,noheader,nounits'],text=True).strip().splitlines()[0])
    def cool():
        begun=time.monotonic()
        while temperature()>79:
            if time.monotonic()-begun>45:raise RuntimeError('GPU cooling timeout')
            time.sleep(1)
    rng=random.Random(2026100702);headers=[rng.randbytes(136) for _ in range(4096)]
    inputs=buf(b''.join(headers));outputs=buf(bytes(len(headers)*32))
    expected=b''.join(hashlib.sha256(hashlib.sha256(h).digest()).digest() for h in headers)
    for label in variants:
        run('verify_'+label,32,128,inputs,outputs,uint(len(headers)))
        assert get(outputs,len(headers)*32)==expected,label
    if pair_mode:
        pair_output=buf(bytes(len(headers)*64));run('verify_pair',32,128,inputs,pair_output,uint(len(headers)))
        pair_expected=b''
        for h0 in headers:
            for h1 in [h0,h0[:128]+bytes(x^255 for x in h0[128:])]:
                pair_expected+=hashlib.sha256(hashlib.sha256(h1).digest()).digest()
        assert get(pair_output,len(headers)*64)==pair_expected,'pair differential'
        variants['pair']=''
    print('4096 independent headers passed for each variant (pair also checks complemented nonce)',flush=True)
    h=buf(headers[0]);mid=buf(bytes(32));found=buf(bytes(4));nonces=buf(bytes(512))
    run('prepare',1,1,h,mid);symbol('tune_mid',get(mid,32));symbol('tune_target',bytes(32))
    count=16777216
    cases=[(label,threads,mult) for label in variants for threads in [64,128,256,512] for mult in [2,4,8,16]]
    rng.shuffle(cases)
    # Repeat in reverse order to reduce launch-order/clock/temperature bias.
    for repeat,order in enumerate([cases,list(reversed(cases))]):
        for label,threads,mult in order:
            cool();name='search_'+label;grid=sm.value*mult
            put(found,bytes(4));run(name,grid,threads,u64(0),uint(count),found,nonces)
            times=[];step=0;begun=time.perf_counter()
            assert temperature()<87,'thermal limit'
            while time.perf_counter()-begun<0.4:
                put(found,bytes(4));start=time.perf_counter()
                run(name,grid,threads,u64(count*(step+1)),uint(count),found,nonces)
                times.append(time.perf_counter()-start)
                step+=1
            regs=C.c_int();local=C.c_int();attr=bind(dll,'cuFuncGetAttribute',[C.POINTER(C.c_int),C.c_int,ptr])
            check(attr(C.byref(regs),4,funcs[name]));check(attr(C.byref(local),3,funcs[name]))
            row={'variant':label,'threads':threads,'blocksPerSm':mult,'repeat':repeat,'mhs':count/statistics.median(times)/1e6,'registers':regs.value,'localBytes':local.value}
            results.append(row);print(json.dumps(row),flush=True)
    out.write_text(json.dumps({'offline':True,'vectorsPerVariant':4096,'results':results},indent=2),encoding='utf-8')
finally:
    for p in allocations:bind(dll,'cuMemFree_v2',[u64])(p)
    if module.value:bind(dll,'cuModuleUnload',[ptr])(module)
    bind(dll,'cuDevicePrimaryCtxRelease',[C.c_int])(dev)
