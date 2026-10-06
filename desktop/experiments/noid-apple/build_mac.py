"""Build and validate on an actual Apple Silicon Mac with Xcode tooling."""
import argparse
import json
from pathlib import Path
import platform
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'artifacts' / 'macos-arm64'


def run(*args, capture=False):
    result = subprocess.run([str(a) for a in args], cwd=ROOT, check=True, text=True,
                            stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cpu-only', action='store_true', help='Skip Metal compilation and execution explicitly')
    parser.add_argument('--benchmark', action='store_true')
    parser.add_argument('--count', type=int, default=32)
    args = parser.parse_args()
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        parser.error('Run natively on an Apple Silicon Mac; Windows/cross compilation cannot validate Metal.')
    if not (4 <= args.count <= 4096 and args.count % 4 == 0):
        parser.error('--count must be a multiple of 4 in [4,4096]')
    OUT.mkdir(parents=True, exist_ok=True)
    run(sys.executable, 'generate.py', '--check')
    run(sys.executable, '../noid/test_reference.py')
    compiler = run('xcrun', '--find', 'clang++', capture=True)
    flags = ['-std=c++17', '-O3', '-arch', 'arm64', '-mmacosx-version-min=11.0', '-Wall', '-Wextra']
    # Internal core functions have static linkage, preventing accelerated and
    # portable implementations from being coalesced by the linker.
    run(compiler, *flags, '-DGZ_FORCE_PORTABLE=1', '-dynamiclib', 'test_bridge.cpp', '-o', OUT / 'portable.dylib')
    run(compiler, *flags, '-march=armv8-a+crypto', '-dynamiclib', 'test_bridge.cpp', '-o', OUT / 'pmull.dylib')
    run(compiler, *flags, '-march=armv8-a+crypto', '-c', 'pmull_backend.cpp', '-o', OUT / 'pmull.o')
    executable = OUT / 'noid-apple-check'
    run(compiler, *flags, '-fobjc-arc', 'mac_host.mm', OUT / 'pmull.o', '-framework', 'Foundation', '-framework', 'Metal', '-o', executable)
    run(sys.executable, 'test_core.py', '--library', OUT / 'portable.dylib', '--report', OUT / 'portable-tests.json')
    available = run(executable, '--pmull-available', capture=True) == 'true'
    if available:
        run(sys.executable, 'test_core.py', '--library', OUT / 'pmull.dylib', '--report', OUT / 'pmull-tests.json')
    else:
        print('PMULL runtime capability not reported; accelerated execution skipped.')
    if args.cpu_only:
        launch = ['--cpu-only']
    else:
        run('xcrun', '-sdk', 'macosx', 'metal', '-std=macos-metal2.3', '-I', ROOT, '-c', 'kernel.metal', '-o', OUT / 'kernel.air')
        run('xcrun', '-sdk', 'macosx', 'metallib', OUT / 'kernel.air', '-o', OUT / 'noid.metallib')
        launch = ['--metallib', OUT / 'noid.metallib']
    if args.benchmark:
        launch += ['--benchmark', '--count', args.count]
    result = json.loads(run(executable, *launch, capture=True))
    (OUT / 'selftest.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
