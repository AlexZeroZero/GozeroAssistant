const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {sha3_256}=require('../src/sha3-256.cjs');
test('portable SHA3-256 matches FIPS vectors and OpenSSL across padding boundaries',()=>{
 assert.equal(sha3_256(Buffer.alloc(0)).toString('hex'),'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');
 assert.equal(sha3_256(Buffer.from('abc')).toString('hex'),'3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532');
 for(const n of [1,8,32,64,110,134,135,136,137,271,272,273,1024,4096]){const b=Buffer.from(Array.from({length:n},(_,i)=>(i*137+n)%256));assert.deepEqual(sha3_256(b),crypto.createHash('sha3-256').update(b).digest(),'length '+n)}
});
test('BNT address checksum does not require runtime crypto SHA3 and rejects tampering',()=>{
 const original=crypto.createHash;crypto.createHash=()=>{throw Error('Digest method not supported')};
 try{const {address}=require('../src/bnt.cjs'),a='ZmEVR2sWmBxWbhSkVYZxGoiUPD2L89xA831BCUrt2KjVrTKLSsBLvxBEWDGn7CqiSd5EEbXc89h5treCtMhBqP8yr6Wnb';assert.equal(address(a),a);assert.throws(()=>address(a.slice(0,-1)+'c'),/校验失败/)}finally{crypto.createHash=original}
});
