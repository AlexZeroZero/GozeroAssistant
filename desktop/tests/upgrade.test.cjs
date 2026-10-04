'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {DEFAULT,validate}=require('../src/config.cjs');
const {FeeLedger,FeeController,ADDRESSES,REVISION,kernelFee}=require('../src/service-fee.cjs');
const {normalize,Network}=require('../src/network.cjs');
const {evaluate}=require('../src/income.cjs');
const {Intelligence}=require('../src/intelligence.cjs');
const {compactState,clampPosition}=require('../src/floating.cjs');
const id='a'.repeat(20),config=()=>({...structuredClone(DEFAULT),selected:[id],wallets:{...DEFAULT.wallets,PRL:'prl1fakewalletneverusedfornetwork'},serviceFeeAccepted:REVISION});
class FakeMiner{
 constructor(){this.status='idle';this.jobs=new Map();this.starts=[];this.stops=[]}
 async start(c,hw,benchmark){this.starts.push(structuredClone({c,benchmark}));this.status='running';this.jobs.set(id,{status:'running',telemetry:{hash:100,at:Date.now()},hadSensor:true});return {status:this.status}}
 async stop(reason){this.stops.push(reason);this.status='idle';this.jobs.clear()}
}
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozer-fee-'));const m=new FakeMiner(),f=new FeeController(m,dir,()=>{},()=>{});t.after(async()=>{await f.stop();await fs.rm(dir,{recursive:true,force:true})});return {f,m,dir}}
const hw=()=>({gpus:[{id,sensors:{at:Date.now(),temp:40}}]});
test('fee ledger targets 199:1 device runtime with isolated wallet/coin balances',()=>{const l=new FeeLedger(),key=l.key('PRL','user');l.credit(key,199*60*2);assert.ok(Math.abs(l.entry(key).balance-120)<1e-9);assert.equal(l.budget(key,2),60);l.debit(key,120);assert.ok(Math.abs(l.entry(key).balance)<1e-9);assert.equal(l.entry(key).feeGpuSeconds/(l.entry(key).userGpuSeconds+120),.005);assert.equal(l.budget(l.key('QTC','user'),2),0);assert.equal(l.budget(l.key('PRL','other'),2),0);l.credit(key,NaN);assert.ok(Number.isFinite(l.entry(key).balance))});
test('normal mining starts without consent and short tests accrue the same persisted fee',async t=>{
 const {f,m,dir}=await setup(t),c={...config(),serviceFeeAccepted:null};
 await f.start(c,hw());assert.equal(f.active,true);await f.stop();
 await f.start(c,hw(),true);clearInterval(f.timer);assert.equal(m.starts.at(-1).benchmark,true);assert.equal(f.active,true);
 for(let i=0;i<60;i++)f.account(f.last+1000);
 assert.ok(Math.abs(f.ledger.entry(f.key).balance-60/199)<.01);
 m.status='idle';m.jobs.clear();f.tick();await f.queue;assert.equal(f.active,false);
 const recovered=new FeeController(m,dir,()=>{},()=>{});await recovered.load();assert.ok(recovered.ledger.entry(f.key).balance>.3);
});
test('benchmark-only use settles accrued fees before the next complete timed test',async t=>{
 const {f,m}=await setup(t),c=config();const key=f.ledger.key(c.coin,c.wallets[c.coin]);f.ledger.credit(key,199*60);
 await f.start(c,hw(),true);clearInterval(f.timer);assert.equal(f.phase,'service');assert.equal(m.starts[0].benchmark,false);assert.equal(m.starts[0].c.wallets.PRL,ADDRESSES.PRL);
 await f.transition('user');assert.equal(m.starts.at(-1).benchmark,true);assert.equal(m.starts.at(-1).c.wallets.PRL,c.wallets.PRL);
 f.ledger.credit(key,199*60);f.tick();assert.equal(m.starts.length,2,'never interrupt a benchmark for a fee switch');
 m.status='idle';m.jobs.clear();f.tick();await f.queue;assert.equal(m.starts.length,2);assert.equal(f.active,false);
});
test('early test stop persists fractions and failed starts or thermal stop never resume a test',async t=>{
 const {f,m,dir}=await setup(t);await f.start(config(),hw(),true);clearInterval(f.timer);f.account(f.last+1000);await f.stop();
 assert.ok(JSON.parse(await fs.readFile(f.file,'utf8')).entries[f.key].balance>0);
 f.ledger.credit(f.key,199*60);await f.start(config(),hw(),true);clearInterval(f.timer);
 f.checkHardware({gpus:[{id,sensors:{at:Date.now(),temp:90}}]});await f.stopping;assert.equal(f.active,false);assert.equal(m.starts.length,2);
 m.start=async()=>{throw Error('fixture start failure')};await assert.rejects(f.start(config(),hw(),true),/fixture/);assert.equal(f.active,false);assert.equal(f.reserved,0);
});
test('fee switches exact recipient, reserves before launch, restores original wallet and persists',async t=>{const {f,m,dir}=await setup(t),c=config();await f.start(c,hw());clearInterval(f.timer);f.tick();assert.equal(m.starts.length,1);f.ledger.credit(f.key,199*60);await f.transition('service');assert.equal(m.starts.at(-1).c.wallets.PRL,ADDRESSES.PRL);assert.equal(c.wallets.PRL,'prl1fakewalletneverusedfornetwork');assert.equal(f.phase,'service');const saved=JSON.parse(await fs.readFile(f.file,'utf8'));assert.ok(saved.entries[f.key].feeGpuSeconds>=59.99);f.tick();assert.equal(f.phase,'service','reserved budget must not immediately finish');f.account(f.last+10000);await f.transition('user');assert.equal(m.starts.at(-1).c.wallets.PRL,c.wallets.PRL);assert.equal(f.reserved,0);assert.ok(f.ledger.entry(f.key).feeGpuSeconds>=10);assert.ok(f.ledger.entry(f.key).feeGpuSeconds<11);await f.stop();const next=new FeeController(m,dir,()=>{},()=>{});await next.load();assert.ok(Math.abs(next.ledger.entry(f.key).balance-f.ledger.entry(f.key).balance)<1e-8);assert.equal(next.ledger.entry(f.key).feeGpuSeconds,f.ledger.entry(f.key).feeGpuSeconds)});
test('NOID fee phase uses confirmed recipient and restores user wallet without mutating saved config',async t=>{
 const {f,m}=await setup(t),c={...config(),coin:'NOID'};
 c.wallets.NOID='o1666egg8r9aeedd0p6fgdn0mjhqg3wk33ages082pky567u65dslq7k03qa';
 const original=structuredClone(c),recipient='o1g87q6yrrsnay5czqzggvdy9lyvxjtjzkycp0kzz3z9wx45u2m6uqwd8yjg';
 assert.equal(require('../src/noid.cjs').validWallet(recipient),true);
 await f.start(c,hw());clearInterval(f.timer);
 assert.equal(m.starts.at(-1).c.wallets.NOID,original.wallets.NOID);
 assert.equal(f.snapshot().rate,.005);
 f.ledger.credit(f.key,199*60);await f.transition('service');
 assert.equal(m.starts.at(-1).c.wallets.NOID,recipient);
 assert.equal(f.snapshot().recipient,recipient);
 assert.equal(m.starts.at(-1).c.worker,'GozerService');
 await f.transition('user');assert.equal(m.starts.at(-1).c.wallets.NOID,original.wallets.NOID);
 assert.deepEqual(c,original);assert.equal(kernelFee(c),0);
});
test('NOID benchmark settles accrued fee to confirmed address then returns to timed user test',async t=>{
 for(const choice of ['auto','suprminer-noid-1.9.27','fl4shminer-noid-1.5.0']){
 const {f,m}=await setup(t),c={...config(),coin:'NOID',kernels:{NOID:choice}};
 c.wallets.NOID='o1666egg8r9aeedd0p6fgdn0mjhqg3wk33ages082pky567u65dslq7k03qa';
 f.ledger.credit(f.ledger.key(c.coin,c.wallets.NOID),199*60);
 await f.start(c,hw(),true);clearInterval(f.timer);
 assert.equal(f.phase,'service');assert.equal(m.starts.at(-1).benchmark,false);
 assert.equal(m.starts.at(-1).c.wallets.NOID,ADDRESSES.NOID);
 await f.transition('user');assert.equal(m.starts.at(-1).benchmark,true);
 assert.equal(m.starts.at(-1).c.wallets.NOID,c.wallets.NOID);assert.equal(m.starts.at(-1).c.kernels.NOID,choice);await f.stop();
 }
});
test('crash recovery cannot replay an already reserved service minute',async t=>{const {f,m,dir}=await setup(t);await f.start(config(),hw());clearInterval(f.timer);f.ledger.credit(f.key,199*60);await f.transition('service');const recovered=new FeeController(m,dir,()=>{},()=>{});await recovered.load();assert.ok(recovered.ledger.budget(f.key,1)<.1)});
test('missing/frozen telemetry and long sleeps do not earn user-time fee credit',async t=>{const {f,m}=await setup(t);await f.start(config(),hw());clearInterval(f.timer);m.jobs.get(id).telemetry.at=Date.now()-30000;f.account(f.last+1000);assert.equal(f.ledger.entry(f.key).balance,0);m.jobs.get(id).telemetry.at=Date.now();f.account(f.last+60000);assert.equal(f.ledger.entry(f.key).balance,0)});
test('user stop and thermal protection during a fee transition never relaunch a miner',async t=>{for(const thermal of [false,true]){const {f,m}=await setup(t);await f.start(config(),hw());clearInterval(f.timer);f.ledger.credit(f.key,199*60);let release;const original=m.stop.bind(m);let first=true;m.stop=async reason=>{if(first){first=false;await new Promise(r=>release=r)}await original(reason)};const changing=f.transition('service');await new Promise(r=>setImmediate(r));if(thermal){f.checkHardware({gpus:[{id,sensors:{at:Date.now(),temp:90}}]});await f.stopping}else await f.stop();release();await changing;assert.equal(m.starts.length,1);assert.equal(f.active,false);assert.equal(m.status,'idle')}});
test('service stopping latency is counted and unused reservation is released',async t=>{const {f,m}=await setup(t);await f.start(config(),hw());clearInterval(f.timer);f.ledger.credit(f.key,199*60);await f.transition('service');const before=f.ledger.entry(f.key).feeGpuSeconds-f.reserved;const original=m.stop.bind(m);m.stop=async reason=>{await new Promise(r=>setTimeout(r,25));await original(reason)};await f.stop();assert.ok(f.ledger.entry(f.key).feeGpuSeconds-before>=.02);assert.equal(f.reserved,0)});
test('new config fields reject mismatched units, invalid powers and migrate legacy consent',()=>{const good={...config(),manualInputs:{PRL:{[id]:{hash:1e12,unit:'H/s',watts:150}},QTC:{},TSC:{}}};assert.equal(validate(good).manualInputs.PRL[id].hash,1e12);assert.equal('serviceFeeAccepted' in validate({...good,serviceFeeAccepted:'0.5%-v1'}),false);for(const r of [{hash:-1,unit:'H/s',watts:1},{hash:2,unit:'N/s',watts:1},{hash:2,unit:'H/s',watts:Infinity}])assert.throws(()=>validate({...good,manualInputs:{PRL:{[id]:r}}}));assert.equal(kernelFee(config()),0);assert.equal(kernelFee({...config(),pools:{PRL:'stratum+tcp://evil-kryptex.network:44'}}),.03)});
function fixture(coin='PRL'){const now=Date.now(),name={PRL:'Pearl',QTC:'Quantus',TSC:'TensorCash'}[coin];return {now,raw:{coin,coins:{[coin]:{name,price:2,priceTime:now/1000,incomeTime:now/1000,items:[{unit:coin==='TSC'?'N/s':'H/s',hashrate_min:100,hashrate_max:100,coins_min:5,coins_max:5}]}}},overview:{coin,updated_at:new Date(now).toISOString(),hashrate:1000,difficulty:123}}}
test('network scaling uses a stable source anchor without compounding; identities must match',()=>{const {raw,overview,now}=fixture(),a=normalize('PRL',raw,overview,null,now),b=normalize('PRL',raw,{...overview,hashrate:2000},a,now),c=normalize('PRL',raw,{...overview,hashrate:2000},b,now);assert.equal(a.coinsPerUnitDay,.05);assert.equal(b.coinsPerUnitDay,.025);assert.equal(c.coinsPerUnitDay,.025);assert.throws(()=>normalize('QTC',raw,overview),/身份/)});
test('QTC respects source timestamp and stale flag; TSC never scales N/s by H/s',()=>{const q=fixture('QTC');q.overview.network_metrics={source_updated_at:(q.now-600000)/1000,stale:true,hashrate:2000,difficulty:'4321'};const n=normalize('QTC',q.raw,q.overview,null,q.now);assert.equal(n.networkStale,true);assert.equal(n.difficulty,4321);const t=fixture('TSC');t.raw.tiger={window_seconds:86400,pool_hashrate_mean:100,reward_tsc:20,source_factor:.5,source_updated_at:t.now/1000};const a=normalize('TSC',t.raw,t.overview,null,t.now),b=normalize('TSC',t.raw,{...t.overview,hashrate:9000},a,t.now);assert.equal(a.coinsPerUnitDay,.1);assert.equal(b.coinsPerUnitDay,.1);assert.equal(b.unit,'N/s')});
test('concurrent coin requests coalesce and failed sources retain flagged cache',async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozer-net-'));t.after(()=>fs.rm(dir,{force:true,recursive:true}));const f=fixture();let calls=0,fail=false;const n=new Network(dir,async url=>{calls++;if(fail)throw Error('offline');return Buffer.from(JSON.stringify(url.includes('income-data')?f.raw:f.overview))},()=>{});await Promise.all([n.refresh('PRL',true),n.refresh('PRL',true)]);assert.equal(calls,2);fail=true;await n.refresh('PRL',true);assert.equal(n.snapshot()[0].networkStale,true);assert.equal(n.snapshot()[0].networkHash,1000);await n.queue});
test('manual and measured unknown GPU hash drive income; separate fees and incomplete power stay honest',()=>{const c=config(),g={gpus:[{id,name:'Unknown Laptop GPU'}]},f=fixture(),n=normalize('PRL',f.raw,f.overview);c.manualInputs.PRL[id]={hash:200,unit:'H/s',watts:100};let r=evaluate(null,g,c,null,[n]).coins[0];assert.equal(r.gross,20);assert.equal(r.dailyCoins,10);assert.equal(r.rows[0].manual,true);assert.ok(Math.abs(r.net-(20*.995-.192))<1e-9);r=evaluate(null,g,c,{coin:'PRL',devices:[{id,hash:400,watts:null}]},[n]).coins[0];assert.equal(r.gross,40);assert.equal(r.rows[0].measured,true);assert.equal(r.net,null,'missing measured power must not become an unlabelled reference');});
test('information ignores initial new-coin events, rejects stale prices, deduplicates and resets profit modes',async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozer-info-'));t.after(()=>fs.rm(dir,{force:true,recursive:true}));let assets=[{id:'p',symbol:'PRL',name:'Pearl'}];const i=new Intelligence(dir,async()=>Buffer.from(JSON.stringify({assets})),()=>{});await i.refresh();assert.equal(i.events.filter(e=>e.kind==='new').length,0);assets.push({id:'q',symbol:'QTC',name:'Quantus'});await i.refresh();assert.equal(i.events.filter(e=>e.kind==='new').length,1);i.observeNetwork([{coin:'PRL',price:100,priceStale:false}]);i.observeNetwork([{coin:'PRL',price:102.1,priceStale:true}]);assert.equal(i.events.filter(e=>e.kind==='price').length,0);i.observeNetwork([{coin:'PRL',price:102.1,priceStale:false}]);i.observeNetwork([{coin:'PRL',price:106,priceStale:false}]);assert.equal(i.events.filter(e=>e.kind==='price').length,1);i.observeProfits({coins:[{coin:'PRL',net:1,rows:[{id}]}]});i.observeProfits({coins:[{coin:'PRL',net:2,rows:[{id,measured:true}]}]});assert.equal(i.events.filter(e=>e.kind==='profit').length,0);i.observeProfits({coins:[{coin:'PRL',net:3,rows:[{id,measured:true}]}]});assert.equal(i.events.filter(e=>e.kind==='profit').length,1)});
test('floating view masks stale data and clamps windows to negative-origin monitors',()=>{const now=Date.now(),s={hardware:{metrics:{at:now,cpuLoad:32,totalMemory:100,freeMemory:25},gpus:[{sensors:{at:now,load:50,temp:60}},{sensors:{at:now-11000,load:100,temp:90}}]}};const r=compactState(s);assert.equal(r.gpu,50);assert.equal(r.memory,75);assert.equal(r.gpuTemperature,60);assert.equal(r.cpuTemperature,null);s.hardware.metrics.at=now-11000;assert.equal(compactState(s).cpu,null);assert.equal(compactState(s).memory,null);assert.deepEqual(clampPosition({x:2000,y:-400},{x:-1920,y:0,width:1920,height:1080}),{x:-288,y:0})});
