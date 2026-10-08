"""Bounded local HTTP pool integration for the native batch runner.

No public pool or payout. Validates actual SHA256d shares, cached target changes,
job rollover, and stop-file cleanup. Uses the app guard's balanced duty budget
and the same 90 C default cutoff; this is a correctness test, not a benchmark.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import tempfile
import threading
import time

root = Path(__file__).resolve().parents[3]
exe = root/'desktop/native/ysr/GozeroYsrCore.exe'
wallet='ysr1m6fp4w5hfjnpsxld9tnmx7e2p2sfejp9kqwkhg'
state={'accepted':0,'closed':False,'jobs':set(),'bad':[],'seen':set()}
lock=threading.Lock()
began=None

def job():
    elapsed=time.monotonic()-began
    height=1 if elapsed<3 else 2
    target=((1<<256)-1) if state['accepted']==0 else (1<<240)//256
    return {'version':1,'height':height,'prevHash':'00'*32,'merkleRoot':'11'*32,
            'stateRoot':'22'*32,'timestamp':'1791345600','difficulty':1,'txCount':0,
            'jobId':str(height),'target':target.to_bytes(32,'big').hex()}

def hash_nonce(j,n):
    header=(j['version'].to_bytes(4,'little')+j['height'].to_bytes(4,'little')+
            bytes.fromhex(j['prevHash']+j['merkleRoot']+j['stateRoot'])+
            int(j['timestamp']).to_bytes(8,'little')+j['difficulty'].to_bytes(4,'little')+
            j['txCount'].to_bytes(4,'little')+(12345).to_bytes(8,'little')+n.to_bytes(8,'little'))
    assert len(header)==136
    return hashlib.sha256(hashlib.sha256(header).digest()).digest()

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,data):
        b=json.dumps(data).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
    def do_GET(self):
        assert self.path.startswith('/api/v2/job?session=test')
        with lock:
            j=job();state['jobs'].add(j['jobId']);self.reply(j)
    def do_POST(self):
        global began
        data=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        with lock:
            if self.path=='/api/v2/session':
                assert data['address']==wallet;began=time.monotonic()
                self.reply({'sessionId':'test','extranonce':'12345','address':wallet,'mode':'pool'})
            elif self.path=='/api/v2/session/stop':
                state['closed']=True;self.reply({'ok':True})
            elif self.path=='/api/v2/share':
                j=job();n=int(data['nonce'])
                if data['jobId']!=j['jobId']:
                    self.reply({'accepted':False,'reason':'job_expired'});return
                key=(data['jobId'],n)
                if key in state['seen'] or hash_nonce(j,n)>bytes.fromhex(j['target']):
                    state['bad'].append(data);self.reply({'accepted':False,'reason':'invalid_hash'});return
                state['seen'].add(key);state['accepted']+=1
                self.reply({'accepted':True,'shareDifficulty':'256'})
            else:raise AssertionError(self.path)

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory(prefix='ysr-pipeline-') as folder:
    stop=Path(folder)/'stop';log=Path(folder)/'log.txt';process=None
    try:
        uuids=subprocess.check_output(['nvidia-smi','--query-gpu=uuid','--format=csv,noheader'],text=True).strip().splitlines()
        assert len(uuids)==1,'Set up an explicitly selected-device test on multi-GPU systems'
        process=subprocess.Popen([str(root/'desktop/vendor/ProcessGuard.exe'),str(os.getpid())],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        args=['--mine','--api',f'http://127.0.0.1:{server.server_port}','--wallet',wallet,'--seconds','30','--stop-file',str(stop)]
        process.stdin.write(json.dumps({'exe':str(exe),'cwd':str(folder),'args':args,'duty':68,'capturePath':str(log),'cudaUuid':uuids[0]})+'\n');process.stdin.flush()
        deadline=time.monotonic()+40
        while process.poll() is None:
            temp=int(subprocess.check_output(['nvidia-smi','--query-gpu=temperature.gpu','--format=csv,noheader,nounits'],text=True).strip().splitlines()[0])
            if temp>=90:raise AssertionError('Thermal cutoff')
            if began and time.monotonic()-began>6:
                stop.touch();break
            if time.monotonic()>deadline:raise AssertionError('Watchdog timeout')
            time.sleep(0.5)
        process.wait(timeout=8)
        assert log.exists(),process.stderr.read()
        text=log.read_text(encoding='utf-8-sig')
        assert process.returncode==0,text
        assert 'GPU selftest PASSED' in text and 'YSR stopping' in text,text
        assert state['accepted']>=2 and state['jobs']=={'1','2'} and state['closed'] and not state['bad'],str(state)
        assert re.search(r'retargeted=[1-9]',text),text
        assert re.search(r'overflowRetries=[1-9]',text),text
        target=root/'.local/yskar-research/pipeline-013.log';target.write_text(text,encoding='utf-8')
        print(json.dumps({'passed':True,'accepted':state['accepted'],'jobs':sorted(state['jobs']),'sessionClosed':state['closed'],'invalidShares':len(state['bad'])}))
    finally:
        stop.touch()
        if process and process.poll() is None:
            try:process.wait(timeout=8)
            except subprocess.TimeoutExpired:process.kill();process.wait()
        server.shutdown();server.server_close()
