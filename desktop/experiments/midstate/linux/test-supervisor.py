#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path
import signal
import subprocess
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('supervisor',Path(__file__).with_name('run-miner.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/'config.json'
        self.base={'pool':'stratum+tcp://mds.gozero.trade:13333','wallet':'a'*64,'mss_confirmed':True,'worker_prefix':'rig'}
    def config(self,**kwargs):
        self.path.write_text(json.dumps({**self.base,**kwargs}));return m.load_config(self.path)
    def test_invalid_wallet_and_confirmation(self):
        for change in [{'wallet':'YOUR_ADDRESS'},{'mss_confirmed':False},{'wallet':'a'*63}]:
            with self.assertRaises(ValueError):self.config(**change)
    def test_reject_bad_pool_budget_and_temperature(self):
        for change in [{'pool':'https://pool:443'},{'pool':'stratum+tcp://user@pool:1'},{'duty':float('nan')},{'duty':1.01},{'temp_stop':100},{'temp_resume':85},{'gpus':['all','all']}]:
            with self.assertRaises(ValueError):self.config(**change)
    def test_tested_profile_and_other_gpu_auto(self):
        c=self.config();a=m.command('/tmp/core',c,'NVIDIA GeForce RTX 3090',0)
        self.assertEqual(a[a.index('--cuda-batch')+1],'20992')
        for name in ['RTX 4090','RTX 3090 Ti','RTX 5060 Laptop GPU']:
            a=m.command('/tmp/core',c,name,1);self.assertEqual(a[a.index('--cuda-batch')+1],'0')
        a=m.command('/tmp/core',self.config(profile='tune'),'RTX 3090',1)
        self.assertEqual(a[a.index('--cuda-unroll')+1],'0')
    def test_same_user_duplicate_gpu_lock(self):
        d=Path(self.tmp.name)/'locks';fd=m.acquire_lock('GPU-test',d)
        try:
            with self.assertRaises(RuntimeError):m.acquire_lock('GPU-test',d)
        finally:m.os.close(fd)
    def test_shutdown_only_owns_children(self):
        other=subprocess.Popen(['sleep','30'],start_new_session=True)
        owned=subprocess.Popen(['sleep','30'],start_new_session=True)
        try:
            m.stop_owned([owned]);self.assertIsNotNone(owned.poll());self.assertIsNone(other.poll())
        finally:
            if other.poll() is None:other.terminate()
            other.wait(timeout=5)

if __name__=='__main__':unittest.main()
