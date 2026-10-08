'use strict';
// Gozero YSKAR integration prototype. Header rules: pinned upstream in provenance.json.
const {createHash}=require('node:crypto');
const PUBLIC_API='https://ysr.pool.gozero.trade:8443';
const LEGACY_API='https://yskar-main.dynv6.net';
const LIMIT64=(1n<<64n)-1n;
function integer(value,max,label){
  if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))throw Error(label+' must be an exact unsigned integer');
  if(!['number','string','bigint'].includes(typeof value)||!/^(0|[1-9][0-9]*)$/.test(String(value)))throw Error(label+' must be an unsigned integer');
  const n=BigInt(value);if(n>max)throw Error(label+' is out of range');return n;
}
function hex(value,bytes,label){if(typeof value!=='string'||!new RegExp('^[a-f0-9]{'+bytes*2+'}$','i').test(value))throw Error(label+' has invalid hex');return Buffer.from(value,'hex')}
function serializeHeader(job,nonce=0n){
  const b=Buffer.alloc(136);
  b.writeUInt32LE(Number(integer(job.version??1,0xffffffffn,'version')),0);
  b.writeUInt32LE(Number(integer(job.height,0xffffffffn,'height')),4);
  for(const [key,offset] of [['prevHash',8],['merkleRoot',40],['stateRoot',72]])hex(job[key],32,key).copy(b,offset);
  b.writeBigUInt64LE(integer(job.timestamp,LIMIT64,'timestamp'),104);
  // Consensus v4: difficulty is the raw u32 FIELD, not difficultyWert.
  b.writeUInt32LE(Number(integer(job.difficulty,0xffffffffn,'difficulty field')),112);
  b.writeUInt32LE(Number(integer(job.txCount,0xffffffffn,'transaction count')),116);
  b.writeBigUInt64LE(integer(job.extranonce,LIMIT64,'session extranonce'),120);
  b.writeBigUInt64LE(integer(nonce,LIMIT64,'nonce'),128);
  return b;
}
function hash(header){if(!Buffer.isBuffer(header)||header.length!==136)throw Error('YSKAR header must be 136 bytes');return createHash('sha256').update(createHash('sha256').update(header).digest()).digest()}
function meetsTarget(digest,target){
  if(!Buffer.isBuffer(digest)||digest.length!==32||!Buffer.isBuffer(target)||target.length!==32)throw Error('Expected 32-byte hash and target');
  // YSKAR compares big-endian, inclusive. NOID uses different rules.
  return Buffer.compare(digest,target)<=0;
}
function targetBytes(difficulty){const n=integer(difficulty,1n<<240n,'difficulty');if(!n)throw Error('Difficulty must be positive');return Buffer.from(((1n<<240n)/n).toString(16).padStart(64,'0'),'hex')}
function validAddress(address){
  if(typeof address!=='string'||!/^ysr1[023456789acdefghjklmnpqrstuvwxyz]{38}$/.test(address))return false;
  const alphabet='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const words=[...address.slice(4)].map(x=>alphabet.indexOf(x));
  if(words.some(x=>x<0))return false;
  const hrp=[...address.slice(0,3)].map(x=>x.charCodeAt(0));
  let chk=1;const generators=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
  for(const v of [...hrp.map(x=>x>>5),0,...hrp.map(x=>x&31),...words]){const top=chk>>>25;chk=((chk&0x1ffffff)<<5)^v;for(let i=0;i<5;i++)if((top>>>i)&1)chk^=generators[i]}
  return (chk>>>0)===0x2bc830a3;
}
function validateApi(value){
  const u=new URL(value);
  const loopback=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  if(!(u.protocol==='https:'||(u.protocol==='http:'&&loopback))||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Use an HTTPS node origin or a local HTTP node');
  return u.origin;
}
function normalizeSession(s){
  if(!s||s.error||typeof s.sessionId!=='string'||!s.sessionId||s.sessionId.length>160)throw Error('YSKAR session was not accepted: '+String(s?.error||'invalid response'));
  integer(s.extranonce,LIMIT64,'session extranonce');
  return Object.freeze({...s,extranonce:String(s.extranonce)});
}
function normalizeJob(raw,session){
  if(!raw||raw.error||typeof raw.jobId!=='string'||!raw.jobId||raw.jobId.length>160)throw Error('YSKAR did not return a valid job');
  const job={...raw,extranonce:session.extranonce};
  serializeHeader(job);hex(job.target,32,'share target');
  if(!BigInt('0x'+job.target))throw Error('Invalid zero share target');
  return Object.freeze(job);
}
function verifyShare(job,nonce){return meetsTarget(hash(serializeHeader(job,nonce)),hex(job.target,32,'share target'))}
module.exports={PUBLIC_API,LEGACY_API,serializeHeader,hash,meetsTarget,targetBytes,validAddress,validateApi,normalizeSession,normalizeJob,verifyShare};
