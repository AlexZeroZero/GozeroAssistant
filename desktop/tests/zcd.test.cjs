'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const z=require('../src/zcd.cjs'),{validate,DEFAULT}=require('../src/config.cjs');
const {cpuDevice,miningDevices,cpuThreads,workerCount}=require('../src/mining-devices.cjs');
const {ADDRESSES,kernelFee,FeeController,FeeLedger}=require('../src/service-fee.cjs');
const {resolve}=require('../src/kernel-catalog.cjs'),{compactState}=require('../src/floating.cjs');
const hw={cpu:[{Name:'AMD Ryzen 9 7950X',NumberOfCores:16,NumberOfLogicalProcessors:32}],gpus:[{id:'a'.repeat(20),name:'RTX 3090',sensors:null}],metrics:{at:Date.now(),freeMemory:8*1024**3}};
const cfg=()=>validate({...DEFAULT,coin:'ZCD',wallets:{...DEFAULT.wallets,ZCD:ADDRESSES.ZCD},pools:{...DEFAULT.pools,ZCD:'stratum+tcp://zcd-pool.example:3333'},selected:[hw.gpus[0].id]});

test('ZCD default pool migrates legacy empty settings without replacing custom pools or wallets',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {ConfigStore}=require('../src/config.cjs'),{poolChoices}=require('../src/pool-catalog.cjs');
 const url='stratum+tcp://zcd.pool.gozero.trade:3333';
 assert.equal(DEFAULT.pools.ZCD,url);assert.equal(poolChoices('ZCD')[0].url,url);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-zcd-default-'));
 try{
  assert.equal((await new ConfigStore(dir).load()).pools.ZCD,url);
  for(const pool of [undefined,'','stratum+ssl://custom.example:4444']){
   const raw=cfg();delete raw.zcdPoolVersion;
   if(pool===undefined)delete raw.pools.ZCD;else raw.pools.ZCD=pool;
   await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify(raw));
   const store=new ConfigStore(dir),loaded=await store.load();
   assert.equal(loaded.pools.ZCD,pool||url);assert.equal(loaded.wallets.ZCD,ADDRESSES.ZCD);
   assert.equal(store.warning,undefined);
   await store.save({...loaded,pools:{...loaded.pools,ZCD:''}});
   assert.equal((await new ConfigStore(dir).load()).pools.ZCD,'');
  }
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});

test('ZCD live feedback and backend share exact permanent-address rules',()=>{
 const {inspect,validAddress}=require('../renderer/zcd-address.js');
 assert.equal(z.validAddress,validAddress);
 assert.equal(inspect('').code,'empty');
 assert.equal(inspect('0x01'+'a'.repeat(62)).code,'one-shot');
 assert.equal(inspect('03'+'a'.repeat(62)).code,'prefix');
 for(const bad of ['02'+'a'.repeat(61),'02'+'a'.repeat(63),'02'+'g'.repeat(62),'02'+'a'.repeat(60)+' a']){
  assert.equal(inspect(bad).code,'format');
  assert.throws(()=>validate({...cfg(),wallets:{ZCD:bad}}));
 }
 for(const good of [ADDRESSES.ZCD,ADDRESSES.ZCD.slice(2),ADDRESSES.ZCD.toUpperCase()]){
  assert.equal(inspect(good).valid,true);assert.equal(inspect(good).normalized,ADDRESSES.ZCD);
  assert.equal(z.address(good),ADDRESSES.ZCD);assert.doesNotThrow(()=>validate({...cfg(),wallets:{ZCD:good}}));
 }
 for(const lang of ['en','ja','ru']){
  const i18n=require('../renderer/i18n.js');
  for(const value of ['', '0x01'+'a'.repeat(62), 'o1test', '02', ADDRESSES.ZCD])assert.notEqual(i18n.t(inspect(value).message,lang),inspect(value).message);
 }
});
test('ZCD refuses one-shot, malformed, truncated and flag-like addresses; accepts persistent hex',()=>{
 assert.ok(z.validAddress(ADDRESSES.ZCD));
 for(const s of ['0x014531f5e8a5af6a693b53ddd4f3d2ca8f673e9804207ec180e67f92853c6bc5','0x011115dd3992999d0e7edcc1c11f8bab77da832b94f18dd3c0a41acd2b00cfbb','02','02'+'g'.repeat(62),'--mine','0x'+ADDRESSES.ZCD]){assert.equal(z.validAddress(s),false);assert.throws(()=>validate({...cfg(),wallets:{ZCD:s}}));}
 assert.equal(z.address(ADDRESSES.ZCD.toUpperCase()),ADDRESSES.ZCD);
});
test('CPU aggregate identity and reserved threads are independent of GPU selection',()=>{
 const c=cfg(),d=cpuDevice(hw);assert.equal(d.logical,32);assert.equal(d.maxThreads,32);assert.equal(cpuThreads(c,hw),24);
 assert.deepEqual(miningDevices(c,hw),[d]);assert.equal(workerCount(c),1);assert.deepEqual(c.selected,[hw.gpus[0].id]);
 assert.deepEqual(miningDevices({...c,coin:'YSR'},hw),hw.gpus);assert.equal(cpuThreads({...c,cpuThreads:32},hw),32);assert.throws(()=>cpuThreads({...c,cpuThreads:33},hw));assert.equal(cpuDevice({cpu:[]}),null);
 const multi=cpuDevice({...hw,cpu:[...hw.cpu,...hw.cpu]});assert.equal(multi.logical,64);assert.notEqual(multi.id,d.id);
});

