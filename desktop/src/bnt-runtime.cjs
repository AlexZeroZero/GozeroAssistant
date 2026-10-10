'use strict';
const {Pool}=require('./bnt-pool.cjs'),{ComputeWorker}=require('./bnt-worker.cjs');
const {HashWindows}=require('./hash-windows.cjs');
const {cpuDevice}=require('./mining-devices.cjs');
const {poolUrls}=require('./pool-catalog.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function report(miner,j,pool,stats,now=Date.now()){
 const elapsed=(now-stats.lastAt)/1000,completed=stats.hashes-stats.lastHashes;stats.lastHashes=stats.hashes;stats.lastAt=now;
 if(!pool.logged||!pool.job){
  stats.started=false;j.status='waiting';j.telemetry=null;miner.hashWindows?.unavailable(j.id);j.lastMessage=pool.connection?.message||'等待矿池任务';miner.changed();return;
 }
 if(!stats.started&&!completed){j.status='waiting';j.lastMessage='已收到任务，正在初始化 CPU 计算';miner.changed();return}
 stats.started=true;j.status='running';miner.ingestLine(j,'CPU TOTAL '+(elapsed>0?completed/elapsed:0).toFixed(3)+' H/s | accepted='+j.shares.accepted+' rejected='+j.shares.rejected+' stale=0');miner.changed();
}
async function start(miner,c,hw,benchmark){
 require('./bnt.cjs').address(c.wallets.BNT);
 if(!hw.metrics?.at||Date.now()-hw.metrics.at>15000)throw Error('请刷新硬件监测后重试');
 // Re-read physical memory at launch, including fee restarts, rather than
 // trusting a UI estimate made before another application allocated RAM.
 const os=require('node:os');hw={...hw,metrics:{...hw.metrics,totalMemory:os.totalmem(),freeMemory:os.freemem()}};
 const budget=require('./bnt.cjs').memoryBudget(hw),count=require('./bnt.cjs').threads(c,hw);
 miner.configure(c);miner.status='starting';miner.changed();const generation=miner.generation=(miner.generation||0)+1;
 const runtime={stopped:false,workers:[],pool:null,loops:[]};miner.bnt=runtime;
 try{
 if(!await miner.installed(c))throw Error('请先安装 BNT 内核');if(runtime.stopped||generation!==miner.generation)throw Error('启动已取消');
 const tuning=await require('./bnt-tuning.cjs').policy(miner.exe,miner.baseDir,c,hw,count);
 if(runtime.stopped||generation!==miner.generation)throw Error('启动已取消');
 const device=cpuDevice(hw),startedAt=Date.now();miner.session={coin:'BNT',kernelId:miner.currentKernel.id,selected:[device.id],devices:[device],startedAt,performance:c.performance,duty:c.performance,cpuThreads:count,bntBudget:budget,temperature:c.temperature,benchmark};
 miner.hashWindows=new HashWindows([device.id],c.hashWindowMinutes,startedAt);miner.jobs.clear();
 const j={id:device.id,name:device.name,status:'starting',telemetry:null,samples:[],powers:[],shares:{accepted:0,rejected:0},lastMessage:'等待矿池任务',pid:null};miner.jobs.set(j.id,j);
 const stats={hashes:0,lastHashes:0,lastAt:Date.now(),started:false,workers:count};let sequence=0;
 const pool=runtime.pool=new Pool(poolUrls(c),c.wallets.BNT,require('./pool-identity.cjs').identity(c,device).worker,{deviceModel:require('./pool-identity.cjs').identity(c,device).model});
 pool.on('state',()=>miner.changed());pool.on('log',msg=>{j.lastMessage=msg;miner.log('矿池',msg);miner.changed()});pool.on('job',job=>{miner.log('矿池','BNT 区块 #'+job.height+' · 收到新任务');miner.changed()});pool.on('offline',()=>{stats.started=false;stats.lastHashes=stats.hashes;stats.lastAt=Date.now();j.status='waiting';j.telemetry=null;miner.hashWindows.unavailable(j.id);miner.changed()});
 pool.on('share',(ok,error)=>{j.shares[ok?'accepted':'rejected']++;miner.log('份额',ok?'BNT accepted · A '+j.shares.accepted:'BNT rejected · '+String(error).slice(0,160));miner.changed()});pool.connect();
 // Each process retains its 2 GiB scratch. Closing the app closes stdin, so
 // even an abrupt parent exit cannot leave an unbounded mining loop behind.
 let large=0,bound=0,engine='';
 for(let i=0;i<count;i++){if(runtime.stopped)throw Error('启动已取消');const w=new ComputeWorker(miner.exe,tuning.plan.engine,{pages:tuning.plan.pages,binding:tuning.plan.affinity?tuning.cpus[i]||null:null});runtime.workers.push(w);const ready=await w.ready;large+=ready.memory?.largePages?1:0;bound+=ready.placement?.bound?1:0;engine=ready.engine;}
 miner.session.bntOptimization={engine,largePageWorkers:large,boundWorkers:bound,tuned:!!tuning.plan.tuned,source:tuning.source,reason:tuning.reason,pagesRequested:tuning.plan.pages};
 miner.log('优化','BNT '+engine+' · '+count+' T · '+c.performance+'% · 核心绑定 '+bound+'/'+count+' · 大页 '+large+'/'+count+' ('+tuning.plan.pages+')'+(tuning.plan.tuned?' · 已使用调优结果':' · 常规配置'));
 if(tuning.reason==='hardware')miner.log('优化','调优记录与当前硬件或内核不匹配，使用常规配置');
 if(tuning.reason==='settings')miner.log('优化','线程数或性能档位与调优记录不一致，使用常规配置');
 if(runtime.stopped)throw Error('启动已取消');j.status='waiting';j.pid=runtime.workers[0].child.pid;miner.status='running';miner.changed();miner.log('运行','BNT CPU · '+count+' 线程 · '+count*2+' GiB · '+c.performance+'% · 等待有效矿池任务');
 runtime.timer=setInterval(()=>report(miner,j,pool,stats),5000);
 runtime.loops=runtime.workers.map(async(w,index)=>{while(!runtime.stopped){const job=pool.job;if(!pool.logged||!job||job.next>job.end){await pause(100);continue}const n=job.next++,id=String(++sequence),begin=Date.now();const r=await w.hash({id,header:job.header,target:job.target,nonce:n.toString()});if(runtime.stopped)break;stats.hashes++;if(r.nonce!==n.toString()||! /^[a-f0-9]{64}$/i.test(r.hash))throw Error('BNT 内核返回无效结果');if(pool.job===job&&BigInt('0x'+r.hash)<=BigInt('0x'+job.target))pool.submit(job,n,r.hash);const sleep=(Date.now()-begin)*(100/c.performance-1);if(sleep>0)await pause(Math.min(sleep,3000));}});
 Promise.all(runtime.loops).catch(e=>{if(!runtime.stopped){miner.log('错误',e.message);miner.stop('BNT 内核运行失败').catch(()=>{})}});
 if(benchmark)runtime.end=setTimeout(()=>miner.finishBenchmark().catch(()=>{}),60000);return miner.snapshot();
 }catch(e){await miner.stop('启动失败：'+e.message);throw e}
}
async function stop(miner,reason){const r=miner.bnt;if(!r)return;r.stopped=true;miner.generation++;clearInterval(r.timer);clearTimeout(r.end);r.pool?.stop();miner.status='stopping';miner.changed();await Promise.allSettled(r.workers.map(w=>w.stop()));await Promise.allSettled(r.loops);miner.hashWindows?.stop();for(const j of miner.jobs.values()){j.status='stopped';j.telemetry=null}miner.status='idle';miner.bnt=null;miner.log('停止',reason);miner.changed();return miner.snapshot()}
module.exports={start,stop,report};
