"""Bounded offline comparison: original loop, larger batches and official kernel.
No wallet, no network mining. GPU throughput only, not pool effective hashrate.
"""
import ctypes as C
import json,os,time,subprocess,hashlib
from pathlib import Path
from validate_cuda import ROOT,bind,check,compile_ptx
workspace=ROOT.parents[2]
reference=(ROOT/'upstream/node-core/gpu/yskar_gpu.cu').read_text(encoding='utf-8')
source='#define YSKAR_NONE 0xffffffffffffffffULL\n__constant__ uint32_t c_mid[8];\n__constant__ uint8_t c_target[32];\n'
source+=reference[reference.index('__global__ void yskar_kernel'):reference.index('/* ------------------------------------------------------- Schnittstelle */')].replace('__global__ void','extern "C" __global__ void')
source+='''
extern "C" __global__ void candidate_stride(uint64_t start,uint32_t count,uint32_t* found,uint64_t* nonces){
 uint32_t stride=blockDim.x*gridDim.x;
 for(uint32_t i=blockIdx.x*blockDim.x+threadIdx.x;i<count;i+=stride){
  uint8_t digest[32];uint64_t nonce=start+i;yskar_hash_nonce(digest,c_mid,nonce);
  if(yskar_meets_target(digest,c_target)){uint32_t slot=atomicAdd(found,1u);if(slot<64)nonces[slot]=nonce;}
 }
}
'''
# Keep the 0.1.0 loop fixed even after production miner.cu changes.
baseline='''
extern "C" __global__ void ysr_prepare(const uint8_t* header,uint32_t* mid){if(threadIdx.x==0&&blockIdx.x==0)yskar_midstate(mid,header);}
extern "C" __global__ void ysr_search(const uint32_t* mid,const uint8_t* target,uint64_t start,uint32_t count,uint32_t* found,uint64_t* nonces){
 uint32_t i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=count)return;
 uint8_t digest[32];uint64_t nonce=start+i;yskar_hash_nonce(digest,mid,nonce);
 if(yskar_meets_target(digest,target)){uint32_t slot=atomicAdd(found,1u);if(slot<64)nonces[slot]=nonce;}
}
'''
ptx=compile_ptx(workspace/'.local/gozer-build/nvrtc13',extra_source=baseline+source)
dll=C.WinDLL(str(Path(os.environ['SystemRoot'])/'System32/nvcuda.dll'))
ptr,u64,uint=C.c_void_p,C.c_uint64,C.c_uint
check(bind(dll,'cuInit',[uint])(0));dev=C.c_int();check(bind(dll,'cuDeviceGet',[C.POINTER(C.c_int),C.c_int])(C.byref(dev),0))
ctx,module=ptr(),ptr();allocations=[]
check(bind(dll,'cuDevicePrimaryCtxRetain',[C.POINTER(ptr),C.c_int])(C.byref(ctx),dev));check(bind(dll,'cuCtxSetCurrent',[ptr])(ctx))
results=[]
try:
 image=C.create_string_buffer(ptx);check(bind(dll,'cuModuleLoadDataEx',[C.POINTER(ptr),ptr,uint,ptr,ptr])(C.byref(module),image,0,None,None))
 sm=C.c_int();check(bind(dll,'cuDeviceGetAttribute',[C.POINTER(C.c_int),C.c_int,C.c_int])(C.byref(sm),16,dev))
 malloc=bind(dll,'cuMemAlloc_v2',[C.POINTER(u64),C.c_size_t]);upload=bind(dll,'cuMemcpyHtoD_v2',[u64,ptr,C.c_size_t]);download=bind(dll,'cuMemcpyDtoH_v2',[ptr,u64,C.c_size_t]);sync=bind(dll,'cuCtxSynchronize',[])
 launch=bind(dll,'cuLaunchKernel',[ptr,uint,uint,uint,uint,uint,uint,uint,ptr,C.POINTER(ptr),ptr])
 def buf(data):
  p=u64();check(malloc(C.byref(p),len(data)));allocations.append(p);put(p,data);return p
 def put(p,data):check(upload(p,C.create_string_buffer(data),len(data)))
 def get(p,n):
  b=C.create_string_buffer(n);check(download(b,p,n));return b.raw
 funcs={}
 def run(name,grid,block,*params):
  if name not in funcs:
   f=ptr();check(bind(dll,'cuModuleGetFunction',[C.POINTER(ptr),ptr,C.c_char_p])(C.byref(f),module,name.encode()));funcs[name]=f
  argv=(ptr*len(params))(*[C.cast(C.pointer(x),ptr) for x in params]);check(launch(funcs[name],grid,1,1,block,1,1,0,None,argv,None));check(sync())
 def symbol(name,data):
  p=u64();size=C.c_size_t();check(bind(dll,'cuModuleGetGlobal_v2',[C.POINTER(u64),C.POINTER(C.c_size_t),ptr,C.c_char_p])(C.byref(p),C.byref(size),module,name.encode()));assert size.value==len(data);put(p,data)
 h=buf(bytes(136));mid=buf(bytes(32));target=buf(bytes(32));found=buf(bytes(4));nonces=buf(bytes(512));one=buf(bytes(8))
 run('ysr_prepare',1,1,h,mid);symbol('c_mid',get(mid,32));symbol('c_target',bytes(32))
 cases=[('baseline-4M','ysr_search',4194304,128),('baseline-64M','ysr_search',67108864,128),('official-grid-stride','yskar_kernel',67108864,256),('candidate-stride-128','candidate_stride',67108864,128),('candidate-stride-256','candidate_stride',67108864,256)]
 for label,name,count,block in cases:
  temp=int(subprocess.check_output(['nvidia-smi','--query-gpu=temperature.gpu','--format=csv,noheader,nounits'],text=True).strip().splitlines()[0]);assert temp<87,('thermal stop',temp)
  grid=(count+block-1)//block if name=='ysr_search' else sm.value*8
  if name=='yskar_kernel':count=(count//(grid*block))*grid*block
  def batch(start):
   if name=='ysr_search':
    put(target,bytes(32));put(found,bytes(4));run(name,grid,block,mid,target,u64(start),uint(count),found,nonces);get(found,4)
   elif name=='yskar_kernel':
    put(one,b'\xff'*8);run(name,grid,block,u64(start),uint(count//(grid*block)),one);get(one,8)
   else:
    put(found,bytes(4));run(name,grid,block,u64(start),uint(count),found,nonces);get(found,4)
  start=0;warm=time.perf_counter()
  while time.perf_counter()-warm<.5:batch(start);start+=count
  at=time.perf_counter();hashes=0
  while time.perf_counter()-at<2:batch(start);start+=count;hashes+=count
  elapsed=time.perf_counter()-at;result={'case':label,'hashes':hashes,'seconds':elapsed,'mhs':hashes/elapsed/1e6,'startTemp':temp};results.append(result);print(json.dumps(result),flush=True)
 (workspace/'.local/yskar-research/batch-comparison.json').write_text(json.dumps({'offline':True,'officialSourceSha256':hashlib.sha256(reference.encode()).hexdigest(),'results':results},indent=2),encoding='utf-8')
finally:
 for p in allocations:bind(dll,'cuMemFree_v2',[u64])(p)
 if module.value:bind(dll,'cuModuleUnload',[ptr])(module)
 bind(dll,'cuDevicePrimaryCtxRelease',[C.c_int])(dev)
