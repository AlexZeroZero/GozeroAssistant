'use strict';
// Blocknet HTTP SOLO adapter. A Stratum pool needs its own documented adapter.
const {createHash}=require('node:crypto');
const MAX64=(1n<<64n)-1n,MAX256=(1n<<256n)-1n;
function validateAddress(address,network='blocknet_mainnet'){
 if(typeof address!=='string'||address.length<80||address.length>100)throw Error('Invalid Blocknet address length');
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let value=0n;
 for(const c of address){const d=alphabet.indexOf(c);if(d<0)throw Error('Invalid Blocknet Base58 address');value=value*58n+BigInt(d)}
 let hex=value.toString(16);if(hex.length%2)hex='0'+hex;
 const decoded=Buffer.concat([Buffer.alloc(address.match(/^1*/)[0].length),Buffer.from(hex,'hex')]);
 if(decoded.length!==68)throw Error('A checksummed Blocknet address is required');
 const sum=createHash('sha3-256').update('blocknet_stealth_address_checksum').update(network).update(decoded.subarray(0,64)).digest();
 if(!sum.subarray(0,4).equals(decoded.subarray(64)))throw Error('Invalid Blocknet address checksum or network');
 // Ristretto public-key validity is additionally checked by the official node.
 return address;
}
function validateEndpoint(input){
 const u=new URL(input);
 if(u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Use a node origin without credentials, query or path');
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(u.hostname)))throw Error('Remote nodes require HTTPS; plain HTTP is restricted to loopback');
 return u.origin;
}
function template(data,address,now=Date.now()){
 if(!data||!/^([a-f0-9]{2}){92}$/i.test(data.header_base||'')||! /^[a-f0-9]{64}$/i.test(data.target||''))throw Error('Malformed PoW template');
 if(typeof data.template_id!=='string'||!data.template_id.length||data.template_id.length>128)throw Error('Missing compact template lease');
 if(data.reward_address_used!==address)throw Error('Node returned a different reward address');
 if(!Number.isSafeInteger(data.template_expires_at_unix_ms)||data.template_expires_at_unix_ms<=now+2000)throw Error('Template lease expired or too short');
 const header=Buffer.from(data.header_base,'hex'),difficulty=header.readBigUInt64LE(84);
 if(!difficulty||BigInt('0x'+data.target)!==MAX256/difficulty)throw Error('PoW target does not match header difficulty');
 return {id:data.template_id,header:data.header_base.toLowerCase(),target:data.target.toLowerCase(),
  expires:data.template_expires_at_unix_ms,prevHash:header.subarray(12,44).toString('hex'),
  height:header.readBigUInt64LE(4).toString(),difficulty:difficulty.toString()};
}
function submitBody(id,nonce){
 if(typeof id!=='string'||!id.length||id.length>128||typeof nonce!=='string'||!/^\d{1,20}$/.test(nonce)||BigInt(nonce)>MAX64)throw Error('Invalid compact submission');
 // Go expects a JSON uint64 number; a JS Number would corrupt high nonces.
 return '{"template_id":'+JSON.stringify(id)+',"nonce":'+BigInt(nonce).toString()+'}';
}
class NodeClient{
 constructor({endpoint,token}){this.endpoint=validateEndpoint(endpoint);if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token.trim()))throw Error('Missing/invalid local API cookie');this.token=token.trim()}
 async request(path,body){
  if(!path.startsWith('/api/'))throw Error('Invalid API path');
  const response=await fetch(this.endpoint+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+this.token,...(body===undefined?{}:{'Content-Type':'application/json'})},body});
  const reader=response.body.getReader();let bytes=0;const chunks=[];
  try{for(;;){const{done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>8*1024*1024)throw Error('Node response exceeds 8 MiB');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
  let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Error('Node returned invalid JSON')}
  if(!response.ok)throw Error('Node HTTP '+response.status+': '+String(data.error||'request failed').slice(0,160));
  return data;
 }
 async getTemplate(address){return template(await this.request('/api/mining/blocktemplate?address='+encodeURIComponent(address)),address)}
 async submit(id,nonce){return this.request('/api/mining/submitblock',submitBody(id,nonce))}
}
module.exports={validateAddress,validateEndpoint,template,submitBody,NodeClient};
