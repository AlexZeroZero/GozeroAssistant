#!/usr/bin/env python3
"""Explicit foreground supervisor; one owned CUDA process per selected GPU."""
import argparse
import csv
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import time
import threading
from urllib.parse import urlsplit


def load_config(path):
    c = json.loads(Path(path).read_text())
    allowed = {'pool', 'wallet', 'mss_confirmed', 'gpus', 'worker_prefix', 'duty', 'temp_stop', 'temp_resume', 'profile'}
    if not isinstance(c, dict) or set(c)-allowed:
        raise ValueError('Unknown configuration keys')
    if c.get('mss_confirmed') is not True or not re.fullmatch(r'(?:[a-fA-F0-9]{64}|[a-fA-F0-9]{72})', c.get('wallet', '')):
        raise ValueError('Set your reusable MSS wallet and mss_confirmed=true; never use a WOTS address')
    u = urlsplit(c.get('pool', ''))
    if u.scheme != 'stratum+tcp' or not u.hostname or not u.port or u.username or u.password or u.path not in ('', '/') or u.query or u.fragment:
        raise ValueError('Expected stratum+tcp://host:port')
    c.setdefault('duty', .9)
    c.setdefault('temp_stop', 85)
    c.setdefault('temp_resume', 70)
    if type(c['duty']) not in (float, int) or not .1 <= c['duty'] <= 1:
        raise ValueError('duty must be 0.1..1.0')
    if type(c['temp_stop']) is not int or type(c['temp_resume']) is not int or not 40 <= c['temp_resume'] < c['temp_stop'] <= 90:
        raise ValueError('Require 40 <= temp_resume < temp_stop <= 90')
    c.setdefault('profile', 'auto')
    if c['profile'] not in ('auto', 'tune'):
        raise ValueError('profile must be auto or tune')
    c.setdefault('worker_prefix', re.sub(r'[^A-Za-z0-9_.-]', '-', socket.gethostname())[:23] or 'rig')
    if not re.fullmatch(r'[A-Za-z0-9_.-]{1,23}', c['worker_prefix']):
        raise ValueError('worker_prefix must be 1..23 letters, digits, _, . or -')
    c.setdefault('gpus', ['all'])
    if not isinstance(c['gpus'], list) or not c['gpus'] or any(not isinstance(x, str) for x in c['gpus']) or len(set(c['gpus'])) != len(c['gpus']):
        raise ValueError('gpus must be unique GPU UUID strings, or ["all"]')
    if c['gpus'] != ['all'] and any(not re.fullmatch(r'GPU-[a-fA-F0-9-]{36}', x) for x in c['gpus']):
        raise ValueError('Use GPU UUIDs from nvidia-smi -L, or ["all"]')
    return c


def inventory():
    out = subprocess.check_output(['nvidia-smi', '--query-gpu=uuid,name,temperature.gpu', '--format=csv,noheader,nounits'], text=True, timeout=8)
    result = {}
    for row in csv.reader(out.splitlines()):
        uid, name, temperature = [x.strip() for x in row]
        if not re.fullmatch(r'GPU-[a-fA-F0-9-]{36}', uid):
            raise ValueError('Invalid GPU UUID from driver')
        result[uid] = {'name': name, 'temperature': int(temperature)}
    if not result:
        raise ValueError('No NVIDIA GPUs detected')
    return result


def command(binary, c, name, index):
    tested = c['profile'] == 'auto' and bool(re.search(r'\bRTX\s+3090\s*$', name, re.I))
    return [str(binary), '--backend', 'cuda', '--gpu-index', '0', '--pool-url', c['pool'],
            '--payout-address', c['wallet'], '--mss-confirmed', '--worker', c['worker_prefix']+'-g'+str(index),
            '--duty', str(c['duty']), '--cuda-batch', '20992' if tested else '0',
            '--cuda-block', '256' if tested else '0', '--cuda-dispatch', '4000' if tested else '0',
            '--cuda-unroll', '2' if tested else '0']


def acquire_lock(uid, directory):
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(directory/(uid+'.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BaseException:
        os.close(fd)
        raise RuntimeError('Another supervisor for this user already owns '+uid)
    return fd


def stop_owned(children):
    for p in children:
        if p.poll() is None:
            try:
                os.killpg(p.pid, signal.SIGINT)
            except ProcessLookupError:
                pass
    for p in children:
        try:
            p.wait(timeout=15)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            p.wait(timeout=5)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config', required=True)
    ap.add_argument('--binary', type=Path, default=Path(__file__).resolve().parent/'GozeroMdsCore')
    ap.add_argument('--check', action='store_true', help='validate and print selected GPUs; do not mine')
    ap.add_argument('--duration', type=int, default=0, help='stop after N seconds; 0 runs until explicitly stopped')
    a = ap.parse_args()
    if a.duration < 0:
        ap.error('duration must be nonnegative')
    c = load_config(a.config)
    binary = a.binary.resolve(strict=True)
    subprocess.run([str(binary), '--check-address', c['wallet']], check=True, timeout=15)
    detected = inventory()
    selected = list(detected) if c['gpus'] == ['all'] else c['gpus']
    for uid in selected:
        if uid not in detected:
            raise ValueError('Selected GPU is unavailable: '+uid)
        print('Selected '+uid+' '+detected[uid]['name'], flush=True)
    if a.check:
        print('Configuration valid; no miner started.', flush=True)
        return 0
    stopping = False
    def stop(signum, frame):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    children, locks, readers = [], [], []
    directory = Path(os.environ.get('XDG_RUNTIME_DIR', str(Path.home()/'.cache')))/'gozero-mds'
    start = time.monotonic()
    try:
        for uid in selected:
            locks.append(acquire_lock(uid, directory))
        while not stopping and any(detected[u]['temperature'] > c['temp_resume'] for u in selected):
            if a.duration and time.monotonic()-start >= a.duration:
                return 0
            print('Waiting for selected GPUs to cool below '+str(c['temp_resume'])+' C', flush=True)
            time.sleep(2)
            detected = inventory()
        if stopping:
            return 0
        for index, uid in enumerate(selected):
            env = {**os.environ, 'CUDA_VISIBLE_DEVICES': uid, 'CUDA_DEVICE_ORDER': 'PCI_BUS_ID'}
            p = subprocess.Popen(command(binary, c, detected[uid]['name'], index), env=env, start_new_session=True,
                                 stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='replace')
            children.append(p)
            def relay(proc=p, label=c['worker_prefix']+'-g'+str(index)):
                for line in proc.stdout:
                    print('['+label+'] '+line.rstrip(), flush=True)
            reader=threading.Thread(target=relay, daemon=True);reader.start();readers.append(reader)
            print('Started '+uid+' PID '+str(p.pid), flush=True)
        while not stopping and (not a.duration or time.monotonic()-start < a.duration):
            if any(p.poll() is not None for p in children):
                raise RuntimeError('A miner exited; stopping this supervisor and its other miners')
            detected = inventory()  # Sensor failures stop the owned miners.
            if any(detected[u]['temperature'] >= c['temp_stop'] for u in selected):
                print('Temperature limit reached; stopping all owned miners', flush=True)
                return 75
            time.sleep(2)
        return 0
    finally:
        stop_owned(children)
        for reader in readers:
            reader.join(timeout=3)
        for fd in locks:
            os.close(fd)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:
        print('Gozero supervisor: '+str(e), file=sys.stderr, flush=True)
        sys.exit(1)
