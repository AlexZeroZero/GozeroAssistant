// SPDX-License-Identifier: Apache-2.0
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {parseArgs,verifyNative,makeConfig}=require('./miner_cli.cjs');
test('CLI requires an explicit address, bounded duration and native Apple execution',()=>{
 assert.throws(()=>makeConfig({}, {platform:'darwin',arch:'arm64'}),/public address/);
 assert.throws(()=>makeConfig({}, {platform:'win32',arch:'x64'}),/Apple Silicon/);
 const wallet='o1'+'q'.repeat(40); // Synthetic public-format text, never a payout default.
 for(const seconds of ['0','601','Infinity','1.2'])assert.throws(()=>makeConfig({wallet,seconds},{platform:'darwin',arch:'arm64'}),/duration/);
 for(const threads of ['-1','9','Infinity','1.2'])assert.throws(()=>makeConfig({wallet,'cpu-threads':threads},{platform:'darwin',arch:'arm64'}),/CPU threads/);
 assert.throws(()=>parseArgs(['--wallet','x','--wallet','y']),/duplicate/);
 assert.throws(()=>parseArgs(['--wallet']),/missing/);
 assert.throws(()=>parseArgs(['--command','arbitrary']),/Unknown/);
});
test('native integrity gate binds executable and shader to a successful selftest',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'noid-cli-'));
 try{
  const exe=Buffer.from('test-native'),metal=Buffer.from('test-metal');
  const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
  fs.writeFileSync(path.join(dir,'noid-apple-check'),exe);fs.writeFileSync(path.join(dir,'noid-runtime.metal'),metal);
  const manifest={cpuSelftest:'passed',metalSelftest:'passed',metalCompilation:'runtime-source',binarySha256:{'noid-apple-check':sha(exe)},metalArtifact:{name:'noid-runtime.metal',sha256:sha(metal)}};
  const save=()=>fs.writeFileSync(path.join(dir,'build-selftest.json'),JSON.stringify(manifest));save();
  assert.equal(verifyNative(dir).flag,'--metal-source');
  const config=makeConfig({wallet:'o1'+'q'.repeat(40),'native-dir':dir,seconds:'180'},{platform:'darwin',arch:'arm64'});
  assert.deepEqual(config.command,[path.join(dir,'noid-apple-check'),'--worker-seconds','210','--metal-source',path.join(dir,'noid-runtime.metal')]);
  const hybrid=makeConfig({wallet:'o1'+'q'.repeat(40),'native-dir':dir,'cpu-threads':'4'},{platform:'darwin',arch:'arm64'});
  assert.deepEqual(hybrid.command.slice(-2),['--cpu-threads','4']);
  fs.appendFileSync(path.join(dir,'noid-runtime.metal'),'changed');assert.throws(()=>verifyNative(dir),/changed/);
  fs.writeFileSync(path.join(dir,'noid-runtime.metal'),metal);manifest.metalSelftest='failed';save();assert.throws(()=>verifyNative(dir),/selftests/);
 }finally{
  // Only known files in the exact newly-created temporary directory are removed.
  for(const name of ['noid-apple-check','noid-runtime.metal','build-selftest.json'])fs.unlinkSync(path.join(dir,name));
  fs.rmdirSync(dir);
 }
});
