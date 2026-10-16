'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {validate,DEFAULT}=require('../src/config.cjs'),{Miner,argsFor}=require('../src/miner.cjs'),mds=require('../src/mds.cjs');
const {resolve}=require('../src/kernel-catalog.cjs');
const wallet='9bd7f16ae5827118e93239e75a98a6ec564c9247f94b5c5de63d1be4d083af03c1f035b7';
const gpu=()=>({id:'a'.repeat(20),name:'NVIDIA GeForce RTX 3090',vendor:'NVIDIA',sensors:{uuid:'GPU-12345678-1234-1234-1234-123456789abc',temp:55,at:Date.now(),load:100}});
const config=()=>validate({coin:'MDS',wallets:{MDS:wallet},selected:['a'.repeat(20)],mdsMssConfirmed:true,performance:100});
test('MDS resolves the tested CUDA core and preserves older coin profiles',()=>{
 const c=config();assert.equal(c.pools.MDS,mds.DEFAULT_POOL);assert.equal(resolve(c).version,'0.1.11');
 assert.equal(resolve(c).exeSha256,'20e28196c354053ddd0daace4e22c899e571b98b2250e40a8c1e962169cecadb');
 assert.equal(validate({coin:'YSR',performance:81}).performance,81);
 const upgraded=validate({...c,kernels:{MDS:'gozero-mds-cuda-0.1.9'}});
 assert.equal(upgraded.kernels.MDS,'auto');assert.equal(upgraded.wallets.MDS,wallet);assert.equal(upgraded.performance,100);
 assert.equal(validate({...c,kernels:{MDS:'gozero-mds-cuda-0.1.10'}}).kernels.MDS,'auto');
 const dual=validate({...c,workbenchMode:'dual',taskProfiles:{gpu:{coin:'MDS',mdsMssConfirmed:true},cpu:{coin:'ZCD'}}});
 assert.equal(dual.taskProfiles.gpu.coin,'MDS');assert.equal(dual.taskProfiles.gpu.mdsMssConfirmed,true);
 assert.throws(()=>validate({...c,pools:{MDS:'stratum+ssl://mds.gozero.trade:13333'}}),/TCP|tcp/);
 assert.throws(()=>validate({...c,poolBackups:{MDS:['stratum+tcp://other.example:13333']}}),/备用/);
});
test('MDS launches CUDA ordinal zero under UUID isolation, keeps budget and requires MSS confirmation',()=>{
 const c=config(),g=gpu(),a=argsFor(c,g,'ignored.log');const value=k=>a[a.indexOf(k)+1];
 assert.equal(value('--backend'),'cuda');assert.equal(value('--gpu-index'),'0');assert.equal(value('--duty'),'0.900');
 assert.equal(value('--payout-address'),wallet);assert.equal(value('--cuda-batch'),'0');assert.equal(value('--cuda-block'),'0');assert.equal(value('--cuda-dispatch'),'0');assert(a.includes('--mss-confirmed'));
 assert.match(value('--worker'),/3090/);assert(value('--worker').length<=32);
 assert.throws(()=>argsFor({...c,mdsMssConfirmed:false},g,''),/MSS|generate-mss/);
 assert.throws(()=>argsFor(c,{...g,vendor:'AMD'},''),/NVIDIA/);
 assert.throws(()=>argsFor(c,{...g,sensors:{...g.sensors,at:Date.now()-11000}},''),/温度/);
 assert.equal(mds.args({...c,performance:50},g)[a.indexOf('--duty')+1],'0.450');
});
test('MDS structured hashrate reaches jobs and averages without changing N/s or multiplying consensus rounds',()=>{
 const m=new Miner(os.tmpdir(),()=>{},()=>{}),g=gpu();m.session={coin:'MDS',selected:[g.id],performance:100};m.currentKernel=resolve(config());
 m.hashWindows=new (require('../src/hash-windows.cjs').HashWindows)([g.id]);
 const j={id:g.id,name:g.name,samples:[],powers:[]};m.jobs.set(g.id,j);
 m.ingestLine(j,'MDS {"type":"telemetry","unit":"N/s","hash":18425.5,"accepted":13,"rejected":1}');
 assert.equal(j.telemetry.hash,18425.5);assert.equal(j.telemetry.unit,'N/s');assert.equal(j.telemetry.accepted,13);assert.equal(m.hashWindows.snapshot().devices[0].samples,1);
 assert.equal(mds.parseTelemetry('MDS {"type":"benchmark","unit":"N/s","hash":999}'),null);
 assert.equal(mds.parseTelemetry('MDS {"type":"telemetry","unit":"H/s","hash":999,"accepted":0,"rejected":0}'),null);
 assert.equal(mds.parseTelemetry('MDS {"type":"telemetry","unit":"N/s","hash":-1,"accepted":0,"rejected":0}'),null);
 assert.equal(mds.parseTelemetry('MDS {"type":"cuda-diagnostics","gpuSettings":{"probeComputeNps":99999}}'),null);
 const diagnostic=mds.message('MDS '+JSON.stringify({type:'selftest',backend:'cuda',passed:true,gpuSettings:{device:'RTX3090',duty:.9,registersPerThread:40,smCount:82,batchNonces:41984,chainUnroll:4,workgroupSize:64,itersPerDispatch:8000,tuning:[{}]}}));
 assert.match(diagnostic,/U4 · SM 82 · 并行链 41984 · 线程块 64 · 分段 8000 · 自动调优/);
});
test('MDS hardware monitor never adds a second throttle and still stops an overheated GPU',()=>{
 const m=new Miner(os.tmpdir(),()=>{},()=>{}),g=gpu(),writes=[];let stopped=false;
 m.status='running';m.session={coin:'MDS',performance:100,temperature:85};m.currentKernel=resolve(config());
 m.jobs.set(g.id,{id:g.id,status:'running',duty:90,powers:[],child:{stdin:{write:x=>writes.push(x)}}});
 m.stop=async()=>{stopped=true};m.checkHardware({gpus:[g]});assert.deepEqual(writes,[]);assert(!stopped);
 assert.throws(()=>m.setPerformance(50),/停止/);
 g.sensors.temp=85;m.checkHardware({gpus:[g]});assert(stopped);
});
test('MDS bundled installation checks all hashes, remains idle and uses its own fee ledger',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-mds-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const m=new Miner(dir,()=>{throw Error('unexpected network download')},()=>{});await m.install(config());assert(await m.installed(config()));assert.equal(m.status,'idle');
 const {FeeController,ADDRESSES,kernelFee}=require('../src/service-fee.cjs');assert.equal(ADDRESSES.MDS,mds.SERVICE_ADDRESS);assert.equal(kernelFee(config()),0);
 const f=new FeeController(m,dir,()=>{},()=>{}),key=f.ledger.key('MDS',wallet);f.ledger.credit(key,199);await f.persist();
 const next=new FeeController(m,dir,()=>{},()=>{});await next.load();assert.equal(next.ledger.entry(key).balance,1);
 await fs.appendFile(m.exe,'tamper');assert.equal(await m.installed(config()),false);
});
test('native-budget guard captures output and terminates its owned worker without applying a second budget',async t=>{
 if(process.platform!=='win32')return;
 const {spawn}=require('node:child_process'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'mds-guard-'));
 const logFile=path.join(dir,'native.log'),guard=spawn(path.resolve(__dirname,'../vendor/ProcessGuard.exe'),[String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let pid,errors='';guard.stderr.on('data',d=>errors+=d);guard.stdout.on('data',d=>{for(const line of String(d).split('\n'))try{pid=JSON.parse(line).pid||pid}catch{}});
 t.after(async()=>{guard.kill();await new Promise(r=>setTimeout(r,150));await fs.rm(dir,{recursive:true,force:true})});
 guard.stdin.write(JSON.stringify({exe:process.execPath,cwd:dir,capturePath:logFile,nativeBudget:true,duty:100,args:['-e',"console.log('native duty');setInterval(()=>{},1000)"]})+'\n');
 const until=async fn=>{const end=Date.now()+5000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,80))}throw Error('guard timeout: '+errors)};
 await until(async()=>pid&&(await fs.readFile(logFile,'utf8').catch(()=>'' )).includes('native duty'));assert.equal(errors,'');
 guard.stdin.end('stop\n');await until(()=>{try{process.kill(pid,0);return false}catch{return true}});
});

test('MDS pipeline status shows bounded queue and pool cooldown instead of raw JSON',()=>{
 const line=mds.message('MDS '+JSON.stringify({type:'pipeline',queued:12,pending:1,oldestAckSeconds:.3,submission:{window:1,cooldownSeconds:2.0}}));
 assert.match(line,/提交队列 12/);assert.match(line,/繁忙退避 2.0s/);assert(!line.includes('{'));
 assert.match(mds.message('MDS '+JSON.stringify({message:'Pool verifier busy: cooling down submissions; limit retained across reconnects'})),/重连后保留限制/);
});
