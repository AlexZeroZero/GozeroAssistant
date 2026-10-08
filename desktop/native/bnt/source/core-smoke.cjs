'use strict';
const assert=require('node:assert/strict'),{ComputeWorker}=require('./node-miner.cjs');
async function run(exe){
 const w=new ComputeWorker(exe,'prefetch');
 try{
  const ready=await w.ready;assert.equal(ready.memoryKiB,2097152);
  await assert.rejects(w.hash({id:'invalid',header:'00',nonce:'0'}),/hex characters/);
  const task={id:'golden',header:'acb399cdb4e634ed5275f6e4f9407419343fa96ad71bbcc57a614941a3413f24388a1db594d4b93affc814719a2ce80a5f4554d1f8853b51ad67ee0d922cd86bce3f66f0454f443ae3580f08d28d5e0b03566f8425e271e670fc2d30',nonce:'0',target:'f'.repeat(64)};
  const pending=w.hash(task);await assert.rejects(w.hash({...task,id:'second'}),/busy/);
  const result=await pending;assert.equal(result.hash,'7ede501774bc34ee386dd7e1460e41d6a5b3d3add5eced6459dde4cb85224971');assert.equal(result.meetsTarget,true);
  await assert.rejects(w.hash({...task,id:'overflow',nonce:'18446744073709551616'}),/uint64/);
 }finally{await w.stop()}
 assert.equal(w.closed,true);
 await assert.rejects(w.hash({id:'after-stop'}),/unavailable/);
 console.log('CORE_SMOKE_PASS: readiness, golden vector, invalid input, uint64 overflow, queue guard, process shutdown');
}
run(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1});
