"""Experimental QTC TLS pool adapter for the pinned official Metal engine.

No wallet is embedded. A bounded run is selected only with --seconds; zero
means continuous. JSON logs distinguish local work from accepted pool shares.
"""
import argparse
import asyncio
import contextlib
import json
import math
import secrets
import ssl
import time
from pathlib import Path

MAX512 = (1 << 512) - 1


def parse_job(job):
    if not isinstance(job, dict):
        raise ValueError('job must be an object')
    header = bytes.fromhex(job['mining_hash'])
    extra = bytes.fromhex(job['extranonce'])
    target_bytes = bytes.fromhex(job['target'])
    difficulty = job['difficulty']
    if isinstance(difficulty, bool) or not isinstance(difficulty, int) or not 0 < difficulty <= MAX512:
        raise ValueError('invalid difficulty')
    if len(header) != 32 or len(extra) != 4 or len(target_bytes) != 64:
        raise ValueError('invalid job byte lengths')
    target = int.from_bytes(target_bytes, 'big')
    if target != MAX512 // difficulty:
        raise ValueError('pool target and difficulty disagree')
    if not isinstance(job['job_id'], str) or not 0 < len(job['job_id']) <= 128:
        raise ValueError('invalid job id')
    return dict(job, target_int=target)


def valid_candidate(result, job, start, count):
    nonce, digest = bytes.fromhex(result['nonce']), bytes.fromhex(result['hash'])
    return (len(nonce) == len(digest) == 64
            and nonce[:4].hex() == job['extranonce']
            and start <= int.from_bytes(nonce, 'big') < start + count
            and int.from_bytes(digest, 'big') < job['target_int'])


def emit(event, **fields):
    print(json.dumps(dict(event=event, timestamp=time.time(), **fields)), flush=True)


