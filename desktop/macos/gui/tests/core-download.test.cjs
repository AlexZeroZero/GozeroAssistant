'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {CoreDownloads,verify,download,inside,proxyFallback}=require('../core-download.cjs');
const {launchSpec}=require('../core-adapter.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function temp(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-core-test-'));try{await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
function fixture(){
 const body=Buffer.from('pinned archive'),file=Buffer.from('validated native executable');
 const manifest=Buffer.from(JSON.stringify({files:{'native/core':{type:'file',bytes:file.length,mode:0o755,sha256:hash(file)}}}));
 const metadata={url:'https://github.com/example/core',bytes:body.length,sha256:hash(body),manifestSha256:hash(manifest)};
 const catalog={coins:{MDS:['mds'],QTC:['python','qtc'],PRL:['python','prl']},packages:Object.fromEntries(['mds','python','qtc','prl'].map(k=>[k,metadata]))};
 const extract=async(_a,dir)=>{await fs.mkdir(path.join(dir,'native'));await fs.writeFile(path.join(dir,'native/core'),file,{mode:0o755});await fs.writeFile(path.join(dir,'PAYLOAD.json'),manifest);};
 return{body,file,manifest,metadata,catalog,extract};
}
test('download rejects wrong SHA, truncation and oversized responses before install',()=>temp(async dir=>{
 const f=fixture();let i=0;
 for(const data of [Buffer.from('wrong archive!'),f.body.subarray(0,3),Buffer.concat([f.body,Buffer.from('extra')])])await assert.rejects(download(f.metadata,path.join(dir,'bad'+i++),new AbortController().signal,()=>{},async()=>new Response(data)),/校验|大小/);
}));
test('pinned install is cached and reusable without network; corruption requires verified repair',()=>temp(async dir=>{
 const f=fixture();let calls=0;const manager=new CoreDownloads(dir,f.catalog,()=>{},{extract:f.extract,request:async()=>{calls++;return new Response(f.body);}});
 await manager.ensure('MDS');assert.equal(calls,1);assert.equal(manager.snapshot().available.MDS,true);
 manager.deps.request=async()=>{throw Error('offline');};await manager.ensure('MDS');await manager.resolve('MDS');assert.equal(calls,1);
 await fs.writeFile(path.join(manager.folder('mds'),'native/core'),'corrupt');await assert.rejects(manager.resolve('MDS'),/校验/);
 await assert.rejects(manager.ensure('MDS'),/offline/);assert.equal(await fs.readFile(path.join(manager.folder('mds'),'native/core'),'utf8'),'corrupt');
 manager.deps.request=async()=>new Response(f.body);await manager.ensure('MDS');await manager.resolve('MDS');
 assert.ok(!(await fs.readdir(manager.root)).some(n=>n.startsWith('.install-')||n.includes('.old-')));
}));
test('shared Python downloads once across QTC and PRL',()=>temp(async dir=>{
 const f=fixture();let requests=0;const manager=new CoreDownloads(dir,f.catalog,()=>{},{extract:f.extract,request:async()=>{requests++;return new Response(f.body);}});
 await manager.ensure('QTC');await manager.ensure('PRL');assert.equal(requests,3);
 assert.equal(manager.locations('QTC').python,manager.locations('PRL').python);
}));
test('cancel download and duplicate start cannot publish a partial cache; retry succeeds',()=>temp(async dir=>{
 const f=fixture();let began;const ready=new Promise(r=>began=r);
 const manager=new CoreDownloads(dir,f.catalog,()=>{},{extract:f.extract,request:async(_u,{signal})=>{began();return new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
 const pending=manager.ensure('MDS');const rejected=assert.rejects(pending,/取消/);await ready;
 await assert.rejects(manager.ensure('MDS'),/已有/);await manager.cancel();await rejected;
 assert.equal(manager.snapshot().stage,'cancelled');assert.equal(manager.snapshot().available.MDS,false);assert.deepEqual(await fs.readdir(manager.root),[]);
 manager.deps.request=async()=>new Response(f.body);await manager.ensure('MDS');
}));
test('tampered payload manifest, injected files and unsafe paths are rejected',()=>temp(async dir=>{
 const f=fixture();await f.extract(null,dir);await verify(dir,f.metadata);
 await fs.writeFile(path.join(dir,'native/injected.cjs'),'bad');await assert.rejects(verify(dir,f.metadata),/未知/);await fs.unlink(path.join(dir,'native/injected.cjs'));
 await fs.writeFile(path.join(dir,'PAYLOAD.json'),'{}');await assert.rejects(verify(dir,f.metadata),/校验/);
 for(const name of ['../escape','/absolute','a/../b','a\\b'])assert.throws(()=>inside(dir,name),/路径/);
}));
test('download failure never calls extractor',()=>temp(async dir=>{
 const f=fixture();let extracted=false;const manager=new CoreDownloads(dir,f.catalog,()=>{},{extract:async()=>{extracted=true;},request:async()=>new Response('bad')});
 await assert.rejects(manager.ensure('MDS'));assert.equal(extracted,false);assert.equal(manager.snapshot().stage,'error');assert.deepEqual(await fs.readdir(manager.root),[]);
}));
test('downloaded runtime launch preserves coin arguments and uses shared interpreters',()=>{
 const runtime={node:'/cache/node',python:'/cache/python'};
 for(const coin of ['BNT','QTC','PRL']){
  const spec=launchSpec('/cache/cores','/profile',{coin,wallets:{[coin]:'test'},pools:{[coin]:'pool'},cpuThreads:0,worker:'worker'},'/report',runtime);
  assert.equal(spec.executable,coin==='BNT'?runtime.node:runtime.python);assert.ok(spec.args.includes('test'));
 }
});
test('unreachable system proxy can fall back to verified HTTPS; cancellation and TLS errors do not',async()=>{
 let direct=0;const secondary=async()=>{direct++;return new Response('ok');},options={signal:new AbortController().signal};
 const proxy=proxyFallback(async()=>{throw Error('net::ERR_PROXY_CONNECTION_FAILED');},secondary);
 assert.equal(await (await proxy('https://github.com',options)).text(),'ok');assert.equal(direct,1);
 await assert.rejects(proxyFallback(async()=>{throw Error('net::ERR_CERT_AUTHORITY_INVALID');},secondary)('https://github.com',options),/CERT/);
 const abort=new AbortController();abort.abort();await assert.rejects(proxy('https://github.com',{signal:abort.signal}));assert.equal(direct,1);
});
