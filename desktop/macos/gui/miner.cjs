'use strict';
const {EventEmitter}=require('node:events'),{spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {verifyNative}=require('../../experiments/noid-apple/miner_cli.cjs');
const {GPU_ID}=require('./config.cjs');
class Miner extends EventEmitter{
 constructor(dir,nativeDir,log,deps={}){super();this.dir=dir;this.nativeDir=nativeDir;this.log=log;this.spawn=deps.spawn||spawn;this.verify=deps.verify||verifyNative;this.status='idle';this.jobs=new Map();this.child=null;this.epoch=0;this.serial=0;this.points=[];this.totals={accepted:0,rejected:0,submitted:0};this.rate={total:null,cpu:null,gpu:null};this.done=Promise.resolve();this.bound=0;this.lastReport=null;}
 snapshot(){return{status:this.status,workState:this.workState,session:this.session,rate:this.rate,totals:this.totals,points:this.points,lastReport:this.lastReport,jobs:[...this.jobs.values()]};}
 update(){this.emit('update');}
 signal(child,signal){try{if(process.platform==='darwin'&&child.pid)process.kill(-child.pid,signal);else child.kill(signal);}catch(e){if(e.code!=='ESRCH')this.log('停止',e.message);}}
 async start(cfg,_hardware,benchmark=false){
  if(this.status!=='idle')throw Error('已有运行任务');
  const epoch=++this.epoch;this.status='starting';this.points=[];this.rate={total:null,cpu:null,gpu:null};this.totals={accepted:0,rejected:0,submitted:0};this.session={startedAt:Date.now(),benchmark,coin:'NOID',cpuThreads:cfg.cpuThreads};this.update();
  this.workState='waiting';this.lastRateLog=0;
  let input;
  try{
   const native=this.verify(this.nativeDir);await fs.mkdir(path.join(this.dir,'results'),{recursive:true});
   if(epoch!==this.epoch)throw Error('启动已取消');
   const id=Date.now()+'-'+(++this.serial)+'-'+crypto.randomBytes(4).toString('hex');
   const report=path.join(this.dir,'results',id+'.json');this.lastReport=report;
   let executable=path.join(this.nativeDir,'node'),args;
   if(benchmark){executable=native.executable;args=[native.flag,native.metal,'--search-seconds','30','--cpu-threads',String(cfg.cpuThreads)];}
   else{
    const remaining=this.bound?Math.ceil((this.bound-Date.now())/1000):cfg.seconds;
    if(remaining<=0)throw Error('本次运行时限已到');
    const seconds=Math.max(1,Math.min(600,remaining));
    const command=[native.executable,native.flag,native.metal,'--worker-seconds',String(seconds+30),'--cpu-threads',String(cfg.cpuThreads)];
    const c={pool:cfg.pool,host:cfg.host,port:cfg.port,transport:cfg.transport||'tls',wallet:cfg.wallets.NOID,worker:cfg.worker,seconds,batch:65536,command,cwd:this.nativeDir};
    input=path.join(this.dir,'run-'+id+'.json');await fs.writeFile(input,JSON.stringify(c),{mode:0o600});
    args=[path.resolve(__dirname,'../../experiments/noid-apple/pool_runner.cjs'),input,report];
   }
   if(epoch!==this.epoch)throw Error('启动已取消');
   const child=this.spawn(executable,args,{cwd:this.nativeDir,detached:process.platform==='darwin',stdio:['ignore','pipe','pipe'],windowsHide:true});this.child=child;
   this.jobs=new Map([[GPU_ID,{id:GPU_ID,status:'running',telemetry:null}]]);this.status='running';this.update();
   let output='',line='',finished=false;
   let finishResolve;this.done=new Promise(r=>{finishResolve=r;});
   const finish=async(code,error)=>{if(finished)return;finished=true;clearTimeout(this.forceTimer);if(input)await fs.unlink(input).catch(()=>{});
    try{if(benchmark&&code===0){const data=JSON.parse(output),s=data.metalSearch;if(!s||data.metalSelftest!=='passed')throw Error('离线校验报告无效');await fs.writeFile(report,JSON.stringify(data,null,2));this.rate={total:s.hashesPerSecondWall,cpu:s.cpuHashes/s.wallSeconds,gpu:s.gpuHashes/s.wallSeconds};this.log('测速','30秒离线总算力 '+(s.hashesPerSecondWall/1e6).toFixed(3)+' MH/s');}
     else if(!benchmark){const data=JSON.parse(await fs.readFile(report,'utf8'));this.totals={accepted:data.accepted,rejected:data.rejected,submitted:data.submitted};this.log('结果','接受 '+data.accepted+' / 拒绝 '+data.rejected+'；'+(data.error||data.reason));}
    }catch(e){if(code===0)this.log('报告',e.message);}
    if(error||code&&this.status!=='stopping')this.log('错误',error?.message||'内核退出码 '+code);
    this.child=null;this.status='idle';for(const j of this.jobs.values())j.status='stopped';this.update();finishResolve();
   };
   child.once('error',e=>finish(null,e));child.once('close',code=>finish(code));
   child.stderr.on('data',chunk=>this.log('内核',String(chunk).slice(0,800)));
   child.stdout.on('data',chunk=>{if(benchmark){output+=String(chunk);if(output.length>2*1024*1024){this.log('错误','测速报告过大');this.stop();}return;}
    line+=String(chunk);if(line.length>1024*1024){this.log('错误','内核输出过大');this.stop();return;}
    let i;while((i=line.indexOf('\n'))>=0){const raw=line.slice(0,i);line=line.slice(i+1);if(!raw.trim())continue;try{this.event(JSON.parse(raw));}catch(e){this.log('内核',raw.slice(0,300));}}
   });
   this.log(benchmark?'测速':'挖矿',benchmark?'离线自检和30秒测速已启动，不连接矿池':'正在校验内核并连接矿池 · '+(cfg.transport==='tcp'?'TCP 兼容（非加密）':'TLS 加密'));return true;
  }catch(e){if(input)await fs.unlink(input).catch(()=>{});this.status='idle';this.update();throw e;}
 }
 event(e){
  if(e.type==='stats'){
   const total=e.localHashesPerSecond,cpu=e.cpuHashesPerSecond,gpu=e.gpuHashesPerSecond;
   if(![total,cpu,gpu].every(n=>Number.isFinite(n)&&n>=0))throw Error('无效算力采样');
   const waiting=['paused','reconnecting'].includes(this.workState);
   this.rate=waiting?{total:0,cpu:0,gpu:0}:{total,cpu,gpu};const at=Date.now();this.points.push({at,total,cpu,gpu});if(this.points.length>120)this.points.shift();
   this.jobs.get(GPU_ID).telemetry={hash:this.rate.total,at};this.totals.accepted=e.accepted;this.totals.rejected=e.rejected;
   if(!this.lastRateLog||at-this.lastRateLog>=10000){this.lastRateLog=at;this.log('算力','最近1秒有效工作 '+(total/1e6).toFixed(3)+' MH/s · GPU '+(gpu/1e6).toFixed(3)+' / CPU '+(cpu/1e6).toFixed(3)+' · 接受 '+e.accepted+' / 拒绝 '+e.rejected);}
  }else if(e.type==='submitted'){this.totals.submitted++;this.log('份额','已提交 #'+e.id+'，等待矿池确认');}
  else if(e.type==='accepted'){this.totals.accepted++;this.log('份额','NOID share accepted · #'+e.id+' · 累计接受 '+this.totals.accepted);}
  else if(e.type==='rejected'){this.totals.rejected++;this.log('份额','NOID share rejected · #'+e.id+' · '+JSON.stringify(e.error||'矿池未接受').slice(0,200));}
  else if(e.type==='paused'){this.workState='paused';this.rate={total:0,cpu:0,gpu:0};const j=this.jobs.get(GPU_ID);if(j)j.telemetry={hash:0,at:Date.now()};this.log('矿池','矿池要求暂停旧任务，保持连接等待新任务'+(e.reason?' · 原因：'+e.reason:''));}
  else if(e.type==='job'){
   if(this.workState!=='mining'){this.workState='waiting';this.rate={total:null,cpu:null,gpu:null};const j=this.jobs.get(GPU_ID);if(j)j.telemetry=null;}
   this.log('任务',(Number.isFinite(e.pauseSeconds)?'矿池等待 '+e.pauseSeconds.toFixed(3)+' 秒，收到新任务':'收到有效工作')+' · '+e.job);
  }
  else if(e.type==='work-resumed'){this.workState='mining';this.log('内核','已完成新任务首批有效计算，持续搜索中');}
  else if(e.type==='reconnect'){this.workState='reconnecting';this.rate={total:0,cpu:0,gpu:0};const j=this.jobs.get(GPU_ID);if(j)j.telemetry={hash:0,at:Date.now()};this.log('连接','连接中断，等待重连');}
  else{const text={ 'worker-ready':'CPU / Metal 自检通过','tls-ready':'TLS 证书已验证','tcp-ready':'TCP 兼容连接已建立（非加密）','authorized':'矿池授权成功','job':'收到有效工作','connecting':'正在连接矿池','reconnect':'连接中断，等待重连','stopped':'本次任务已结束','connection-error':e.message,'worker-stderr':e.message}[e.type];if(text)this.log('内核',text);}
  this.update();
 }
 async stop(reason='用户停止'){
  ++this.epoch;const child=this.child;if(!child){this.status='idle';this.update();return;}
  if(this.status!=='stopping'){this.status='stopping';this.log('停止',reason);this.update();this.signal(child,'SIGTERM');this.forceTimer=setTimeout(()=>this.signal(child,'SIGKILL'),6000);}
  await this.done;
 }
}
module.exports={Miner};
