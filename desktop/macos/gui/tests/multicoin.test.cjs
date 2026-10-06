'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DEFAULT,validate,miningConfig,selectCoin,GPU_ID}=require('../config.cjs');
const {launchSpec,coreEvent}=require('../core-adapter.cjs');
const {formatRate}=require('../coins.cjs');
const {Miner}=require('../miner.cjs');
const {ADDRESSES,FeeController}=require('../../../src/service-fee.cjs');
const {model}=require('../menubar.cjs');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
test('switching coins preserves separate wallets, endpoints and NOID CPU preference',()=>{
 let c=validate({...DEFAULT,wallet:ADDRESSES.NOID,cpuThreads:4});
 c=selectCoin(c,'QTC');assert.equal(c.wallet,'');assert.equal(c.cpuThreads,0);
 c=validate({...c,wallet:ADDRESSES.QTC,host:'qtc-eu.kryptex.network'});
 c=selectCoin(c,'PRL');c=validate({...c,wallet:ADDRESSES.PRL});
 c=selectCoin(c,'NOID');assert.equal(c.wallet,ADDRESSES.NOID);assert.equal(c.cpuThreads,4);
 c=selectCoin(c,'QTC');assert.equal(c.wallet,ADDRESSES.QTC);assert.equal(c.host,'qtc-eu.kryptex.network');
 assert.throws(()=>validate({...c,wallet:ADDRESSES.PRL}));assert.throws(()=>selectCoin(c,'__proto__'));
 assert.throws(()=>validate({...c,transport:'tcp'}));
});
test('external launch uses fee-selected wallet and profile state, continuous mode and TLS',()=>{
 for(const coin of ['QTC','PRL']){
  const cfg=miningConfig({...selectCoin(DEFAULT,coin),wallet:ADDRESSES[coin]});
  cfg.wallet='do-not-use-top-level-wallet';
  const spec=launchSpec('/app/cores','/profile',cfg,'/report');
  assert.equal(spec.args[spec.args.indexOf('--wallet')+1],ADDRESSES[coin]);
  assert.equal(spec.env.PMK_HOME,path.join('/profile','prl-state'));
  assert.equal(spec.executable,path.join('/app/cores','python/bin/python3'));
  if(coin==='QTC')assert.equal(spec.args[spec.args.indexOf('--seconds')+1],'0');
  else assert.ok(spec.args.includes('stratum+ssl://prl-eu.kryptex.network:8048'));
 }
});
test('PRL interval MAC rate, reconnect/battery states and share verdicts are distinct',()=>{
 const m=new Miner('unused','unused',()=>{});m.session={coin:'PRL'};m.jobs.set(GPU_ID,{status:'running'});
 coreEvent(m,{event:'routine_telemetry',completed_ops:10e12,elapsed_seconds:10,tops:1,accepted:0,rejected:0});
 assert.equal(m.rate.total,0.5e12);
 coreEvent(m,{event:'routine_telemetry',completed_ops:14e12,elapsed_seconds:12,tops:1});
 assert.equal(m.rate.total,1e12);assert.equal(formatRate(m.rate.total,'PRL'),'1.000 TMAC/s');
 assert.match(model({config:{coin:'PRL'},miner:{...m.snapshot(),status:'running'}}).title,/TMAC\/s/);
 coreEvent(m,{event:'power_state',paused:true,source:'battery'});assert.equal(m.rate.total,0);assert.equal(m.workState,'power-paused');
 coreEvent(m,{event:'pool_job',pool_job_id:'new'});assert.equal(m.workState,'power-paused');
 coreEvent(m,{event:'power_state',paused:false,source:'ac'});assert.equal(m.workState,'waiting');
 coreEvent(m,{event:'pool_transport_error',error:'offline'});assert.equal(m.jobs.get(GPU_ID).telemetry,null);
 coreEvent(m,{event:'pool_outcome',classification:'transport',submitted:1,accepted:0});assert.equal(m.totals.rejected,0);
 coreEvent(m,{event:'pool_outcome',classification:'accepted',submitted:2,accepted:1});assert.equal(m.totals.accepted,1);
 coreEvent(m,{event:'pool_outcome',classification:'invalid',submitted:3,accepted:1});assert.equal(m.totals.rejected,1);
 coreEvent(m,{event:'pool_summary',submitted:4,accepted:1,rejected:1,stale:1});assert.equal(m.totals.rejected,2);
});
test('QTC rate and pool confirmations never infer shares from computed work',()=>{
 const m=new Miner('unused','unused',()=>{});m.session={coin:'QTC'};m.jobs.set(GPU_ID,{});
 coreEvent(m,{event:'hashrate',hashes_per_second:15e6,accepted:0,rejected:0,submitted:0});
 assert.equal(m.rate.total,15e6);assert.equal(m.totals.accepted,0);
 coreEvent(m,{event:'share_submitted'});assert.equal(m.totals.submitted,1);assert.equal(m.totals.accepted,0);
 coreEvent(m,{event:'share_accepted'});assert.equal(m.totals.accepted,1);
});
test('unchanged fee controller switches both new coins to their original fee addresses and back',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-fee-'));
 try{for(const coin of ['QTC','PRL']){
  const userWallet=coin==='QTC'?'qz'+'1'.repeat(47):'prl1'+'q'.repeat(59);
  const cfg=miningConfig({...selectCoin(DEFAULT,coin),wallet:userWallet,worker:'UserWorker'});let seen;
  const m={status:'idle',jobs:new Map(),async start(c){seen=c;this.status='running'},async stop(){this.status='idle'}};
  const fee=new FeeController(m,dir,()=>{},()=>{});fee.ledger.credit(fee.ledger.key(coin,cfg.wallet),12000);
  await fee.start(cfg,{});try{assert.equal(fee.phase,'service');assert.equal(seen.wallets[coin],ADDRESSES[coin]);assert.equal(seen.worker,'GozerService');await fee.transition('user');assert.equal(seen.worker,'UserWorker');assert.equal(seen.wallets[coin],userWallet);assert.equal(seen.seconds,0);}finally{await fee.stop();}
 }}finally{await fs.rm(dir,{recursive:true,force:true});}
});
