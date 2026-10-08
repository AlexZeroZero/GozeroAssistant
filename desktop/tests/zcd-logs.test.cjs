'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Miner}=require('../src/miner.cjs'),{HashWindows}=require('../src/hash-windows.cjs');
const {DEFAULT}=require('../src/config.cjs'),{ADDRESSES}=require('../src/service-fee.cjs');
const {poolConfig}=require('../src/zcd.cjs');

test('ZCD native log captures telemetry while the separate console captures startup errors',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-zcd-logs-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const messages=[],miner=new Miner(dir,()=>{throw Error('No network in test')},(type,text)=>messages.push({type,text}));
 const cfg={...DEFAULT,coin:'ZCD',cpuThreads:1,wallets:{...DEFAULT.wallets,ZCD:ADDRESSES.ZCD}};
 const hw={cpu:[{Name:'test CPU',NumberOfCores:2,NumberOfLogicalProcessors:4}]};
 const native='logs/cpu.log';assert.equal(poolConfig(cfg,hw,native)['log-file'],native);
 const job={id:'cpu',name:'CPU',status:'running',logFile:path.join(dir,'cpu.log'),offset:0,fragment:'',samples:[],consoleLog:{logFile:path.join(dir,'cpu.console.log'),offset:0,fragment:''}};
 miner.jobs.set(job.id,job);miner.status='running';miner.session={coin:'ZCD',benchmark:false};miner.hashWindows=new HashWindows([job.id]);
 await fs.writeFile(job.logFile,'[time] cpu READY threads 1/1\n[time] miner speed 10s/60s/15m 123.4 n/a n/a H/s max 999 H/s\n[time] cpu accepted (1/0) diff 1000\n');
 await fs.writeFile(job.consoleLog.logFile,'startup diagnostic\n');
 await miner.readLogs();assert.equal(job.telemetry.hash,123.4);assert.deepEqual(job.shares,{accepted:1,rejected:0});
 assert.ok(messages.some(x=>x.text.includes('READY')));assert.ok(messages.some(x=>x.text.includes('startup diagnostic')));
 const n=messages.length;await miner.readLogs();assert.equal(messages.length,n);assert.equal(job.samples.length,1);
 assert.ok(Math.abs(miner.hashWindows.snapshot(Date.now()+1000).hash-123.4)<1e-9);
 // Split writes are consumed exactly once, after a complete line arrives.
 await fs.appendFile(job.logFile,'[time] miner speed 10s/60s/15m 234.');await miner.readLogs();assert.equal(job.telemetry.hash,123.4);
 await fs.appendFile(job.logFile,'5 200.0 n/a H/s max 999 H/s\n');await miner.readLogs();assert.equal(job.telemetry.hash,234.5);
 // A rotated log must not inherit an incomplete fragment from the old file.
 await fs.appendFile(job.logFile,'old fragment');await miner.readLogs();await fs.writeFile(job.logFile,'new log\n');await miner.readLogs();assert.match(messages.at(-1).text,/CPU .* new log$/);
});
