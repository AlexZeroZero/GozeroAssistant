'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {spawn}=require('node:child_process'),jtm=require('../src/jtm.cjs'),{validate}=require('../src/config.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const out=path.resolve(__dirname,'../artifacts/release-1.0.57');await fs.mkdir(out,{recursive:true});
 let paused=false,pausedPolls=0,child,output='',failure,requests=0;const nonces=new Set();
 const c=validate({coin:'JTM',cpuThreads:2,wallets:{JTM:jtm.SERVICE_ADDRESS},worker:'pool_test'});
 const server=http.createServer((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{
  try{
   const q=JSON.parse(body);requests++;
   assert.equal(req.headers.authorization,'Bearer '+jtm.token(c));assert.match(req.headers['x-jetsam-version'],/gozero-pool\.2/);
   let result,error;
   if(q.method==='jetsam_getBlockTemplate'){
    assert(q.params.length===0||(q.params.length===1&&q.params[0]===''));
    if(paused){pausedPolls++;error={code:20,message:'node preparing work; retry'}}
    else result={template_id:'unchanged-template',pow_fields_hex:'00'.repeat(256),nonce_field_index:0,difficulty_target_hex:'ff'.repeat(31)+'03',block_target_hex:'00'.repeat(32),height:41001,expires_in_seconds:120,nonce_prefix:7,pow_walk:true,pool_share_protocol:'GozeroJTM/1'};
   }else{
    assert.equal(q.method,'jetsam_submitBlock');assert.equal(q.params[0],'unchanged-template');
    assert(!nonces.has(q.params[1]),'duplicate nonce after share/pause/resume');nonces.add(q.params[1]);
    result={accepted:true,block_hash:null};
   }
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,...(error?{error}:{result})}));
  }catch(e){failure=e;res.writeHead(500);res.end('{}')}
 })});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 async function until(fn,ms=20000){const end=Date.now()+ms;while(Date.now()<end){if(failure)throw failure;if(fn())return;await pause(100)}throw Error('Timed out: '+output.slice(-1800))}
 const args=jtm.args(c,{logical:24});args[args.indexOf('--rpc')+1]='http://127.0.0.1:'+server.address().port;
 args[args.indexOf('--report-secs')+1]='1';
 const report={passed:false,scope:'local mock; not live-pool acceptance'};
 try{
  child=spawn(path.resolve(__dirname,'../artifacts/jtm/GozeroJtmCore.exe'),args,{windowsHide:true,env:{...process.env,TOWERMINER_KEY:jtm.token(c)},stdio:['ignore','pipe','pipe']});
  child.on('error',e=>{failure=e});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  await until(()=>nonces.size>=5);paused=true;await until(()=>pausedPolls>0);await pause(1500);
  const held=nonces.size;await pause(1500);assert.equal(nonces.size,held,'old work submitted while pool has no job');
  paused=false;await until(()=>nonces.size>=held+5);assert.match(output,/SHARE accepted/);
  report.passed=true;report.mockShares=nonces.size;report.pausedPolling=pausedPolls;report.resumedSameJobWithoutDuplicates=true;report.requests=requests;
 }finally{
  if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('close',r))}
  server.closeAllConnections();await new Promise(r=>server.close(r));
  await fs.writeFile(path.join(out,'pool-native-smoke.log'),output);
  await fs.writeFile(path.join(out,'pool-native-smoke.json'),JSON.stringify(report,null,2));
 }
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1});
