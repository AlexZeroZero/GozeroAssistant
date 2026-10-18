'use strict';
// Real bundled process + real loopback HTTP, isolated from the user's profile.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Miner}=require('../src/miner.cjs'),{validate}=require('../src/config.cjs'),jtm=require('../src/jtm.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const out=process.env.GOZER_JTM_ARTIFACTS||path.resolve(__dirname,'../artifacts/jtm');await fs.mkdir(out,{recursive:true});
 const dir=await fs.mkdtemp(path.join(out,'native-profile-')),logs=[],requests=[];
 const miner=new Miner(dir,()=>{throw Error('Unexpected download')},(type,text)=>logs.push({type,text}));
 let generation=1;
 const server=http.createServer((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{
  const q=JSON.parse(body);requests.push({method:q.method,params:q.params,headers:req.headers});
  let result;
  if(q.method==='jetsam_getBlockTemplate')result={template_id:'test-'+generation,pow_fields_hex:('00'.repeat(255)+generation.toString(16).padStart(2,'0')),nonce_field_index:0,difficulty_target_hex:'ff'.repeat(32),height:40000+generation,expires_in_seconds:120,nonce_prefix:7,pow_walk:true};
  else if(q.method==='jetsam_submitBlock'){result='ab'.repeat(32);generation++;}
  else throw Error('Unexpected method '+q.method);
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
 })});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const hardware=()=>({scannedAt:Date.now(),cpu:[{Name:os.cpus()[0].model,NumberOfCores:os.cpus().length,NumberOfLogicalProcessors:os.cpus().length}],gpus:[],metrics:{at:Date.now(),freeMemory:os.freemem()}});
 const c=validate({coin:'JTM',cpuThreads:2,performance:100,reportPoolIdentity:false,jtmKey:'mock-only-token',wallets:{JTM:jtm.SERVICE_ADDRESS},pools:{JTM:'http://127.0.0.1:'+server.address().port}});
 async function until(fn,ms){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await pause(150)}throw Error('Timed out: '+JSON.stringify(logs.slice(-8)))}
 const result={protocol:'local mock, not live pool',passed:false};
 try{
  await miner.install(c);assert(await miner.installed(c));await miner.start(c,hardware());
  await until(()=>[...miner.jobs.values()].some(j=>j.shares?.accepted>0),45000);
  assert(requests.length>1);assert(requests.filter(r=>r.method==='jetsam_getBlockTemplate').every(r=>r.params[0]===jtm.SERVICE_ADDRESS));
  assert(requests.every(r=>r.headers.authorization==='Bearer mock-only-token'&&!r.headers['x-jetsam-host']&&!r.headers['x-jetsam-cpu']));
  const submits=requests.filter(r=>r.method==='jetsam_submitBlock');assert(submits.every(r=>/^[0-9a-f]{32}$/.test(r.params[1])&&r.params[1].endsWith('07000000')));
  assert.equal(new Set(submits.map(r=>r.params.join(':'))).size,submits.length);
  result.submits=submits.length;await miner.stop('mock completed');assert.equal(miner.status,'idle');
  const requestCount=requests.length;await miner.start(validate({coin:'JTM',cpuThreads:2}),hardware(),true);
  await until(()=>miner.status==='idle',55000);assert(miner.benchmark?.offline&&miner.benchmark.devices[0].hash>0);assert.equal(requests.length,requestCount);
  result.benchmark=miner.benchmark;result.passed=true;
 }finally{
  await miner.stop('test cleanup');server.closeAllConnections();await new Promise(r=>server.close(r));
  await fs.writeFile(path.join(out,'native-smoke.log'),logs.map(l=>l.type+' '+l.text).join('\n'));
  await fs.writeFile(path.join(out,'native-smoke.json'),JSON.stringify(result,null,2));
 }
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1});
