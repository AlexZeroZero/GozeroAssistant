// SPDX-License-Identifier: Apache-2.0
// Explicit, bounded Mac-local miner. Importing this module never starts work.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {run,validatedConfig}=require('./pool_runner.cjs');
function check(ok,message){if(!ok)throw Error(message)}
function parseArgs(argv){
 const options={};
 const allowed=new Set(['wallet','worker','host','port','seconds','batch','native-dir','report']);
 for(let i=0;i<argv.length;i++){
  const name=argv[i].startsWith('--')?argv[i].slice(2):'';
  check(allowed.has(name)&&i+1<argv.length&&!argv[i+1].startsWith('--')&&options[name]===undefined,'Unknown, duplicate or missing option: '+argv[i]);
  options[name]=argv[++i];
 }
 return options;
}
function verifyNative(directory){
 const folder=path.resolve(directory),manifest=JSON.parse(fs.readFileSync(path.join(folder,'build-selftest.json'),'utf8'));
 check(manifest.cpuSelftest==='passed'&&manifest.metalSelftest==='passed','Native selftests have not passed');
 const mode=manifest.metalCompilation,metal=mode==='runtime-source'?'noid-runtime.metal':'noid.metallib';
 check(['runtime-source','offline-metallib'].includes(mode)&&manifest.metalArtifact?.name===metal,'Invalid Metal artifact metadata');
 for(const [name,expected] of [['noid-apple-check',manifest.binarySha256?.['noid-apple-check']],[metal,manifest.metalArtifact.sha256]]){
  check(typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected),'Missing native artifact checksum');
  check(crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,name))).digest('hex')===expected,'Native artifact changed: '+name);
 }
 return {executable:path.join(folder,'noid-apple-check'),metal:path.join(folder,metal),flag:mode==='runtime-source'?'--metal-source':'--metallib'};
}
function makeConfig(options,environment=process){
 check(environment.platform==='darwin'&&environment.arch==='arm64','Run this core natively on an Apple Silicon Mac');
 const seconds=Number(options.seconds??180),batch=Number(options.batch??65536);
 // Validate the user values before reading artifacts or starting any process.
 const config=validatedConfig({pool:'innovlab',host:options.host??'hk2.innovlab.cc',port:Number(options.port??19601),
  wallet:options.wallet,worker:options.worker??'gozero-mac',seconds,batch,command:['pending-native-verification']});
 const native=verifyNative(options['native-dir']??__dirname);
 config.command=[native.executable,'--worker-seconds',String(seconds+30),native.flag,native.metal];
 return config;
}
async function main(argv){
 const options=parseArgs(argv),config=makeConfig(options);
 const report=path.resolve(options.report??path.join(__dirname,'results','mining-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid+'.json'));
 console.log('Gozero NOID Mac 实验挖矿核心：本机 Metal + CPU校验 + TLS；本次最多 '+config.seconds+' 秒，Ctrl+C 停止。');
 const summary=await run(config,{reportFile:report,event:event=>{
  if(event.type==='stats')console.log((event.localHashesPerSecond/1e6).toFixed(3)+' MH/s | 接受 '+event.accepted+' | 拒绝 '+event.rejected);
  else if(['worker-ready','tls-ready','authorized','paused','stopped','worker-stderr'].includes(event.type))console.log(JSON.stringify(event));
 }});
 console.log('报告：'+report);
 console.log('本地平均 '+(summary.localHashesPerSecond/1e6).toFixed(3)+' MH/s；提交 '+summary.submitted+'，接受 '+summary.accepted+'，拒绝 '+summary.rejected+'。');
 if(summary.error)process.exitCode=1;
 return summary;
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1});
module.exports={parseArgs,verifyNative,makeConfig,main};
