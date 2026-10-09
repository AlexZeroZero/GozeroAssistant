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
const {startThreads,runningThreads}=require('./bnt-memory.cjs');
async function run(cfg,emit=console.log,deps={}){
 const Worker=deps.Worker||ComputeWorker,PoolClient=deps.Pool||Pool;
 address(cfg.wallet);
 const url=new URL(cfg.url);if(!['stratum+tcp:','stratum+ssl:'].includes(url.protocol))throw Error('Invalid pool protocol');
 if(!Number.isInteger(cfg.threads)||cfg.threads<1||cfg.threads>8)throw Error('BNT CPU threads must be 1..8');
 const manifest=JSON.parse(await fs.readFile(path.join(path.dirname(cfg.core),'MANIFEST.json'),'utf8'));
 if(manifest.arch!=='arm64'||manifest.sha256!==crypto.createHash('sha256').update(await fs.readFile(cfg.core)).digest('hex'))throw Error('BNT 内核完整性校验失败');
 const memoryInfo=deps.memoryInfo|| (async()=>JSON.parse((await exec(cfg.core,['--info'],{timeout:10000})).stdout));
 const info=await memoryInfo(),count=startThreads(cfg.threads,info);
 if(!count)throw Error('BNT 当前内存压力过高或不足以分配一个 2 GiB 线程，请稍后重试');
 const send=e=>emit(JSON.stringify(e));const workers=[];let stopped=false,timer,memoryTimer,memoryPoll=null,hashes=0,lastHashes=0,lastAt=Date.now(),sequence=0,loops=[];
 const totals={submitted:0,accepted:0,rejected:0};
 const pool=new PoolClient([cfg.url],cfg.wallet,cfg.worker,{deviceModel:'Apple Silicon CPU'});
 let resolveStop;const ended=new Promise(r=>resolveStop=r);
 const stop=()=>{if(stopped)return;stopped=true;pool.stop();clearInterval(timer);clearInterval(memoryTimer);resolveStop();};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 const parent=process.ppid;const parentTimer=setInterval(()=>{try{process.kill(parent,0)}catch{stop()}},2000);
 const deadline=cfg.seconds>0?setTimeout(stop,cfg.seconds*1000):null;
 const sample=()=>{const now=Date.now(),rate=pool.logged&&pool.job?(hashes-lastHashes)/((now-lastAt)/1000):0;lastHashes=hashes;lastAt=now;send({event:'hashrate',hashes_per_second:rate,...totals});};
 try{
  for(let i=0;i<count&&!stopped;i++){
   if(i>0&&startThreads(1,await memoryInfo())===0)break;
   const w=new Worker(cfg.core,'native',{pages:'off'});workers.push(w);
   try{await w.ready;}catch(e){
    if(i>0&&/memory pressure|budget|allocation failed/i.test(e.message)){workers.pop();await w.stop();break;}
    throw e;
   }
   const v=vectors[i%vectors.length];const result=await w.hash({id:'selftest',header:v.header,nonce:v.nonce});
   if(result.hash!==v.hash||result.nonce!==v.nonce)throw Error('BNT 完整参数启动自检失败');
   send({event:'selftest_passed',thread:i+1,memoryKiB:2097152});
  }
  if(stopped)return;
  send({event:'memory_threads',requested:cfg.threads,active:workers.length,pressure:info.pressureLevel});
  pool.on('log',message=>send({event:'pool_log',message}));
  pool.on('offline',()=>{if(stopped)return;lastAt=Date.now();lastHashes=hashes;send({event:'connection_error',reason:'BNT disconnected'});});
  pool.on('job',j=>send({event:'job',job_id:j.id,height:j.height}));
  pool.on('share',(ok,error)=>{totals[ok?'accepted':'rejected']++;send({event:ok?'share_accepted':'share_rejected',reason:error});});
  pool.connect();lastAt=Date.now();timer=setInterval(sample,5000);
  loops=workers.map(async w=>{try{while(!stopped&&!w.retired){
   const j=pool.job;if(!pool.logged||!j||j.next>j.end){await pause(100);continue;}
   const n=j.next++;const result=await w.hash({id:String(++sequence),header:j.header,target:j.target,nonce:n.toString()});
   if(stopped||w.retired)break;
   if(result.nonce!==n.toString()||! /^[a-f0-9]{64}$/.test(result.hash))throw Error('Invalid BNT worker result');
   hashes++;
   if(pool.job===j&&BigInt('0x'+result.hash)<=BigInt('0x'+j.target)&&pool.submit(j,n,result.hash)){totals.submitted++;send({event:'share_submitted'});}
  }}catch(e){if(!stopped&&!w.retired)throw e;}});
  memoryTimer=setInterval(()=>{
   if(stopped||memoryPoll)return;
   memoryPoll=(async()=>{
    const info=await memoryInfo();if(stopped)return;
    const active=workers.filter(w=>!w.retired),keep=runningThreads(active.length,info.pressureLevel);
    if(keep===active.length)return;
    send({event:'memory_threads',requested:cfg.threads,active:keep,pressure:info.pressureLevel});
    if(!keep){send({event:'memory_stop',message:'系统内存压力严重，已停止 BNT 并释放计算内存'});stop();return;}
    for(const w of active.slice(keep)){w.retired=true;await w.stop();}
   })().catch(e=>{if(!stopped){send({event:'memory_stop',message:e.message});stop();}}).finally(()=>memoryPoll=null);
  },deps.memoryIntervalMs||5000);
  let failure;const completion=Promise.all(loops).catch(e=>{if(!stopped){failure=e;stop();}});
  await ended;await Promise.allSettled(workers.map(w=>w.stop()));await completion;if(failure)throw failure;
 }finally{
  stop();clearTimeout(deadline);clearInterval(parentTimer);process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  await memoryPoll;await Promise.allSettled(workers.map(w=>w.stop()));await Promise.allSettled(loops);
  send({event:'summary',...totals,hashes});
 }
}
if(require.main===module){
 const args=process.argv.slice(2),cfg={};for(let i=0;i<args.length;i+=2)cfg[args[i].replace(/^--/,'')]=args[i+1];
 cfg.threads=Number(cfg.threads);cfg.seconds=Number(cfg.seconds||0);
 run(cfg).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={run};
