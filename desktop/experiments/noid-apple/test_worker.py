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
        process=subprocess.Popen(COMMAND+['--worker-seconds','1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            process.wait(timeout=5)  # Keep stdin OPEN: native deadline must end it.
            self.assertEqual(process.returncode,0)
            rows=[json.loads(line) for line in process.stdout.read().splitlines()]
            self.assertEqual(rows[-1]['event'],'lifetime-ended')
        finally:
            if process.poll() is None:process.kill();process.wait()
            process.stdin.close();process.stdout.close();process.stderr.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--executable',required=True);parser.add_argument('--metal-source',required=True)
    args=parser.parse_args();COMMAND=[args.executable,'--metal-source',args.metal_source]
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(WorkerTests))
    sys.exit(0 if result.wasSuccessful() else 1)
