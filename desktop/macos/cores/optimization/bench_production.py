import argparse,asyncio,json,os,subprocess,time,sys,statistics
from pathlib import Path
parser=argparse.ArgumentParser(description="Paired ABBA offline benchmarks; requires real PRL G3 admission for both profiles.")
parser.add_argument('mode',choices=['qtc','prl'])
parser.add_argument('--quantus',type=Path,required=True)
parser.add_argument('--pearl',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args();o=args.output;o.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'qtc'))
from pool_miner import next_batch
async def qtc():
 workers=[];counter=0;nonce=0;rows=[]
 try:
  for baseline in [True,False]:
   p=await asyncio.create_subprocess_exec(str(args.quantus/'target/release/examples/gozero_worker'),stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,env=dict(os.environ,GZ_QTC_BASELINE_SHADER='1' if baseline else '0'))
   ready=json.loads(await p.stdout.readline());assert ready['max_batch']==1048576;workers.append(p)
  async def dispatch(index,count):
   nonlocal counter,nonce
   counter+=1;start=time.perf_counter();p=workers[index]
   p.stdin.write((f'{counter} '+('42'*32)+f' {(1<<512)-1} {nonce:0128x} {count}\n').encode())
   await p.stdin.drain();result=json.loads(await p.stdout.readline());elapsed=time.perf_counter()-start
   assert result['id']==counter and result['hashes']==count and 'nonce' not in result,result
   nonce+=count;return elapsed
  for i in [0,1]:
   for _ in range(12):await dispatch(i,1048576)
  for mode in ['kernel_same_batch','production_adaptive']:
   batches=[1048576,1048576] if mode=='kernel_same_batch' else [262144,262144]
   for block in range(8):
    for index in ([0,1,1,0] if block%2==0 else [1,0,0,1]):
     begin=time.perf_counter();hashes=0;times=[]
     while time.perf_counter()-begin<2:
      count=batches[index];elapsed=await dispatch(index,count);times.append(elapsed);hashes+=count
      if mode=='production_adaptive' and index==1:batches[index]=next_batch(count,elapsed,1048576)
     row=dict(coin='QTC',mode=mode,block=block,index=index,hashes=hashes,seconds=time.perf_counter()-begin,batch=batches[index],p95_seconds=sorted(times)[int(.95*(len(times)-1))]);row['rate']=hashes/row['seconds'];rows.append(row);print(json.dumps(row),flush=True)
  (o/'qtc-worker-abba.json').write_text(json.dumps(rows,indent=2))
 finally:
  for p in workers:p.stdin.close()
  for p in workers:await asyncio.wait_for(p.wait(),15)
async def prl():
 sys.path.insert(0,str(args.pearl/'miner'))
 from pmk_miner.native import Native
 from pmk_miner.pipeline import Pipeline,Shape
 from pmk_miner.transport import GatewayJob
 natives=[];rows=[]
 try:
  for baseline in [True,False]:
   os.environ['GZ_PRL_BASELINE']='1' if baseline else '0';os.environ['PMK_HOME']=str(o/('baseline-admission' if baseline else 'pmk-state'))
   os.environ['PMK_G3_ADMISSION_FILE']=str(Path(os.environ['PMK_HOME'])/'g3-admission.json')
   natives.append(Native(kernel='sg'))
  async def submit(*args):raise AssertionError('unexpected proof with hard target')
  for dimension in [2048,4096]:
   pipes=[];shape=Shape(dimension,dimension,4096,2)
   header=(1).to_bytes(4,'little')+bytes(64)+(1).to_bytes(4,'little')+(0x03000001).to_bytes(4,'little')
   job=GatewayJob(header,1,3)
   for native in natives:
    pipe=Pipeline(native,shape,lambda *a,**kw:None);pipe.set_template(job);pipes.append(pipe)
   async def batch(index):
    records=await asyncio.gather(*[pipes[index].run(slot,1,0x03000001,submit,lambda j:j is job) for slot in range(2)])
    assert all(rec.state=='released' and rec.completed_ops==shape.ops for rec in records)
    return records
   for index in [0,1]:
    for _ in range(3):await batch(index)
   for block in range(8):
    for index in ([0,1,1,0] if block%2==0 else [1,0,0,1]):
     begin=time.perf_counter();ops=0;gpu=[];jobs=0
     while time.perf_counter()-begin<2:
      recs=await batch(index);ops+=sum(rec.completed_ops for rec in recs);gpu.extend(rec.gpu_seconds for rec in recs);jobs+=len(recs)
     row=dict(coin='PRL',dimension=dimension,block=block,index=index,ops=ops,jobs=jobs,seconds=time.perf_counter()-begin,gpu_median_seconds=statistics.median(gpu));row['rate']=ops/row['seconds'];rows.append(row);print(json.dumps(row),flush=True)
   for pipe in pipes:pipe.cancel()
  (o/'prl-pipeline-abba.json').write_text(json.dumps(rows,indent=2))
 finally:
  for native in natives:native.close()
asyncio.run(qtc() if args.mode=='qtc' else prl())

