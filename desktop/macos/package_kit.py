"""Create a source-only Apple Silicon test kit on Windows or macOS."""
import hashlib
import json
from pathlib import Path
import stat
import subprocess
import zipfile

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'desktop' / 'dist'
NAME = 'Gozero-Mac-DeveloperKit'
REFERENCE = ('reference.py', 'test_reference.py', 'constants.json', 'pool-vectors.json', 'provenance.json', 'LICENSE-Apache-2.0.txt')
CORE = ('NOTICE', 'README.md', 'STATUS.txt', 'LICENSE-Apache-2.0.txt', 'provenance.json',
        'build_mac.py', 'benchmark_mac.py', 'constants.h', 'core.h', 'cpu_batch.h', 'dispatch.h', 'fixtures.h', 'fixtures.json',
        'generate.py', 'kernel.metal', 'mac_host.mm', 'pmull_backend.cpp', 'test_bridge.cpp', 'test_core.py',
        'pool_session.cjs', 'test_pool_session.cjs', 'pool_runner.cjs', 'test_pool_runner.cjs', 'test_worker.py', 'evidence/offline-2026-10-06.json',
        'evidence/mac-m3-selftest-2026-10-06.json', 'evidence/mac-m3-portable-2026-10-06.json',
        'evidence/mac-m3-pmull-2026-10-06.json', 'evidence/mac-m3-package-smoke-2026-10-06.json',
        'evidence/mac-m3-innovlab-2026-10-06.json', 'evidence/mac-m3-worker-build-2026-10-06.json',
        'evidence/mac-m3-optimization-2026-10-06.json', 'evidence/mac-m3-optimized-innovlab-2026-10-06.json')


def main():
    subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=REPO, check=True, capture_output=True)
    subprocess.run([__import__('sys').executable, str(REPO / 'desktop/experiments/noid-apple/generate.py'), '--check'], cwd=REPO, check=True)
    files = {}
    for folder, names in [('desktop/experiments/noid', REFERENCE), ('desktop/experiments/noid-apple', CORE)]:
        for name in names:
            relative = folder + '/' + name
            files[relative] = (REPO / relative).read_bytes()
    for source, destination in [('run_checks.py', 'desktop/macos/run_checks.py'),
                                ('package_native.py', 'desktop/macos/package_native.py'),
                                ('python-runtime.json', 'desktop/macos/python-runtime.json'),
                                ('Run-Mac-Checks.command', 'Run-Mac-Checks.command'),
                                ('REMOTE-SETUP.md', 'README-远程与本机测试.md')]:
        files[destination] = (REPO / 'desktop/macos' / source).read_bytes()
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip()
    dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=REPO, text=True).strip())
    manifest = {'type': 'source-only-developer-kit', 'compiledMacApplication': False,
                'gitBaseRevision': revision, 'workingTreeHasChanges': dirty,
                'files': {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}}
    files['MANIFEST.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    OUT.mkdir(parents=True, exist_ok=True)
    archive = OUT / (NAME + '.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for name, data in sorted(files.items()):
            item = zipfile.ZipInfo(NAME + '/' + name, date_time=(2026, 10, 6, 0, 0, 0))
            item.create_system = 3
            item.compress_type = zipfile.ZIP_DEFLATED
            mode = 0o755 if name.endswith('.command') else 0o644
            item.external_attr = (stat.S_IFREG | mode) << 16
            bundle.writestr(item, data)
    # Verify the actual ZIP contents against the manifest before delivery.
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip() is not None:
            raise RuntimeError('ZIP CRC check failed')
        for name, expected in manifest['files'].items():
            if hashlib.sha256(bundle.read(NAME + '/' + name)).hexdigest() != expected:
                raise RuntimeError('ZIP manifest mismatch: ' + name)
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(checksum + '  ' + archive.name + '\n', encoding='ascii')
    print(archive)
    print('SOURCE ONLY; not a compiled .app/.dmg')
    print('SHA256:', checksum)


if __name__ == '__main__':
    main()
