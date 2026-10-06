import asyncio
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pool_miner as miner


def job(difficulty=1):
    return dict(mining_hash='11' * 32, extranonce='aabbccdd', job_id='test-job',
                difficulty=difficulty, target=f'{miner.MAX512 // difficulty:0128x}')


class ValidationTests(unittest.TestCase):
    def test_real_difficulty_target(self):
        self.assertEqual(miner.parse_job(job(18253611008))['target_int'], miner.MAX512 // 18253611008)

    def test_rejects_bad_lengths_and_difficulty(self):
        for key, value in [('mining_hash', '00'), ('extranonce', '00'), ('target', 'ff'),
                           ('difficulty', 0), ('difficulty', True), ('difficulty', 1.5), ('job_id', '')]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                miner.parse_job(dict(job(), **{key: value}))

    def test_rejects_mismatched_target(self):
        with self.assertRaises(ValueError):
            miner.parse_job(dict(job(), target='11' * 64))

    def test_candidate_prefix_range_and_target(self):
        j = miner.parse_job(job())
        start = int('aabbccdd' + '00' * 60, 16)
        candidate = {'nonce': f'{start:0128x}', 'hash': '00' * 64}
        self.assertTrue(miner.valid_candidate(candidate, j, start, 32))
        self.assertFalse(miner.valid_candidate(candidate, j, start + 1, 32))
        self.assertFalse(miner.valid_candidate(dict(candidate, nonce='00' * 64), j, 0, 32))
        self.assertFalse(miner.valid_candidate(dict(candidate, hash='ff' * 64), j, start, 32))


class LifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_pipe_and_mock_pool_acceptance_cleanup(self):
        original_connect = asyncio.open_connection
        original_spawn = asyncio.create_subprocess_exec
        submitted = []

        async def pool(reader, writer):
            try:
                request = json.loads(await reader.readline())
                self.assertEqual(request['method'], 'login')
                writer.write((json.dumps({'id': 1, 'result': {'id': 'session', 'status': 'OK', 'job': job()}}) + '\n').encode())
                await writer.drain()
                while line := await reader.readline():
                    request = json.loads(line)
                    if request['method'] == 'submit':
                        submitted.append(request)
                        writer.write((json.dumps({'id': request['id'], 'result': {'status': 'OK'}, 'error': None}) + '\n').encode())
                        await writer.drain()
            except ConnectionError:
                pass
            finally:
                writer.close()
                with contextlib.suppress(ConnectionError):
                    await writer.wait_closed()

        server = await asyncio.start_server(pool, '127.0.0.1', 0)
        port = server.sockets[0].getsockname()[1]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fake = root / 'fake_core.py'
            fake.write_text('import sys,json,time\nprint(json.dumps({"ready":True,"backend":"mock"}),flush=True)\n'
                            'for line in sys.stdin:\n'
                            ' i,h,d,n,c=line.split();time.sleep(.01)\n'
                            ' print(json.dumps({"id":int(i),"hashes":int(c),"nonce":n,"hash":"00"*64}),flush=True)\n', encoding='utf-8')

            async def connect(*args, **kwargs):
                kwargs.pop('ssl', None)
                return await original_connect(*args, **kwargs)

            async def spawn(*args, **kwargs):
                return await original_spawn(sys.executable, *args, **kwargs)

            args = SimpleNamespace(core=fake, wallet='qz-public-test', worker='test', host='127.0.0.1',
                                   port=port, seconds=.5, batch=1024, report=root / 'report.json')
            with patch.object(asyncio, 'open_connection', connect), patch.object(asyncio, 'create_subprocess_exec', spawn), contextlib.redirect_stdout(io.StringIO()):
                await miner.run(args)
            report = json.loads(args.report.read_text())
            self.assertGreater(report['accepted'], 0)
            self.assertEqual(report['rejected'], 0)
            self.assertEqual(report['core_exit_code'], 0)
            self.assertIsNone(report['error'])
            self.assertTrue(all(s['params']['id'] == 'session' for s in submitted))
        server.close()
        await server.wait_closed()


if __name__ == '__main__':
    unittest.main()
