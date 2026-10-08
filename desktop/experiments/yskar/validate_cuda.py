"""Offline GPU differential checks. No wallet, networking or mining session.

Uses the pinned upstream SHA-256d functions, compiled with installed NVIDIA
NVRTC. This is an algorithm check, not a complete yskar-cuda miner build.
"""
import argparse
import ctypes as C
import hashlib
import json
import os
from pathlib import Path
import random
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent


def check(code):
    if code:
        raise RuntimeError('CUDA/NVRTC error ' + str(code))


def bind(dll, name, args):
    fn = getattr(dll, name)
    fn.argtypes, fn.restype = args, C.c_int
    return fn


def compile_ptx(directory, miner=False, extra_source=''):
    script = "$ErrorActionPreference='Stop'; foreach($n in @('nvrtc64_130_0.dll','nvrtc-builtins64_130.dll')) { $s=Get-AuthenticodeSignature -LiteralPath (Join-Path $env:GOZERO_YSKAR_NVRTC $n); if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'O=NVIDIA Corporation') { throw 'NVIDIA compiler signature verification failed' } }"
    subprocess.run([shutil.which('pwsh') or 'powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script],
                   env={**os.environ, 'GOZERO_YSKAR_NVRTC': str(directory)}, check=True, capture_output=True)
    with os.add_dll_directory(str(directory)):
        builtins = C.WinDLL(str(directory / 'nvrtc-builtins64_130.dll'))
        dll = C.WinDLL(str(directory / 'nvrtc64_130_0.dll'))
        create = bind(dll, 'nvrtcCreateProgram', [C.POINTER(C.c_void_p), C.c_char_p, C.c_char_p, C.c_int, C.c_void_p, C.c_void_p])
        compile_fn = bind(dll, 'nvrtcCompileProgram', [C.c_void_p, C.c_int, C.POINTER(C.c_char_p)])
        destroy = bind(dll, 'nvrtcDestroyProgram', [C.POINTER(C.c_void_p)])
        source = (ROOT / 'upstream/node-core/gpu/yskar_sha256.h').read_text(encoding='utf-8')
        source = source.replace('#include <stdint.h>', 'typedef unsigned int uint32_t; typedef unsigned long long uint64_t; typedef unsigned char uint8_t;')
        source = source.replace('__host__ __device__ __forceinline__', '__device__ __forceinline__')
        if miner:
            from generate_fast_sha import generate
            optimized = generate()
            if (ROOT / 'fast_sha.cuh').read_text(encoding='utf-8') != optimized:
                raise RuntimeError('Regenerate fast_sha.cuh before compiling')
            source += optimized
            source += (ROOT / 'miner.cu').read_text(encoding='utf-8').replace('#include "yskar_sha256.h"', '')
        source += extra_source
        source += r'''
extern "C" __global__ void verify_hash(const uint8_t* headers, uint8_t* hashes, unsigned count) {
    unsigned i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i >= count) return;
    const uint8_t* header = headers + i * 136;
    uint32_t mid[8]; yskar_midstate(mid, header);
    uint64_t nonce = 0;
    for (unsigned k = 0; k < 8; ++k) nonce |= ((uint64_t)header[128+k]) << (8*k);
    yskar_hash_nonce(hashes + i*32, mid, nonce);
}
extern "C" __global__ void verify_target(const uint8_t* hashes, const uint8_t* targets, unsigned* output, unsigned count) {
    unsigned i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < count) output[i] = yskar_meets_target(hashes + i*32, targets + i*32);
}
'''
        program = C.c_void_p()
        check(create(C.byref(program), source.encode(), b'yskar_validation.cu', 0, None, None))
        try:
            opts = (C.c_char_p * 2)(b'--gpu-architecture=compute_80', b'--std=c++17')
            result = compile_fn(program, 2, opts)
            length = C.c_size_t()
            check(bind(dll, 'nvrtcGetProgramLogSize', [C.c_void_p, C.POINTER(C.c_size_t)])(program, C.byref(length)))
            log = C.create_string_buffer(length.value)
            check(bind(dll, 'nvrtcGetProgramLog', [C.c_void_p, C.c_void_p])(program, log))
            if result:
                raise RuntimeError(log.value.decode(errors='replace'))
            check(bind(dll, 'nvrtcGetPTXSize', [C.c_void_p, C.POINTER(C.c_size_t)])(program, C.byref(length)))
            ptx = C.create_string_buffer(length.value)
            check(bind(dll, 'nvrtcGetPTX', [C.c_void_p, C.c_void_p])(program, ptx))
            return ptx.raw
        finally:
            destroy(C.byref(program))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--nvrtc', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    meta = json.loads((ROOT / 'provenance.json').read_text())
    for name, expected in meta['files'].items():
        if hashlib.sha256((ROOT / 'upstream' / name).read_bytes()).hexdigest() != expected:
            raise ValueError('Upstream source integrity mismatch: ' + name)
    ptx = compile_ptx(args.nvrtc.resolve())
    dll = C.WinDLL(str(Path(os.environ['SystemRoot']) / 'System32/nvcuda.dll'))
    ptr, u64, uint = C.c_void_p, C.c_uint64, C.c_uint
    check(bind(dll, 'cuInit', [uint])(0))
    device = C.c_int()
    check(bind(dll, 'cuDeviceGet', [C.POINTER(C.c_int), C.c_int])(C.byref(device), 0))
    ctx, module = ptr(), ptr()
    allocations = []
    retain = bind(dll, 'cuDevicePrimaryCtxRetain', [C.POINTER(ptr), C.c_int])
    check(retain(C.byref(ctx), device))
    try:
        check(bind(dll, 'cuCtxSetCurrent', [ptr])(ctx))
        name = C.create_string_buffer(128)
        check(bind(dll, 'cuDeviceGetName', [ptr, C.c_int, C.c_int])(name, 128, device))
        image = C.create_string_buffer(ptx)
        check(bind(dll, 'cuModuleLoadDataEx', [C.POINTER(ptr), ptr, uint, ptr, ptr])(C.byref(module), image, 0, None, None))
        malloc = bind(dll, 'cuMemAlloc_v2', [C.POINTER(u64), C.c_size_t])
        upload = bind(dll, 'cuMemcpyHtoD_v2', [u64, ptr, C.c_size_t])
        download = bind(dll, 'cuMemcpyDtoH_v2', [ptr, u64, C.c_size_t])
        launch = bind(dll, 'cuLaunchKernel', [ptr, uint, uint, uint, uint, uint, uint, uint, ptr, C.POINTER(ptr), ptr])
        sync = bind(dll, 'cuCtxSynchronize', [])

        def buffer(data):
            p = u64()
            check(malloc(C.byref(p), len(data))); allocations.append(p)
            check(upload(p, C.create_string_buffer(data), len(data)))
            return p

        def run(function, params, count):
            f = ptr()
            check(bind(dll, 'cuModuleGetFunction', [C.POINTER(ptr), ptr, C.c_char_p])(C.byref(f), module, function.encode()))
            params = params + [uint(count)]
            argv = (ptr * len(params))(*[C.cast(C.pointer(x), ptr) for x in params])
            check(launch(f, (count+63)//64, 1, 1, 64, 1, 1, 0, None, argv, None)); check(sync())

        # Genesis plus independent deterministic random headers/nonces.
        genesis = bytes.fromhex('010000000000000000000000000000000000000000000000000000000000000000000000'
          '000000001007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840'
          'e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca5780a1a06a'
          '000000000010000001000000000000000000000024bf060300000000')
        rng = random.Random(20261007)
        headers = [genesis] + [rng.randbytes(136) for _ in range(64)]
        expected = b''.join(hashlib.sha256(hashlib.sha256(h).digest()).digest() for h in headers)
        assert expected[:32].hex() == '000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66'
        input_ptr, output_ptr = buffer(b''.join(headers)), buffer(bytes(len(expected)))
        run('verify_hash', [input_ptr, output_ptr], len(headers))
        out = C.create_string_buffer(len(expected));check(download(out, output_ptr, len(expected)))
        if out.raw != expected:
            raise AssertionError('GPU hashes differ from independent hashlib')
        # Equality, zero/one, BE ordering; inclusive <= is intentional.
        values = [(1,1,1),(0,1,1),(1,0,0),(1<<248,255,0)]
        hashes = buffer(b''.join(a.to_bytes(32,'big') for a,b,c in values))
        targets = buffer(b''.join(b.to_bytes(32,'big') for a,b,c in values))
        results = buffer(bytes(4*len(values)))
        run('verify_target', [hashes, targets, results], len(values))
        out = C.create_string_buffer(4*len(values));check(download(out,results,len(out)))
        actual = [int.from_bytes(out.raw[i:i+4],'little') for i in range(0,len(out),4)]
        if actual != [c for a,b,c in values]:raise AssertionError('Target comparison failed')
        record = {'passed':True,'offline':True,'poolConnected':False,'device':name.value.decode(),
                  'hashChecks':len(headers),'targetChecks':len(values),'upstreamCommit':meta['commit'],
                  'ptxSha256':hashlib.sha256(ptx).hexdigest(),'scope':'SHA-256d functions only; not a packaged miner or hashrate benchmark'}
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(record))
    finally:
        for p in allocations:bind(dll,'cuMemFree_v2',[u64])(p)
        if module.value:bind(dll,'cuModuleUnload',[ptr])(module)
        bind(dll,'cuDevicePrimaryCtxRelease',[C.c_int])(device)


if __name__ == '__main__':
    main()
