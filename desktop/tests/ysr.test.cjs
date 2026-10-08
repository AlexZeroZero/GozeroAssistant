'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {validate,DEFAULT}=require('../src/config.cjs'),ysr=require('../src/ysr.cjs'),{resolve}=require('../src/kernel-catalog.cjs');
const {Miner,argsFor,parseExternalTelemetry}=require('../src/miner.cjs');
const wallet='ysr1at4jxzcln84ys38s0spw23l0wn7pquz5w6eyf4';

test('YSR new default migrates old profiles once and preserves custom pools and mining settings',async t=>{
 const {ConfigStore}=require('../src/config.cjs'),{PUBLIC_API,LEGACY_API}=ysr;
 assert.equal(DEFAULT.pools.YSR,'https://ysr.pool.gozero.trade:8443');
 assert.equal(require('../src/pool-catalog.cjs').poolChoices('YSR')[0].url,PUBLIC_API);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ysr-pool-migration-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const original={...structuredClone(DEFAULT),coin:'YSR',performance:100,temperature:84};
 delete original.ysrPoolVersion;original.wallets.YSR=wallet;original.pools.YSR=LEGACY_API+'/';original.poolBackups.YSR=['https://backup.example'];
 await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify(original));
 const store=new ConfigStore(dir),migrated=await store.load();
 assert.equal(migrated.pools.YSR,PUBLIC_API);assert.equal(migrated.wallets.YSR,wallet);assert.equal(migrated.temperature,84);assert.equal(migrated.performance,100);assert.deepEqual(migrated.poolBackups.YSR,['https://backup.example']);
 await store.save({...migrated,pools:{...migrated.pools,YSR:LEGACY_API}});
 assert.equal((await new ConfigStore(dir).load()).pools.YSR,LEGACY_API,'explicit subsequent choice stays');
 original.pools.YSR='https://custom.example:8443';await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify(original));
 assert.equal((await new ConfigStore(dir).load()).pools.YSR,original.pools.YSR);
});

test('YSR gateway mining retains official chain ledger queries and isolates pool caches',async()=>{
 const {PoolAccount,accountFor}=require('../src/pool-account.cjs');
 const config=validate({coin:'YSR',wallets:{YSR:wallet}}),calls=[];
 const a=new PoolAccount(async url=>{calls.push(url);return Buffer.from(JSON.stringify({address:wallet,balance:'0',history:[]}))});
 a.configure(config);await a.refresh();assert.equal(calls[0],ysr.LEGACY_API+'/api/v2/account/'+wallet);assert.equal(a.snapshot().source,'YSKAR 节点');
 a.configure({...config,pools:{...config.pools,YSR:ysr.LEGACY_API}});await a.refresh();assert.equal(calls[1],ysr.LEGACY_API+'/api/v2/account/'+wallet);
 assert.equal(a.cache.size,2);assert.equal(a.snapshot().sections.balance.value.confirmed,0);
 assert.ok(accountFor({...config,pools:{YSR:'https://ysr.pool.gozero.trade.evil.example:8443'}}).reason);
 a.stop();
});

test('YSR retarget diagnostics do not suppress real completed-work hashrate',()=>{
 const line='04:22:18 GPU hashrate 2580000000.00 H/s accepted=18 rejected=0 stale=189 expired=181 retargeted=8 overflowRetries=0 submitErrors=0';
 const value=parseExternalTelemetry(line);
 assert.equal(value.hash,2580000000);assert.equal(value.accepted,18);assert.equal(value.stale,189);
 assert.equal(parseExternalTelemetry('GPU target hashrate 2580000000 H/s'),null);
 assert.equal(parseExternalTelemetry('GPU network hashrate 2580000000 H/s'),null);
 assert.equal(parseExternalTelemetry('GPU expected hashrate 2580000000 H/s'),null);
});

test('YSR older explicit selections migrate without resetting wallets or budgets',()=>{
 for(const previous of ['gozero-ysr-0.1.0','gozero-ysr-0.1.1','gozero-ysr-0.1.2']){
 const config=validate({coin:'YSR',wallets:{YSR:wallet},kernels:{YSR:previous},performance:100,temperature:85});
 assert.equal(config.wallets.YSR,wallet);assert.equal(config.performance,100);assert.equal(config.temperature,85);
 assert.equal(config.kernels.YSR,'auto');assert.equal(resolve(config).version,'0.1.3');
 }
});

