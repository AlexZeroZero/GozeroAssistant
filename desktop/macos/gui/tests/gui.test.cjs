'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {validate,DEFAULT,Store,miningConfig,GPU_ID}=require('../config.cjs');
const {delta,parseGPU}=require('../hardware.cjs'),{Miner}=require('../miner.cjs');
const {FeeController,ADDRESSES}=require('../../../src/service-fee.cjs');
const base=path.resolve(__dirname,'../artifacts');
const {PRESETS,presetFor}=require('../pools.cjs'),{model:menuModel,MenuBar}=require('../menubar.cjs');
const {t}=require('../i18n.js');
async function temp(fn){await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'test-'));try{await fn(dir);}finally{assert.ok(path.resolve(dir).startsWith(base+path.sep));await fs.rm(dir,{recursive:true,force:true});}}
function fake(){const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{queueMicrotask(()=>child.emit('close',null));return true;};return child;}
const config=()=>miningConfig({...DEFAULT,wallet:ADDRESSES.NOID});

test('language persists independently and preserves protocol values in translated logs',()=>temp(async dir=>{
 const store=new Store(dir);await store.save({...DEFAULT,language:'en',cpuThreads:4});const next=new Store(dir);await next.load();
 assert.equal(next.value.language,'en');assert.equal(next.value.cpuThreads,4);assert.throws(()=>validate({...DEFAULT,language:'xx'}),/语言/);
 assert.equal(t('本次最多 180 秒，到时自动停止','en'),'Stops automatically after 180s');
 assert.equal(t('矿池等待 0.123 秒，收到新任务 · abc12','en'),'Pool wait 0.123s; new work · abc12');
 const raw='矿池要求暂停旧任务，保持连接等待新任务 · 原因：canonical-tip-unverified';
 assert.ok(t(raw,'en').includes('canonical-tip-unverified'));assert.equal(t(raw,'zh'),raw);
 assert.equal(menuModel({config:{...DEFAULT,language:'en'},miner:{status:'idle'}}).title,'Gozero Idle');
}));

test('all catalog entries validate and custom ports never masquerade as presets',()=>{
 assert.equal(PRESETS.length,11);assert.equal(new Set(PRESETS.map(p=>p.host+':'+p.port)).size,11);
 for(const p of PRESETS){const c=validate({...DEFAULT,...p});assert.equal(presetFor(c).id,p.id);assert.equal(presetFor({...c,port:c.port+1}),null);}
});

test('TCP is an explicit Suprnova choice, while existing settings remain TLS',()=>{
 assert.equal(validate({}).transport,'tls');assert.throws(()=>validate({...DEFAULT,transport:'tcp'}),/TLS/);
 const c=miningConfig({...DEFAULT,pool:'suprnova',transport:'tcp',wallet:ADDRESSES.NOID});assert.ok(c.pools.NOID.startsWith('stratum+tcp://'));
});

test('menu bar does not show old hashrate while paused, stopped or benchmarking',()=>{
 const s={config:DEFAULT,miner:{status:'running',workState:'mining',rate:{total:1234000,cpu:134000,gpu:1100000}}};
 assert.equal(menuModel(s).title,'1.23 MH/s');assert.equal(menuModel(s).busy,true);
 s.miner.workState='paused';assert.equal(menuModel(s).title,'等待矿池');assert.ok(!menuModel(s).summary.includes('MH/s'));
 s.miner.workState='reconnecting';assert.equal(menuModel(s).title,'重连中');
 s.miner.status='idle';assert.equal(menuModel(s).title,'Gozero 待机');assert.equal(menuModel(s).busy,false);
 s.miner.status='running';s.miner.session={benchmark:true};assert.equal(menuModel(s).title,'Gozero 测速中');
});

