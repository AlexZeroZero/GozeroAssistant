"""Compare two PRL builds in separate persistent processes, with real admission.

Run using PRL's Python environment. Each root must contain miner/, pmkcore/,
and libpmk/.build/release (including its matching resource bundle). Both
admission files must come from full G3 validation of that exact build.
No pool connection. Hard-target full pipelines, two slots, 60 seconds warmup,
then eight alternating ABBA blocks at each of 2048 and 4096. Rates are ops/s.
"""
import argparse,asyncio,json,os,sys,time,statistics
from pathlib import Path

async def worker():
 p=Path(sys.argv[2]);sys.path.insert(0,str(p/'miner'))
 from pmk_miner.native import Native
 from pmk_miner.pipeline import Pipeline,Shape
 from pmk_miner.transport import GatewayJob
 lib=p/'libpmk/.build/release/libpmk.dylib';os.environ['PMK_RESOURCE_BUNDLE']=str(lib.parent/'libpmk_PMK.bundle')
 n=Native(metal=str(lib),kernel='sg');pipes={}
 async def submit(*a):raise AssertionError('unexpected proof')
 header=(1).to_bytes(4,'little')+bytes(64)+(1).to_bytes(4,'little')+(0x03000001).to_bytes(4,'little');job=GatewayJob(header,1,3)
 for dim in [2048,4096]:
  pipe=Pipeline(n,Shape(dim,dim,4096,2),lambda *a,**k:None);pipe.set_template(job);pipes[dim]=pipe
 print(json.dumps({'ready':True,'probe':n.probe_key}),flush=True)
 try:
  for line in sys.stdin:
   cmd=json.loads(line);dim=cmd['dim'];seconds=cmd['seconds'];t=time.perf_counter();ops=0;count=0;gpu=[]
   while time.perf_counter()-t<seconds:
    recs=await asyncio.gather(*[pipes[dim].run(i,1,0x03000001,submit,lambda j:j is job) for i in range(2)])
    assert all(r.state=='released' and r.completed_ops==2*dim*dim*4096 for r in recs)
    ops+=sum(r.completed_ops for r in recs);count+=len(recs);gpu.extend(r.gpu_seconds for r in recs)
   elapsed=time.perf_counter()-t
   print(json.dumps(dict(rate=ops/elapsed,seconds=elapsed,ops=ops,jobs=count,gpu_median=statistics.median(gpu))),flush=True)
 finally:
  for pipe in pipes.values():pipe.cancel()
  n.close()
async def controller():
 parser=argparse.ArgumentParser(description=__doc__)
 for name in ['baseline-root','candidate-root','baseline-admission','candidate-admission','output']:parser.add_argument('--'+name,type=Path,required=True)
 args=parser.parse_args();args.output.parent.mkdir(parents=True,exist_ok=True)
 workers=[];rows=[]
 try:
  for idx in [0,1]:
   root=args.baseline_root if idx==0 else args.candidate_root
   admission=args.baseline_admission if idx==0 else args.candidate_admission
   state=admission.parent
   env=dict(os.environ,PMK_HOME=str(state.resolve()),PMK_G3_ADMISSION_FILE=str(admission.resolve()))
   for key in ['GZ_PRL_BASELINE','GZ_PRL_FP32','PMK_PROFILE_JSON','PMK_PROFILE_SPLIT_CB']:
    env.pop(key,None)
   child=await asyncio.create_subprocess_exec(sys.executable,__file__,'worker',str(root.resolve()),env=env,stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE)
   workers.append(child)
   ready=json.loads(await asyncio.wait_for(child.stdout.readline(),60));assert ready['ready'];print(json.dumps(dict(index=idx,**ready)),flush=True)
  async def block(idx,dim,seconds):
   w=workers[idx];w.stdin.write((json.dumps(dict(dim=dim,seconds=seconds))+'\n').encode());await w.stdin.drain();return json.loads(await asyncio.wait_for(w.stdout.readline(),seconds+60))
  for rep in range(6):
   for idx in [0,1]:print(json.dumps(dict(phase='warmup',index=idx,**await block(idx,4096,5))),flush=True)
  for dim in [2048,4096]:
   for rep in range(8):
    for idx in ([0,1,1,0] if rep%2==0 else [1,0,0,1]):
     row=dict(dim=dim,block=rep,index=idx,**await block(idx,dim,2));rows.append(row);print(json.dumps(row),flush=True)
  args.output.write_text(json.dumps(rows,indent=2),encoding='utf-8')
 finally:
  for w in workers:w.stdin.close()
  for w in workers:
   try:await asyncio.wait_for(w.wait(),15)
   except asyncio.TimeoutError:
    w.kill();await w.wait();raise
asyncio.run(worker() if len(sys.argv)>1 and sys.argv[1]=='worker' else controller())