test('YSR budget does not ratchet down from whole-GPU load; manual changes and thermal stop remain active',()=>{
 const miner=new Miner(os.tmpdir(),()=>{},()=>{}),writes=[];let stops=0;
 miner.status='running';miner.session={coin:'YSR',performance:75,temperature:90};
 const job={id:'gpu',duty:68,status:'running',powers:[],samples:[],hadSensor:true,child:{stdin:{destroyed:false,write:s=>writes.push(s)}}};miner.jobs.set(job.id,job);miner.stop=async()=>{stops++};
 const hw={gpus:[{id:'gpu',sensors:{at:Date.now(),load:100,temp:60,power:100}}]};
 for(let i=0;i<60;i++)miner.checkHardware(hw);assert.equal(job.duty,68);assert.equal(writes.length,0);
 miner.setPerformance(100);assert.equal(job.duty,90);assert.equal(writes.at(-1),'duty:90\n');
 for(let i=0;i<60;i++)miner.checkHardware(hw);assert.equal(job.duty,90);assert.equal(writes.length,1);
 hw.gpus[0].sensors.temp=90;miner.checkHardware(hw);assert.equal(stops,1);
 hw.gpus[0].sensors={at:Date.now()-11000,temp:60};miner.checkHardware(hw);assert.equal(stops,2);
});
test('YSR explicit HTTPS pool and checksummed wallet are isolated from Stratum coins',()=>{
 const c=validate({coin:'YSR',wallets:{YSR:wallet}});assert.equal(DEFAULT.wallets.YSR,'');assert.equal(resolve(c).id,'gozero-ysr-0.1.3');
 assert.throws(()=>validate({...c,pools:{YSR:'stratum+tcp://example.com:3333'}}));assert.throws(()=>validate({...c,wallets:{YSR:wallet.slice(0,-1)+'q'}}));
 assert.throws(()=>validate({...c,poolBackups:{YSR:['https://user:password@example.com']}}));
 const args=argsFor(c,{vendor:'NVIDIA',sensors:{uuid:'GPU-11111111-1111-1111-1111-111111111111'}},'C:/space name/worker.log');
 assert.equal(args[args.indexOf('--wallet')+1],wallet);assert.equal(args[args.indexOf('--stop-file')+1],'C:/space name/worker.log.stop');
 assert.throws(()=>argsFor(c,{vendor:'AMD',sensors:{}},'log'));
 assert.equal(parseExternalTelemetry('GPU hashrate 120000000 H/s accepted=1 rejected=0 stale=0').hash,120000000);
});
test('Bundled YSR installs pinned files without a remote download and detects tampering',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-ysr-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const miner=new Miner(dir,()=>{throw Error('unexpected remote download')},()=>{}),c=validate({coin:'YSR'});
 assert.equal(await miner.installed(c),false);await miner.install(c);assert.equal(await miner.installed(c),true);
 await fs.appendFile(path.join(miner.dir,'ysr.ptx'),'tampered');assert.equal(await miner.installed(c),false);await miner.install(c);assert.equal(await miner.installed(c),true);
});
test('YSR network estimates coin output with no fabricated USD price',()=>{
 const raw={token:{token_symbol:'YSR',decimals:8},height:3730,difficulty:38416269,difficultyWert:'38416269',nextReward:'87500000000',hashrate:4270738667,targetBlockTime:600};
 const n=ysr.network(raw);assert.equal(n.price,null);assert.equal(n.reward,875);assert.equal(n.coinsPerUnitDay,875*86400/(38416269*65536));
 assert.throws(()=>ysr.network({...raw,token:{token_symbol:'OTHER',decimals:8}}));assert.throws(()=>ysr.network({...raw,difficultyWert:'NaN'}));
});
test('YSR ledger reports chain balance and returned block rewards, not pending pool payouts',()=>{
 const d=ysr.account({address:wallet,balance:'123456789',history:[{kind:'pool',amount:'50000000',timestamp:'1791341104',txid:'a'.repeat(64)},{kind:'transfer',amount:'900000000'}]},wallet);
 assert.equal(d.balance.confirmed,1.23456789);assert.equal(d.balance.pending,null);assert.equal(d.balance.threshold,null);assert.equal(d.stats.paid,0.5);assert.equal(d.stats.week,null);assert.equal(d.payouts.rows.length,1);
 assert.throws(()=>ysr.account({address:'other',balance:'0',history:[]},wallet));
});
test('YSR fee address validates and ledger reload preserves YSR without sharing other coins',async t=>{
 const {FeeController,ADDRESSES,kernelFee}=require('../src/service-fee.cjs');assert(ysr.validAddress(ADDRESSES.YSR));assert.equal(kernelFee({coin:'YSR'}),0);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-ysr-fee-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const f=new FeeController({},dir,()=>{},()=>{}),key=f.ledger.key('YSR',wallet);f.ledger.credit(key,199);await f.persist();const next=new FeeController({},dir,()=>{},()=>{});await next.load();assert.equal(next.ledger.entry(key).balance,1);assert.equal(next.ledger.entry(next.ledger.key('NOID',wallet)).balance,0);
});
test('YSR local records do not block uploads for coins accepted by the deployed server',async t=>{
 const {Records}=require('../src/records.cjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'ysr-records-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));const sent=[];
 const records=new Records(dir,async(_url,options)=>{sent.push(JSON.parse(options.body).coin);return Buffer.from('{"accepted":true}')},()=>{});
 records.rows=[{record:{coin:'YSR'},uploaded:false},{record:{coin:'QTC'},uploaded:false}];records.enabled=true;
 await records.flush();assert.deepEqual(sent,['QTC']);assert.equal(records.rows[0].uploaded,false);assert.equal(records.rows[1].uploaded,true);
});
