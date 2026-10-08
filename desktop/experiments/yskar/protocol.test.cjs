'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const p=require('../../src/ysr-protocol.cjs');
const upstream=()=>import('./upstream/miner/src/header.mjs');
test('Pinned upstream sources retain their recorded SHA256',()=>{
  const meta=require('./provenance.json');
  for(const [name,hash] of Object.entries(meta.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'upstream',name))).digest('hex'),hash);
});
test('Genesis hash, serialization and official WASM match Node crypto',async()=>{
  const u=await upstream();
  const wasm=fs.readFileSync(path.join(__dirname,'upstream/miner/miner.57f237a2a4.wasm'));
  const {instance}=await WebAssembly.instantiate(wasm,{}),e=instance.exports;
  const mem=new Uint8Array(e.memory.buffer);
  u.selfTest(mem,e.init_job,e.mine);
  assert.equal(p.hash(p.serializeHeader(u.GENESIS,u.GENESIS.nonce)).toString('hex'),u.GENESIS.hash);
  // Vary all header fields and nonce high/low halves, including carry boundaries.
  let seed=20261007;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed};
  for(let i=0;i<32;i++){
    const nonce=i===0?(1n<<64n)-1n:(BigInt(next())<<32n)|BigInt(next());
    const j={...u.GENESIS,height:i%2?6000:1,version:next(),timestamp:String(next()),difficulty:next(),txCount:next(),extranonce:String((BigInt(next())<<32n)|BigInt(next())),prevHash:Buffer.alloc(32,next()&255).toString('hex')};
    const header=p.serializeHeader(j,nonce);
    assert.deepEqual(header,Buffer.from(u.serializeHeader(j,nonce)));
    mem.set(header,u.MEM.HEADER);mem.fill(255,u.MEM.TARGET,u.MEM.TARGET+32);e.init_job();
    assert.equal(e.mine(Number(nonce&0xffffffffn)|0,1),1);
    assert.deepEqual(Buffer.from(mem.slice(u.MEM.HASH,u.MEM.HASH+32)),p.hash(header));
  }
});
test('Target is big endian and equality is accepted',()=>{
  const zero=Buffer.alloc(32),one=Buffer.alloc(32);one[31]=1;
  const high=Buffer.alloc(32);high[0]=1;
  assert(p.meetsTarget(one,one));assert(p.meetsTarget(zero,one));assert(!p.meetsTarget(high,one));
  assert.equal(p.targetBytes(4096).toString('hex'),'0000001000000000000000000000000000000000000000000000000000000000');
  assert.throws(()=>p.targetBytes(0));assert.throws(()=>p.meetsTarget(Buffer.alloc(31),one));
});
test('YSR bech32m address checksum and prefix',()=>{
  const good='ysr1at4jxzcln84ys38s0spw23l0wn7pquz5w6eyf4';
  assert(p.validAddress(good));assert(!p.validAddress(good.slice(0,-1)+'q'));assert(!p.validAddress('o1'+good.slice(4)));assert(!p.validAddress(good.toUpperCase()));
});
test('Reject malformed job, unsafe integers, inactive session, credentialed URLs',async()=>{
  const u=await upstream(),j={...u.GENESIS,jobId:'job',target:'ff'.repeat(32)};
  const s=p.normalizeSession({sessionId:'session',extranonce:'18446744073709551615'});
  assert.equal(p.normalizeJob(j,s).extranonce,s.extranonce);
  assert.throws(()=>p.serializeHeader({...j,extranonce:undefined}));
  assert.throws(()=>p.serializeHeader(j,1n<<64n));
  assert.throws(()=>p.serializeHeader({...j,timestamp:Number.MAX_SAFE_INTEGER+1}));
  assert.throws(()=>p.serializeHeader({...j,prevHash:'zz'.repeat(32)}));
  assert.throws(()=>p.normalizeSession({error:'pool_full'}));
  assert.throws(()=>p.normalizeJob({...j,target:'00'.repeat(32)},s));
  assert.equal(p.validateApi(p.PUBLIC_API),p.PUBLIC_API);
  assert.equal(p.validateApi('http://127.0.0.1:8645'),'http://127.0.0.1:8645');
  for(const url of ['https://user:secret@example.com','http://example.com','https://example.com/other','https://example.com/?a=1'])assert.throws(()=>p.validateApi(url));
});
test('Consensus v4 preserves raw field despite a different display difficulty',async()=>{
  const u=await upstream(),j={...u.GENESIS,height:6000,difficulty:0x84000000,difficultyWert:'2147483648'};
  assert.equal(p.serializeHeader(j).readUInt32LE(112),0x84000000);
});
