'use strict';
// Install the actual packaged bundles into an isolated directory; no mining.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
 const folder=path.join(root,'dist',`GozerAssistant-${version}-win-x64`),app=path.join(folder,'resources/app');
 const out=path.join(root,'artifacts',`release-${version}`);await fs.mkdir(out,{recursive:true});
 const profile=await fs.mkdtemp(path.join(out,'bundle-install-'));
 const previous=path.join(root,'dist','GozerAssistant-1.0.55-win-x64/resources/app');
 const {installKernel}=require(path.join(app,'src/kernel-install.cjs'));
 const {Miner}=require(path.join(app,'src/miner.cjs'));
 const results=[];
 for(const coin of ['MDS','JTM','YSR','BNT']){
  const metadata=require(path.join(app,`src/${coin.toLowerCase()}-kernel.json`));
  const dir=path.join(profile,'miners',metadata.id),exe=path.join(dir,metadata.exe),updates=[];
  const file=path.join(app,'native',metadata.bundleDirectory,metadata.exe);
  assert.equal(hash(await fs.readFile(file)),hash(await fs.readFile(path.join(root,'native',metadata.bundleDirectory,metadata.exe))),`${coin} executable changed during packaging`);
  const unchangedFrom1055=hash(await fs.readFile(file))===hash(await fs.readFile(path.join(previous,'native',metadata.bundleDirectory,metadata.exe)));
  await installKernel({dir,exe,metadata,request:async()=>{throw Error('Unexpected network download')},update:s=>updates.push(s),log:()=>{}});
  assert.equal(updates.at(-1).stage,'ready');
  const miner=new Miner(profile,()=>{},()=>{});
  assert(await miner.installed({coin,kernels:{[coin]:'auto'}}));
  results.push({coin,version:metadata.version,installed:true,executableUnchangedByPackaging:true,unchangedFrom1055});
 }
 const locales=(await fs.readdir(path.join(folder,'locales'))).filter(n=>n.endsWith('.pak')).sort();
 assert.deepEqual(locales,['en-GB.pak','en-US.pak','ja.pak','ru.pak','zh-CN.pak','zh-TW.pak']);
 const report={version,passed:true,bundles:results,locales,noMiningExecuted:true};
 await fs.writeFile(path.join(out,'bundle-install.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1});
