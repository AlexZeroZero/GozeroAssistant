const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {LargePages,status,preference}=require('../src/large-pages.cjs');
test('large pages distinguishes account rights, current token and actual allocation',()=>{
 assert.equal(status({ok:true,assigned:false,tokenAvailable:false},null).phase,'disabled');
 assert.equal(status({ok:true,assigned:true,tokenAvailable:false},null).phase,'pending');
 assert.equal(status({ok:true,tokenAvailable:true,allocationAvailable:false},null).phase,'allocation-failed');
 assert.equal(status({ok:true,tokenAvailable:true,allocationAvailable:true},null).phase,'available');
 assert.equal(status({ok:true,assigned:false,tokenAvailable:false},{enabled:true}).phase,'disabled','revoked policy must allow re-enabling');
});
test('BNT preserves measured choices when large-page permissions change',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-pages-'));
 try{
 const tuning=require('../src/bnt-tuning.cjs'),exe=path.resolve(__dirname,'../native/bnt/GozeroBlocknetCore.exe'),hw={cpu:[],memory:[],metrics:{totalMemory:100}},c={performance:100};
 const before=await tuning.policy(exe,dir,c,hw,1);assert.equal(before.plan.pages,'off');
 const selected={engine:'prefetch',threads:1,performance:100,affinity:false,pages:'off'};
 await fs.writeFile(path.join(dir,'bnt-tuning.json'),JSON.stringify({at:'2026-01-01',fingerprint:tuning.fingerprint(before.info,hw),selected}));
 await fs.writeFile(path.join(dir,'large-pages.json'),JSON.stringify({enabled:true,enabledAt:'2026-02-01'}));
 const after=await tuning.policy(exe,dir,c,hw,1);assert.equal(after.plan.pages,'off');assert.equal(after.plan.tuned,true);
 await fs.unlink(path.join(dir,'bnt-tuning.json'));assert.equal((await tuning.policy(exe,dir,c,hw,1)).plan.pages,'auto');
 await fs.writeFile(path.join(dir,'bnt-tuning.json'),JSON.stringify({at:'2026-03-01',fingerprint:tuning.fingerprint(before.info,hw),selected}));
 const retuned=await tuning.policy(exe,dir,c,hw,1);assert.equal(retuned.plan.pages,'off');assert.equal(retuned.plan.tuned,true,'fresh tuning may choose ordinary pages if faster');
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('UAC cancellation never persists enable preference; refresh never elevates',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-pages-')),calls=[];
 try{const p=new LargePages(dir,{run:async(file,args,options)=>{calls.push(args[0]);assert.equal(options.windowsHide,true);if(args[0]==='--request')throw{stdout:JSON.stringify({ok:false,cancelled:true,errorCode:1223})};return{stdout:JSON.stringify({ok:true,assigned:false,tokenAvailable:false})}}});
 await p.refresh();assert.deepEqual(calls,['--status']);await assert.rejects(p.enable(),/已取消/);assert.equal(await preference(dir),null);assert.equal(p.busy,false);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('confirmed grant is saved but is not reported as allocated until fresh logon',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-pages-'));
 try{const p=new LargePages(dir,{run:async()=>({stdout:JSON.stringify({ok:true,granted:true,assigned:true,tokenAvailable:false})})});await p.enable();assert.equal((await preference(dir)).enabled,true);assert.equal(p.snapshot().phase,'pending');assert.equal(p.busy,false);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
