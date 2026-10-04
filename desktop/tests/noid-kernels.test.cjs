'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {validate}=require('../src/config.cjs'),{resolve}=require('../src/kernel-catalog.cjs');
const {argsFor,Miner}=require('../src/miner.cjs'),{kernelFee}=require('../src/service-fee.cjs');
const kernels=Object.values(require('../src/noid-kernels.json'));
const wallet='o1mlk6uluf2dghqzz0etew4u9wq6clnnr4y4wuv20q2m255mj9crjquzyr4r';
const config=k=>validate({coin:'NOID',wallets:{NOID:wallet},kernels:{NOID:k.id}});
const gpu=()=>({vendor:'NVIDIA',pci:'01:00.0',architecture:'Ampere',driver:'610.62',sensors:{uuid:'GPU-12345678-1234-1234-1234-123456789abc',at:Date.now(),temp:60}});
test('two official NOID engines resolve independently with correct pool, wallet and fee dialects',()=>{
 assert.equal(resolve(validate({coin:'NOID'})).name,'Suprminer');
 for(const k of kernels){const c=config(k),a=argsFor(c,gpu(),'test.log');assert.equal(resolve(c).id,k.id);assert.equal(kernelFee(c),k.kernelFee);assert.ok(a.includes(wallet+'.'+c.worker));assert.equal(a[a.indexOf('-d')+1],'0');assert.ok(a.includes(c.pools.NOID));
  if(k.name==='Suprminer'){assert.ok(a.includes('--no-cpu'));assert.equal(a.filter(x=>x.startsWith('stratum')).length,1)}else{assert.equal(a.filter(x=>x==='--pool').length,3);assert.ok(a.includes('--noid-keep-warm=false'))}
 }
});
test('third-party launch requires a precise GPU identity, fresh temperature and compatible driver',()=>{
 for(const k of kernels){const c=config(k);for(const patch of[{uuid:undefined},{temp:null},{at:undefined},{at:Date.now()-11000}]){const g=gpu();Object.assign(g.sensors,patch);assert.throws(()=>argsFor(c,g,'log'))}}
 const k=kernels.find(k=>k.minimumDriver);assert.throws(()=>argsFor(config(k),{...gpu(),driver:'596.08'},'log'),/610/);
});
test('external telemetry excludes pool/network/efficiency figures and preserves explicit local units',()=>{
 const {parseExternalTelemetry:p}=require('../src/miner.cjs');
 assert.equal(p('GPU #0 speed: 23.45 MH/s | efficiency 120 kH/s/W').hash,23450000);
 assert.equal(p('Total hashrate: 0 H/s').hash,0);
 for(const line of ['Network hashrate: 80 GH/s','pool speed: 50 MH/s','GPU efficiency 20 kH/s/W','expected GPU speed: 150 MH/s','{"hashrate":20}'])assert.equal(p(line),null);
});
test('bundle extractor rejects traversal, duplicates, missing files and wrong hashes before replacing files',async t=>{
 const exec=require('node:util').promisify(require('node:child_process').execFile),{extract}=require('../src/kernel-install.cjs'),crypto=require('node:crypto');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-bundle-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await exec('python',['-c',"import pathlib,zipfile,sys,warnings; warnings.filterwarnings('ignore'); p=pathlib.Path(sys.argv[1])\nfor name,items in [('ok',[('root/miner.exe',b'fixture')]),('traversal',[('../miner.exe',b'fixture')]),('duplicate',[('root/miner.exe',b'fixture'),('root/miner.exe',b'fixture')]),('missing',[('root/readme',b'fixture')])]:\n with zipfile.ZipFile(p/(name+'.zip'),'w') as z:\n  for n,b in items:z.writestr(n,b)",dir],{windowsHide:true});
 const metadata={archiveRoot:'root/',files:{'miner.exe':crypto.createHash('sha256').update('fixture').digest('hex')}},target=path.join(dir,'installed');
 await extract(path.join(dir,'ok.zip'),target,null,metadata);
 for(const name of ['traversal','duplicate','missing'])await assert.rejects(extract(path.join(dir,name+'.zip'),target,null,metadata));
 await assert.rejects(extract(path.join(dir,'ok.zip'),target,null,{...metadata,files:{'miner.exe':'0'.repeat(64)}}));
 assert.equal(await fs.readFile(path.join(target,'miner.exe'),'utf8'),'fixture');assert.deepEqual(await fs.readdir(target),['miner.exe']);
});
test('official downloads install all pinned dependencies, reuse per-engine storage, detect tampering',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-three-kernels-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const k of kernels){const archive=path.resolve(__dirname,'../../.local/noid-comparison',new URL(k.url).pathname.split('/').pop());
  try{await fs.access(archive)}catch{t.diagnostic('Official fixture missing: '+k.name);continue}
  const updates=[],miner=new Miner(root,async(url,o)=>{assert.equal(url,k.url);const b=await fs.readFile(archive);o.onProgress({received:b.length,total:b.length});return b},()=>{});miner.on('update',s=>updates.push(s));const c=config(k);
  assert.equal(await miner.installed(c),false);await miner.install(c);assert.equal(await miner.installed(c),true);assert.equal(miner.installation.stage,'ready');assert.ok(updates.some(s=>s.installation.stage==='extracting'));
  assert.equal((await fs.readdir(miner.dir)).filter(f=>/\.(bat|cmd)$/i.test(f)).length,0);
  const dependency=Object.keys(k.files).find(n=>/\.dll$/i.test(n))||k.exe;await fs.appendFile(path.join(miner.dir,dependency),'tampered');assert.equal(await miner.installed(c),false);
  miner.configure(validate({coin:'NOID'}));assert.equal(miner.currentKernel.name,'Suprminer');assert.equal(miner.installation.stage,k.name==='Suprminer'?'ready':'idle');
 }
});
