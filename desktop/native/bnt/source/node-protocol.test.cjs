'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateAddress,validateEndpoint,template,submitBody,NodeClient}=require('./node-protocol.cjs');
const header=Buffer.alloc(92);header.writeBigUInt64LE(17n,4);header.writeBigUInt64LE(3n,84);
const fixture=()=>({header_base:header.toString('hex'),target:(((1n<<256n)-1n)/3n).toString(16).padStart(64,'0'),template_id:'test',reward_address_used:'recipient',template_expires_at_unix_ms:Date.now()+60000});
test('network-bound address checksum rejects typos and other networks',()=>{
 const {createHash}=require('node:crypto'),payload=Buffer.from(Array.from({length:64},(_,i)=>i+1));
 const sum=createHash('sha3-256').update('blocknet_stealth_address_checksumblocknet_mainnet').update(payload).digest().subarray(0,4);
 let n=BigInt('0x'+Buffer.concat([payload,sum]).toString('hex')),address='',alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
 while(n){address=alphabet[Number(n%58n)]+address;n/=58n}
 assert.equal(validateAddress(address),address);
 assert.throws(()=>validateAddress(address,'blocknet_testnet'),/checksum/);
 assert.throws(()=>validateAddress(address.slice(0,-1)+(address.endsWith('1')?'2':'1')),/checksum/);
});
test('reject incorrect target, reward or expired job',()=>{
 assert.equal(template(fixture(),'recipient').height,'17');
 assert.throws(()=>template({...fixture(),target:'f'.repeat(64)},'recipient'),/target/);
 assert.throws(()=>template(fixture(),'someone-else'),/reward/);
 assert.throws(()=>template({...fixture(),template_expires_at_unix_ms:1},'recipient'),/expired/);
 assert.throws(()=>template({...fixture(),header_base:'00'},'recipient'),/Malformed/);
});
test('uint64 submission keeps all bits, equality target is valid',()=>{
 assert.equal(submitBody('a"b','18446744073709551615'),'{"template_id":"a\\"b","nonce":18446744073709551615}');
 for(const value of ['18446744073709551616','-1','1.2','1e5','1,"x":1'])assert.throws(()=>submitBody('id',value));
});
test('API tokens stay on authenticated HTTPS or loopback without redirects',()=>{
 assert.equal(validateEndpoint('http://127.0.0.1:8332'),'http://127.0.0.1:8332');
 for(const url of ['http://remote.example','https://user:secret@example.com','https://example.com/path','https://example.com/?token=secret'])assert.throws(()=>validateEndpoint(url));
});
test('HTTP template and precise submit wire format',async()=>{
 const http=require('node:http');let submitted;
 const server=http.createServer(async(req,res)=>{
  assert.equal(req.headers.authorization,'Bearer test-cookie');res.setHeader('content-type','application/json');
  if(req.url.startsWith('/api/mining/blocktemplate?'))res.end(JSON.stringify(fixture()));
  else{const pieces=[];for await(const b of req)pieces.push(b);submitted=Buffer.concat(pieces).toString();res.end('{"accepted":true}')}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const c=new NodeClient({endpoint:'http://127.0.0.1:'+server.address().port,token:'test-cookie'});const t=await c.getTemplate('recipient');assert.equal(t.id,'test');assert.equal((await c.submit(t.id,'18446744073709551615')).accepted,true);assert.ok(submitted.includes('18446744073709551615'))}
 finally{await new Promise(resolve=>server.close(resolve))}
});
