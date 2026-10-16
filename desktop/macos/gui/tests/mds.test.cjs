'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {DEFAULT,Store,validate,selectCoin,miningConfig,GPU_ID}=require('../config.cjs');
const {launchSpec}=require('../core-adapter.cjs'),mds=require('../mds.cjs');
const {Miner}=require('../miner.cjs');
const {FeeController,ADDRESSES}=require('../../../src/service-fee.cjs');
const {model}=require('../menubar.cjs');
const wallet='ab'.repeat(32);
function cfg(){return miningConfig({...selectCoin(DEFAULT,'MDS'),wallet,mdsMssConfirmed:true});}
test('MDS requires explicit reusable-address confirmation and TCP; profiles stay separate',async()=>{
 let c=selectCoin({...DEFAULT,wallet:ADDRESSES.NOID,cpuThreads:4},'MDS');
 assert.equal(c.host,'mds.gozero.trade');assert.equal(c.port,13333);assert.equal(c.transport,'tcp');
 assert.throws(()=>miningConfig({...c,wallet}),/generate-mss/);
 assert.throws(()=>validate({...c,transport:'tls'}),/TCP/);
 assert.throws(()=>validate({...c,wallet:ADDRESSES.NOID}));
 c=validate({...c,wallet,mdsMssConfirmed:true});
 let noid=selectCoin(c,'NOID');assert.equal(noid.wallet,ADDRESSES.NOID);assert.equal(noid.cpuThreads,4);
 c=selectCoin(noid,'MDS');assert.equal(c.wallet,wallet);assert.equal(c.mdsMssConfirmed,true);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mds-config-'));
 try{const s=new Store(dir);await s.save(c);await s.save({...c,wallet:'cd'.repeat(32)});assert.equal(s.value.mdsMssConfirmed,false);assert.equal(s.value.profiles.MDS.mdsMssConfirmed,false);
 await s.save({...s.value,mdsMssConfirmed:true});const again=new Store(dir);await again.load();assert.equal(again.value.mdsMssConfirmed,true);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('MDS launches Metal with effective fee wallet, bundled tuning and GUI parent; no duration limit',()=>{
 const c=cfg();c.wallets.MDS=ADDRESSES.MDS;
 const spec=launchSpec('/native/cores','/profile',c,'/report');
 assert.equal(spec.args[spec.args.indexOf('--payout-address')+1],ADDRESSES.MDS);
 assert.equal(spec.env.WGPU_BACKEND,'metal');assert.equal(spec.args[spec.args.indexOf('--parent-pid')+1],String(process.pid));
 assert.equal(spec.args.includes('--duration'),false);assert.equal(spec.args.includes('cuda'),false);
 assert.throws(()=>launchSpec('/native/cores','/profile',{...c,mdsMssConfirmed:false},'/report'));
});
test('MDS counts real sends and ACKs, uses N/s, clears work for reconnect and stale jobs',()=>{
 const m=new Miner('unused','unused',()=>{});m.session={coin:'MDS'};m.status='running';m.jobs.set(GPU_ID,{status:'running'});
 mds.event(m,{type:'status',message:'Connecting pool:13333'});assert.equal(m.workState,'reconnecting');
 mds.event(m,{type:'status',message:'Pool authorized'});assert.equal(m.workState,'waiting');
 mds.event(m,{type:'job',job:1});mds.event(m,{type:'telemetry',hash:123.5,unit:'N/s',accepted:0,rejected:0});
 assert.equal(m.rate.gpu,123.5);assert.equal(m.totals.accepted,0);assert.match(model({config:{coin:'MDS'},miner:m.snapshot()}).title,/N\/s/);
 mds.event(m,{type:'submitted'});assert.equal(m.totals.submitted,1);
 mds.event(m,{type:'share',accepted:true});assert.equal(m.totals.accepted,1);
 mds.event(m,{type:'share',accepted:false,error:'Stale job'});assert.equal(m.totals.rejected,1);
 mds.event(m,{type:'status',message:'Current job expired: paused obsolete work, waiting for replacement'});
 assert.equal(m.rate.total,0);assert.equal(m.jobs.get(GPU_ID).telemetry,null);assert.equal(m.workState,'paused');
 mds.event(m,{type:'telemetry',hash:100,unit:'N/s',accepted:1,rejected:1});assert.equal(m.rate.total,0);
 mds.event(m,{type:'job',job:2});mds.event(m,{type:'telemetry',hash:99,unit:'N/s',accepted:1,rejected:1});assert.equal(m.rate.total,99);
 mds.event(m,{type:'error',message:'pool disconnected'});assert.equal(m.rate.total,0);
 assert.throws(()=>mds.event(m,{type:'telemetry',hash:Infinity,unit:'N/s',accepted:0,rejected:0}));
});
test('MDS fee phase uses original Windows recipient and reloads its ledger without changing 0.5% math',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mds-fee-'));let seen;
 const m={status:'idle',jobs:new Map(),async start(c){seen=c;this.status='running'},async stop(){this.status='idle'}};
 const fee=new FeeController(m,dir,()=>{},()=>{});
 try{const c=cfg();fee.ledger.credit(fee.ledger.key('MDS',wallet),12000);await fee.start(c,{});
 assert.equal(seen.wallets.MDS,mds.SERVICE_ADDRESS);assert.equal(seen.mdsMssConfirmed,true);
 await fee.transition('user');assert.equal(seen.wallets.MDS,wallet);await fee.stop();
 const reload=new FeeController(m,dir,()=>{},()=>{});await reload.load();assert.equal(reload.ledger.entries[fee.key].userGpuSeconds,fee.ledger.entries[fee.key].userGpuSeconds);
 }finally{await fee.stop();await fs.rm(dir,{recursive:true,force:true});}
});
