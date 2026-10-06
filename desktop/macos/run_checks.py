"""Run Mac-only core checks and preserve a diagnostic ZIP, including failures."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import uuid
import zipfile

REPO = Path(__file__).resolve().parents[2]
CORE = REPO / 'desktop' / 'experiments' / 'noid-apple'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cpu-only', action='store_true', help='Explicitly skip Metal tests')
    parser.add_argument('--count', type=int, default=32)
    args = parser.parse_args()
    if not (4 <= args.count <= 4096 and args.count % 4 == 0):
        parser.error('--count must be a multiple of four in [4,4096]')
    tag = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:6]
    output = REPO / 'desktop' / 'artifacts' / ('mac-check-' + tag)
    output.mkdir(parents=True)
    report = {'startedUTC': datetime.now(timezone.utc).isoformat(), 'platform': platform.platform(),
              'machine': platform.machine(), 'python': platform.python_version(), 'cpuOnly': args.cpu_only,
              'status': 'preflight', 'scope': 'Offline selftest and short synthetic benchmark. No pool mining.',
              'sourceSha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in CORE.iterdir() if p.is_file()}}
    copied = []
    built = CORE / 'artifacts' / 'macos-arm64'
    # A report is collected only if this invocation actually creates/changes it.
    old = {p.name: (p.stat().st_mtime_ns, hashlib.sha256(p.read_bytes()).hexdigest())
           for p in built.glob('*.json')}
    code = 1
    try:
        if platform.system() != 'Darwin' or platform.machine() != 'arm64':
            raise RuntimeError('请在苹果 M 芯片 Mac 上以原生 arm64 方式运行；Windows / Rosetta 不执行本测试。')
        if not shutil.which('xcrun'):
            raise RuntimeError('未找到 Xcode 工具。请安装 Xcode / Command Line Tools。')
        # build_mac.py can compile Metal with the system runtime when the
        # optional offline Metal compiler is absent. CPU-only is never implicit.
        command = [sys.executable, '-u', str(CORE / 'build_mac.py'), '--benchmark', '--count', str(args.count)]
        if args.cpu_only:
            command.append('--cpu-only')
        report['status'] = 'running'
        with (output / 'build.log').open('w', encoding='utf-8') as log:
            process = subprocess.Popen(command, cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                       text=True, encoding='utf-8', errors='replace')
            try:
                for line in process.stdout:
                    print(line, end='', flush=True)
                    log.write(line)
                    log.flush()
                code = process.wait()
            except BaseException:
                process.terminate()
                process.wait()
                raise
        report['status'] = 'passed' if code == 0 else 'failed'
        report['exitCode'] = code
    except (OSError, RuntimeError) as error:
        report['status'] = 'failed'
        report['error'] = str(error)
        print(str(error), file=sys.stderr)
    finally:
        for path in built.glob('*.json'):
            stamp = (path.stat().st_mtime_ns, hashlib.sha256(path.read_bytes()).hexdigest())
            if old.get(path.name) != stamp:
                shutil.copy2(path, output / path.name)
                copied.append(path.name)
        report['collectedReports'] = copied
        report['finishedUTC'] = datetime.now(timezone.utc).isoformat()
        (output / 'run.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        archive = output.with_suffix('.zip')
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
            for path in sorted(output.iterdir()):
                if path.is_file():
                    bundle.write(path, output.name + '/' + path.name)
        print('\n诊断包 / Diagnostic bundle:', archive)
        print('结果:', report['status'], '（此结果不是矿池有效份额或持续算力证明）')
    return code


if __name__ == '__main__':
    sys.exit(main())
