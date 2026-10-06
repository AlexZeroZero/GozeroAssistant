"""Exercise actual native worker framing, CPU-verified output and termination."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'noid'))
from reference import pow_hash
COMMAND=[]
HEADER=json.loads((ROOT/'fixtures.json').read_text())[0]['header']
NONCE=((1<<32)-2).to_bytes(8,'little').hex()+'0123456789abcdef'


def request(**overrides):
    return {'id':1,'fields':HEADER,'nonce':NONCE,'target':'ff'*32,'count':4,'capacity':2,**overrides}


class WorkerTests(unittest.TestCase):
    def test_continuous_worker_waits_for_input_then_exits_on_eof(self):
        process=subprocess.Popen(COMMAND+['--worker-seconds','0','--cpu-threads','4'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            with self.assertRaises(subprocess.TimeoutExpired):
                process.wait(timeout=2)
            stdout,stderr=process.communicate(json.dumps(request())+'\n',timeout=10)
            self.assertEqual(process.returncode,0,stderr)
            rows=[json.loads(line) for line in stdout.splitlines()]
            self.assertEqual(rows[0]['event'],'ready')
            self.assertEqual(rows[1]['count'],4)
            self.assertEqual(len(rows[1]['candidates']),4)
            self.assertFalse(any(row.get('event')=='lifetime-ended' for row in rows))
        finally:
            if process.poll() is None:process.kill();process.wait()
            process.stdin.close();process.stdout.close();process.stderr.close()

    def test_cpu_chunk_reservations_cover_every_nonce_once(self):
        data=json.dumps(request(count=1021,capacity=128))+'\n'
        run=subprocess.run(COMMAND+['--worker-seconds','10','--cpu-threads','8'],input=data,capture_output=True,text=True,timeout=15)
        self.assertEqual(run.returncode,0,run.stderr)
        row=json.loads(run.stdout.splitlines()[1])
        self.assertGreater(row['cpuHashes'],128)
        start=int.from_bytes(bytes.fromhex(NONCE[:16]),'little')
        expected={(start+i).to_bytes(8,'little').hex()+NONCE[16:] for i in range(1021)}
        self.assertEqual(len(row['candidates']),1021)
        self.assertEqual({c['nonce'] for c in row['candidates']},expected)
        for candidate in row['candidates'][::127]:
            self.assertEqual(candidate['cpuDigest'],pow_hash(bytes.fromhex(HEADER),bytes.fromhex(candidate['nonce'])).hex())

    def test_hybrid_partitions_are_complete_disjoint_and_match_reference(self):
        # An odd range crosses the 32-bit carry and exercises CPU scalar tails.
        start=int.from_bytes(bytes.fromhex(NONCE[:16]),'little')
        nonces=[(start+i).to_bytes(8,'little').hex()+NONCE[16:] for i in range(129)]
        expected={n:pow_hash(bytes.fromhex(HEADER),bytes.fromhex(n)).hex() for n in nonces}
        target=expected[nonces[-1]]
        smaller={n:d for n,d in expected.items() if int.from_bytes(bytes.fromhex(d),'little')<int.from_bytes(bytes.fromhex(target),'little')}
        for threads in (1,4,8):
            data='\n'.join(json.dumps(r) for r in (request(count=129),request(id=2,count=129,target=target),request(id=3,count=129,target='00'*32)))+'\n'
            run=subprocess.run(COMMAND+['--worker-seconds','10','--cpu-threads',str(threads)],input=data,capture_output=True,text=True,timeout=15)
            self.assertEqual(run.returncode,0,run.stderr)
            rows=[json.loads(line) for line in run.stdout.splitlines()]
            self.assertEqual(rows[0]['cpuThreads'],threads)
            self.assertGreater(rows[1]['cpuHashes'],0)
            for row,expected_subset in zip(rows[1:],(expected,smaller,{})):
                self.assertEqual(row['cpuHashes']+row['gpuHashes'],129)
                actual={c['nonce']:c['cpuDigest'] for c in row['candidates']}
                self.assertEqual(len(actual),len(row['candidates']))
                self.assertEqual(actual,expected_subset)

    def test_cpu_verified_candidates_and_eof(self):
        data='\n'.join(json.dumps(r) for r in (request(),request(id=2,target='00'*32)))+'\n'
        run=subprocess.run(COMMAND+['--worker-seconds','10'],input=data,capture_output=True,text=True,timeout=15)
        self.assertEqual(run.returncode,0,run.stderr)
        rows=[json.loads(line) for line in run.stdout.splitlines()]
        self.assertEqual(rows[0]['event'],'ready');self.assertEqual(len(rows[1]['candidates']),4)
        self.assertEqual(rows[2]['candidates'],[])
        for c in rows[1]['candidates']:
            self.assertEqual(c['cpuDigest'],pow_hash(bytes.fromhex(HEADER),bytes.fromhex(c['nonce'])).hex())
            self.assertEqual(c['nonce'][16:],NONCE[16:])

    def test_overflow_rejected(self):
        data=json.dumps(request(nonce='ff'*8+'0123456789abcdef',count=2))+'\n'
        run=subprocess.run(COMMAND+['--worker-seconds','10'],input=data,capture_output=True,text=True,timeout=15)
        self.assertNotEqual(run.returncode,0);self.assertIn('range overflow',run.stderr)

    def test_idle_worker_has_independent_deadline(self):
        process=subprocess.Popen(COMMAND+['--worker-seconds','1','--cpu-threads','4'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            process.wait(timeout=5)  # Keep stdin OPEN: native deadline must end it.
            self.assertEqual(process.returncode,0)
            rows=[json.loads(line) for line in process.stdout.read().splitlines()]
            self.assertEqual(rows[-1]['event'],'lifetime-ended')
        finally:
            if process.poll() is None:process.kill();process.wait()
            process.stdin.close();process.stdout.close();process.stderr.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--executable',required=True)
    mode=parser.add_mutually_exclusive_group(required=True);mode.add_argument('--metal-source');mode.add_argument('--metallib')
    args=parser.parse_args();COMMAND=[args.executable,'--metal-source',args.metal_source] if args.metal_source else [args.executable,'--metallib',args.metallib]
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(WorkerTests))
    sys.exit(0 if result.wasSuccessful() else 1)
