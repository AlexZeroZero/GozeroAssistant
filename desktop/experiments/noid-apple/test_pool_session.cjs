'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Session,LineDecoder,nonce,reconnectDelay,LIMIT}=require('./pool_session.cjs');
const prefix='0123456789abcdef';
const job=(overrides={})=>({method:'mining.notify',params:[{job_id:'offline-job',work_domain_id:'ab'.repeat(32),pow_fields_hex:'00'.repeat(256),
  nonce_field_index:10,nonce_bits:64,nonce_prefix_hex:prefix,share_target_hex:'ff'.repeat(32),block_target_hex:'01'.repeat(32),clean:true,expires_in_seconds:30,...overrides}]});
function setup(pool='innovlab',authorize=true) {
  let time=0; const session=new Session({pool,username:'offline-test.invalid',now:()=>time});
  const subscribe=session.connect({tlsVerified:true});
  const [auth]=session.receive({id:subscribe.id,result:{protocol:'parano1d-stratum-v1',nonce_bits:64,session_namespace:prefix}});
  if(authorize) session.receive({id:auth.id,result:true});
  return {session,auth,setTime:t=>{time=t}};
}
const found=(start=0n,count=1,capacity=count)=>({nonces:Array.from({length:count},(_,i)=>nonce(start+BigInt(i),prefix)),totalMatches:count,capacity});
const hash=()=>Buffer.alloc(32);

