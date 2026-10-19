'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {address,SERVICE_ADDRESS,event,verify}=require('../jtm.cjs');
const {DEFAULT,selectCoin,miningConfig,validate,CPU_ID}=require('../config.cjs');
const {launchSpec}=require('../core-adapter.cjs'),{Miner}=require('../miner.cjs'),{CoreDownloads}=require('../core-download.cjs');
const {FeeController,ADDRESSES}=require('../../../src/service-fee.cjs');
const OTHER='j1ryr28fawt4y3fy0rqd80cq2jhau7pr3lgdsuc0jfyqr9drd8hgvsd8cw8g';
const cfg=()=>miningConfig({...selectCoin(DEFAULT,'JTM'),wallet:OTHER,cpuThreads:0});
async function temp(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jtm-gui-'));try{await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
async function native(dir){const root=path.join(dir,'cores/jtm');await fs.mkdir(root,{recursive:true});const binary=Buffer.from('fake-verified-native');await fs.writeFile(path.join(root,'GozeroJtmCore'),binary);await fs.writeFile(path.join(root,'MANIFEST.json'),JSON.stringify({arch:'arm64',cpuTarget:'apple-m1',sha256:crypto.createHash('sha256').update(binary).digest('hex')}));}
test('JTM checksum, protocols, thread caps and independent profiles',()=>{
 assert.equal(address(SERVICE_ADDRESS),SERVICE_ADDRESS);assert.equal(address(OTHER),OTHER);
 for(const w of [SERVICE_ADDRESS.slice(0,-1)+'q','j1'+'q'.repeat(58),'tj1'+SERVICE_ADDRESS.slice(2),OTHER.toUpperCase()])assert.throws(()=>address(w));
 const c=cfg();assert.deepEqual(c.selected,[CPU_ID]);assert.equal(c.pools.JTM,'https://jtm.pool.gozero.trade/rpc');
 assert.equal(require('../pools.cjs').presetFor(c).id,'jtm-gozero');
 const dongqn={...c,pool:'dongqn',host:'sg.jtm.dongqn.com',transport:'http',port:8888};
 assert.equal(miningConfig(dongqn).pools.JTM,'http://sg.jtm.dongqn.com:8888');
 assert.equal(require('../pools.cjs').presetFor(dongqn).id,'jtm-dongqn-sg');
 assert.equal(selectCoin(selectCoin(dongqn,'NOID'),'JTM').host,dongqn.host);
 for(const patch of [{transport:'http'},{port:8888},{host:'pool.gozero.trade/JTM'},{host:'other.test'},{pool:'dongqn'}])assert.throws(()=>validate({...c,...patch}));
 for(const patch of [{transport:'tcp'},{pool:'kryptex'},{cpuThreads:-1},{cpuThreads:257},{cpuThreads:1.5}])assert.throws(()=>validate({...c,...patch}));
 assert.equal(selectCoin(selectCoin(c,'NOID'),'JTM').wallet,OTHER);assert.equal(validate({...c,seconds:600}).seconds,0);
});
test('JTM launches continuously with effective fee wallet, CPU count and parent guard',()=>{
 const c=cfg();c.wallet='must-not-be-used';c.wallets.JTM=SERVICE_ADDRESS;
 const s=launchSpec('/app/cores','/profile',c,'/report');assert.equal(s.env.TOWERMINER_KEY,SERVICE_ADDRESS+'.'+c.worker);
 assert.equal(s.args[s.args.indexOf('--parent-pid')+1],String(process.pid));assert.equal(Number(s.args[s.args.indexOf('--threads')+1]),os.availableParallelism());
 assert.ok(!s.args.includes('--bench-walk'));assert.ok(!s.args.some(a=>a.includes(SERVICE_ADDRESS)));
});
test('JTM status owns counters; waiting clears CPU work and unknown is not rejected',()=>{
 const m=new Miner('unused','unused',()=>{});m.session={coin:'JTM'};m.jobs.set(CPU_ID,{status:'running'});
 event(m,{type:'profile',threads:12,backend:'neon+pmull'});
 const s={type:'status',hps:9000,found:3,accepted:1,refused:1,unknown:1,state:'mining',uptime_s:50,height:42};event(m,s);
 assert.deepEqual(m.rate,{total:9000,cpu:9000,gpu:0});assert.equal(m.jobs.get(CPU_ID).telemetry.hash,9000);
 event(m,{type:'block',result:'accepted',height:42});assert.equal(m.totals.accepted,1);
 event(m,{type:'share',result:'accepted',height:42});assert.equal(m.totals.accepted,1);assert.equal(m.rate.cpu,9000);
 event(m,{...s,state:'waiting'});assert.equal(m.rate.cpu,0);assert.equal(m.jobs.get(CPU_ID).telemetry,null);assert.equal(m.totals.rejected,1);
 event(m,{...s,state:'error'});assert.equal(m.workState,'reconnecting');event(m,s);assert.equal(m.workState,'mining');
 assert.throws(()=>event(m,{...s,hps:-1}));assert.throws(()=>event(m,{...s,accepted:NaN}));
});
test('bundled JTM requires integrity and never downloads or depends on cache',()=>temp(async dir=>{
 await native(dir);const runtime={nativeDir:dir};let downloaded=false;
 const d=new CoreDownloads(dir,{coins:{},packages:{}},()=>{},{bundled:{JTM:{runtime,verify:s=>verify(dir,s)}},download:()=>{downloaded=true;}});
 await d.scan();assert.equal(d.snapshot().available.JTM,true);assert.deepEqual(await d.ensure('JTM'),runtime);assert.deepEqual(await d.resolve('JTM'),runtime);assert.equal(downloaded,false);
 await fs.appendFile(path.join(dir,'cores/jtm/GozeroJtmCore'),'corrupt');await assert.rejects(d.ensure('JTM'),/完整性/);await assert.rejects(d.resolve('JTM'),/完整性/);
}));
test('JTM split JSON output, final counters and Stop use one owned CPU process',()=>temp(async dir=>{
 await native(dir);const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{setImmediate(()=>{child.stdout.write(JSON.stringify({type:'status',hps:0,found:2,accepted:2,refused:0,unknown:0,state:'waiting',message:'stopped'})+'\n');child.emit('close',0);});};
 const m=new Miner(dir,dir,()=>{},{spawn:()=>child});m.signal=(_child,signal)=>{assert.equal(signal,'SIGINT');child.kill();};
 await m.start(cfg(),{});const line=JSON.stringify({type:'status',hps:1234,found:1,accepted:1,refused:0,unknown:0,state:'mining'})+'\n';child.stdout.write(line.slice(0,30));child.stdout.write(line.slice(30));assert.equal(m.rate.cpu,1234);
 await m.stop();assert.equal(m.status,'idle');assert.equal(m.totals.accepted,2);assert.equal(JSON.parse(await fs.readFile(m.lastReport)).totals.accepted,2);
}));
test('JTM original 0.5% ledger persists and fee phases use the authorized recipient',()=>temp(async dir=>{
 const launches=[],m={status:'idle',jobs:new Map(),async start(c){launches.push(c.wallets.JTM);this.status='running';},async stop(){this.status='idle';}};
 const f=new FeeController(m,dir,()=>{},()=>{}),c=cfg();await f.start(c,{});
 try{assert.equal(f.snapshot().rate,0.005);f.ledger.credit(f.key,12000);await f.transition('service');assert.equal(launches.at(-1),ADDRESSES.JTM);await f.transition('user');assert.equal(launches.at(-1),OTHER);}finally{await f.stop();}
 const restored=new FeeController(m,dir,()=>{},()=>{});await restored.load();assert.ok(restored.ledger.entries[f.key]);
}));
