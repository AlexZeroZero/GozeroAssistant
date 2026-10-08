const test=require('node:test'),assert=require('node:assert/strict'),net=require('node:net');
const {parse,job,submission,Pool}=require('../src/bnt-pool.cjs');
const {address,threads,threadLimit}=require('../src/bnt.cjs');
const ADDRESS='ZmEVR2sWmBxWbhSkVYZxGoiUPD2L89xA831BCUrt2KjVrTKLSsBLvxBEWDGn7CqiSd5EEbXc89h5treCtMhBqP8yr6Wnb';
test('BNT checksummed mainnet address, memory bound, and config migration',()=>{
 assert.equal(address(ADDRESS),ADDRESS);assert.throws(()=>address(ADDRESS.slice(0,-1)+'c'));
 const hw={cpu:[{NumberOfLogicalProcessors:128}],metrics:{totalMemory:16*1024**3,freeMemory:12*1024**3}};
 assert.equal(threadLimit(hw),3);assert.equal(threads({cpuThreads:0,performance:75},hw),2);assert.throws(()=>threads({cpuThreads:128},hw));
 const {validate,DEFAULT}=require('../src/config.cjs');const c=validate({...DEFAULT,coin:'BNT',wallets:{BNT:ADDRESS}});assert.equal(c.pools.BNT,'stratum+tcp://bnt.pool.gozero.trade:14444');assert.throws(()=>validate({...c,wallets:{BNT:'bad'}}));
});
test('uint64 nonce survives JSON and submission without rounding',()=>{
 const m=parse('{"nonce_start":18446744073709551614,"nonce_end":18446744073709551615}');assert.equal(m.nonce_start,18446744073709551614n);
 const j=job({...m,job_id:'j',header_base:'00'.repeat(92),target:'ff'.repeat(32),height:1});assert.equal(j.end,2n**64n-1n);
 assert.match(submission(2,j.id,j.end,'01'.repeat(32)),/"nonce":18446744073709551615,/);assert.throws(()=>submission(2,'j',2n**64n,'01'.repeat(32)));
});
test('pool login, fragmented work, accepted share and explicit shutdown',async()=>{
 const sockets=new Set(),server=net.createServer(s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));let buf='';s.on('data',chunk=>{buf+=chunk;let n;while((n=buf.indexOf('\n'))>=0){const m=JSON.parse(buf.slice(0,n));buf=buf.slice(n+1);if(m.method==='login'){assert.equal(m.params.address,ADDRESS);s.write('{"id":1,"status":"ok","result":{"required_capabilities":["submit_claimed_hash"]}}\n');const row=JSON.stringify({method:'job',params:{job_id:'test',header_base:'00'.repeat(92),target:'ff'.repeat(32),height:1,nonce_start:1,nonce_end:8}})+'\n';s.write(row.slice(0,40));s.write(row.slice(40))}else if(m.method==='submit'){assert.equal(m.params.nonce,1);s.write(JSON.stringify({id:m.id,status:'ok',result:{accepted:true}})+'\n')}}})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const p=new Pool(['stratum+tcp://127.0.0.1:'+server.address().port],ADDRESS,'test');p.on('log',()=>{});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),3000);p.on('job',j=>assert.equal(p.submit(j,1n,'01'.repeat(32)),true));p.on('share',ok=>{assert.equal(ok,true);clearTimeout(timer);resolve()});p.connect()})}finally{p.stop();for(const s of sockets)s.destroy();await new Promise(r=>server.close(r))}
});