test('subscribe, early notify, authorization gate and exact submit tuple',()=>{
  const {session,auth}=setup('innovlab',false);
  session.receive(job()); assert.equal(session.allocate(1),null);
  session.receive({id:auth.id,result:true}); const ticket=session.allocate(1);
  const {requests}=session.complete(ticket,found(),hash);
  assert.deepEqual(requests[0].params,['offline-job','00000000000000000123456789abcdef','ab'.repeat(32)]);
  assert.equal(session.accepted,0); session.receive({id:requests[0].id,result:true}); assert.equal(session.accepted,1);
  assert.equal(session.complete(ticket,found(),hash).discarded,true);
});
test('pause aborts queued work; auth and optional resume never revive it',()=>{
  const {session}=setup(); session.receive(job()); const ticket=session.allocate(1);
  session.receive({method:'mining.pause',params:[{reason:'canonical-tip-unverified'}]});
  assert.equal(ticket.signal.aborted,true); assert.equal(session.connected,true); assert.equal(session.allocate(1),null);
  assert.equal(session.complete(ticket,found(),()=>{throw Error('must not hash')}).discarded,true);
  session.receive({method:'mining.resume',params:[]}); assert.equal(session.allocate(1),null);
  session.receive(job({job_id:'fresh'})); assert.equal(session.allocate(1).job.id,'fresh');
});
test('pause before authorization does not leave a pending job to resume',()=>{
  const {session,auth}=setup('innovlab',false); session.receive(job()); session.receive({method:'mining.pause'});
  session.receive({id:auth.id,result:true}); assert.equal(session.allocate(1),null);
});
test('every notify cancels old results including clean=false and difficulty changes',()=>{
  const {session}=setup(); session.receive(job()); const old=session.allocate(1);
  session.receive(job({job_id:'difficulty-2',clean:false,share_target_hex:'01'.repeat(32)}));
  assert.equal(old.signal.aborted,true); assert.equal(session.complete(old,found(),hash).discarded,true);
  assert.equal(session.allocate(1).job.id,'difficulty-2');
});
test('expiry after GPU launch and during CPU verification prevents submission',()=>{
  const {session,setTime}=setup(); session.receive(job()); const old=session.allocate(1);
  setTime(30000); assert.equal(session.complete(old,found(),hash).discarded,true);
  session.receive(job({job_id:'fresh-after-expiry'})); const fresh=session.allocate(1);
  assert.equal(session.complete(fresh,found(),()=>{setTime(60000);return hash()}).discarded,true);
});
test('disconnect invalidates results; reconnect changes namespace and ignores old replies',()=>{
  const {session}=setup(); session.receive(job()); const old=session.allocate(1); session.disconnect();
  assert.equal(old.signal.aborted,true); const subscribe=session.connect({tlsVerified:true});
  session.receive({id:2,result:true}); assert.equal(session.authorized,false);
  session.receive({id:subscribe.id,result:{protocol:'parano1d-stratum-v1',nonce_bits:64,session_namespace:'10'.repeat(8)}});
  assert.equal(session.namespace,'10'.repeat(8)); assert.equal(session.complete(old,found(),hash).discarded,true);
});
test('nonce reservations do not overlap, wrap, or modify namespace',()=>{
  const {session}=setup(); session.receive(job());
  assert.equal(session.allocate(5).start,0n); assert.equal(session.allocate(7).start,5n);
  session.counter=(1n<<64n)-1n; assert.throws(()=>session.allocate(2),/exhausted/);
  assert.equal(session.allocate(1).start,(1n<<64n)-1n); assert.throws(()=>session.allocate(1),/exhausted/);
  assert.equal(nonce(1n<<32n,prefix).toString('hex'),'00000000010000000123456789abcdef');
  assert.throws(()=>nonce(1n<<64n,prefix),/overflow/);
});
test('overflow retries the reserved range and final candidates require CPU validation',()=>{
  const {session}=setup(); session.receive(job()); const ticket=session.allocate(4);
  const overflow=session.complete(ticket,{nonces:[],totalMatches:4,capacity:2},hash);
  assert.deepEqual(overflow.retry.map(t=>[t.start,t.count]),[[0n,2],[2n,2]]); assert.equal(session.counter,4n);
  const requests=overflow.retry.flatMap(t=>session.complete(t,found(t.start,t.count),hash).requests);
  assert.equal(new Set(requests.map(r=>r.params[1])).size,4);
  const bad=session.allocate(1); assert.throws(()=>session.complete(bad,found(4n),()=>Buffer.alloc(32,255)),/CPU validation/);
});
test('wrong namespace, outside range, duplicate, missing and equal-target candidates fail closed',()=>{
  for(const mutate of [r=>r.nonces[0].fill(0,8),r=>r.nonces[0].writeBigUInt64LE(100n),r=>r.nonces[1]=r.nonces[0],r=>r.nonces.pop()]) {
    const {session}=setup(); session.receive(job()); const ticket=session.allocate(2), result=found(0n,2); mutate(result);
    assert.throws(()=>session.complete(ticket,result,hash)); assert.equal(session.pending.size,0);
  }
  const {session}=setup(); session.receive(job({share_target_hex:'00'.repeat(32)}));
  assert.throws(()=>session.complete(session.allocate(1),found(),hash),/CPU validation/);
});
test('reject malformed jobs and handshake; cancel existing work on parser failures',()=>{
  for(const override of [{nonce_bits:128},{nonce_prefix_hex:'00'.repeat(8)},{pow_fields_hex:'ff'.repeat(256)},
    {share_target_hex:'abc'},{expires_in_seconds:0},{expires_in_seconds:NaN},{clean:1},{work_domain_id:'xx'.repeat(32)}]) {
    const {session}=setup(); session.receive(job()); const ticket=session.allocate(1);
    assert.throws(()=>session.receive(job(override))); assert.equal(ticket.signal.aborted,true); assert.equal(session.connected,false);
  }
  const {session}=setup(); session.receive(job()); const ticket=session.allocate(1);
  assert.throws(()=>session.ingest(Buffer.from('not JSON\n'))); assert.equal(ticket.signal.aborted,true);
  const pending=setup('innovlab',false); assert.throws(()=>pending.session.receive({id:pending.auth.id,result:false}));
});
test('framing handles fragmentation, multiple frames, UTF8 and a 4 MiB byte limit',()=>{
  const decoder=new LineDecoder(), messages=[];
  const data=Buffer.from('{"reason":"暂停"}\n{"id":2}\r\n');
  for(const byte of data) decoder.feed(Buffer.from([byte]),m=>messages.push(m));
  assert.deepEqual(messages,[{reason:'暂停'},{id:2}]);
  const exact=Buffer.from('"'+'x'.repeat(LIMIT-2)+'"\n');
  assert.throws(()=>new LineDecoder().feed(exact,()=>{}),/object/); // Length passes; scalar shape fails.
  assert.throws(()=>new LineDecoder().feed(Buffer.alloc(LIMIT+1,32),()=>{}),/4 MiB/);
  assert.throws(()=>new LineDecoder().feed(Buffer.from([0xff,10]),()=>{}));
  assert.throws(()=>new LineDecoder().feed(Buffer.from('[]\n'),()=>{}),/object/);
});
test('pool timeout policies differ; TLS and bounded backoff are explicit',()=>{
  const unauth=setup('innovlab',false); unauth.setTime(60000); assert.equal(unauth.session.tick(),'reconnect');
  const idle=setup(); idle.setTime(600000); assert.equal(idle.session.tick(),'reconnect');
  const suprnova=setup('suprnova'); suprnova.setTime(600000); assert.equal(suprnova.session.tick(),undefined);
  const secure=new Session({pool:'innovlab',username:'offline'}); assert.throws(()=>secure.connect(),/TLS/);
  for(let i=0;i<100;i++) {const delay=reconnectDelay(i,()=>0.5); assert.ok(delay>=800 && delay<=30000);}
});
test('pause between CPU validation and transport write suppresses queued submits',()=>{
  const {session}=setup(); session.receive(job());
  const [request]=session.complete(session.allocate(1),found(),hash).requests;
  assert.equal(session.canSend(request),true);
  session.receive({method:'mining.pause'}); assert.equal(session.canSend(request),false);
});
test('opaque work domain is echoed verbatim; changed work under an ID fails closed',()=>{
  const {session}=setup(); session.receive(job({work_domain_id:'AB'.repeat(32)}));
  const [request]=session.complete(session.allocate(1),found(),hash).requests;
  assert.equal(request.params[2],'AB'.repeat(32));
  assert.throws(()=>session.receive(job({share_target_hex:'00'.repeat(32)})),/job ID reused/); assert.equal(session.connected,false);
});
test('duplicate notify and pause/resume replay preserve all reserved nonce counters',()=>{
  const {session}=setup();session.receive(job());const first=session.allocate(9);
  session.receive(job());assert.equal(first.signal.aborted,true);assert.equal(session.allocate(7).start,9n);
  session.receive({method:'mining.pause'});session.receive(job());assert.equal(session.allocate(1).start,16n);
  session.receive(job({job_id:'another'}));session.allocate(3);
  session.receive(job());assert.equal(session.allocate(1).start,17n);
});
