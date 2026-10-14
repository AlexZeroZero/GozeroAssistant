'use strict';
// Separate Node controller: native workers own scratch memory and exit on stdin EOF.
const {Pool}=require('../../src/bnt-pool.cjs');
const {ComputeWorker}=require('../../src/bnt-worker.cjs');
const {address}=require('../../src/bnt.cjs');
const {execFile}=require('node:child_process');
const exec=require('node:util').promisify(execFile);
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const vectors=require('../../src/bnt-vectors.json');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const {threadLimit,memoryPlan}=require('./bnt-memory.cjs');
const {availableParallelism}=require('node:os');
async function run(cfg,emit=console.log,deps={}){
 const Worker=deps.Worker||ComputeWorker,PoolClient=deps.Pool||Pool;
 address(cfg.wallet);const limit=Math.min(threadLimit(cfg.threads),deps.logicalCPUs??availableParallelism());
 const url=new URL(cfg.url);if(!['stratum+tcp:','stratum+ssl:'].includes(url.protocol))throw Error('Invalid pool protocol');
 const manifest=JSON.parse(await fs.readFile(path.join(path.dirname(cfg.core),'MANIFEST.json'),'utf8'));
 if(manifest.arch!=='arm64'||manifest.sha256!==crypto.createHash('sha256').update(await fs.readFile(cfg.core)).digest('hex'))throw Error('BNT 内核完整性校验失败');
 const memoryInfo=deps.memoryInfo|| (async()=>JSON.parse((await exec(cfg.core,['--info'],{timeout:10000})).stdout));
 const send=e=>emit(JSON.stringify(e)),workers=new Set(),tasks=new Set();
 let stopped=false,timer,memoryTimer,memoryPoll=null,spawning=false,hashes=0,lastHashes=0,lastAt=Date.now(),sequence=0;
 let stable=0,retryAt=0,queryErrors=0,failure,lastState='',pressure=0;
 const totals={submitted:0,accepted:0,rejected:0};
 const pool=new PoolClient([cfg.url],cfg.wallet,cfg.worker,{deviceModel:'Apple Silicon CPU'});
 let resolveStop;const ended=new Promise(r=>resolveStop=r);
 const track=p=>{tasks.add(p);p.then(()=>tasks.delete(p),()=>tasks.delete(p));return p;};
 const active=()=>[...workers].filter(w=>!w.retired&&w.verified).length;
 const report=()=>{
  const n=active(),state=n?'running':'memory-wait',key=n+':'+state+':'+pressure;
  if(key===lastState||stopped)return;lastState=key;
  if(!n){lastHashes=hashes;lastAt=Date.now();}
  send({event:'memory_threads',requested:cfg.threads,active:n,pressure,state});
 };
 const retire=w=>{
  if(w.closing)return w.closing;w.retired=true;
  // Register stop immediately; shutdown also waits for retiring workers.
  w.closing=track(Promise.resolve().then(()=>w.stop()).finally(()=>workers.delete(w)));
  return w.closing;
 };
 const stop=()=>{
  if(stopped)return;stopped=true;pool.stop();clearInterval(timer);clearInterval(memoryTimer);
  for(const w of workers)retire(w).catch(e=>failure||=e);resolveStop();
 };
 const fatal=e=>{if(!stopped){failure=e;stop();}};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 deps.signal?.addEventListener('abort',stop,{once:true});if(deps.signal?.aborted)stop();
 const parent=process.ppid;const parentTimer=setInterval(()=>{try{process.kill(parent,0)}catch{stop()}},2000);
 const deadline=cfg.seconds>0?setTimeout(stop,cfg.seconds*1000):null;
 const loop=async w=>{
  try{while(!stopped&&!w.retired){
   const j=pool.job;if(!pool.logged||!j||j.next>j.end){await pause(100);continue;}
   const n=j.next++;const result=await w.hash({id:String(++sequence),header:j.header,target:j.target,nonce:n.toString()});
   if(stopped||w.retired)break;
   if(result.nonce!==n.toString()||! /^[a-f0-9]{64}$/.test(result.hash))throw Error('Invalid BNT worker result');
   hashes++;
   if(pool.job===j&&BigInt('0x'+result.hash)<=BigInt('0x'+j.target)&&pool.submit(j,n,result.hash)){totals.submitted++;send({event:'share_submitted'});}
  }}catch(e){if(!stopped&&!w.retired)fatal(e);}
 };
 const spawnOne=async()=>{
  spawning=true;let w;
  try{
   if(stopped)return;
   w=new Worker(cfg.core,'native',{pages:'off'});workers.add(w);
   await w.ready;if(stopped||w.retired)return;
   const v=vectors[sequence%vectors.length],result=await w.hash({id:'selftest',header:v.header,nonce:v.nonce});
   if(stopped||w.retired)return;
   if(result.hash!==v.hash||result.nonce!==v.nonce)throw Error('BNT 完整参数启动自检失败');
   w.verified=true;send({event:'selftest_passed',memoryKiB:2097152});report();
   track(loop(w));
  }catch(e){
   if(!stopped&&!w?.retired){
    if(/memory pressure|budget|allocation failed/i.test(e.message)){
     retryAt=Date.now()+(deps.retryCooldownMs??30000);
     send({event:'memory_wait',message:'BNT 内存分配暂不可用，稍后自动重试'});
    }else fatal(e);
   }
  }finally{
   if(w&&!w.verified)await retire(w);
   spawning=false;stable=0;report();
  }
 };
 const poll=async initial=>{
  let info,plan;
  try{info=await memoryInfo();if(stopped)return;plan=memoryPlan(limit,workers.size,info);queryErrors=0;}
  catch(e){
   if(stopped)return;stable=0;
   if(++queryErrors===1)send({event:'memory_wait',message:'BNT 内存状态读取失败，暂停增加线程'});
   if(queryErrors>=3){pressure=0;await Promise.all([...workers].map(retire));report();}
   return;
  }
  if(stopped)return;pressure=info.pressureLevel;
  if(plan.keep<workers.size){
   stable=0;retryAt=Date.now()+(deps.retryCooldownMs??30000);
   // Pending allocations sort last: preserve existing hashing work on warning.
   const ordered=[...workers].sort((a,b)=>Number(b.verified||false)-Number(a.verified||false));
   const closing=ordered.slice(plan.keep).map(retire);report();await Promise.all(closing);return;
  }
  report();
  if(!plan.grow||spawning||Date.now()<retryAt){stable=0;return;}
  if(!initial&&++stable<(deps.stablePolls??3))return;
  stable=0;track(spawnOne().catch(fatal));
 };
 try{
  pool.on('log',message=>send({event:'pool_log',message}));
  pool.on('offline',()=>{if(stopped)return;lastAt=Date.now();lastHashes=hashes;send({event:'connection_error',reason:'BNT disconnected'});});
  pool.on('job',j=>send({event:'job',job_id:j.id,height:j.height}));
  pool.on('share',(ok,error)=>{totals[ok?'accepted':'rejected']++;send({event:ok?'share_accepted':'share_rejected',reason:error});});
  if(!stopped){
   pool.connect();
   timer=setInterval(()=>{const now=Date.now(),rate=active()&&pool.logged&&pool.job?(hashes-lastHashes)/Math.max(0.001,(now-lastAt)/1000):0;lastHashes=hashes;lastAt=now;send({event:'hashrate',hashes_per_second:rate,...totals});},5000);
   // Keep polling independent of allocation/selftest for prompt pressure/Stop response.
   memoryPoll=poll(true);await memoryPoll;memoryPoll=null;
   if(!stopped)memoryTimer=setInterval(()=>{
    if(stopped||memoryPoll)return;
    memoryPoll=poll(false).catch(fatal).finally(()=>memoryPoll=null);
   },deps.memoryIntervalMs??5000);
  }
  await ended;
 }finally{
  stop();clearTimeout(deadline);clearInterval(parentTimer);
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);deps.signal?.removeEventListener('abort',stop);
  await memoryPoll;await Promise.allSettled([...workers].map(retire));
  while(tasks.size)await Promise.allSettled([...tasks]);
  send({event:'summary',...totals,hashes});
 }
 if(failure)throw failure;
}
if(require.main===module){
 const args=process.argv.slice(2),cfg={};for(let i=0;i<args.length;i+=2)cfg[args[i].replace(/^--/,'')]=args[i+1];
 cfg.threads=Number(cfg.threads);cfg.seconds=Number(cfg.seconds||0);
 run(cfg).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={run};
