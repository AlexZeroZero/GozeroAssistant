"""Compile the pinned Apache-2.0 QTC CUDA source with verified local NVRTC."""
from pathlib import Path
import ctypes, os, hashlib
root=Path(__file__).resolve().parents[1]
runtime=root.parent/'.local/gozer-build/nvrtc13'
cookie=os.add_dll_directory(str(runtime))
builtins=ctypes.WinDLL(str(runtime/'nvrtc-builtins64_130.dll'))
dll=ctypes.WinDLL(str(runtime/'nvrtc64_130_0.dll'))
program=ctypes.c_void_p()
source=(root/'native/qtc.cu').read_bytes()
dll.nvrtcCreateProgram.argtypes=[ctypes.POINTER(ctypes.c_void_p),ctypes.c_char_p,ctypes.c_char_p,ctypes.c_int,ctypes.c_void_p,ctypes.c_void_p]
dll.nvrtcCompileProgram.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.POINTER(ctypes.c_char_p)]
for f in ['nvrtcGetProgramLogSize','nvrtcGetPTXSize']:
    getattr(dll,f).argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_size_t)]
for f in ['nvrtcGetProgramLog','nvrtcGetPTX']:
    getattr(dll,f).argtypes=[ctypes.c_void_p,ctypes.c_void_p]
assert dll.nvrtcCreateProgram(ctypes.byref(program),source,b'gozer-qtc.cu',0,None,None)==0
options=(ctypes.c_char_p*3)(b'--gpu-architecture=compute_75',b'--std=c++17',b'--device-as-default-execution-space')
result=dll.nvrtcCompileProgram(program,3,options)
size=ctypes.c_size_t();dll.nvrtcGetProgramLogSize(program,ctypes.byref(size))
log=ctypes.create_string_buffer(size.value);dll.nvrtcGetProgramLog(program,log)
print(log.value.decode('utf8','replace'))
assert result==0, result
dll.nvrtcGetPTXSize(program,ctypes.byref(size))
ptx=ctypes.create_string_buffer(size.value);assert dll.nvrtcGetPTX(program,ptx)==0
target=root/'native/qtc.ptx';target.write_bytes(ptx.raw)
print('QTC PTX',len(ptx.raw),hashlib.sha256(ptx.raw).hexdigest())