test('menu bar actions keep show, stop and quit separate',async()=>{
 class FakeTray extends EventEmitter{setTitle(t){this.title=t;}setToolTip(){}setContextMenu(m){this.menu=m;}isDestroyed(){return !!this.destroyed;}destroy(){this.destroyed=true;}}
 const actions=[];const bar=new MenuBar({Tray:FakeTray,Menu:{buildFromTemplate:x=>x},nativeImage:{createFromPath:()=>({resize:()=>({})})},icon:'icon',show:()=>actions.push('show'),stop:()=>actions.push('stop'),quit:()=>actions.push('quit'),onError:()=>assert.fail()});
 bar.update({config:DEFAULT,miner:{status:'running',workState:'mining',rate:{total:1e6}}});
 bar.menu[0].click();assert.deepEqual(actions,['show']);await bar.menu.find(x=>x.label==='停止挖矿 / 测速').click();assert.deepEqual(actions,['show','stop']);
 await bar.menu.find(x=>x.label==='退出助手（停止内核）').click();assert.deepEqual(actions,['show','stop','quit']);
 bar.destroy();assert.equal(bar.available(),false);
});
test('configuration validates wallet checksum and excludes executable/argument injection',()=>{
 assert.equal(validate(DEFAULT).cpuThreads,0);assert.throws(()=>miningConfig(DEFAULT),/收款地址/);
 for(const patch of [{wallet:'o1'+'q'.repeat(58)},{host:'example.com;whoami'},{host:'https://example.com'},{port:0},{cpuThreads:32},{seconds:0},{seconds:601},{worker:'$(id)'},{stopOnThermal:'false'}])assert.throws(()=>validate({...DEFAULT,...patch}));
 assert.deepEqual(miningConfig({...DEFAULT,wallet:ADDRESSES.NOID}).selected,[GPU_ID]);
});
test('settings persist atomically; corrupt settings stay on disk until explicit save',()=>temp(async dir=>{
 const store=new Store(dir);await store.save({...DEFAULT,worker:'GozeroTest',cpuThreads:4});const next=new Store(dir);await next.load();assert.equal(next.value.cpuThreads,4);
 await fs.writeFile(next.file,'broken');await next.load();assert.ok(next.warning);assert.equal(await fs.readFile(next.file,'utf8'),'broken');
}));
test('CPU sampling and GPU parsing preserve unavailable data',()=>{
 assert.deepEqual(delta([{times:{user:10,sys:10,idle:80}}],[{times:{user:20,sys:20,idle:100}}]),[50]);
 assert.equal(parseGPU('"Device Utilization %"=99'),99);assert.equal(parseGPU('unavailable'),null);
});
test('cancel while setup awaits filesystem prevents any child launch',()=>temp(async dir=>{
 let spawned=0;const miner=new Miner(dir,dir,()=>{},{spawn:()=>{spawned++;return fake();},verify:()=>({executable:'native',flag:'--metal-source',metal:'shader'})});
 const pending=miner.start(config(),{},false);await miner.stop();await assert.rejects(pending,/取消/);assert.equal(spawned,0);assert.equal(miner.status,'idle');
}));
test('miner runs isolated bounded child; rejects duplicate start; stop cleans config',()=>temp(async dir=>{
 const child=fake();let args,opts;const miner=new Miner(dir,dir,()=>{},{spawn:(_e,a,o)=>{args=a;opts=o;return child;},verify:()=>({executable:'native',flag:'--metal-source',metal:'shader'})});
 await miner.start(config(),{},false);const cfg=JSON.parse(await fs.readFile(args[1],'utf8'));assert.equal(cfg.wallet,ADDRESSES.NOID);assert.ok(cfg.seconds<=600);assert.equal(cfg.command.at(-1),'0');assert.equal(opts.stdio[0],'ignore');
 await assert.rejects(miner.start(config(),{},false),/已有/);
 child.stdout.write(JSON.stringify({type:'stats',localHashesPerSecond:2e6,cpuHashesPerSecond:0.2e6,gpuHashesPerSecond:1.8e6,accepted:3,rejected:0})+'\n');assert.equal(miner.rate.total,2e6);assert.equal(miner.jobs.get(GPU_ID).telemetry.hash,2e6);
 await miner.stop();assert.equal(miner.status,'idle');await assert.rejects(fs.stat(args[1]),{code:'ENOENT'});
}));
test('offline benchmark uses native executable and never invokes pool controller',()=>temp(async dir=>{
 const child=fake();let exe,args;const miner=new Miner(dir,dir,()=>{},{spawn:(e,a)=>{exe=e;args=a;return child;},verify:()=>({executable:'native',flag:'--metal-source',metal:'shader'})});
 await miner.start({...DEFAULT,cpuThreads:4},{},true);assert.equal(exe,'native');assert.ok(args.includes('--search-seconds'));assert.ok(!args.some(x=>x.includes('pool_runner')));
 child.stdout.write(JSON.stringify({metalSelftest:'passed',metalSearch:{hashesPerSecondWall:200,cpuHashes:60,gpuHashes:540,wallSeconds:3}}));child.emit('close',0);await miner.done;assert.equal(miner.rate.cpu,20);assert.equal(miner.rate.gpu,180);
}));

test('pool wait, real work resume and accepted shares are separately visible',()=>{
 const logs=[],miner=new Miner('unused','unused',(type,text)=>logs.push({type,text}));
 miner.jobs.set(GPU_ID,{status:'running'});miner.workState='mining';
 const stats={type:'stats',localHashesPerSecond:2e6,cpuHashesPerSecond:0.2e6,gpuHashesPerSecond:1.8e6,accepted:0,rejected:0};
 miner.event({type:'paused',reason:'canonical-tip-unverified'});
 miner.event(stats);assert.equal(miner.rate.total,0);assert.equal(miner.workState,'paused');
 miner.event({type:'job',job:'fresh',pauseSeconds:0.8});assert.equal(miner.rate.total,null);assert.equal(miner.workState,'waiting');
 miner.event({type:'work-resumed',job:'fresh'});miner.event(stats);assert.equal(miner.rate.total,2e6);assert.equal(miner.workState,'mining');
 miner.event({type:'submitted',id:42});miner.event({type:'accepted',id:42});
 assert.equal(miner.totals.submitted,1);assert.equal(miner.totals.accepted,1);
 assert.ok(logs.some(l=>l.text.includes('canonical-tip-unverified')));
 assert.ok(logs.some(l=>l.text.includes('0.800 秒')));
 assert.ok(logs.some(l=>l.text.includes('NOID share accepted')));
 assert.equal(logs.filter(l=>l.type==='算力').length,1,'Do not flood the log each second');
 miner.event({type:'reconnect'});miner.event(stats);assert.equal(miner.rate.total,0);
});
test('original service fee ledger and recipient transition remain active',()=>temp(async dir=>{
 const cfg=config();let seen;const miner={status:'idle',jobs:new Map(),async start(c){seen=c;this.status='running';this.jobs.set(GPU_ID,{status:'running',telemetry:{hash:1,at:Date.now()}});},async stop(){this.status='idle';}};
 const fee=new FeeController(miner,dir,()=>{},()=>{});const key=fee.ledger.key('NOID',cfg.wallets.NOID);fee.ledger.credit(key,12000);
 await fee.start(cfg,{gpus:[{id:GPU_ID}]});assert.equal(fee.phase,'service');assert.equal(seen.worker,'GozerService');assert.equal(seen.wallets.NOID,ADDRESSES.NOID);assert.equal(fee.snapshot().rate,0.005);
 await fee.stop();assert.equal(fee.active,false);assert.equal(miner.status,'idle');assert.ok((await fs.readFile(path.join(dir,'service-fee-ledger.json'),'utf8')).includes('entries'));
}));
