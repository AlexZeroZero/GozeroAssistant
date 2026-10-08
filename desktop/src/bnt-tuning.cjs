'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {ComputeWorker}=require('./bnt-worker.cjs'),{threadLimit}=require('./bnt.cjs');
const {bntThreadBudget}=require('../renderer/performance.js');
const exec=promisify(execFile),cache=new Map();
const HEADER='acb399cdb4e634ed5275f6e4f9407419343fa96ad71bbcc57a614941a3413f24388a1db594d4b93affc814719a2ce80a5f4554d1f8853b51ad67ee0d922cd86bce3f66f0454f443ae3580f08d28d5e0b03566f8425e271e670fc2d30';
const GOLDEN='7ede501774bc34ee386dd7e1460e41d6a5b3d3add5eced6459dde4cb85224971';
function fresh(hw){return{...hw,metrics:{...hw.metrics,totalMemory:os.totalmem(),freeMemory:os.freemem(),at:Date.now()}}}
async function coreInfo(exe){const st=await fs.stat(exe),key=exe+':'+st.size+':'+st.mtimeMs;if(!cache.has(key)){const {stdout}=await exec(exe,['--info'],{windowsHide:true,timeout:10000,maxBuffer:1024*1024});const info=JSON.parse(stdout);info.binarySha256=crypto.createHash('sha256').update(await fs.readFile(exe)).digest('hex');if(!Array.isArray(info.cpus)||typeof info.avx2!=='boolean')throw Error('BNT 内核能力读取失败');cache.set(key,info)}return cache.get(key)}
function fingerprintData(info,hw){return{version:info.version,binarySha256:info.binarySha256,avx2:info.avx2,avx512f:info.avx512f,cpus:info.cpus.map(({flags,...r})=>r),cpu:(hw.cpu||[]).map(({CurrentClockSpeed,...r})=>r),memory:hw.memory,total:hw.metrics?.totalMemory}}
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fingerprint(info,hw){return digest(fingerprintData(info,hw))}
function compatibleFingerprints(info,hw){const data=fingerprintData(info,hw);return[fingerprint(info,hw),digest({largePageToken:false,...data}),digest({largePageToken:true,...data})]}
function resolvePlan(info,hw,c,count,pref,profile){
 // Stream wins at some concurrency levels but can lose when memory bandwidth
 // is shared by more workers. Enable it only through a measured tuning plan.
 const fallback={engine:info.avx2?(count===1?'prefetch':'gozero'):'sse2',pages:pref?'auto':'off',affinity:false,threads:count,performance:c.performance};
 if(!profile)return{plan:fallback,source:'default',reason:'missing'};
 if(!compatibleFingerprints(info,hw).includes(profile.fingerprint))return{plan:fallback,source:'default',reason:'hardware'};
 if(!validPlan(profile.selected,info,count,c.performance))return{plan:fallback,source:'default',reason:'settings'};
 // Permission changes do not change the CPU/kernel identity. Preserve all
 // measured choices, including ordinary pages, until the user retunes.
 return{plan:{...profile.selected,tuned:true},source:'saved',reason:null};
}

