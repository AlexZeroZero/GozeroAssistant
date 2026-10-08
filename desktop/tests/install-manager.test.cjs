const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {InstallManager}=require('../src/install-manager.cjs'),{DEFAULT}=require('../src/config.cjs');
test('download controller is independent, active executable cannot be overwritten',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-install-test-'));let active=['suprminer-noid-1.9.27'];const manager=new InstallManager(dir,()=>{},()=>{},()=>{},()=>active);
 try{const noid={...DEFAULT,coin:'NOID'};await assert.rejects(()=>manager.install(noid),/正在挖矿/);assert.equal(manager.entry(noid).miner.status,'idle');const bnt={...DEFAULT,coin:'BNT'};await manager.install(bnt);assert.equal(manager.snapshot(bnt).installed,true);assert.equal(manager.snapshot(noid).installed,false);assert.equal(active[0],'suprminer-noid-1.9.27');assert.equal(manager.entry(bnt).miner.status,'idle')}finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('failed system download retries direct, but a corrupt archive is never retried or installed',async()=>{
 const {installKernel}=require('../src/kernel-install.cjs'),crypto=require('node:crypto');const zip=Buffer.from('archive'),exe=Buffer.from('exe'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-retry-test-'));const metadata={version:'1',url:'https://github.com/a/b',sha256:hash(zip),exeSha256:hash(exe)};let calls=[];
 try{await installKernel({dir,exe:path.join(dir,'miner.exe'),metadata,request:async(u,o)=>{calls.push(o.direct);if(calls.length===1)throw Error('timeout');return zip},update:()=>{},log:()=>{},extractArchive:()=>fs.writeFile(path.join(dir,'miner.exe'),exe)});assert.deepEqual(calls,[false,true]);calls=[];await assert.rejects(()=>installKernel({dir,exe:path.join(dir,'miner.exe'),metadata,request:async()=>{calls.push(1);return Buffer.from('tampered')},update:()=>{},log:()=>{}}),/SHA256/);assert.equal(calls.length,1)}finally{await fs.rm(dir,{recursive:true,force:true})}
});
