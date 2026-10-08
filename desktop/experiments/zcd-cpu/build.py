"""Auditable Windows CPU-only XMRig build. Does not start a miner or change AV settings."""
import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

SOURCE_COMMIT = 'b2ca72480c58d197e18c885d9fc1a0c8d517e60a'
DEPS_COMMIT = 'ddfb65ec8bf4803a6c1c2037969546d018c76b54'
HERE = Path(__file__).resolve().parent
DISABLED = ['OPENCL', 'CUDA', 'NVML', 'ADL', 'HTTP', 'MSR', 'DMI',
            'CN_LITE', 'CN_HEAVY', 'CN_PICO', 'CN_FEMTO', 'KAWPOW', 'GHOSTRIDER']

def sha(path):
    return hashlib.file_digest(open(path, 'rb'), 'sha256').hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True,
                        help='ASCII build path containing verified toolchain, cmake, source and deps archives')
    parser.add_argument('--inputs', type=Path, default=HERE/'inputs.json')
    args = parser.parse_args()
    root = args.root.resolve()
    records = json.loads(args.inputs.read_text(encoding='utf-8'))
    for item in records:
        if sha(root/(item['name']+'.zip')) != item['sha256']:
            raise RuntimeError('Input archive checksum mismatch: '+item['name'])
    source = root/'source'/('xmrig-'+SOURCE_COMMIT)
    deps = root/'deps'/('xmrig-deps-'+DEPS_COMMIT)/'gcc/x64'
    compiler = root/'toolchain/mingw64/bin'
    cmake = next((root/'cmake').glob('*/bin/cmake.exe'))
    build = root/'build'
    output = root/'output'
    output.mkdir(exist_ok=True)
    # Re-read original inputs each time so patches do not accumulate.
    import zipfile
    patches = []
    with zipfile.ZipFile(root/'source.zip') as archive:
        def change(relative, transform):
            before = archive.read('xmrig-'+SOURCE_COMMIT+'/'+relative).decode('utf-8')
            after = transform(before)
            if before == after:
                raise RuntimeError('Expected source edit missing: '+relative)
            (source/relative).write_text(after, encoding='utf-8', newline='\n')
            patches.extend(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
                                               'a/'+relative, 'b/'+relative))
        # No driver or example launch scripts in build outputs.
        def no_extra_files(text):
            start = text.index('if (WIN32)\n    if (NOT ARM_TARGET)')
            end = text.index('\nif (CMAKE_CXX_COMPILER_ID MATCHES Clang', start)
            return text[:start]+text[end:]
        change('CMakeLists.txt', no_extra_files)
        # Use only existing account rights. Do not grant persistent LSA privileges.
        def existing_rights_only(text):
            start = text.index('static LSA_UNICODE_STRING StringToLsaUnicodeString')
            end = text.index('} // namespace xmrig', start)
            text = text[:start]+text[end:]
            text = text.replace('TrySetLockPagesPrivilege()', 'SetLockPagesPrivilege()')
            text = text.replace('if (!LookupPrivilegeValue(nullptr, SE_LOCK_MEMORY_NAME, &(tp.Privileges[0].Luid))) {\n        return FALSE;',
                                'if (!LookupPrivilegeValue(nullptr, SE_LOCK_MEMORY_NAME, &(tp.Privileges[0].Luid))) {\n        CloseHandle(token);\n        return FALSE;')
            text = text.replace('if (!rc || GetLastError() != ERROR_SUCCESS) {\n        return FALSE;',
                                'if (!rc || GetLastError() != ERROR_SUCCESS) {\n        CloseHandle(token);\n        return FALSE;')
            return text
        change('src/crypto/common/VirtualMemory_win.cpp', existing_rights_only)
        # AVX2 dataset initialization uses up to 4 * CodeSize. Secure JIT must
        # transition the whole owned allocation, not just the first CodeSize.
        def full_jit_allocation(text):
            old = 'uint8_t* p1 = alignToPage(code, 4096);\n\t\tuint8_t* p2 = code + CodeSize;'
            if text.count(old) != 2:
                raise RuntimeError('Secure JIT allocation layout changed upstream')
            return text.replace(old, 'uint8_t* p1 = allocatedCode;\n\t\tuint8_t* p2 = allocatedCode + allocatedSize;')
        change('src/crypto/randomx/jit_compiler_x86.cpp', full_jit_allocation)
        # Upstream explicitly permits changing these constants in source builds.
        change('src/donate.h', lambda t: t.replace('kDefaultDonateLevel = 1', 'kDefaultDonateLevel = 0').replace('kMinimumDonateLevel = 1', 'kMinimumDonateLevel = 0'))
        # Preserve upstream identity; clearly distinguish this source build in file properties.
        change('src/version.h', lambda t: t.replace('"XMRig miner"', '"XMRig CPU miner - Gozero source build"'))
    (output/'source-changes.patch').write_text(''.join(patches), encoding='utf-8', newline='\n')
    env = {**os.environ, 'PATH':str(compiler)+os.pathsep+os.environ['PATH']}
    options = ['-DWITH_'+name+'=OFF' for name in DISABLED]
    options += ['-DWITH_HWLOC=ON', '-DWITH_RANDOMX=ON', '-DWITH_TLS=ON',
                '-DWITH_ASM=ON', '-DWITH_BENCHMARK=ON', '-DWITH_SECURE_JIT=ON',
                '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_POLICY_VERSION_MINIMUM=3.5']
    configure = [str(cmake), '-S', str(source), '-B', str(build), '-G', 'MinGW Makefiles',
                 '-DXMRIG_DEPS='+deps.as_posix(), *options]
    subprocess.run(configure, env=env, check=True)
    subprocess.run([str(cmake), '--build', str(build), '--parallel', '4'], env=env, check=True)
    shutil.copy2(build/'xmrig.exe', output/'xmrig.exe')
    shutil.copy2(source/'LICENSE', output/'LICENSE-XMRig.txt')
    shutil.copy2(HERE/'build.py', output/'build.py')
    shutil.copy2(args.inputs, output/'inputs.json')
    record = {
        'name':'XMRig CPU miner - Gozero source build', 'version':'6.26.0-cpu.2',
        'sourceCommit':SOURCE_COMMIT, 'dependenciesCommit':DEPS_COMMIT,
        'source':'https://github.com/xmrig/xmrig/tree/'+SOURCE_COMMIT,
        'dependencies':'https://github.com/xmrig/xmrig-deps/tree/'+DEPS_COMMIT,
        'options':options, 'compilerSha256':sha(compiler/'g++.exe'),
        'exeSha256':sha(output/'xmrig.exe'), 'patchSha256':sha(output/'source-changes.patch'),
        'signed':False, 'packed':False, 'obfuscated':False,
        'upstreamDonationPercent':0,
        'notes':'Build success is not antivirus clearance. Dependencies are pinned upstream binary libraries. No performance, pool share acceptance or clean detection claim.'
    }
    (output/'build-record.json').write_text(json.dumps(record, indent=2)+'\n', encoding='utf-8')
    print('Built '+str(output/'xmrig.exe'), flush=True)

if __name__ == '__main__':
    main()
