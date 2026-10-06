"""Bounded, alternating Metal A/B benchmark; no networking or pool shares."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import statistics
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--executable', type=Path, default=ROOT / 'artifacts/macos-arm64/noid-apple-check')
    parser.add_argument('--metal-source', type=Path, default=ROOT / 'artifacts/macos-arm64/noid-runtime.metal')
    parser.add_argument('--seconds', type=int, default=15)
    parser.add_argument('--rounds', type=int, default=3)
    parser.add_argument('--batch', type=int, default=65536)
    parser.add_argument('--threadgroup', type=int, default=32)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        parser.error('Run natively on an Apple Silicon Mac')
    if not (1 <= args.seconds <= 60 and 2 <= args.rounds <= 10 and 1 <= args.batch <= 65536):
        parser.error('seconds 1..60, rounds 2..10, batch 1..65536 required')
    executable, source = args.executable.resolve(), args.metal_source.resolve()
    text = source.read_text()
    if 'GZ_METAL_BASELINE' not in text or '#define GZ_METAL_BASELINE' in text:
        parser.error('Expected the optimized source with its baseline switch available')
    report = {'status': 'running', 'scope': 'offline synthetic search; no pool shares',
              'startedUTC': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'binarySha256': digest(executable), 'optimizedMetalSha256': digest(source),
              'secondsPerSample': args.seconds, 'rounds': args.rounds, 'samples': []}
    args.report.parent.mkdir(parents=True, exist_ok=True)

    def save():
        args.report.write_text(json.dumps(report, indent=2) + '\n')

    try:
        with tempfile.TemporaryDirectory(prefix='noid-ab-', dir=args.report.parent) as tmp:
            baseline = Path(tmp) / 'baseline.metal'
            baseline.write_text('#define GZ_METAL_BASELINE 1\n' + text)
            report['baselineMetalSha256'] = digest(baseline)
            save()
            for round_index in range(args.rounds):
                order = ('baseline', 'optimized') if round_index % 2 == 0 else ('optimized', 'baseline')
                for variant in order:
                    command = [str(executable), '--metal-source', str(baseline if variant == 'baseline' else source),
                               '--benchmark', '--count', '4096', '--search-seconds', str(args.seconds),
                               '--search-batch', str(args.batch), '--threadgroup', str(args.threadgroup)]
                    run = subprocess.run(command, capture_output=True, text=True, timeout=args.seconds + 120)
                    if run.returncode:
                        raise RuntimeError(f'{variant} failed: {run.stderr}')
                    sample = json.loads(run.stdout)
                    if sample.get('cpuSelftest') != 'passed' or sample.get('metalSelftest') != 'passed':
                        raise RuntimeError('Missing correctness gate')
                    report['samples'].append({'variant': variant, 'round': round_index + 1, 'result': sample})
                    save()
                    print(variant, round_index + 1, round(sample['metalSearch']['hashesPerSecondWall']), flush=True)
            medians = {v: statistics.median(s['result']['metalSearch']['hashesPerSecondWall']
                       for s in report['samples'] if s['variant'] == v) for v in ('baseline', 'optimized')}
            report.update(status='passed', medianHashesPerSecond=medians,
                          speedup=medians['optimized'] / medians['baseline'])
    except Exception as error:
        report.update(status='failed', error=str(error))
        raise
    finally:
        save()
    print(json.dumps({k: report[k] for k in ('status', 'medianHashesPerSecond', 'speedup')}, indent=2))


if __name__ == '__main__':
    main()