test('CPU modes use all logical threads, including SMT, and permit explicit overrides',()=>{
 const {cpuThreadBudget}=require('../renderer/performance.js');
 const cpu=cpuDevice(hw);
 assert.deepEqual([50,75,100].map(p=>cpuThreadBudget(cpu,p)),[16,24,32]);
 assert.deepEqual([50,75,100].map(performance=>cpuThreads({...cfg(),performance,cpuThreads:0},hw)),[16,24,32]);
 assert.equal(cpuThreadBudget({cores:24,logical:24},100),24);
 assert.equal(cpuThreadBudget({cores:1,logical:1},50),1);
 assert.equal(cpuThreads({...cfg(),performance:50,cpuThreads:4},hw),4);
 const smt={...hw,cpu:[{Name:'64-core SMT CPU',NumberOfCores:64,NumberOfLogicalProcessors:128}]};
 assert.deepEqual([50,75,100].map(performance=>cpuThreads({...cfg(),performance,cpuThreads:0},smt)),[64,96,128]);
 const full={...cfg(),performance:100,cpuThreads:128};
 assert.equal(z.poolConfig(full,smt).cpu['rx/2'].length,128);
 assert.equal(cpuDevice(smt).maxThreads,128);
 assert.throws(()=>cpuThreads({...full,cpuThreads:129},smt));
 const {Miner}=require('../src/miner.cjs'),m=new Miner('.',()=>{},()=>{}),writes=[];
 m.session={coin:'ZCD'};m.jobs.set('cpu',{samples:[],powers:[],child:{stdin:{write:s=>writes.push(s)}}});
 m.setPerformance(100);assert.equal(m.session.duty,100);assert.equal(writes.at(-1),'duty:100\n');
});

