const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {HashWindows}=require('../src/hash-windows.cjs');
const {DEFAULT,validate,ConfigStore}=require('../src/config.cjs');
const {poolUrls}=require('../src/pool-catalog.cjs');
const {argsFor}=require('../src/miner.cjs');
const {kernelFee}=require('../src/service-fee.cjs');
function sample(w,id,hash,at){w.sample(id,{hash,at},at)}
test('fixed five-minute windows hold the completed total while the next window fills',()=>{
 const w=new HashWindows(['a','b'],5,0);
 for(let t=0;t<300000;t+=10000){sample(w,'a',t<150000?100:200,t);if(t%30000===0)sample(w,'b',50,t)}
 const done=w.snapshot(300000);assert.equal(done.hash,200);assert.equal(done.coverage,1);assert.equal(done.complete,true);assert.equal(done.remainingMs,300000);
 for(let t=300000;t<600000;t+=30000){sample(w,'a',400,t);sample(w,'b',100,t);assert.equal(w.snapshot(t+1).hash,200)}
 assert.equal(w.snapshot(600000).hash,500);
});
test('ten-minute duration, duplicate/future/invalid samples, gaps and stopped values are explicit',()=>{
 const w=new HashWindows(['a'],10,0);sample(w,'a',100,0);sample(w,'a',999,0);sample(w,'a',NaN,1000);w.sample('a',{hash:999,at:10000},5000);
 assert.equal(w.snapshot(90000).hash,100);assert.equal(w.snapshot(90000).fresh,false);
 const end=w.snapshot(600000);assert.equal(end.complete,true);assert.equal(end.hash,100);assert.equal(end.coverage,.1);
 const empty=w.snapshot(1200000);assert.equal(empty.hash,100);assert.equal(empty.retained,true);assert.equal(empty.to,600000);
 w.stop(1200000);sample(w,'a',999,1200001);assert.equal(w.snapshot(1300000).hash,100);assert.equal(w.snapshot(1300000).running,false);
});
test('missing GPUs never masquerade as a full total; zero is valid; snapshots do not weight samples',()=>{
 const w=new HashWindows(['a','b'],5,0);sample(w,'a',100,0);assert.equal(w.snapshot(1000).hash,null);
 sample(w,'b',0,1000);for(let t=2000;t<=30000;t+=1000)w.snapshot(t);
 const s=w.snapshot(30000);assert.equal(s.hash,100);assert.equal(s.devices[0].samples,1);assert.equal(s.devices[1].hash,0);
 w.unavailable('a',30000);assert.equal(w.snapshot(40000).fresh,false);assert.equal(w.snapshot(40000).devices[0].coverage,.75);
 assert.equal(new HashWindows(['a'],5,40000).snapshot(40000).hash,null);
});
test('defaults use Singapore then Hong Kong and US; native failover gets one wallet and exact PCI',()=>{
 const c=validate({...DEFAULT,wallets:{PRL:'prl1fixtureaddressnotfornetwork'}}),urls=poolUrls(c);
 assert.match(urls[0],/prl-sg/);assert.match(urls[1],/prl-hk/);assert.match(urls[2],/prl-us/);
 const args=argsFor(c,{vendor:'NVIDIA',pci:'61:00.0'},'fixture.log');
 assert.deepEqual(args.flatMap((v,i)=>v==='--url'?[args[i+1]]:[]),urls);assert.equal(args.filter(v=>v==='--user').length,1);assert.ok(args.includes('61:00.0'));
 assert.equal(kernelFee(c),0);assert.equal(kernelFee({...c,poolBackups:{PRL:['stratum+tcp://example.org:4444']}}),.03);
});
test('pool settings reject invalid backups, wrong coin, excessive endpoints and invalid periods',()=>{
 for(const patch of [{hashWindowMinutes:1},{poolBackups:{PRL:['https://example.org:443']}},{poolBackups:{PRL:Array(3).fill(DEFAULT.pools.PRL)}},{poolBackups:{PRL:['stratum+ssl://qtc-sg.kryptex.network:8049']}}])assert.throws(()=>validate({...DEFAULT,...patch}));
 assert.deepEqual(validate({...DEFAULT,poolBackups:{PRL:[DEFAULT.pools.PRL,DEFAULT.pools.PRL]}}).poolBackups.PRL,[]);
});
test('legacy global defaults migrate once, custom endpoints remain intact and persisted lists survive',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozer-pools-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const old=structuredClone(DEFAULT);delete old.poolRoutingVersion;delete old.poolBackups;old.pools.PRL='stratum+ssl://prl.kryptex.network:8048';old.pools.QTC='stratum+tcp://custom.example:9999';
 await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify(old));const store=new ConfigStore(dir);await store.load();
 assert.equal(store.value.pools.PRL,DEFAULT.pools.PRL);assert.equal(store.value.pools.QTC,old.pools.QTC);assert.deepEqual(store.value.poolBackups.QTC,[]);
 await store.save({...store.value,pools:{...store.value.pools,PRL:old.pools.PRL},poolBackups:{PRL:[],QTC:[]},hashWindowMinutes:10});
 const next=new ConfigStore(dir);await next.load();assert.equal(next.value.pools.PRL,old.pools.PRL);assert.deepEqual(next.value.poolBackups.PRL,[]);assert.equal(next.value.hashWindowMinutes,10);
});
