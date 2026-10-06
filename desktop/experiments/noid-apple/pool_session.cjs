// SPDX-License-Identifier: Apache-2.0
// Offline-tested protocol state model. No sockets, credentials, or auto-start.
// Future transport must use verified TLS, call tick() on a timer, propagate
// ticket.signal to workers, and disconnect() on every transport/framing error.
// Call canSend(request) immediately before socket.write, with no await between.
'use strict';
const {TextDecoder} = require('node:util');
const LIMIT = 4 * 1024 * 1024;
const SPACE = 1n << 64n;
const POLICIES = Object.freeze({
  innovlab: Object.freeze({handshakeMs:60000, idleMs:600000, tlsRequired:true}),
  suprnova: Object.freeze({handshakeMs:60000, idleMs:null, tlsRequired:false}),
});
function check(ok, message) { if (!ok) throw Error(message); }
function hex(value, size) {
  check(typeof value === 'string' && new RegExp(`^[0-9a-fA-F]{${size * 2}}$`).test(value), 'invalid hex length/content');
  return value.toLowerCase();
}
function le(value) { return BigInt('0x' + Buffer.from(value).reverse().toString('hex')); }
function nonce(counter, namespace) {
  check(typeof counter === 'bigint' && counter >= 0 && counter < SPACE, 'nonce counter overflow');
  const bytes = Buffer.alloc(16); bytes.writeBigUInt64LE(counter); Buffer.from(namespace,'hex').copy(bytes,8); return bytes;
}
function reconnectDelay(attempt, random=Math.random) {
  check(Number.isInteger(attempt) && attempt >= 0, 'invalid reconnect attempt');
  const sample = random(); check(sample >= 0 && sample < 1, 'invalid jitter');
  return Math.floor(Math.min(30000, 1000 * 2 ** Math.min(attempt,5)) * (0.8 + 0.2 * sample));
}

class LineDecoder {
  constructor() { this.parts=[]; this.length=0; this.decoder=new TextDecoder('utf-8',{fatal:true}); }
  feed(chunk, receive) {
    check(Buffer.isBuffer(chunk), 'transport must provide bytes');
    let start=0;
    while(start < chunk.length) {
      const newline=chunk.indexOf(10,start), end=newline<0?chunk.length:newline;
      this.length += end-start; check(this.length<=LIMIT,'pool line exceeds 4 MiB');
      if(end>start) this.parts.push(chunk.subarray(start,end));
      if(newline<0) return;
      const bytes=Buffer.concat(this.parts,this.length); this.parts=[]; this.length=0;
      const line=this.decoder.decode(bytes).trim();
      if(line) {
        const message=JSON.parse(line);
        check(message && typeof message==='object' && !Array.isArray(message),'pool frame must be an object');
        receive(message);
      }
      start=newline+1;
    }
  }
}

