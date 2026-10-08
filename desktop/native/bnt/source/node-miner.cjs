'use strict';
// Explicit, bounded development runner for the independent CPU core.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const{spawn}=require('node:child_process'),{createInterface}=require('node:readline');
const{validateAddress,NodeClient}=require('./node-protocol.cjs');
const emit=data=>process.stdout.write(JSON.stringify({...data,at:new Date().toISOString()})+'\n');
class ComputeWorker{
 constructor(exe,engine){
  this.child=spawn(exe,['worker',engine],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.pending=null;this.closed=false;
  this.ready=new Promise((resolve,reject)=>{this.readyResolve=resolve;this.readyReject=reject});
  this.timer=setTimeout(()=>this.fail(Error('Core startup timeout')),30000);
  this.exited=new Promise(resolve=>this.child.once('close',resolve));
  this.child.on('error',e=>this.fail(e));this.child.on('exit',()=>{this.closed=true;this.fail(Error('Core exited'))});
  this.child.stdin.on('error',e=>this.fail(e));
  this.child.stderr.on('data',()=>{}); // Diagnostics reported through bounded JSON errors; no secrets.
  const lines=createInterface({input:this.child.stdout});
  lines.on('line',line=>{
   let msg;try{msg=JSON.parse(line)}catch{return this.fail(Error('Invalid core output'))}
   if(msg.event==='ready'){clearTimeout(this.timer);this.readyResolve(msg)}
   else if(this.pending){const p=this.pending;this.pending=null;clearTimeout(this.jobTimer);msg.event==='hash'&&msg.id===p.id?p.resolve(msg):p.reject(Error(msg.message||'Core job failed'))}
  });
 }
 fail(e){clearTimeout(this.timer);clearTimeout(this.jobTimer);this.readyReject(e);if(this.pending){this.pending.reject(e);this.pending=null}}
 async hash(job){await this.ready;if(this.closed||this.pending)throw Error('Core unavailable/busy');return new Promise((resolve,reject)=>{this.pending={resolve,reject,id:job.id};this.jobTimer=setTimeout(()=>{this.fail(Error('Hash computation timeout'));this.child.kill()},60000);this.child.stdin.write(JSON.stringify(job)+'\n')})}
 async stop(){this.fail(Error('Stopped'));this.child.stdin.end();if(!this.closed)this.child.kill();await this.exited}
}
async function mine(config){
 const address=validateAddress(config.address),threads=config.threads??1,seconds=config.seconds??120;
 if(!Number.isInteger(threads)||threads<1||threads>8||!Number.isInteger(seconds)||seconds<1||seconds>3600)throw Error('Threads 1..8 and seconds 1..3600 required');
 const required=threads*2*1024**3,free=os.freemem();if(required>Math.min(free/2,free-4*1024**3))throw Error('Insufficient spare memory for selected threads');
 const exe=path.resolve(config.exe);if(!fs.statSync(exe).isFile())throw Error('Missing core executable');
 const engine=config.engine||(threads===1?'prefetch':'avx2');
 if(!['auto','official','reuse','sse2','avx2','gozero','prefetch'].includes(engine))throw Error('Unknown engine');
 const token=fs.readFileSync(config.cookieFile,'utf8').trim(),api=new NodeClient({endpoint:config.endpoint,token});
 let stopped=false,job=null,nonce=0n,total=0,accepted=0,jobGeneration=0;
 const workers=[];const start=Date.now(),deadline=start+seconds*1000;
 const signal=()=>{stopped=true;job=null;for(const w of workers)w.child.kill()};
 process.once('SIGINT',signal);process.once('SIGTERM',signal);
 const timer=setTimeout(signal,seconds*1000);
 async function refresh(){
  const status=await api.request('/api/status');
  if(!Number.isSafeInteger(status.chain_height)||!Number.isInteger(status.peers)||status.peers<1||status.syncing){job=null;emit({event:'waiting_node',height:status.chain_height,peers:status.peers,syncing:status.syncing});return}
  if(!job||job.prevHash!==status.best_hash||job.expires<Date.now()+15000){
   const next=await api.getTemplate(address);
   if(next.prevHash!==status.best_hash)return; // Tip changed between requests; retry.
   job={...next,generation:++jobGeneration};nonce=0n;
   emit({event:'job',height:job.height,difficulty:job.difficulty});
  }
 }
 try{
  await refresh();
  for(let i=0;i<threads;i++){const w=new ComputeWorker(exe,engine);workers.push(w);await w.ready}
  emit({event:'started',threads,engine,maxSeconds:seconds,mode:'HTTP SOLO',serviceFee:false});
  const loops=workers.map(async(w,index)=>{
   while(!stopped&&Date.now()<deadline){
    const current=job;
    if(!current||current.expires<Date.now()+2500){await new Promise(r=>setTimeout(r,100));continue}
    if(nonce>(1n<<64n)-1n){job=null;continue}
    const n=(nonce++).toString(),id=current.generation+':'+index+':'+n;
    const result=await w.hash({id,header:current.header,target:current.target,nonce:n});total++;
    if(stopped||job?.generation!==current.generation||current.expires<=Date.now())continue;
    if(result.nonce!==n||! /^[a-f0-9]{64}$/.test(result.hash))throw Error('Core returned malformed result');
    // Independently check the target rather than trusting a boolean from the worker.
    if(BigInt('0x'+result.hash)<=BigInt('0x'+current.target)){
     job=null;const response=await api.submit(current.id,n);
     if(response.accepted===true){accepted++;emit({event:'block_accepted',height:response.height,hash:response.hash})}
     else throw Error('Node did not accept solved block');
    }
   }
  });
  let loopError;const all=Promise.all(loops).catch(e=>{loopError=e;stopped=true});
  while(!stopped&&Date.now()<deadline){
   await new Promise(r=>setTimeout(r,1000));if(stopped)break;
   try{await refresh()}catch{job=null;emit({event:'waiting_node',reason:'Node unavailable; work paused'})}
   if(total)emit({event:'hashrate',hashes:total,hashrate:total/((Date.now()-start)/1000),unit:'H/s',acceptedBlocks:accepted});
  }
  stopped=true;job=null;await Promise.all(workers.map(w=>w.stop()));await all;
  if(loopError&&Date.now()<deadline)throw loopError;
  emit({event:'stopped',hashes:total,acceptedBlocks:accepted});
 }finally{
  clearTimeout(timer);stopped=true;job=null;process.removeListener('SIGINT',signal);process.removeListener('SIGTERM',signal);
  await Promise.allSettled(workers.map(w=>w.stop()));
 }
}
if(require.main===module){
 const file=process.argv[2];
 if(!file){console.error('Usage: node node-miner.cjs CONFIG.json (explicit start, bounded duration)');process.exitCode=1}
 else Promise.resolve().then(()=>mine(JSON.parse(fs.readFileSync(file,'utf8')))).catch(e=>{emit({event:'error',message:e.message});process.exitCode=1});
}
module.exports={ComputeWorker,mine};
