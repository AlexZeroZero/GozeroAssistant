"""Generate and compile the GPLv3 MDS fixed-32-byte BLAKE3 CUDA kernel.
No third-party miner binary/source is used. NVRTC is a build-only dependency.
"""
from pathlib import Path
import argparse,ctypes as C,os,re,subprocess,json,hashlib,shutil
ROOT=Path(__file__).resolve().parent
def generate():
    source=(ROOT.parent/'src/core/gpu_mining.rs').read_text(encoding='utf8')
    body=source.split('fn compress(m: array<u32,16>, block_len: u32) -> array<u32,8> {',1)[1].split('\n}',1)[0]
    body=re.sub(r'\bvar\b','unsigned',body).replace('block_len','32u').replace('FLAGS','11u')
    iv=['6A09E667','BB67AE85','3C6EF372','A54FF53A','510E527F','9B05688C','1F83D9AB','5BE0CD19']
    for i,value in enumerate(iv):body=body.replace(f'IV{i}',f'0x{value}u')
    body=re.sub(r'm\[(\d+)\]',lambda m:f'h.x{m[1]}' if int(m[1])<8 else '0u',body)
    body=body.replace('return array<u32,8>(', 'return Hash{').replace('v7 ^ v15);','v7 ^ v15};')
    fields=' '.join(f'unsigned x{i};' for i in range(8))
    load=', '.join(f'state[{i}*n+gid]' for i in range(8))
    save='\n'.join(f'    state[{i}*n+gid]=h.x{i};' for i in range(8))
    shared=f'''// SPDX-License-Identifier: GPL-3.0-only
// Generated from Gozero/Midstate WGSL consensus compression. Do not edit.
struct Hash {{ {fields} }};
__device__ __forceinline__ unsigned rotr(unsigned x,unsigned n) {{ return __funnelshift_r(x,x,n); }}
__device__ __forceinline__ Hash iterate(Hash h) {{ {body} }}
'''
    kernels=[]
    for unroll in [1,2,4,8]:
        kernels.append(f'''extern "C" __global__ void mds_step_u{unroll}(unsigned* __restrict__ state,unsigned n,unsigned iters) {{
    unsigned gid=blockIdx.x*blockDim.x+threadIdx.x;
    if(gid>=n)return;
    Hash h={{{load}}};
    // Startup measurements select scheduling on the actual GPU. All variants
    // execute the same chain, including a non-divisible final remainder.
    #pragma unroll {unroll}
    for(unsigned i=0;i<iters;++i)h=iterate(h);
{save}
}}
''')
    return reassociate_message_additions(schedule_integer_additions(shared+'\n'.join(kernels)))
def schedule_integer_additions(source):
    # The fourth CUDA argument is a host-supplied constant 1. Keeping this
    # value opaque to ptxas enables an alternate integer instruction schedule.
    # Unsigned modular addition and all 1,000,000 chain rounds are preserved.
    source=source.replace('Hash iterate(Hash h)','Hash iterate(Hash h,unsigned one)').replace('h=iterate(h)','h=iterate(h,one)').replace('unsigned iters) {','unsigned iters,unsigned one) {')
    helper='// Runtime multiplier is supplied as exactly 1 by the host. This compares\n// alternate integer instruction scheduling without changing modular addition.\n__device__ __forceinline__ unsigned madd(unsigned a,unsigned b,unsigned one){unsigned out; asm("mad.lo.u32 %0, %1, %2, %3;":"=r"(out):"r"(b),"r"(one),"r"(a));return out;}\n'
    source=source.replace('__device__ __forceinline__ Hash iterate',helper+'__device__ __forceinline__ Hash iterate')
    return re.sub(r'(v\d+) = (v\d+) \+ (v\d+)( \+ ([^;]+))?;',lambda m:f'{m[1]} = madd({m[2]},{m[3]},one)'+(f' + {m[5]}' if m[5] else '')+';',source)


def reassociate_message_additions(source):
    # Modular uint32 addition is associative. Perform the message addition
    # before the opaque unit-multiplier IMAD to change its dependency schedule.
    # This is not a change to the hash, chain length, nonce or target.
    return re.sub(r'madd\((v\d+),(v\d+),one\) \+ (h\.x\d+)',
                  r'madd(\1 + \3,\2,one)', source)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--nvrtc',type=Path,required=True);a=ap.parse_args()
    source=generate();(ROOT/'mds.cu').write_text(source,encoding='utf8')
    directory=a.nvrtc.resolve()
    script="$ErrorActionPreference='Stop'; foreach($n in @('nvrtc64_130_0.dll','nvrtc-builtins64_130.dll')) { $s=Get-AuthenticodeSignature -LiteralPath (Join-Path $env:MDS_NVRTC $n); if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'O=NVIDIA Corporation') { throw 'Invalid NVIDIA compiler signature' } }"
    subprocess.run([shutil.which('pwsh') or 'powershell.exe','-NoProfile','-NonInteractive','-Command',script],env={**os.environ,'MDS_NVRTC':str(directory)},check=True,capture_output=True)
    def bind(d,name,args):
        f=getattr(d,name);f.argtypes=args;f.restype=C.c_int;return f
    def check(r):
        if r:raise RuntimeError(f'NVRTC error {r}')
    P=C.c_void_p;Z=C.c_size_t
    with os.add_dll_directory(str(directory)):
        builtins=C.WinDLL(str(directory/'nvrtc-builtins64_130.dll'));rtc=C.WinDLL(str(directory/'nvrtc64_130_0.dll'));program=P()
        check(bind(rtc,'nvrtcCreateProgram',[C.POINTER(P),C.c_char_p,C.c_char_p,C.c_int,P,P])(C.byref(program),source.encode(),b'mds.cu',0,None,None))
        opts=[b'--gpu-architecture=compute_80',b'--std=c++17',b'--restrict']
        try:
            result=bind(rtc,'nvrtcCompileProgram',[P,C.c_int,C.POINTER(C.c_char_p)])(program,len(opts),(C.c_char_p*len(opts))(*opts))
            length=Z();check(bind(rtc,'nvrtcGetProgramLogSize',[P,C.POINTER(Z)])(program,C.byref(length)))
            log=C.create_string_buffer(length.value);check(bind(rtc,'nvrtcGetProgramLog',[P,P])(program,log));(ROOT/'compile.log').write_bytes(log.value);check(result)
            check(bind(rtc,'nvrtcGetPTXSize',[P,C.POINTER(Z)])(program,C.byref(length)))
            ptx=C.create_string_buffer(length.value);check(bind(rtc,'nvrtcGetPTX',[P,P])(program,ptx));(ROOT/'mds.ptx').write_bytes(ptx.raw)
            (ROOT/'build.json').write_text(json.dumps({'integerSchedule':'mad-message-first','architecture':'compute_80','chainUnroll':[1,2,4,8],'options':[o.decode() for o in opts],'sourceSha256':hashlib.sha256(source.encode()).hexdigest(),'ptxSha256':hashlib.sha256(ptx.raw).hexdigest(),'compilerSha256':hashlib.sha256((directory/'nvrtc64_130_0.dll').read_bytes()).hexdigest()},indent=2),encoding='utf8')
        finally:bind(rtc,'nvrtcDestroyProgram',[C.POINTER(P)])(C.byref(program))
    print('Built CUDA PTX',len(ptx.raw))
if __name__=='__main__':main()