function placements(info){
 const cores=new Map();for(const r of info.cpus||[]){if(!Number.isInteger(r.group)||!Number.isInteger(r.logical)||r.logical<0||r.logical>63)continue;const key=r.group+':'+r.core;if(!cores.has(key))cores.set(key,[]);cores.get(key).push(r)}
 const physical=[...cores.values()].map(rows=>rows.sort((a,b)=>a.logical-b.logical));
 const order=[];const max=Math.max(0,...physical.map(r=>r.length));
 // All physical cores before SMT siblings; fast cores first on hybrid CPUs.
 // Round-robin NUMA/cache domains avoids filling a single CCD first.
 for(let sibling=0;sibling<max;sibling++){
  const rows=physical.map(r=>r[sibling]).filter(Boolean);
  for(const efficiency of [...new Set(rows.map(r=>r.efficiency))].sort((a,b)=>b-a)){
   const buckets=new Map();for(const r of rows.filter(r=>r.efficiency===efficiency)){const k=r.group+':'+r.numa+':'+r.cache;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(r)}
   while([...buckets.values()].some(b=>b.length))for(const b of buckets.values())if(b.length)order.push(b.shift());
  }
 }
 return order;
}
function engines(info){return info.avx2?['avx2','gozero','prefetch',...(info.streamPrefetch?['stream']:[]),...(info.avx512f?['avx512','gozero512','prefetch512']:[])]:['sse2']}
function candidates(limit){return [...new Set([1,2,4,8,12,16,24,32,48,64,96,128,limit].filter(n=>n>0&&n<=limit))]}
function median(xs){const a=[...xs].sort((a,b)=>a-b);return a.length%2?a[a.length>>1]:(a[a.length/2-1]+a[a.length/2])/2}
function rank(rows){const groups=new Map();for(const r of rows){const k=JSON.stringify(r.plan);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}return [...groups.values()].map(a=>({plan:a[0].plan,hs:median(a.map(r=>r.hs)),runs:a.length})).sort((a,b)=>b.hs-a.hs)}
function choose(rows){const sorted=rank(rows),best=sorted[0];return sorted.filter(r=>r.hs>=best.hs*.97).sort((a,b)=>a.plan.threads-b.plan.threads||b.hs-a.hs)[0]}
function validPlan(p,info,count,performance){return p&&p.threads===count&&p.performance===performance&&engines(info).includes(p.engine)&&['off','auto'].includes(p.pages)&&typeof p.affinity==='boolean'}
async function policy(exe,dir,c,hw,count){
 const pref=await require('./large-pages.cjs').preference(dir),info=await coreInfo(exe);let profile;
 try{profile=JSON.parse(await fs.readFile(path.join(dir,'bnt-tuning.json'),'utf8'))}catch{}
 return{info,...resolvePlan(info,hw,c,count,pref,profile),cpus:placements(info)};
}
function check(signal){if(signal?.aborted)throw Error('BNT 调优已取消')}
async function trial(exe,info,hw,plan,{durationMs=10000,signal,onWorkers=()=>{}}={}){
 check(signal);if(plan.threads>threadLimit(fresh(hw)))throw Error('可用内存发生变化，请关闭占用程序后重新调优');
 const cpus=placements(info),workers=[],ready=[];const abort=()=>{for(const w of workers)w.stop().catch(()=>{})};signal?.addEventListener('abort',abort,{once:true});
 try{
  for(let i=0;i<plan.threads;i++){check(signal);const w=new ComputeWorker(exe,plan.engine,{pages:plan.pages,binding:plan.affinity?cpus[i]||null:null});workers.push(w);ready.push(await w.ready)}
  onWorkers(ready);
  // Every tested path must produce the full 2 GiB consensus golden hash.
  await Promise.all(workers.map(async(w,i)=>{const r=await w.hash({id:'warm'+i,header:HEADER,nonce:'0'});if(r.hash!==GOLDEN)throw Error('BNT 算法校验失败：'+plan.engine)}));check(signal);
  const start=performance.now(),end=start+durationMs;let hashes=0;
  await Promise.all(workers.map(async(w,i)=>{let n=0;while(performance.now()<end){check(signal);const at=performance.now(),nonce=BigInt(++n)*BigInt(plan.threads)+BigInt(i);const r=await w.hash({id:String(n),header:HEADER,nonce:String(nonce)});if(!/^[a-f0-9]{64}$/i.test(r.hash))throw Error('Invalid BNT hash');hashes++;const pause=(performance.now()-at)*(100/plan.performance-1);if(pause>0)await new Promise(resolve=>setTimeout(resolve,Math.min(pause,3000)))}}));
  check(signal);return{plan,hashes,seconds:(performance.now()-start)/1000,hs:hashes/((performance.now()-start)/1000),largePageWorkers:ready.filter(r=>r.memory?.largePages).length,boundWorkers:ready.filter(r=>r.placement?.bound).length};
 }finally{signal?.removeEventListener('abort',abort);await Promise.allSettled(workers.map(w=>w.stop()))}
}
async function verifyPaths(exe,info,signal,progress){
 for(const engine of engines(info)){
  check(signal);progress('完整算法校验 · '+engine);
  const w=new ComputeWorker(exe,engine,{pages:'off'}),abort=()=>w.stop().catch(()=>{});signal?.addEventListener('abort',abort,{once:true});
  try{await w.ready;for(const [i,v] of require('./bnt-vectors.json').entries()){check(signal);const r=await w.hash({id:'verify'+i,header:v.header,nonce:v.nonce});if(r.hash!==v.hash)throw Error('BNT 算法校验失败：'+engine)}}finally{signal?.removeEventListener('abort',abort);await w.stop()}
 }
}
async function tune(exe,dir,c,hw,{signal,progress=()=>{},durationMs=10000,confirmMs=30000,maxThreads=1024}={}){
 const available=threadLimit(fresh(hw)),limit=Math.min(maxThreads,Math.max(bntThreadBudget(available,c.performance),Math.min(c.cpuThreads||0,available)));if(!limit)throw Error('BNT 调优所需内存不足');
 const count=Math.min(c.cpuThreads||bntThreadBudget(available,c.performance),limit);
 const active=await policy(exe,dir,c,hw,count),info=active.info;
 const {engine,pages,affinity,threads,performance:budget}=active.plan;
 const rows=[],baseline={engine,pages,affinity,threads,performance:budget};
 const run=async(plan,label,ms=durationMs)=>{check(signal);progress(label+' · '+plan.engine+' / '+plan.threads+' T');const r=await trial(exe,info,hw,plan,{signal,durationMs:ms});rows.push(r);progress(label+' · '+r.hs.toFixed(3)+' H/s');return r};
 await verifyPaths(exe,info,signal,progress);
 const baseBefore=await run(baseline,'当前配置基线');
 const es=engines(info),eRows=[];
 for(let round=0;round<2;round++)for(const engine of round?[...es].reverse():es)eRows.push(await run({...baseline,engine,threads:Math.min(4,limit),affinity:true},'计算路径对比'));
 const enginePlan=choose(eRows).plan,tRows=[];
 const counts=candidates(limit);
 for(let round=0;round<2;round++)for(const threads of round?[...counts].reverse():counts)tRows.push(await run({...enginePlan,threads},'线程数对比'));
 // Re-check all ISA paths at the chosen concurrency: 1/4-thread winners
 // need not win when memory bandwidth is shared by many workers.
 const threadsPlan=choose(tRows).plan,finalEngines=[];
 for(let round=0;round<2;round++)for(const engine of round?[...es].reverse():es)finalEngines.push(await run({...threadsPlan,engine},'最佳并发复核'));
 const selected=choose(finalEngines).plan,layoutRows=[];
 for(let round=0;round<2;round++)for(const variant of round?[[true,'auto'],[false,'off'],[true,'off']]:[[true,'off'],[false,'off'],[true,'auto']])layoutRows.push(await run({...selected,affinity:variant[0],pages:variant[1]},'大页与核心分配'));
 const candidate=choose(layoutRows).plan,confirmation=[];
 // Alternating sustained baseline/candidate tests reduce order/thermal bias.
 for(const plan of [baseline,candidate,candidate,baseline])confirmation.push(await run(plan,'持续复测',confirmMs));
 const winner=choose(confirmation),baselineHs=median(confirmation.filter(r=>JSON.stringify(r.plan)===JSON.stringify(baseline)).map(r=>r.hs));
 const result={schema:1,at:new Date().toISOString(),fingerprint:fingerprint(info,hw),info,selected:winner.plan,hashrate:winner.hs,baselineHs,changePercent:(winner.hs/baselineHs-1)*100,baseBefore:baseBefore.hs,rows,verification:'Four full 2 GiB consensus vectors per eligible engine, plus a golden vector on every trial; offline PoW throughput, not pool payout or power efficiency.'};
 check(signal);await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'bnt-tuning.json');await fs.writeFile(file+'.tmp',JSON.stringify(result,null,2));check(signal);await fs.rename(file+'.tmp',file);return result;
}
module.exports={coreInfo,fingerprint,compatibleFingerprints,resolvePlan,placements,engines,candidates,rank,choose,validPlan,policy,trial,tune,verifyPaths,HEADER,GOLDEN};
