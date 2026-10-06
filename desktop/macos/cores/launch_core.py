"""Launch one experimental Apple Silicon core with a public-address config."""
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys

root = Path(__file__).resolve().parent
coin = sys.argv[1].upper() if len(sys.argv) > 1 else ''
if coin not in ('QTC', 'PRL'):
    raise SystemExit('Choose QTC or PRL')
config = json.loads((root / 'config.json').read_text(encoding='utf-8'))[coin]
wallet = config['wallet'].strip()
if not wallet.startswith('prl1' if coin == 'PRL' else 'qz'):
    raise SystemExit('Please enter your public payout address in config.json; no private key is required.')
state = root / 'state'
state.mkdir(exist_ok=True)
lock = (state / 'mining.lock').open('w')
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    raise SystemExit('Another core in this package is running. Stop it before switching coins.')
python = str(root / 'python/bin/python3')
env = dict(os.environ)
if coin == 'QTC':
    command = [python, str(root / 'qtc/pool_miner.py'), '--core', str(root / 'qtc/gozero_worker'),
               '--wallet', wallet, '--worker', config.get('worker', 'Gozero-Mac-QTC'),
               '--host', config.get('host', 'qtc-hk.kryptex.network'), '--port', str(config.get('port', 8049)),
               '--report', str(state / 'qtc-last-session.json')]
else:
    env['PMK_HOME'] = str(state / 'prl')
    env['PMK_RESOURCE_BUNDLE'] = str(root / 'prl/libpmk/.build/release/libpmk_PMK.bundle')
    command = [python, str(root / 'prl/scripts/pmk_mine.py'), '--wallet', wallet,
               '--worker', config.get('worker', 'Gozero-Mac-PRL'), '--pool', config.get('pool', 'stratum+ssl://prl-eu.kryptex.network:8048')]
print(f'{coin} Apple Silicon core — continuous mining; Ctrl+C stops. No 10-minute limit.', flush=True)
process = subprocess.Popen(command, cwd=root, env=env, start_new_session=True)
def stop_signal(signum, frame):
    raise KeyboardInterrupt
for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
    signal.signal(signum, stop_signal)
try:
    code = process.wait()
except KeyboardInterrupt:
    for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(signum, signal.SIG_IGN)
    os.killpg(process.pid, signal.SIGINT)
    try:
        code = process.wait(timeout=30)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            code = process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            code = process.wait()
raise SystemExit(code)
