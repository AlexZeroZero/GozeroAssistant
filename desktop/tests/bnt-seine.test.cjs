const test=require('node:test'),assert=require('node:assert/strict');
const adapter=require('../src/bnt-seine.cjs'),catalog=require('../src/kernel-catalog.cjs');
const {validate}=require('../src/config.cjs'),{ADDRESSES,kernelFee,FeeController}=require('../src/service-fee.cjs');
const config=()=>validate({coin:'BNT',wallets:{BNT:ADDRESSES.BNT},kernels:{BNT:'seine-bnt-0.2.15'},performance:100,cpuThreads:2});
test('Seine is selectable; recommended remains Gozero; official node is not a pool kernel',()=>{
 assert.equal(catalog.resolve(config()).adapter,'bnt-seine');
 assert.equal(catalog.resolve({...config(),kernels:{BNT:'auto'}}).bundled,true);
 assert.equal(catalog.validChoice('BNT','core-0.20.0'),false);
 assert.equal(catalog.validChoice('ZCD','seine-bnt-0.2.15'),false);
 assert.equal(kernelFee(config()),.025);
 assert.equal(adapter.fee('stratum+tcp://eu.bntpool.com:3333'),.01);
 assert.equal(adapter.fee('stratum+tcp://bntpool.com.attacker.com:3333'),.025);
});
test('Seine CPU arguments fix threads and disable automatic resizing / unexpected GPU mining',()=>{
 const cfg=config(),a=adapter.args(cfg,2,cfg.pools.BNT,'D:\\kernel\\data');
 assert.equal(a[a.indexOf('--backend')+1],'cpu');assert.equal(a[a.indexOf('--threads')+1],'2');
 assert.ok(a.includes('--disable-cpu-autotune-threads'));assert.ok(!a.includes('--allow-oversubscribe'));
 assert.ok(!a.includes('--api-server'));assert.ok(!a.includes('--service'));
 assert.equal(a[a.indexOf('--cpu-page-mode')+1],'regular');
 const large=adapter.args(cfg,2,cfg.pools.BNT,'data',true);assert.equal(large[large.indexOf('--cpu-page-mode')+1],'auto');
 assert.throws(()=>adapter.args(cfg,2,'stratum+ssl://pool:3333','data'),/stratum\+tcp/);
 assert.throws(()=>adapter.args({...cfg,wallets:{BNT:'bad'}},2,cfg.pools.BNT,'data'),/BNT/);
});
test('Seine telemetry derives period hashrate, ignores balance/network messages and separates shares',()=>{
 const a=adapter.parse('    5.0s INFO STATS elapsed=5.0s hashes=20 rate=3.998 H/s templates=1 submitted=0 stale=0 accepted=0 deferred=0 dropped=0');
 const b=adapter.parse('   10.0s INFO STATS elapsed=10.0s hashes=48 rate=4.796 H/s templates=1 submitted=1 stale=0 accepted=1 deferred=0 dropped=0');
 assert.equal(adapter.interval(null,a),null);assert.equal(adapter.interval(a,b),5.6);
 assert.equal(adapter.interval(b,a),null);assert.equal(adapter.interval(a,{...a,elapsed:10}),0);
 assert.equal(adapter.parse('5.0s WARN STATS failed to fetch pool stats: network 999 GH/s'),null);
 assert.equal(adapter.parse('5.0s INFO STATS elapsed=0.0s hashes=20 rate=3 H/s'),null);
 assert.equal(adapter.parse('5.0s OK SHARE accepted (backend=cpu#1)').kind,'accepted');
 assert.equal(adapter.parse('5.0s WARN SHARE rejected (stale)').kind,'rejected');
 assert.equal(adapter.parse('5.0s WARN CONN connection closed').kind,'offline');
 assert.equal(adapter.parse('5.0s OK AUTH login accepted (protocol v2)').kind,'auth');
 assert.equal(adapter.parse('5.0s INFO JOB new job height=10 difficulty=60').kind,'work');
});
test('Seine fee restarts preserve kernel, CPU budget and pool configuration',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'seine-fee-')),starts=[];
 const miner={status:'idle',jobs:new Map(),start:async(c)=>{starts.push(c);miner.status='running'},stop:async()=>{miner.status='idle'}};
 const fee=new FeeController(miner,dir,()=>{},()=>{}),cfg=config();
 try{
  await fee.start(cfg,{});fee.ledger.credit(fee.key,12000);
  await fee.transition('service');assert.equal(starts.at(-1).worker,'GozerService');
  await fee.transition('user');assert.equal(starts.at(-1).worker,cfg.worker);
  for(const c of starts){assert.equal(c.kernels.BNT,'seine-bnt-0.2.15');assert.equal(c.cpuThreads,2);assert.equal(c.performance,100);assert.equal(c.pools.BNT,cfg.pools.BNT)}
 }finally{await fee.stop();await fs.rm(dir,{recursive:true,force:true})}
});
test('Seine disconnect removes stale telemetry and reconnection rebases counters',()=>{
 const {ingest}=require('../src/bnt-seine-runtime.cjs'),{HashWindows}=require('../src/hash-windows.cjs');
 const j={id:'cpu',samples:[],shares:{accepted:0,rejected:0}},r={stopped:false,connection:{stage:'connect'},acceptedBase:0,offlineSince:Date.now()};
 const miner={seine:r,changed(){},log(){},hashWindows:new HashWindows(['cpu'],5,Date.now())};
 ingest(miner,j,'0.1s OK AUTH login accepted (protocol v2)');
 ingest(miner,j,'0.2s INFO JOB new job height=1');
 ingest(miner,j,'5.0s INFO STATS elapsed=5.0s hashes=10 rate=2.0 H/s accepted=0');
 ingest(miner,j,'10.0s INFO STATS elapsed=10.0s hashes=25 rate=2.5 H/s accepted=1');
 assert.equal(j.telemetry.hash,3);assert.equal(j.shares.accepted,1);
 ingest(miner,j,'11.0s WARN CONN disconnected');assert.equal(j.telemetry,null);assert.equal(j.status,'waiting');
 ingest(miner,j,'15.0s INFO STATS elapsed=15.0s hashes=25 rate=1.6 H/s accepted=1');assert.equal(j.telemetry,null);
 ingest(miner,j,'16.0s INFO JOB new job height=2');
 ingest(miner,j,'20.0s INFO STATS elapsed=20.0s hashes=30 rate=1.5 H/s accepted=1');assert.equal(j.telemetry.hash,1);
 ingest(miner,j,'20.1s OK SHARE accepted (backend=cpu#1)');assert.equal(j.shares.accepted,2);
 ingest(miner,j,'20.2s WARN SHARE rejected (stale)');assert.equal(j.shares.rejected,1);
 r.stopped=true;ingest(miner,j,'21.0s OK SHARE accepted');assert.equal(j.shares.accepted,2);
});
