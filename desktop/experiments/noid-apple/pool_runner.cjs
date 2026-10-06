// SPDX-License-Identifier: Apache-2.0
// Bounded validation runner. Explicit config required; never starts on import.
'use strict';
const fs=require('node:fs'),path=require('node:path'),tls=require('node:tls'),net=require('node:net');
const {spawn}=require('node:child_process');
const {Session,LineDecoder,nonce,reconnectDelay}=require('./pool_session.cjs');
function check(ok,message){if(!ok)throw Error(message)}
function validatedConfig(c){
 check(c&&['innovlab','suprnova'].includes(c.pool),'pool must be innovlab or suprnova');
 check(['tls','tcp'].includes(c.transport??'tls')&&(c.pool!=='innovlab'||(c.transport??'tls')==='tls'),'Innovlab requires TLS; TCP only supported for Suprnova');
 check(typeof c.wallet==='string'&&/^o1[023456789acdefghjklmnpqrstuvwxyz]{20,100}$/.test(c.wallet),'NOID public address required');
 check(typeof c.worker==='string'&&/^[A-Za-z0-9_-]{1,32}$/.test(c.worker),'invalid worker name');
 check(typeof c.host==='string'&&/^[a-zA-Z0-9.-]+$/.test(c.host),'invalid TLS hostname');
 check(Number.isInteger(c.port)&&c.port>0&&c.port<65536,'invalid port');
 check(Number.isInteger(c.seconds)&&c.seconds>=1&&c.seconds<=600,'test duration must be 1..600 seconds');
 check(Number.isInteger(c.batch)&&c.batch>=1&&c.batch<=65536,'batch must be 1..65536');
 check(Array.isArray(c.command)&&c.command.length>0&&c.command.every(x=>typeof x==='string'),'explicit worker command required');
 return c;
}
function verifiedCandidates(response,ticket){
 check(response.count===ticket.count&&Array.isArray(response.candidates)&&response.candidates.length<=1024,'invalid worker response');
 const digests=new Map(),nonces=[];
 for(const candidate of response.candidates){
  check(/^[a-f0-9]{32}$/.test(candidate.nonce)&&/^[a-f0-9]{64}$/.test(candidate.cpuDigest),'invalid CPU-verified candidate');
  check(!digests.has(candidate.nonce),'duplicate worker candidate');
  nonces.push(Buffer.from(candidate.nonce,'hex'));digests.set(candidate.nonce,Buffer.from(candidate.cpuDigest,'hex'));
 }
 return {result:{nonces,totalMatches:nonces.length,capacity:1024},hash:(_header,n)=>digests.get(n.toString('hex'))};
}
async function run(input,{event=()=>{},reportFile,transport,spawnWorker=spawn}={}){
 const config=validatedConfig(input),started=performance.now();
 const secure=(config.transport??'tls')==='tls';transport??=secure?tls.connect:net.connect;
 const summary={startedAt:new Date().toISOString(),pool:config.pool,host:config.host,port:config.port,worker:config.worker,
  walletSuffix:config.wallet.slice(-8),durationLimitSeconds:config.seconds,transport:secure?'tls':'tcp',tlsVerified:false,authorized:false,
  hashes:0,cpuHashes:0,gpuHashes:0,discardedHashes:0,accepted:0,rejected:0,submitted:0,pauses:0,poolPausedSeconds:0,jobs:0,reconnects:0,events:[]};
 const log=(type,data={})=>{const row={at:new Date().toISOString(),type,...data};summary.events.push(row);if(summary.events.length>2000)summary.events.shift();event(row)};
 const session=new Session({pool:config.pool,username:config.wallet+'.'+config.worker});
 let socket,worker,ready=false,busy=null,serial=0,attempt=0,closed=false,retryTimer,stopTimer,tickTimer,statsTimer,deadlineTimer;
 let reconnectAt=0,workerDeadline=0,lastStats=0,lastHashes=0,lastCPUHashes=0,lastGPUHashes=0,lastPing=0;
 let pausedAt=null,needsWorkResume=true;
 const endPause=()=>{if(pausedAt===null)return null;const seconds=(performance.now()-pausedAt)/1000;summary.poolPausedSeconds+=seconds;pausedAt=null;return seconds;};
 const decoder=new LineDecoder();
 return new Promise(resolve=>{
  const finish=(reason,error)=>{
   if(closed)return;closed=true;clearTimeout(retryTimer);clearTimeout(deadlineTimer);clearInterval(tickTimer);clearInterval(statsTimer);
   endPause();session.disconnect();socket?.destroy();worker?.stdin.end();
   summary.reason=reason;summary.error=error?.message||null;summary.elapsedSeconds=(performance.now()-started)/1000;
   summary.accepted=session.accepted;summary.rejected=session.rejected;
   summary.localHashesPerSecond=summary.hashes/summary.elapsedSeconds;summary.finishedAt=new Date().toISOString();
   log('stopped',{reason,error:summary.error,accepted:summary.accepted,rejected:summary.rejected});
   // Child has a separate hard lifetime as well as EOF handling.
   stopTimer=setTimeout(()=>{worker?.kill();finalize()},3000);
   const finalize=()=>{if(!stopTimer)return;clearTimeout(stopTimer);stopTimer=null;
    if(reportFile){fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(summary,null,2)+'\n')}
    process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);resolve(summary)};
   if(!worker||worker.exitCode!==null)finalize();else worker.once('exit',finalize);
  };
  const interrupt=()=>finish('user-stop');process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  const send=request=>{
   if(closed||!socket||socket.destroyed||!session.canSend(request))return false;
   if(socket.writableLength>1024*1024)throw Error('pool write backlog exceeded');
   socket.write(JSON.stringify(request)+'\n');if(request.method==='mining.submit'){summary.submitted++;log('submitted',{id:request.id,job:request.params[0],nonce:request.params[1]})}return true;
  };
  const connect=()=>{
   if(closed)return;session.disconnect();log('connecting',{attempt});
   const connection=transport({host:config.host,port:config.port,...(secure?{servername:config.host,rejectUnauthorized:true}:{})});socket=connection;
   connection.setTimeout(15000,()=>{if(!session.authorized)connection.destroy(Error('TLS/handshake timeout'))});
   connection.on(secure?'secureConnect':'connect',()=>{try{if(secure)check(connection.authorized,'TLS certificate not verified');summary.tlsVerified=secure;
    log(secure?'tls-ready':'tcp-ready',{protocol:secure?connection.getProtocol():'TCP'});send(session.connect({tlsVerified:secure}));}catch(e){finish('protocol-error',e)}});
   const lines=new LineDecoder();
   connection.on('data',chunk=>{if(closed||connection!==socket)return;try{lines.feed(chunk,message=>{
    const pending=session.pending.get(message.id)?.method;
    const replies=session.receive(message);for(const request of replies)send(request);
    if(pending==='mining.authorize'){summary.authorized=session.authorized;attempt=0;log('authorized');}
    if(message.method==='mining.notify'){summary.jobs++;log('job',{job:session.job.id,expiresMs:session.job.deadline-performance.now(),target:session.job.target,pauseSeconds:endPause()})}
    if(message.method==='mining.pause'){
     summary.pauses++;if(pausedAt===null)pausedAt=performance.now();needsWorkResume=true;
     const reason=message.params?.[0]?.reason;
     log('paused',{source:'pool',reason:typeof reason==='string'?reason.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,200):null});
    }
    if(pending==='mining.submit'){summary.accepted=session.accepted;summary.rejected=session.rejected;
     log(message.result===true&&!message.error?'accepted':'rejected',{id:message.id,error:message.error||null});}
   });pump()}catch(e){finish('protocol-error',e)}});
   connection.on('error',e=>log('connection-error',{message:e.message}));
   connection.on('close',()=>{if(closed||connection!==socket)return;endPause();needsWorkResume=true;session.disconnect();summary.reconnects++;
    const delay=reconnectDelay(attempt++);reconnectAt=performance.now()+delay;log('reconnect',{delay});retryTimer=setTimeout(connect,delay)});
  };
  const pump=()=>{
   if(closed||!ready||busy||!session.authorized||!session.job||performance.now()<reconnectAt)return;
   try{
    const ticket=session.allocate(config.batch);if(!ticket)return;
    busy={ticket,id:++serial};workerDeadline=performance.now()+10000;
    worker.stdin.write(JSON.stringify({id:serial,fields:ticket.job.fields,nonce:nonce(ticket.start,ticket.job.prefix).toString('hex'),target:ticket.job.target,count:ticket.count,capacity:64})+'\n');
   }catch(e){finish('worker-schedule-error',e)}
  };
  try{
   worker=spawnWorker(config.command[0],config.command.slice(1),{cwd:config.cwd||process.cwd(),stdio:['pipe','pipe','pipe'],windowsHide:true});
   workerDeadline=performance.now()+60000;
   worker.stdin.on('error',e=>finish('worker-pipe-error',e));
   worker.stderr.on('data',data=>log('worker-stderr',{message:String(data).slice(0,1000)}));
   worker.stdout.on('data',chunk=>{if(closed)return;try{decoder.feed(chunk,response=>{
    if(response.event==='ready'){check(!ready&&response.cpuSelftest==='passed'&&response.metalSelftest==='passed','worker selftest failed or duplicate ready');ready=true;summary.cpuMiningThreads=response.cpuThreads??0;log('worker-ready',{gpu:response.gpu,cpuThreads:summary.cpuMiningThreads});connect();return;}
    if(response.event==='lifetime-ended'){finish('worker-lifetime-ended');return;}
    check(busy&&response.id===busy.id,'unexpected worker response');const {ticket}=busy;busy=null;
    if(ticket.signal.aborted){summary.discardedHashes+=ticket.count;return;}
    const verified=verifiedCandidates(response,ticket);
    const cpuHashes=response.cpuHashes??0,gpuHashes=response.gpuHashes??ticket.count;
    check(Number.isInteger(cpuHashes)&&Number.isInteger(gpuHashes)&&cpuHashes>=0&&gpuHashes>=0&&cpuHashes+gpuHashes===ticket.count,'invalid CPU/GPU work accounting');
    const completed=session.complete(ticket,verified.result,verified.hash);
    if(completed.discarded){summary.discardedHashes+=ticket.count;return;}
    summary.hashes+=ticket.count;
    summary.cpuHashes+=cpuHashes;summary.gpuHashes+=gpuHashes;
    if(needsWorkResume){needsWorkResume=false;log('work-resumed',{job:ticket.job.id,cpuHashes,gpuHashes});}
    for(const request of completed.requests)send(request);
   });setImmediate(pump)}catch(e){finish('worker-validation-error',e)}});
   worker.once('error',e=>finish('worker-start-error',e));worker.once('exit',(code,signal)=>{if(!closed)finish('worker-exit',Error('worker exited '+code+' '+signal))});
   tickTimer=setInterval(()=>{if(closed)return;try{
    if((!ready||busy)&&performance.now()>workerDeadline)return finish('worker-timeout',Error('worker response deadline exceeded'));
    if(session.tick()==='reconnect')socket?.destroy();
    if(session.authorized&&performance.now()-lastPing>60000){lastPing=performance.now();send(session.request('mining.ping',[]))}
    pump();
   }catch(e){finish('session-error',e)}},50);
   lastStats=performance.now();statsTimer=setInterval(()=>{const now=performance.now(),elapsed=(now-lastStats)/1000;log('stats',{localHashesPerSecond:(summary.hashes-lastHashes)/elapsed,cpuHashesPerSecond:(summary.cpuHashes-lastCPUHashes)/elapsed,gpuHashesPerSecond:(summary.gpuHashes-lastGPUHashes)/elapsed,hashes:summary.hashes,accepted:session.accepted,rejected:session.rejected});lastHashes=summary.hashes;lastCPUHashes=summary.cpuHashes;lastGPUHashes=summary.gpuHashes;lastStats=now},1000);
   deadlineTimer=setTimeout(()=>finish('duration-limit'),config.seconds*1000);
  }catch(e){finish('startup-error',e)}
 });
}
if(require.main===module){
 const file=process.argv[2],report=process.argv[3];if(!file||!report)throw Error('Usage: node pool_runner.cjs CONFIG_JSON REPORT_JSON');
 run(JSON.parse(fs.readFileSync(file,'utf8')),{reportFile:path.resolve(report),event:e=>console.log(JSON.stringify(e))}).then(s=>{if(s.error)process.exitCode=1}).catch(e=>{console.error(e);process.exitCode=1});
}
module.exports={run,validatedConfig,verifiedCandidates};