class Session {
  constructor({pool, username, now=()=>performance.now()}={}) {
    check(Object.hasOwn(POLICIES,pool),'unknown pool policy');
    check(typeof username==='string' && username.length>0 && username.length<=256,'username required');
    this.policy=POLICIES[pool]; this.username=username; this.now=now; this.serial=0;
    this.authorized=false; this.connected=false; this.namespace=null; this.job=null;
    this.pending=new Map(); this.inflight=new Set(); this.abort=new AbortController();
    this.accepted=0; this.rejected=0; this.generation=0; this.decoder=new LineDecoder();
  }
  request(method,params) {
    check(this.pending.size<1024,'too many pending requests');
    const id=++this.serial, request=Object.freeze({id,method,params:Object.freeze(params)});
    this.pending.set(id,{method,request,generation:this.generation}); return request;
  }
  canSend(request) {
    this.tick(); const pending=this.pending.get(request.id);
    if(!this.connected || pending?.request!==request) return false;
    if(pending.method==='mining.submit' && (!this.authorized || !this.job || pending.generation!==this.generation)) {
      this.pending.delete(request.id); return false;
    }
    return true;
  }
  invalidate() { this.abort.abort(); this.abort=new AbortController(); this.generation++; this.inflight.clear(); this.job=null; }
  disconnect() {
    this.invalidate(); this.connected=false; this.authorized=false; this.namespace=null;
    this.pending.clear(); this.decoder=new LineDecoder(); this.seenJobs=new Set();
  }
  connect({tlsVerified=false}={}) {
    this.disconnect(); check(!this.policy.tlsRequired || tlsVerified,'Innovlab requires verified TLS');
    this.connected=true; this.started=this.now(); this.lastActivity=this.started;
    return this.request('mining.subscribe',['Gozero-Apple-experimental/0.1']);
  }
  tick() {
    if(!this.connected) return;
    const time=this.now();
    if((!this.authorized && time-this.started>=this.policy.handshakeMs) ||
       (this.policy.idleMs && time-this.lastActivity>=this.policy.idleMs)) {
      this.disconnect(); return 'reconnect';
    }
    if(this.job && time>=this.job.deadline) {this.invalidate(); return 'expired';}
  }
  ingest(chunk) {
    const outgoing=[];
    try { this.decoder.feed(chunk,m=>outgoing.push(...this.receive(m))); }
    catch(error) {this.disconnect(); throw error;}
    return outgoing;
  }
  receive(message) {
    try { return this.handle(message); }
    catch(error) {this.disconnect(); throw error;}
  }
  handle(message) {
    this.tick(); check(this.connected,'disconnected session'); this.lastActivity=this.now();
    if(message.method==='mining.pause') {this.invalidate(); return [];}
    if(message.method==='mining.notify') {
      this.invalidate();
      check(this.namespace!==null,'notify before subscribe response');
      check(Array.isArray(message.params) && message.params.length===1,'expected one job object');
      const j=message.params[0]; check(j && typeof j==='object','invalid job');
      check(j.nonce_field_index===10 && j.nonce_bits===64 && typeof j.clean==='boolean','unsupported nonce layout/clean');
      check(typeof j.job_id==='string' && j.job_id.length>0 && j.job_id.length<=256,'invalid job ID');
      // Reusing a job ID would reset its counters and produce duplicate work.
      // A new connection has a fresh namespace, so reconnect safely if reused.
      check(!this.seenJobs.has(j.job_id) && this.seenJobs.size<65536,'job ID reused or session job limit reached');
      check(Number.isSafeInteger(j.expires_in_seconds) && j.expires_in_seconds>0 && j.expires_in_seconds<=86400,'invalid expiry');
      const prefix=hex(j.nonce_prefix_hex,8); check(prefix===this.namespace,'session namespace changed');
      const fields=hex(j.pow_fields_hex,256); check(fields.slice(320,352)==='0'.repeat(32),'nonce field must be zero');
      hex(j.work_domain_id,32); this.seenJobs.add(j.job_id);
      this.job=Object.freeze({id:j.job_id,domain:j.work_domain_id,fields,prefix,
        target:hex(j.share_target_hex,32),blockTarget:hex(j.block_target_hex,32),deadline:this.now()+j.expires_in_seconds*1000});
      this.counter=0n; return [];
    }
    if(message.method) return []; // Optional notifications do not restart work.
    const method=this.pending.get(message.id)?.method; if(!method) return [];
    this.pending.delete(message.id);
    if(method==='mining.subscribe') {
      const r=message.result;
      check(!message.error && r?.protocol==='parano1d-stratum-v1' && r.nonce_bits===64,'subscribe rejected');
      this.namespace=hex(r.session_namespace,8);
      return [this.request('mining.authorize',[this.username,'x'])];
    }
    if(method==='mining.authorize') {
      check(!message.error && message.result===true,'authorization rejected'); this.authorized=true;
    }
    if(method==='mining.submit') {
      if(!message.error && message.result===true) this.accepted++; else this.rejected++;
    }
    return [];
  }
  ticket(start,count) {
    const ticket=Object.freeze({job:this.job,generation:this.generation,start,count,signal:this.abort.signal});
    this.inflight.add(ticket); return ticket;
  }
  allocate(count) {
    this.tick();
    if(!this.connected || !this.authorized || !this.job) return null;
    check(Number.isInteger(count) && count>0 && count<=1048576,'invalid batch count');
    check(this.inflight.size<64,'too many in-flight batches');
    check(this.counter+BigInt(count)<=SPACE,'nonce space exhausted');
    const ticket=this.ticket(this.counter,count); this.counter+=BigInt(count); return ticket;
  }
  complete(ticket,{nonces,totalMatches,capacity},hashNonce) {
    try { return this.finish(ticket,{nonces,totalMatches,capacity},hashNonce); }
    catch(error) {this.disconnect(); throw error;}
  }
  finish(ticket,{nonces,totalMatches,capacity},hashNonce) {
    this.tick();
    if(!this.inflight.has(ticket) || ticket.signal.aborted || ticket.generation!==this.generation || !this.authorized)
      return {discarded:true,requests:[],retry:[]};
    this.inflight.delete(ticket);
    check(Number.isInteger(totalMatches) && totalMatches>=0 && totalMatches<=ticket.count,'invalid match count');
    check(Number.isInteger(capacity) && capacity>0 && capacity<=1048576,'invalid candidate capacity');
    if(totalMatches>capacity) {
      // The same reserved range is retried; never allocate fresh counters here.
      const half=Math.floor(ticket.count/2);
      return {requests:[],retry:[this.ticket(ticket.start,half),this.ticket(ticket.start+BigInt(half),ticket.count-half)]};
    }
    check(Array.isArray(nonces) && nonces.length===totalMatches,'missing candidates');
    const seen=new Set(), validated=[];
    for(const candidate of nonces) {
      check(Buffer.isBuffer(candidate) && candidate.length===16,'invalid candidate nonce');
      const value=candidate.toString('hex'), counter=candidate.readBigUInt64LE();
      check(value.slice(16)===ticket.job.prefix && counter>=ticket.start && counter-ticket.start<BigInt(ticket.count),'candidate outside assignment');
      check(!seen.has(value),'duplicate candidate'); seen.add(value);
      const digest=hashNonce(Buffer.from(ticket.job.fields,'hex'),Buffer.from(candidate));
      check(Buffer.isBuffer(digest) && digest.length===32 && le(digest)<le(Buffer.from(ticket.job.target,'hex')),'CPU validation failed');
      validated.push(value);
    }
    this.tick();
    if(ticket.signal.aborted || ticket.generation!==this.generation) return {discarded:true,requests:[],retry:[]};
    check(this.pending.size+validated.length<=1024,'too many pending shares');
    return {requests:validated.map(value=>this.request('mining.submit',[ticket.job.id,value,ticket.job.domain])),retry:[]};
  }
}
module.exports={Session,LineDecoder,nonce,reconnectDelay,POLICIES,LIMIT};
