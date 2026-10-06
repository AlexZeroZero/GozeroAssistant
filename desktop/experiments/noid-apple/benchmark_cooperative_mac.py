"""Bounded CPU+GPU A/B search benchmark with read-only macOS GPU telemetry."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import re
import statistics
import subprocess
import time

ROOT = Path(__file__).resolve().parent


def workers():
    rows = subprocess.check_output(['ps', '-axo', 'pid,comm'], text=True).splitlines()[1:]
    return {int(row.split(None, 1)[0]) for row in rows if row.split(None, 1)[-1].rsplit('/', 1)[-1]
            in ('noid-apple-check', 'noid-hybrid-check')}


def sample(executable, shader, threads, duration):
    if workers():
        raise RuntimeError('A mining worker is active; stop it before comparative benchmarking')
    command = [str(executable), '--metal-source', str(shader), '--search-seconds', str(duration),
               '--cpu-threads', str(threads)]
    start = time.monotonic()
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    samples = []
    try:
        while process.poll() is None:
            if time.monotonic() - start > duration + 60:
                raise TimeoutError('Native benchmark deadline exceeded')
            if workers() - {process.pid}:
                raise RuntimeError('Another miner started; comparative sample invalid')
            raw = subprocess.check_output(['ioreg', '-r', '-c', 'AGXAccelerator', '-l'], text=True)
            match = re.search(r'"Device Utilization %"=(\d+)', raw)
            cpu = subprocess.run(['ps', '-p', str(process.pid), '-o', '%cpu='], capture_output=True, text=True).stdout.strip()
            samples.append({'secondsSinceLaunch': time.monotonic() - start,
                            'gpuDevicePercent': int(match.group(1)) if match else None,
                            'processCPUPercent': float(cpu) if cpu else None})
            time.sleep(1)
        stdout, stderr = process.communicate(timeout=5)
        if process.returncode:
            raise RuntimeError(stderr)
        return {'cpuThreads': threads, 'native': json.loads(stdout), 'utilizationSamples': samples}
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        process.stdout.close()
        process.stderr.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seconds', type=int, choices=range(5,61), default=15)
    parser.add_argument('--rounds', type=int, choices=range(1,6), default=3)
    parser.add_argument('--threads', type=int, choices=range(1,9), nargs='+', default=[4])
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        parser.error('Run natively on Apple Silicon')
    if len(set(args.threads)) != len(args.threads):
        parser.error('CPU thread counts must be unique')
    build = ROOT / 'artifacts/macos-arm64'
    report = {'scope': 'offline bounded CPU+GPU search, not pool-side hashrate', 'samples': [],
              'artifactSha256': {name: hashlib.sha256((build / name).read_bytes()).hexdigest()
                                 for name in ('noid-apple-check', 'noid-runtime.metal')}}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    for trial in range(args.rounds):
        order=[0,*args.threads]
        for threads in (order if trial % 2 == 0 else reversed(order)):
            row = sample(build / 'noid-apple-check', build / 'noid-runtime.metal', threads, args.seconds)
            report['samples'].append(row)
            args.report.write_text(json.dumps(report, indent=2) + '\n')
            print(json.dumps({'threads': threads, 'search': row['native']['metalSearch']}), flush=True)
    rates = {n: statistics.median(r['native']['metalSearch']['hashesPerSecondWall']
             for r in report['samples'] if r['cpuThreads'] == n) for n in (0, *args.threads)}
    report['medianHashesPerSecond'] = rates
    report['gainPercent'] = {n: (rates[n] / rates[0] - 1) * 100 for n in args.threads}
    report['thermalStatus'] = subprocess.check_output(['pmset', '-g', 'therm'], text=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'medianHashesPerSecond': rates, 'gainPercent': report['gainPercent']}))


if __name__ == '__main__':
    main()
