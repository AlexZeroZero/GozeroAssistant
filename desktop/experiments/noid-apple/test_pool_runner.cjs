'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {run,validatedConfig}=require('./pool_runner.cjs');
const config={pool:'innovlab',host:'pool.invalid',port:19601,wallet:'o1'+'q'.repeat(40),worker:'offline',seconds:1,batch:4,command:['fake-worker']};
function harness({badDigest=false,authorized=true,accounting={cpuHashes:1,gpuHashes:3}}={}){
 let socket,requests=[],work=0;
 const namespace='0123456789abcdef';
 const job=id=>({method:'mining.notify',params:[{job_id:id,work_domain_id:'ab'.repeat(32),pow_fields_hex:'00'.repeat(256),nonce_field_index:10,nonce_bits:64,nonce_prefix_hex:namespace,share_target_hex:'ff'.repeat(32),block_target_hex:'01'.repeat(32),clean:true,expires_in_seconds:30}]});
 const frame=m=>socket.emit('data',Buffer.from(JSON.stringify(m)+'\n'));
 const transport=options=>{
  assert.equal(options.rejectUnauthorized,true);assert.equal(options.servername,config.host);
  socket=new EventEmitter();socket.authorized=authorized;socket.destroyed=false;socket.writableLength=0;
  socket.setTimeout=()=>{};socket.getProtocol=()=> 'TLSv1.3';socket.destroy=()=>{if(!socket.destroyed){socket.destroyed=true;queueMicrotask(()=>socket.emit('close'))}};
  socket.write=line=>{const request=JSON.parse(line);requests.push(request);queueMicrotask(()=>{
   if(request.method==='mining.subscribe')frame({id:request.id,result:{protocol:'parano1d-stratum-v1',nonce_bits:64,session_namespace:namespace}});
   if(request.method==='mining.authorize'){frame({id:request.id,result:true});frame(job('first'));}
   if(request.method==='mining.submit')frame({id:request.id,result:true});
  });return true;};
  queueMicrotask(()=>socket.emit('secureConnect'));return socket;
 };
 const spawnWorker=()=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.exitCode=null;
  child.stdin.on('finish',()=>{child.exitCode=0;queueMicrotask(()=>child.emit('exit',0,null))});child.kill=()=>child.stdin.end();
  child.stdin.on('data',data=>{const request=JSON.parse(String(data));const ordinal=++work;
   if(ordinal===1&&!badDigest)frame({method:'mining.pause'});
   setImmediate(()=>{
    child.stdout.write(JSON.stringify({id:request.id,count:request.count,...accounting,candidates:[{nonce:request.nonce,cpuDigest:(badDigest?'ff':'00').repeat(32)}]})+'\n');
    if(ordinal===1&&!badDigest)frame(job('fresh'));
    if(ordinal===2&&!badDigest)frame({method:'mining.pause'});
   });
  });
  queueMicrotask(()=>child.stdout.write(JSON.stringify({event:'ready',cpuSelftest:'passed',metalSelftest:'passed',gpu:'offline-test'})+'\n'));
  return child;
 };
 return {transport,spawnWorker,requests};
}
test('bounded input validation',()=>{
 for(const changed of [{seconds:0},{seconds:601},{batch:65537},{wallet:'private-key'},{port:0},{worker:'bad worker'}])assert.throws(()=>validatedConfig({...config,...changed}));
});
test('full runner discards paused in-flight work and accepts only the fresh job',async()=>{
 const h=harness();const result=await run(config,h);
 assert.equal(result.reason,'duration-limit');assert.equal(result.accepted,1);assert.equal(result.discardedHashes,4);assert.equal(result.error,null);
 assert.equal(result.cpuHashes,1);assert.equal(result.gpuHashes,3);assert.equal(result.hashes,4);
 const shares=h.requests.filter(x=>x.method==='mining.submit');assert.equal(shares.length,1);assert.equal(shares[0].params[0],'fresh');
});

test('inconsistent CPU/GPU counters stop before submission',async()=>{
 const h=harness({accounting:{cpuHashes:4,gpuHashes:4}});const result=await run(config,h);
 assert.equal(result.reason,'worker-validation-error');assert.match(result.error,/work accounting/);assert.equal(result.submitted,0);
});
test('equal-target CPU result stops before any submit',async()=>{
 const h=harness({badDigest:true});const result=await run(config,h);
 assert.equal(result.reason,'worker-validation-error');assert.match(result.error,/CPU validation failed/);assert.equal(result.submitted,0);
});
test('unverified TLS cannot send a subscription or wallet',async()=>{
 const h=harness({authorized:false});const result=await run(config,h);
 assert.equal(result.reason,'protocol-error');assert.equal(h.requests.length,0);
});
