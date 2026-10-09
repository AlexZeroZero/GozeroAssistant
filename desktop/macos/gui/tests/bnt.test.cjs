'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),net=require('node:net');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {DEFAULT,selectCoin,validate,miningConfig,CPU_ID}=require('../config.cjs');
const {launchSpec,coreEvent}=require('../core-adapter.cjs');
const {Miner}=require('../miner.cjs');
const {ADDRESSES,FeeController}=require('../../../src/service-fee.cjs');
const {parse,job,submission,Pool}=require('../../../src/bnt-pool.cjs');
test('BNT profile has checksummed wallet, CPU-only threads, explicit TCP and isolated settings',()=>{
 const original=validate({...DEFAULT,cpuThreads:4,wallet:ADDRESSES.NOID});
 const c=validate({...selectCoin(original,'BNT'),wallet:ADDRESSES.BNT});
 assert.equal(c.cpuThreads,1);assert.equal(c.transport,'tcp');assert.equal(miningConfig(c).selected[0],CPU_ID);
 assert.throws(()=>validate({...c,cpuThreads:0}));assert.throws(()=>validate({...c,cpuThreads:9}));
 assert.throws(()=>validate({...c,wallet:c.wallet.slice(0,-1)+'c'}));
 const noid=selectCoin(c,'NOID');assert.equal(noid.wallet,original.wallet);assert.equal(noid.cpuThreads,4);
 const spec=launchSpec('/app/native/cores','/profile',miningConfig(c),'/report');
 assert.equal(spec.executable,path.join('/app/native','node'));assert.ok(spec.args.includes(ADDRESSES.BNT));
 assert.ok(spec.args.includes('stratum+tcp://bnt.pool.gozero.trade:14444'));
});
test('BNT reports H/s as CPU work, zero GPU, and counts only explicit pool verdicts',()=>{
 const m=new Miner('unused','unused',()=>{});m.session={coin:'BNT'};m.jobs.set(CPU_ID,{status:'running'});
 coreEvent(m,{event:'hashrate',hashes_per_second:1.5,accepted:0,rejected:0});
 assert.equal(require('../menubar.cjs').model({config:{coin:'BNT'},miner:{...m.snapshot(),status:'running'}}).summary,'CPU 1.50 H/s');assert.equal(m.rate.cpu,1.5);assert.equal(m.rate.gpu,0);assert.equal(m.jobs.get(CPU_ID).telemetry.hash,1.5);
 coreEvent(m,{event:'share_submitted'});assert.equal(m.totals.accepted,0);
 coreEvent(m,{event:'share_accepted'});assert.equal(m.totals.accepted,1);
 coreEvent(m,{event:'connection_error'});assert.equal(m.rate.total,0);assert.equal(m.jobs.get(CPU_ID).telemetry,null);
 coreEvent(m,{event:'job',job_id:'new'});coreEvent(m,{event:'hashrate',hashes_per_second:2});assert.equal(m.rate.cpu,2);
});
test('BNT uint64 boundaries survive JSON and are never submitted after job replacement',()=>{
 const m=parse('{"nonce_start":18446744073709551614,"nonce_end":18446744073709551615}');
 assert.equal(m.nonce_start,18446744073709551614n);
 const j=job({...m,job_id:'j',header_base:'00'.repeat(92),target:'ff'.repeat(32),height:1});
 assert.match(submission(2,j.id,j.end,'01'.repeat(32)),/"nonce":18446744073709551615,/);
 assert.throws(()=>submission(2,'j',1n<<64n,'01'.repeat(32)));
 const pool=new Pool([],ADDRESSES.BNT,'test');pool.logged=true;pool.job={...j};
 assert.equal(pool.submit(j,j.next,'01'.repeat(32)),false);
});
test('BNT fragmented protocol, negotiation and accepted share, shutdown cancels reconnect',async()=>{
 const sockets=new Set();let connections=0;
 const server=net.createServer(s=>{connections++;sockets.add(s);s.on('close',()=>sockets.delete(s));let buf='';s.on('data',chunk=>{
  buf+=chunk;let at;while((at=buf.indexOf('\n'))>=0){const m=JSON.parse(buf.slice(0,at));buf=buf.slice(at+1);
   if(m.method==='login'){assert.equal(m.params.address,ADDRESSES.BNT);s.write('{"id":1,"status":"ok","result":{"required_capabilities":["submit_claimed_hash"]}}\n');
    const row=JSON.stringify({method:'job',params:{job_id:'test',header_base:'00'.repeat(92),target:'ff'.repeat(32),height:1,nonce_start:1,nonce_end:8}})+'\n';s.write(row.slice(0,40));s.write(row.slice(40));
   }else if(m.method==='submit')s.write(JSON.stringify({id:m.id,status:'ok',result:{accepted:true}})+'\n');
  }
 });});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const p=new Pool(['stratum+tcp://127.0.0.1:'+server.address().port],ADDRESSES.BNT,'test');
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),3000);p.on('job',j=>assert.equal(p.submit(j,1n,'01'.repeat(32)),true));p.on('share',ok=>{clearTimeout(timer);assert.equal(ok,true);resolve()});p.connect()});}
 finally{p.stop();for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}assert.equal(connections,1);
});
test('BNT fee accounting reloads and switches the original recipient while preserving NOID entries',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-bnt-fee-'));let fee;
 try{
  const cfg=miningConfig({...selectCoin(DEFAULT,'BNT'),wallet:ADDRESSES.BNT,worker:'UserWorker'});let seen;
  const m={status:'idle',jobs:new Map(),async start(c){seen=c;this.status='running'},async stop(){this.status='idle'}};
  fee=new FeeController(m,dir,()=>{},()=>{});const key=fee.ledger.key('BNT',cfg.wallet);fee.ledger.credit(key,12000);
  const oldKey=fee.ledger.key('NOID',ADDRESSES.NOID);fee.ledger.credit(oldKey,123);await fee.persist();
  fee=new FeeController(m,dir,()=>{},()=>{});await fee.load();assert.ok(fee.ledger.entries[oldKey]);
  await fee.start(cfg,{});assert.equal(fee.phase,'service');assert.equal(seen.worker,'GozerService');assert.equal(seen.wallets.BNT,ADDRESSES.BNT);
  await fee.transition('user');assert.equal(seen.worker,'UserWorker');assert.equal(seen.selected[0],CPU_ID);
 }finally{await fee?.stop();await fs.rm(dir,{recursive:true,force:true});}
});

