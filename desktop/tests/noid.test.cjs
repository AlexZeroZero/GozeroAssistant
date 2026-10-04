'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validWallet,compatibility,network,account}=require('../src/noid.cjs');
const {validate}=require('../src/config.cjs'),{argsFor}=require('../src/miner.cjs');
const {resolve,choices}=require('../src/kernel-catalog.cjs');
const wallet='o1mlk6uluf2dghqzz0etew4u9wq6clnnr4y4wuv20q2m255mj9crjquzyr4r'; // Public pool reference fixture; never used for live mining.
test('NOID validates bech32m, padding, worker dialect and independent pool/kernel defaults',()=>{
 assert.equal(validWallet(wallet),true);assert.equal(validWallet(wallet.slice(0,-1)+'q'),false);assert.equal(validWallet(wallet.toUpperCase()),false);
 const c=validate({coin:'NOID',wallets:{NOID:wallet}});assert.equal(c.pools.NOID,'stratum+ssl://stratum-apac.suprnova.cc:3341');assert.equal(c.poolBackups.NOID.length,2);assert.equal(resolve(c).id,'suprminer-noid-1.9.27');assert.equal(choices('NOID').length,3);
 assert.throws(()=>validate({...c,worker:'rig.1'}),/点号/);assert.throws(()=>validate({...c,kernels:{NOID:'krig-1.5.4'}}),/内核/);
});
test('NOID default uses official miner, migrates old choice and rejects incompatible GPUs',()=>{
 const c=validate({coin:'NOID',wallets:{NOID:wallet},kernels:{NOID:'gozero-noid-0.2.0'}});
 assert.equal(c.kernels.NOID,'auto');assert.equal(resolve(c).name,'Suprminer');assert.ok(!choices('NOID').some(c=>c.id.startsWith('gozero')));
 const g={vendor:'NVIDIA',pci:'01:00.0',architecture:'Ampere',driver:'610.62',sensors:{at:Date.now(),temp:60,uuid:'GPU-12345678-1234-1234-1234-123456789abc'}};
 const a=argsFor(c,g,'unused');assert.equal(a[a.indexOf('-u')+1],wallet+'.Gozer');assert.ok(!a.includes('--mine'));
 assert.throws(()=>argsFor(c,{...g,vendor:'AMD'},'log'),/NVIDIA/);assert.throws(()=>argsFor(c,{...g,architecture:'Turing'},'log'),/Ampere/);
 assert.equal(compatibility({gpus:[{...g,id:'a'},{...g,id:'b',vendor:'AMD'}]},['a','b']).blocked,true);
});
test('NOID retains its fixed time budget instead of repeatedly reducing it from whole-GPU utilization; thermal stop still applies',()=>{
 const {Miner}=require('../src/miner.cjs');let writes=0,stops=0;const j={id:'a',status:'running',duty:68,powers:[],child:{stdin:{destroyed:false,write(){writes++}}}};
 const fake={status:'running',session:{coin:'NOID',performance:75,temperature:90},jobs:new Map([['a',j]]),stop:async()=>{stops++}};
 const gpu={id:'a',sensors:{at:Date.now(),load:100,power:50,temp:60}};Miner.prototype.checkHardware.call(fake,{gpus:[gpu]});assert.equal(writes,0);assert.equal(j.duty,68);
 gpu.sensors.temp=90;Miner.prototype.checkHardware.call(fake,{gpus:[gpu]});assert.equal(stops,1);
});
test('NOID estimates use only validated current pool values; unknown USD price stays unknown',()=>{
 const p={id:'noid',coin:{symbol:'NOID',algorithm:'Poseidon2b'},networkStats:{networkHashrate:1e9,networkDifficulty:2e10,blockHeight:123},blockTime:20,blockReward:45};
 const r=network({pool:p},1000);assert.equal(r.coinsPerUnitDay,86400/20*45/1e9);assert.equal(r.price,null);assert.equal(r.priceStale,true);assert.equal(r.networkAt,1000);
 assert.throws(()=>network({pool:{...p,coin:{symbol:'QTC'}}}),/无效/);assert.throws(()=>network({pool:{...p,blockTime:0}}),/无效/);
});
test('NOID pool accounting excludes block credits from payouts and never invents 7/30-day values',()=>{
 assert.deepEqual(account('balance',{pendingBalance:'0',unconfirmedBalance:'0.0123',payoutLimit:0.1}),{confirmed:0,pending:0.0123,threshold:0.1});
 assert.deepEqual(account('stats',{totalPaid:'2.3'}),{paid:2.3,week:null,month:null});
 const r=account('payouts',[{type:'Credit',status:'paid',amount:3},{type:'Debit',status:'paid',amount:2,created:'2026-10-04T00:00:00Z',transactionConfirmationData:'a'.repeat(64)}]);assert.equal(r.count,1);assert.equal(r.rows[0].amount,2);
 assert.throws(()=>account('balance',{}),/无效/);
});