test('local source build has zero kernel fee while optional official engine keeps its fee',()=>{
 const local=cfg(),official={...local,kernels:{...local.kernels,ZCD:'xmrig-zcd-6.26.0'}};
 assert.equal(kernelFee(local),0);assert.equal(z.poolConfig(local,hw)['donate-level'],0);
 assert.equal(kernelFee(official),0.01);assert.equal(z.poolConfig(official,hw)['donate-level'],1);
 assert.equal(resolve(local).bundled,undefined);assert.match(resolve(local).url,/github\.com\/AlexZeroZero\/GozeroAssistant\/releases\/download\//);assert.equal(resolve(official).bundled,undefined);
});
test('selecting either ZCD engine only checks installed files and never downloads automatically',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {Miner}=require('../src/miner.cjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-zcd-ondemand-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let requests=0;const miner=new Miner(dir,async()=>{requests++;throw Error('No implicit download')},()=>{});
 for(const choice of ['auto','gozero-xmrig-cpu-6.26.0-2','xmrig-zcd-6.26.0']){
  const c=cfg();c.kernels.ZCD=choice;
  const k=miner.configure(c);assert.ok(!k.bundled);assert.equal(new URL(k.url).hostname,'github.com');
  assert.equal(await miner.installed(c),false);assert.equal(miner.status,'idle');
 }
 assert.equal(requests,0);
});
test('ZCD pool configuration fixes rx/2, preserves ordered backups and isolates CPU from GPU/MSR',()=>{
 const c=cfg();c.poolBackups.ZCD=['stratum+ssl://backup.example:4444','stratum+tcp://third.example:5555'];const p=z.poolConfig(c,hw);
 assert.deepEqual(p.pools.map(p=>p.url),['zcd-pool.example:3333','backup.example:4444','third.example:5555']);assert.deepEqual(p.pools.map(p=>p.tls),[false,true,false]);assert.ok(p.pools.every(p=>p.user===ADDRESSES.ZCD&&p.algo==='rx/2'));assert.equal(p.pools[0]['rig-id'],'Gozer');
 assert.equal(p.cpu['rx/2'].length,24);assert.equal(p.cpu['*'],false);assert.equal(p.cuda.enabled,false);assert.equal(p.opencl.enabled,false);assert.equal(p.http.enabled,false);assert.equal(p.randomx.wrmsr,false);assert.equal(p.autosave,false);assert.equal(p['donate-level'],0);
 assert.equal(resolve(c).id,'gozero-xmrig-cpu-6.26.0-2');assert.equal(kernelFee(c),0);
 assert.deepEqual(z.args(c,cpuDevice(hw),'test.log'),['--config',require('node:path').resolve('test.log.json')]);
});
test('ZCD allows empty pool for later setup, but never launches backup-only or arbitrary protocols',()=>{
 const c=cfg();c.pools.ZCD='';assert.equal(validate(c).pools.ZCD,'');assert.throws(()=>z.poolConfig(c,hw),/主矿池/);assert.throws(()=>z.args(c,cpuDevice(hw),'test.log'),/主矿池/);
 for(const pool of ['https://example.com:8443','stratum+tcp://user:secret@example.com:3333','stratum+tcp://example.com:3333/anything']){assert.throws(()=>validate({...cfg(),pools:{...cfg().pools,ZCD:pool}}));}
});
test('XMRig telemetry reads only recent 10s rate, not 60s/15m or trailing maximum',()=>{
 assert.equal(z.parseTelemetry('[2026-10-08 12:00:00] miner speed 10s/60s/15m 508.4 600.0 n/a H/s max 1000.0 H/s').hash,508.4);
 assert.equal(z.parseTelemetry('miner speed 10s/60s/15m 1.5 1.7 1.9 kH/s max 10 kH/s').hash,1500);
 assert.equal(z.parseTelemetry('miner speed 10s/60s/15m n/a 900.0 800.0 H/s max 999 H/s'),null);
 assert.equal(z.parseTelemetry('pool hashrate 100000 H/s'),null);
 assert.equal(z.parseTelemetry('miner speed 10s/60s/15m 0.0 n/a n/a H/s max 1000 H/s').hash,0);
 assert.deepEqual(z.parseShares('cpu accepted (10/2) diff 1000 (50 ms)'),{accepted:10,rejected:2});assert.equal(z.parseShares('new job from pool'),null);
});
test('CPU service budget counts one CPU job with zero or many selected GPUs',()=>{
 const f=new FeeController({jobs:new Map()},'.',()=>{},()=>{});f.cfg={...cfg(),selected:[]};f.key='ZCD:test';f.active=true;f.phase='service';f.reserved=60;f.ledger=new FeeLedger();f.ledger.debit(f.key,60);f.accountService(30);assert.equal(f.reserved,30);f.releaseReservation();assert.equal(f.ledger.entry(f.key).feeGpuSeconds,30);assert.ok(Number.isFinite(f.snapshot().nextFeeAfterSeconds));
});
test('CPU floating panel reports CPU identity, never GPU power or fabricated temperature',()=>{
 const s=compactState({config:cfg(),hardware:hw,miner:{status:'idle',jobs:[]}});assert.match(s.deviceLabel,/CPU.*Ryzen/);assert.equal(s.power,null);assert.equal(s.cpuTemperature,null);
});