test('BNT memory policy clamps requested threads and keeps unknown-pressure fallback bounded',()=>{
 const {startThreads,runningThreads}=require('../bnt-memory.cjs');
 assert.equal(startThreads(8,{maxThreads:2,pressureLevel:1}),2);
 assert.equal(startThreads(1,{maxThreads:2,pressureLevel:1}),1);
 assert.equal(startThreads(8,{maxThreads:2,pressureLevel:2}),1);
 assert.equal(startThreads(1,{maxThreads:2,pressureLevel:4}),0);
 assert.equal(startThreads(1,{maxThreads:0,pressureLevel:1}),0);
 assert.equal(startThreads(8,{maxThreads:2,pressureLevel:0}),2);
 assert.throws(()=>startThreads(8,{maxThreads:NaN,pressureLevel:1}));
 assert.equal(runningThreads(4,2),1);assert.equal(runningThreads(1,4),0);
 assert.equal(runningThreads(2,1),2);
});
test('controller reduces live workers on warning and releases all on critical pressure without system stress',async()=>{
 const {EventEmitter}=require('node:events'),{run}=require('../bnt-runner.cjs');
 const vectors=require('../../../src/bnt-vectors.json'),workers=[],events=[];
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bnt-pressure-')),core=path.join(dir,'core');
 await fs.writeFile(core,'fixture');await fs.writeFile(path.join(dir,'MANIFEST.json'),JSON.stringify({arch:'arm64',sha256:require('node:crypto').createHash('sha256').update('fixture').digest('hex')}));
 class FakeWorker{
  constructor(){workers.push(this);this.ready=Promise.resolve({});this.closed=false;}
  async hash(j){await new Promise(r=>setTimeout(r,3));if(this.closed)throw Error('Stopped');return{...j,hash:vectors.find(v=>v.header===j.header)?.hash||'ff'.repeat(32)};}
  async stop(){this.closed=true;}
 }
 class FakePool extends EventEmitter{
  connect(){this.logged=true;this.job={id:'mock',header:'00'.repeat(92),target:'01'.repeat(32),next:0n,end:10000n};this.emit('job',this.job);}
  submit(){return false;}
  stop(){this.logged=false;this.job=null;}
 }
 let calls=0;
 try{await run({wallet:ADDRESSES.BNT,url:'stratum+tcp://localhost:14444',threads:8,core,worker:'test',seconds:2},line=>events.push(JSON.parse(line)),{
  Worker:FakeWorker,Pool:FakePool,memoryIntervalMs:15,memoryInfo:async()=>({maxThreads:2,pressureLevel:++calls<=2?1:calls===3?2:4})
 });
 assert.deepEqual(events.filter(e=>e.event==='memory_threads').map(e=>e.active),[2,1,0]);
 assert.equal(workers.length,2);assert.ok(workers.every(w=>w.closed));assert.ok(events.some(e=>e.event==='memory_stop'));
 assert.equal(events.at(-1).event,'summary');assert.equal(events.at(-1).accepted,0);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
