const{test}=require('node:test'),assert=require('node:assert/strict'),net=require('node:net');
const identity=require('../src/pool-identity.cjs'),{validate}=require('../src/config.cjs');
const device={name:'NVIDIA GeForce RTX 3090',id:'private-device-id',sensors:{uuid:'private-uuid'}},cfg={worker:'rig01',reportPoolIdentity:true};
test('reporting defaults on, can be disabled independently in dual profiles, and validates its type',()=>{
 assert.equal(validate({}).reportPoolIdentity,true);assert.equal(validate({reportPoolIdentity:false}).reportPoolIdentity,false);
 const v=validate({workbenchMode:'dual',taskProfiles:{gpu:{reportPoolIdentity:false},cpu:{reportPoolIdentity:true}}});assert.equal(v.taskProfiles.gpu.reportPoolIdentity,false);assert.equal(v.taskProfiles.cpu.reportPoolIdentity,true);assert.throws(()=>validate({reportPoolIdentity:'false'}));
});
test('metadata contains only worker/model and disabling it removes both custom fields',()=>{
 assert.deepEqual(identity.identity(cfg,device),{worker:'rig01',model:'NVIDIA GeForce RTX 3090'});
 assert.equal(identity.label(cfg,device),'rig01__RTX_3090');assert.equal(identity.label({...cfg,reportPoolIdentity:false},device),'Gozer');
 assert.deepEqual(identity.identity({...cfg,reportPoolIdentity:false},device),{worker:'Gozer',model:''});
 assert.doesNotMatch(identity.agent({...cfg,reportPoolIdentity:false},device),/rig01|3090|private/);
 assert.doesNotMatch(JSON.stringify(identity.identity(cfg,{name:'RTX\n3090',serial:'secret'})),/\\n|secret/);
});
test('XMRig carries CPU model through its supported user-agent and uses generic identity when off',()=>{
 const hw={cpu:[{Name:'AMD Ryzen 9 7950X',NumberOfCores:16,NumberOfLogicalProcessors:32}],metrics:{freeMemory:8*1024**3}};
 const c=validate({coin:'ZCD',worker:'rig01',wallets:{ZCD:require('../src/service-fee.cjs').ADDRESSES.ZCD}});
 const on=require('../src/zcd.cjs').poolConfig(c,hw);assert.equal(on.pools[0]['rig-id'],'rig01');assert.match(on['user-agent'],/7950X/);
 const off=require('../src/zcd.cjs').poolConfig({...c,reportPoolIdentity:false},hw);assert.equal(off.pools[0]['rig-id'],'Gozer');assert.doesNotMatch(off['user-agent'],/7950X|rig01/);
});
test('BNT login sends optional model without changing the payout address or protocol',async()=>{
 for(const report of [true,false]){
  let resolve;const got=new Promise(r=>resolve=r),sockets=[];
  const server=net.createServer(s=>{sockets.push(s);let input='';s.on('data',b=>{input+=b;if(input.includes('\n'))resolve(JSON.parse(input.split('\n')[0]))})});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const p=identity.identity({...cfg,reportPoolIdentity:report},device),address=require('../src/service-fee.cjs').ADDRESSES.BNT,pool=new(require('../src/bnt-pool.cjs').Pool)(['stratum+tcp://127.0.0.1:'+server.address().port],address,p.worker,{deviceModel:p.model});
  try{pool.connect();const login=await Promise.race([got,new Promise((_,j)=>{setTimeout(()=>j(Error('login timeout')),2000).unref()})]);assert.equal(login.params.address,address);assert.equal(login.params.protocol_version,2);assert.equal(login.params.worker,report?'rig01':'Gozer');assert.equal(login.params.device_model,report?device.name:undefined)}finally{pool.stop();sockets.forEach(s=>s.destroy());await new Promise(r=>server.close(r))}
 }
});
test('log filter uses recorded task identity, keeps system rows in all and never guesses from message text',()=>{
 const l=require('../renderer/log-filter.js'),rows=[{task:'gpu',type:'矿工',text:'GPU'},{task:'cpu',type:'矿工',text:'GPU example'},{task:null,type:'系统',text:'CPU'}];
 assert.equal(l.filter(rows,'all').length,3);assert.deepEqual(l.filter(rows,'gpu'),[rows[0]]);assert.deepEqual(l.filter(rows,'cpu'),[rows[1]]);assert.equal(l.label(rows[1]),'CPU · 矿工');
});
