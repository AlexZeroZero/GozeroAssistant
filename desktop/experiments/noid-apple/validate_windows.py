"""Reproduce offline arithmetic evidence using an existing Clang/LLD toolchain.

Does not install tooling, access a pool, or claim macOS execution.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'artifacts'


def run(*args, capture=False):
    return subprocess.run([str(a) for a in args], cwd=ROOT, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--clang', required=True, type=Path)
    parser.add_argument('--report', type=Path, default=OUT / 'offline-evidence.json')
    args = parser.parse_args()
    if platform.system() != 'Windows' or platform.machine().lower() not in ('amd64', 'x86_64'):
        parser.error('This runner validates on Windows x64; use build_mac.py on Apple Silicon.')
    clang = args.clang.resolve(); linker = clang.with_name('ld.lld.exe')
    OUT.mkdir(parents=True, exist_ok=True)
    run(sys.executable, 'generate.py', '--check')
    run(sys.executable, '../noid/test_reference.py')
    run(clang, '--target=x86_64-pc-windows-msvc', '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror', '-c', 'test_bridge.cpp', '-o', OUT / 'core.obj')
    run(linker, '-flavor', 'link', '/dll', '/noentry', '/nodefaultlib', '/out:' + str(OUT / 'core.dll'), OUT / 'core.obj')
    run(sys.executable, 'test_core.py', '--library', OUT / 'core.dll', '--report', OUT / 'core-tests.json')
    for name in ('test_bridge', 'pmull_backend'):
        flags = ['--target=arm64-apple-macos11', '-march=armv8-a+crypto', '-ffreestanding', '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror']
        run(clang, *flags, '-c', name + '.cpp', '-o', OUT / (name + '-arm64.o'))
        run(clang, *flags, '-S', name + '.cpp', '-o', OUT / (name + '-arm64.s'))
    assembly = (OUT / 'pmull_backend-arm64.s').read_text()
    instructions = len(re.findall(r'\bpmull2?(?:\.1q)?\s', assembly))
    if instructions == 0:
        raise RuntimeError('ARM64 object did not select PMULL instructions')
    run('node', '--test', 'test_pool_session.cjs')
    record = {'recordedAtUTC': datetime.now(timezone.utc).isoformat(), 'compiler': run(clang, '--version', capture=True).splitlines()[0],
              'native': json.loads((OUT / 'core-tests.json').read_text()),
              'referenceTests': 8, 'poolStateTests': 'passed; offline simulated messages only',
              'arm64CrossCompile': {'objects': ['test_bridge', 'pmull_backend'], 'pmullAssemblyInstructions': instructions,
                                    'macOSLinking': False, 'executed': False},
              'macOSHostCompiled': False, 'metalCompiled': False, 'metalExecuted': False, 'acceptedPoolShares': False,
              'sourceSha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in ROOT.iterdir() if p.is_file() and p.suffix in ('.h','.cpp','.mm','.metal','.py','.cjs')}}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print('Evidence saved:', args.report)


if __name__ == '__main__':
    main()
