'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {run}=require('../bnt-runner.cjs'),{memoryPlan}=require('../bnt-memory.cjs');
const {ADDRESSES}=require('../../../src/service-fee.cjs');
const vectors=require('../../../src/bnt-vectors.json');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn){const end=Date.now()+2000;while(!fn()){if(Date.now()>end)throw Error('fixture timeout');await delay(5);}}
async function fixture(body,options={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bnt-adaptive-')),core=path.join(dir,'core');
 await fs.writeFile(core,'fixture');await fs.writeFile(path.join(dir,'MANIFEST.json'),JSON.stringify({arch:'arm64',sha256:require('node:crypto').createHash('sha256').update('fixture').digest('hex')}));
 const s={workers:[],events:[],nonces:[],submits:[],capacity:2,pressure:1,queries:0,failures:0,slow:null,...options};
 const signal=new AbortController();
 class Worker{
  constructor(){s.workers.push(this);this.closed=false;this.phase='ready';
   this.ready=s.slow==='ready'?new Promise((r,j)=>this.readyReject=j):s.failures-->0?Promise.reject(Error('2 GiB allocation failed')):Promise.resolve();
  }
  async hash(j){
   this.phase=j.id==='selftest'?'selftest':'hash';
   if(s.slow===this.phase)return new Promise((r,reject)=>this.hashReject=reject);
   if(j.id!=='selftest'){s.nonces.push(j.nonce);if(s.replaceJob){s.replaceJob=false;s.pool.job={...s.pool.job,id:'new'};}}
   await delay(2);if(this.closed)throw Error('Stopped');
   return {...j,hash:j.id==='selftest'?(s.badHash?'00'.repeat(32):vectors.find(v=>v.header===j.header).hash):'01'.repeat(32)};
  }
  async stop(){this.closed=true;this.readyReject?.(Error('Stopped'));this.hashReject?.(Error('Stopped'));}
 }
 class Pool extends EventEmitter{
  constructor(){super();s.pool=this;}
  connect(){this.logged=true;this.job={id:'mock',header:'00'.repeat(92),target:'ff'.repeat(32),next:0n,end:1000000n};this.emit('job',this.job);}
  submit(j,n){assert.equal(j,this.job);s.submits.push(n.toString());return true;}
  stop(){this.logged=false;this.job=null;}
 }
 s.count=()=>s.workers.filter(w=>!w.closed&&w.verified).length;
 s.abort=()=>signal.abort();
 let error;
 const done=run({wallet:ADDRESSES.BNT,url:'stratum+tcp://localhost:14444',threads:options.threads??0,core,worker:'test',seconds:0},line=>s.events.push(JSON.parse(line)),{
  Worker,Pool,signal:signal.signal,logicalCPUs:options.logicalCPUs??8,memoryIntervalMs:10,stablePolls:3,retryCooldownMs:30,
  memoryInfo:async()=>{s.queries++;if(s.queryGate)await s.queryGate;if(s.queryFail)throw Error('query unavailable');return{maxThreads:Math.max(0,s.capacity-s.workers.filter(w=>!w.closed).length),pressureLevel:s.pressure};}
 }).catch(e=>error=e);
 try{await body(s,done);}
 finally{signal.abort();await done;await fs.rm(dir,{recursive:true,force:true});}
 if(!options.expectFailure&&error)throw error;
 assert.ok(s.workers.every(w=>w.closed));assert.equal(s.pool.logged,false);
 assert.equal(s.events.at(-1).event,'summary');
 if(options.expectFailure)assert.match(error?.message||'',options.expectFailure);
}
test('additional capacity is never confused with existing allocated workers',()=>{
 assert.deepEqual(memoryPlan(0,3,{maxThreads:0,pressureLevel:1}),{keep:3,grow:false});
 assert.deepEqual(memoryPlan(0,3,{maxThreads:1,pressureLevel:1}),{keep:3,grow:true});
 assert.deepEqual(memoryPlan(2,2,{maxThreads:5,pressureLevel:1}),{keep:2,grow:false});
 assert.deepEqual(memoryPlan(0,2,{maxThreads:4,pressureLevel:2}),{keep:1,grow:false});
 assert.deepEqual(memoryPlan(0,0,{maxThreads:4,pressureLevel:0}),{keep:0,grow:false});
 assert.deepEqual(memoryPlan(0,2,{maxThreads:0,pressureLevel:1,availableMemory:2,headroomBytes:3}),{keep:1,grow:false});
});
test('auto grows, warning reduces, critical pauses, recovery resumes without nonce duplication',()=>fixture(async s=>{
 await wait(()=>s.count()===2);s.pressure=2;await wait(()=>s.count()===1);
 await delay(50);assert.equal(s.count(),1);
 s.pressure=4;await wait(()=>s.count()===0);assert.equal(s.pool.logged,true);
 s.pressure=1;s.capacity=3;await wait(()=>s.count()===3);await delay(15);
 assert.equal(new Set(s.nonces).size,s.nonces.length);
 assert.equal(new Set(s.submits).size,s.submits.length);
 assert.ok(s.events.some(e=>e.event==='memory_threads'&&e.active===0));
 s.abort();const n=s.workers.length;await delay(60);assert.equal(s.workers.length,n);
}));
test('initial lack of memory waits then resumes; intermittent capacity cannot cause churn',()=>fixture(async s=>{
 await wait(()=>s.queries>=3);assert.equal(s.workers.length,0);
 s.capacity=1;await wait(()=>s.count()===1);
 const q=s.queries;s.capacity=2;await wait(()=>s.queries>=q+1);s.capacity=1;
 await delay(50);assert.equal(s.workers.length,1);
 s.capacity=2;await wait(()=>s.count()===2);
},{capacity:0}));
test('manual upper bound survives changing available memory',()=>fixture(async s=>{
 await wait(()=>s.count()===1);await delay(80);assert.equal(s.workers.length,1);
},{threads:1,capacity:8}));
test('failed extra allocation preserves useful work and backs off before retrying',()=>fixture(async s=>{
 await wait(()=>s.count()===1);s.failures=1;s.capacity=2;
 await wait(()=>s.events.some(e=>e.event==='memory_wait'));
 assert.equal(s.count(),1);await wait(()=>s.count()===2);
},{capacity:1}));
test('repeated query failure pauses and resumes only after healthy samples',()=>fixture(async s=>{
 await wait(()=>s.count()===2);s.queryFail=true;
 await wait(()=>s.count()===0);s.queryFail=false;await wait(()=>s.count()===2);
}));
for(const phase of ['ready','selftest','hash'])test('Stop cancels '+phase+' without resume',()=>fixture(async s=>{
 await wait(()=>s.workers.some(w=>w.phase===phase));s.abort();await wait(()=>s.workers.every(w=>w.closed));
 const n=s.workers.length;await delay(50);assert.equal(s.workers.length,n);
},{slow:phase}));
test('critical pressure interrupts a pending selftest independently of polling',()=>fixture(async s=>{
 await wait(()=>s.workers.some(w=>w.phase==='selftest'));s.pressure=4;
 await wait(()=>s.workers.every(w=>w.closed));assert.equal(s.pool.logged,true);
 s.slow=null;s.pressure=1;await wait(()=>s.count()===2);
},{slow:'selftest'}));
test('old work completing after job replacement is suppressed',()=>fixture(async s=>{
 await wait(()=>s.submits.length>2);assert.ok(!s.submits.includes(s.nonces[0]));
},{replaceJob:true,threads:1}));
test('failed full-memory known answer stops controller',()=>fixture(async(_s,done)=>{await done;},{badHash:true,expectFailure:/启动自检失败/}));
test('Stop during memory query prevents future allocation',()=>fixture(async s=>{
 await wait(()=>s.count()===1);let release;s.queryGate=new Promise(r=>release=r);
 const q=s.queries;await wait(()=>s.queries>q);s.abort();release();await delay(50);
 assert.equal(s.workers.length,1);
},{capacity:1}));
test('zero-worker state clears GUI work and fee telemetry even when a new job arrives',()=>{
 const {Miner}=require('../miner.cjs'),{coreEvent}=require('../core-adapter.cjs'),{CPU_ID}=require('../config.cjs');
 const m=new Miner('unused','unused',()=>{});m.session={coin:'BNT'};m.jobs.set(CPU_ID,{status:'running'});
 coreEvent(m,{event:'hashrate',hashes_per_second:2});
 coreEvent(m,{event:'memory_threads',requested:0,active:0});
 assert.equal(m.rate.total,0);assert.equal(m.jobs.get(CPU_ID).telemetry,null);
 coreEvent(m,{event:'job',job_id:'new'});assert.equal(m.workState,'memory-wait');
 coreEvent(m,{event:'hashrate',hashes_per_second:2});assert.equal(m.rate.total,0);
 coreEvent(m,{event:'memory_threads',requested:0,active:1});
 coreEvent(m,{event:'hashrate',hashes_per_second:2});assert.equal(m.rate.total,2);
});

test('automatic mode also respects hardware CPU count',()=>fixture(async s=>{
 await wait(()=>s.count()===2);await delay(80);assert.equal(s.workers.length,2);
},{capacity:8,logicalCPUs:2}));

test('warning pressure can start and recover one budgeted worker without growing further',()=>fixture(async s=>{
 await wait(()=>s.count()===1);await delay(60);assert.equal(s.workers.length,1);
 s.pressure=4;await wait(()=>s.count()===0);s.pressure=2;
 await wait(()=>s.count()===1);await delay(60);assert.equal(s.workers.length,2);
},{capacity:4,pressure:2}));