def next_batch(count, seconds, limit):
    """Aim for 40–90 ms per dispatch; bound job-change latency and memory use."""
    if not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or seconds <= 0:
        return count
    if seconds < .04:
        return min(limit, count * 2)
    if seconds > .09:
        return min(count, max(min(65536, limit), count // 2))
    return count


async def run(args):
    began = time.monotonic()
    stats = dict(hashes=0, submitted=0, accepted=0, rejected=0, stale_local=0, reconnects=0, jobs=0)
    worker = await asyncio.create_subprocess_exec(str(args.core), stdin=asyncio.subprocess.PIPE,
                                                 stdout=asyncio.subprocess.PIPE)
    reader_task = None
    writer = None
    pending = {}
    stop_at = began + args.seconds if args.seconds else float('inf')
    last_sample = began
    last_hashes = 0
    fatal = None
    stopped = False
    try:
        ready = json.loads(await asyncio.wait_for(worker.stdout.readline(), 90))
        if not ready.get('ready'):
            raise RuntimeError('core initialization failed')
        limit = ready.get('max_batch', 262144)
        if type(limit) is not int or not 1 <= limit <= 1048576:
            raise RuntimeError('invalid core batch capability')
        limit = min(limit, getattr(args, 'max_batch', 1048576))
        batch = min(args.batch, limit)
        emit('core_ready', backend=ready['backend'], max_batch=limit)
        request_id = 0
        while time.monotonic() < stop_at:
            current = {'job': None, 'generation': 0, 'session': None}
            available = asyncio.Event()
            try:
                reader, writer = await asyncio.wait_for(asyncio.open_connection(
                    args.host, args.port, ssl=ssl.create_default_context(), limit=65536), 20)

                async def send(message):
                    writer.write((json.dumps(message) + '\n').encode())
                    await writer.drain()

                def adopt(raw):
                    current['job'] = parse_job(raw)
                    current['generation'] += 1
                    stats['jobs'] += 1
                    available.set()
                    emit('job', job_id=raw['job_id'], difficulty=raw['difficulty'])

                async def receive():
                    while True:
                        line = await asyncio.wait_for(reader.readline(), 90)
                        if not line:
                            raise ConnectionError('pool disconnected')
                        msg = json.loads(line)
                        if msg.get('id') == 1:
                            value = msg.get('result')
                            if msg.get('error') or not isinstance(value, dict) or value.get('status') != 'OK':
                                raise ConnectionError('pool login rejected')
                            current['session'] = value['id']
                            adopt(value['job'])
                            emit('authorized', pool=f'{args.host}:{args.port}')
                        elif msg.get('method') == 'job':
                            adopt(msg['params']['job'])
                        elif msg.get('id') in pending:
                            value = msg.get('result')
                            accepted = not msg.get('error') and isinstance(value, dict) and value.get('status') == 'OK'
                            stats['accepted' if accepted else 'rejected'] += 1
                            pending.pop(msg['id'])
                            emit('share_accepted' if accepted else 'share_rejected', response=msg)

                reader_task = asyncio.create_task(receive())
                await send({'id': 1, 'method': 'login', 'params': {
                    'login': args.wallet + '.' + args.worker, 'pass': 'x', 'agent': 'Gozero-Mac-QTC/0.1'}})
                await asyncio.wait_for(available.wait(), 20)
                generation = -1
                nonce = 0
                while time.monotonic() < stop_at:
                    if reader_task.done():
                        await reader_task
                    job = current['job']
                    if generation != current['generation']:
                        generation = current['generation']
                        nonce = int.from_bytes(bytes.fromhex(job['extranonce']) + secrets.token_bytes(28) + bytes(32), 'big')
                    count = batch
                    dispatch_started = time.monotonic()
                    request_id += 1
                    worker.stdin.write(f"{request_id} {job['mining_hash']} {job['difficulty']} {nonce:0128x} {count}\n".encode())
                    await worker.stdin.drain()
                    try:
                        line = await asyncio.wait_for(worker.stdout.readline(), 30)
                    except asyncio.TimeoutError as exc:
                        raise RuntimeError('core response timeout') from exc
                    if not line:
                        raise RuntimeError(f'core exited: {await worker.wait()}')
                    result = json.loads(line)
                    if result.get('id') != request_id:
                        raise RuntimeError('core response id mismatch')
                    hashes = result['hashes']
                    if not isinstance(hashes, int) or not 0 <= hashes <= count:
                        raise RuntimeError('invalid core work count')
                    stats['hashes'] += hashes
                    if 'nonce' in result:
                        if not valid_candidate(result, job, nonce, count):
                            raise RuntimeError('core candidate failed adapter validation')
                        if generation != current['generation'] or reader_task.done():
                            stats['stale_local'] += 1
                        else:
                            msg_id = request_id + 100
                            pending[msg_id] = job['job_id']
                            await send({'id': msg_id, 'method': 'submit', 'params': {
                                'id': current['session'], 'job_id': job['job_id'],
                                'nonce': result['nonce'], 'result': result['hash']}})
                            stats['submitted'] += 1
                            emit('share_submitted', job_id=job['job_id'])
                    nonce += count
                    if getattr(args, 'adaptive_batch', False) and hashes == count and 'nonce' not in result:
                        batch = next_batch(count, time.monotonic() - dispatch_started, limit)
                    now = time.monotonic()
                    if now - last_sample >= 10:
                        emit('hashrate', batch=batch, hashes_per_second=(stats['hashes'] - last_hashes) / (now - last_sample), **stats)
                        last_sample, last_hashes = now, stats['hashes']
            except (OSError, asyncio.TimeoutError, ConnectionError) as exc:
                emit('connection_error', reason=str(exc))
                stats['reconnects'] += 1
                if time.monotonic() < stop_at:
                    await asyncio.sleep(min(3, max(0, stop_at - time.monotonic())))
            finally:
                if reader_task:
                    reader_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError, Exception):
                        await reader_task
                    reader_task = None
                if writer:
                    writer.close()
                    with contextlib.suppress(Exception):
                        await asyncio.wait_for(writer.wait_closed(), 5)
                    writer = None
    except asyncio.CancelledError:
        stopped = True
        raise
    except BaseException as exc:
        fatal = type(exc).__name__ + ': ' + str(exc)
        raise
    finally:
        if worker.stdin:
            worker.stdin.close()
        try:
            await asyncio.wait_for(worker.wait(), 10)
        except asyncio.TimeoutError:
            worker.kill()
            await worker.wait()
        report = dict(stats, elapsed_seconds=time.monotonic() - began, awaiting_verdict=len(pending),
                      error=fatal, stop_reason='user_stop' if stopped else 'completed',
                      pool=args.host, core_exit_code=worker.returncode)
        report['local_average_hps'] = stats['hashes'] / report['elapsed_seconds']
        if args.report:
            args.report.write_text(json.dumps(report, indent=2), encoding='utf-8')
        emit('summary', **report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--core', required=True, type=Path)
    parser.add_argument('--wallet', required=True)
    parser.add_argument('--worker', default='Gozero-Mac')
    parser.add_argument('--host', default='qtc-hk.kryptex.network')
    parser.add_argument('--port', type=int, default=8049)
    parser.add_argument('--seconds', type=int, default=0)
    parser.add_argument('--batch', type=int, default=262144)
    parser.add_argument('--max-batch', type=int, default=1048576)
    parser.add_argument('--adaptive-batch', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    if not args.wallet.startswith('qz') or args.seconds < 0 or not 1 <= args.batch <= 1048576 or not 1 <= args.max_batch <= 1048576:
        parser.error('invalid wallet, duration or batch')
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
