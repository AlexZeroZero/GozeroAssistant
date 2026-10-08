"""Build local YSR CUDA miner from pinned MIT source; never starts mining."""
from pathlib import Path
import hashlib
import json
import os
import random
import shutil
import subprocess
from validate_cuda import compile_ptx, ROOT

workspace=ROOT.parents[2]
out=workspace/'.local/gozer-build/ysr-core-0.1.3'
out.mkdir(parents=True,exist_ok=True)
meta=json.loads((ROOT/'provenance.json').read_text())
for name,digest in meta['files'].items():
    if hashlib.sha256((ROOT/'upstream'/name).read_bytes()).hexdigest()!=digest:
        raise RuntimeError('Upstream input changed: '+name)
(out/'ysr.ptx').write_bytes(compile_ptx(workspace/'.local/gozer-build/nvrtc13',miner=True))
csc=Path(os.environ['SystemRoot'])/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
subprocess.run([str(csc),'/nologo','/target:exe','/platform:x64','/optimize+',
 '/r:System.Web.Extensions.dll','/r:System.Numerics.dll','/out:'+str(out/'GozeroYsrCore.exe'),str(ROOT/'GozeroYsrCore.cs')],check=True)
js="import {GENESIS,serializeHeader,toHex} from './upstream/miner/src/header.mjs'; console.log(toHex(serializeHeader(GENESIS,GENESIS.nonce)));"
genesis=bytes.fromhex(subprocess.check_output(['node','--input-type=module','-e',js],cwd=ROOT,text=True).strip())
rng=random.Random(20261007)
headers=[genesis]+[rng.randbytes(136) for _ in range(16)]
(out/'selftest.json').write_text(json.dumps([{'header':h.hex(),'digest':hashlib.sha256(hashlib.sha256(h).digest()).hexdigest()} for h in headers],indent=2)+'\n',encoding='utf-8')
shutil.copy2(ROOT/'upstream/LICENSE',out/'LICENSE-YSKAR.txt')
(out/'NOTICE.txt').write_text('Gozero YSR 0.1.3\nSHA-256d functions: Copyright (c) 2026 The YSKAR developers, MIT.\nUpstream commit '+meta['commit']+'\nGozero changes: bounded candidate list; C# HTTP pool host, CPU candidate verification, job lifecycle, explicit start and JSON-free rate logs. No third-party miner fee. GozeroAssistant service fee is scheduled by its separate disclosed controller.\n',encoding='utf-8')
files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file() and p.name in ['GozeroYsrCore.exe','ysr.ptx','selftest.json','LICENSE-YSKAR.txt','NOTICE.txt']}
metadata={'id':'gozero-ysr-0.1.3','name':'Gozero YSR CUDA','version':'0.1.3','exe':'GozeroYsrCore.exe','exeSha256':files['GozeroYsrCore.exe'],'files':files,'source':'https://github.com/dabitlex/YSKAR/tree/'+meta['commit']+'/node-core/gpu','kernelFee':0,'bundled':True,'bundleDirectory':'ysr','captureOutput':True}
(out/'metadata.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
if '--stage' in __import__('sys').argv:
    dest=ROOT.parents[1]/'native/ysr';dest.mkdir(parents=True,exist_ok=True)
    for name in files:shutil.copy2(out/name,dest/name)
    (ROOT.parents[1]/'src/ysr-kernel.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
print(str(out))
