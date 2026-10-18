'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const jtm=require('../src/jtm.cjs'),{validate}=require('../src/config.cjs');
const hw={scannedAt:Date.now(),cpu:[{Name:'AMD Test CPU',NumberOfCores:64,NumberOfLogicalProcessors:128}],gpus:[],metrics:{at:Date.now(),freeMemory:8*1024**3}};
test('JTM requires mainnet bech32m checksum and refuses a changed payload or NOID address',()=>{
 assert(jtm.validAddress(jtm.SERVICE_ADDRESS));assert(!jtm.validAddress(jtm.SERVICE_ADDRESS.replace('smg','sng')));assert(!jtm.validAddress('o'+jtm.SERVICE_ADDRESS.slice(1)));assert.throws(()=>jtm.address('j1invalid'));
});
test('JTM defaults to Gozero, restricts protocol, and isolates CPU profiles',()=>{
 const c=validate({coin:'JTM'});assert.equal(c.pools.JTM,jtm.DEFAULT_POOL);assert.equal(c.workbenchMode,'cpu');
 assert.equal(validate({coin:'JTM',pools:{JTM:''}}).pools.JTM,'');
 assert.equal(jtm.endpoint(jtm.POOL_PAGE),jtm.DEFAULT_POOL);
 assert.equal(jtm.endpoint('https://pool.example:18443/rpc'),'https://pool.example:18443/rpc');
 for(const u of ['stratum+tcp://pool.example:3333','https://user:secret@pool.example','https://pool.example?key=secret'])assert.throws(()=>jtm.endpoint(u));
 assert.throws(()=>validate({...c,jtmKey:'x\ny'}));assert.throws(()=>validate({...c,poolBackups:{...c.poolBackups,JTM:['https://other.example']}}));
 const dual=validate({...c,workbenchMode:'dual',taskProfiles:{cpu:{coin:'JTM',jtmKey:'test-token'}}});assert.equal(dual.taskProfiles.cpu.jtmKey,'test-token');assert.notEqual(dual.taskProfiles.gpu.coin,'JTM');
});
test('Gozero JTM derives payout identity without custom coinbase or command-line credentials',()=>{
 const c=validate({coin:'JTM',wallets:{JTM:jtm.SERVICE_ADDRESS},worker:'rig.01',jtmKey:'old-custom-token'});
 const cpu=require('../src/mining-devices.cjs').cpuDevice(hw);
 assert.equal(jtm.token(c),jtm.SERVICE_ADDRESS+'.rig_01');
 assert.equal(jtm.token({...c,reportPoolIdentity:false}),jtm.SERVICE_ADDRESS+'.Gozer');
 assert.equal(jtm.token(c,true),'');
 const args=jtm.args(c,cpu);assert(!args.includes('--coinbase'));assert(!args.includes('--key'));assert(args.includes('rig_01'));
 assert.equal(jtm.token({...c,pools:{JTM:'https://custom.example/rpc'}}),'old-custom-token');
 assert.equal(jtm.isGozeroPool('https://jtm.pool.gozero.trade.evil.example/rpc'),false);
 assert.equal(jtm.parse('{"type":"share","result":"accepted","height":1}').type,'share');
});
test('JTM pool migration covers old single/dual profiles and preserves custom endpoints',()=>{
 const old={pools:{JTM:''},taskProfiles:{cpu:{pools:{JTM:''}},gpu:{pools:{JTM:'https://custom.example/rpc'}}}};
 assert(jtm.migrateDefaultPool(old));assert.equal(old.pools.JTM,jtm.DEFAULT_POOL);
 assert.equal(old.taskProfiles.cpu.pools.JTM,jtm.DEFAULT_POOL);assert.equal(old.taskProfiles.gpu.pools.JTM,'https://custom.example/rpc');
 old.pools.JTM='';assert.equal(jtm.migrateDefaultPool(old),false);assert.equal(old.pools.JTM,'');
});
test('JTM repairs saved HTTP endpoints in current single and dual profiles without losing payout identity',()=>{
 const plain='http://jtm.pool.gozero.trade/rpc';
 const raw={jtmPoolVersion:1,coin:'JTM',pools:{JTM:plain},wallets:{JTM:jtm.SERVICE_ADDRESS},worker:'rig.01',taskProfiles:{cpu:{coin:'JTM',pools:{JTM:plain}},gpu:{pools:{JTM:'http://custom.example/rpc'}}}};
 assert(jtm.migrateDefaultPool(raw));assert.equal(raw.pools.JTM,jtm.DEFAULT_POOL);
 assert.equal(raw.taskProfiles.cpu.pools.JTM,jtm.DEFAULT_POOL);assert.equal(raw.taskProfiles.gpu.pools.JTM,'http://custom.example/rpc');
 const c=validate({...raw,taskProfiles:undefined});assert.equal(c.wallets.JTM,jtm.SERVICE_ADDRESS);assert.equal(c.worker,'rig.01');
 assert.equal(validate({...c,pools:{JTM:plain}}).pools.JTM,jtm.DEFAULT_POOL);
 assert.equal(jtm.endpoint('http://jtm.pool.gozero.trade:80/rpc'),jtm.DEFAULT_POOL);
 assert.throws(()=>jtm.endpoint('http://jtm.pool.gozero.trade:8443/rpc'),/HTTPS/);
 const unvalidated={...c,pools:{JTM:plain}},args=jtm.args(unvalidated,{logical:128});
 assert(args.includes(jtm.DEFAULT_POOL));assert(!args.includes('--coinbase'));
 assert.equal(jtm.token(unvalidated),jtm.SERVICE_ADDRESS+'.rig_01');
});
test('JTM uses all requested logical threads and never puts its token in command arguments',()=>{
 const c=validate({coin:'JTM',performance:100,cpuThreads:128,jtmKey:'secret',wallets:{JTM:jtm.SERVICE_ADDRESS},pools:{JTM:'https://pool.example'}}),cpu=require('../src/mining-devices.cjs').cpuDevice(hw);
 jtm.validateStart(c,hw);const args=jtm.args(c,cpu);assert.equal(args[args.indexOf('--threads')+1],'128');assert(!args.includes('secret'));assert(args.includes('--coinbase'));
 assert(jtm.args({...c,reportPoolIdentity:false},cpu).includes('--no-report-hardware'));
 assert.equal(require('../src/mining-devices.cjs').miningDevices(c,hw)[0].id,cpu.id);assert.equal(require('../src/mining-devices.cjs').workerCount(c),1);
 assert.throws(()=>jtm.validateStart(validate({coin:'JTM'}),hw));jtm.validateStart(validate({coin:'JTM'}),hw,true);
 assert(jtm.args(validate({coin:'JTM'}),cpu,true).includes('--bench-walk'));
});
test('JTM upgrade preserves addresses and migrates an explicitly selected previous core',()=>{
 const c=validate({coin:'JTM',kernels:{JTM:'gozero-jtm-0.3.1-gozero.1'},wallets:{JTM:jtm.SERVICE_ADDRESS},pools:{JTM:'https://pool.example'}});
 assert.equal(c.kernels.JTM,'auto');assert.equal(c.wallets.JTM,jtm.SERVICE_ADDRESS);assert.equal(c.pools.JTM,'https://pool.example');
});
test('JTM waiting status clears stale hashrate; offline rates cannot be mistaken for pool acceptance',()=>{
 assert.equal(jtm.parse(JSON.stringify({type:'status',state:'waiting',hps:1000})).hash,0);
 assert.equal(jtm.parse(JSON.stringify({type:'status',state:'mining',hps:1234})).hash,1234);
 assert.equal(jtm.parse('human line '+JSON.stringify({type:'status',state:'mining',hps:1234})+' tail').hash,1234);
 assert.equal(jtm.parse('BENCH-WALK hps=456.7'),null);assert.equal(jtm.parse('BENCH-WALK hps=456.7',true).hash,456.7);
 assert.equal(jtm.parse('  t=5s hashed=100 rate=5.20 kH/s pwm=1',true).hash,5200);
 assert.equal(require('../src/service-fee.cjs').ADDRESSES.JTM,jtm.SERVICE_ADDRESS);assert.equal(require('../src/service-fee.cjs').kernelFee({coin:'JTM'}),0);
});
