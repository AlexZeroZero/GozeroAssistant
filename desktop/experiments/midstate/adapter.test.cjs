const test=require('node:test'),assert=require('node:assert/strict'),a=require('./assistant-adapter.cjs');
test('MDS preserves nonce units and rejects invalid telemetry',()=>{
 const v={type:'telemetry',hash:2409.5,unit:'N/s',accepted:2,rejected:0};
 assert.deepEqual(a.parseTelemetry('MDS '+JSON.stringify(v),10),{hash:2409.5,unit:'N/s',at:10,accepted:2,rejected:0});
 for(const x of [{...v,hash:-1},{...v,unit:'MH/s'},{...v,accepted:-1}])assert.equal(a.parseTelemetry('MDS '+JSON.stringify(x)),null);
});
test('MDS uses explicit devices and MSS confirmation without guessing TLS ports',()=>{
 const c={pool:'stratum+tcp://pool.example:3333',wallet:'a'.repeat(64),worker:'Rig1',backend:'gpu',gpuIndex:1,performance:100,mssConfirmed:true};
 const args=a.args(c);assert.equal(args[args.indexOf('--gpu-index')+1],'1');assert.equal(Number(args[args.indexOf('--duty')+1]),.8999999999999999);
 assert.throws(()=>a.args({...c,mssConfirmed:false}));assert.throws(()=>a.args({...c,pool:'stratum+ssl://pool.example:3333'}));
});
