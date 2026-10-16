'use strict';
const path=require('node:path');
const {GPU_ID,CPU_ID}=require('./config.cjs');
const {formatRate}=require('./coins.cjs');
function launchSpec(root,dir,cfg,report,runtime={}){
 const coin=cfg.coin,wallet=cfg.wallets[coin];
 if(!['QTC','PRL','BNT','MDS'].includes(coin)||!wallet)throw Error('内核配置无效');
 if(coin==='MDS'){
  require('./mds.cjs').confirm(cfg);
  return {executable:path.join(root,'mds/GozeroMdsCore'),args:['--backend',cfg.cpuThreads>0?'hybrid':'gpu','--threads',String(cfg.cpuThreads||1),'--pool-url',cfg.pools.MDS,'--payout-address',wallet,'--worker',cfg.worker,'--mss-confirmed','--duty','0.9','--parent-pid',String(process.pid)],cwd:path.join(root,'mds'),env:{...process.env,WGPU_BACKEND:'metal',GPU_OC_SETTINGS:path.join(root,'mds/GPU_OC_SETTINGS.toml')}};
 }
 if(coin==='BNT')return {executable:runtime.node||path.join(root,'../node'),args:[path.join(__dirname,'bnt-runner.cjs'),'--core',path.join(root,'bnt/gozero-blocknet-core'),'--wallet',wallet,'--worker',cfg.worker,'--url',cfg.pools.BNT,'--threads',String(cfg.cpuThreads)],cwd:root,env:{...process.env}};
 const env={...process.env,PYTHONUNBUFFERED:'1',PYTHONDONTWRITEBYTECODE:'1'};
 // Mutable admission records and pool ledger belong to the profile, never the app.
 env.PMK_HOME=path.join(dir,'prl-state');
 env.PMK_RESOURCE_BUNDLE=path.join(root,'prl/libpmk/.build/release/libpmk_PMK.bundle');
 const args=coin==='QTC'?[path.join(root,'qtc/pool_miner.py'),'--core',path.join(root,'qtc/gozero_worker'),'--wallet',wallet,'--worker',cfg.worker,'--host',cfg.host,'--port',String(cfg.port),'--seconds','0','--adaptive-batch','--max-batch','1048576','--report',report]:[path.join(root,'prl_gui.py'),'--wallet',wallet,'--worker',cfg.worker,'--pool',cfg.pools.PRL];
 return {executable:runtime.python||path.join(root,'python/bin/python3'),args,cwd:root,env};
}
function coreEvent(m,e){
 const coin=m.session.coin,event=e.event,id=coin==='BNT'?CPU_ID:GPU_ID;
 const wait=state=>{m.workState=state;m.rate={total:0,gpu:0,cpu:null};const j=m.jobs.get(id);if(j)j.telemetry=null;};
 if(event==='hashrate'||event==='routine_telemetry'){
  let rate=e.hashes_per_second;
  if(coin==='PRL'){
   // Derive a recent interval from cumulative operations, not a lifetime average.
   const prev=m.coreSample;m.coreSample={ops:e.completed_ops,seconds:e.elapsed_seconds};
   rate=prev&&e.elapsed_seconds>prev.seconds?(e.completed_ops-prev.ops)/(2*(e.elapsed_seconds-prev.seconds)):e.tops*1e12/2;
  }
  if(!Number.isFinite(rate)||rate<0)throw Error('无效算力采样');
  if(['reconnecting','power-paused','memory-wait'].includes(m.workState))rate=0;
  else if(rate>0)m.workState='mining';
  const at=Date.now();m.rate={total:rate,gpu:coin==='BNT'?0:rate,cpu:coin==='BNT'?rate:null};m.lastSampleAt=at;
  m.points.push({at,total:rate,gpu:coin==='BNT'?0:rate,cpu:coin==='BNT'?rate:0});if(m.points.length>120)m.points.shift();
  const j=m.jobs.get(id);if(j)j.telemetry={hash:rate,at};
  for(const key of ['accepted','rejected','submitted'])if(Number.isInteger(e[key])&&e[key]>=0)m.totals[key]=e[key];
  if(!m.lastRateLog||at-m.lastRateLog>=10000){m.lastRateLog=at;m.log('算力',coin+' · '+formatRate(rate,coin));}
 }else if(event==='memory_threads'){
  m.session.activeCpuThreads=e.active;m.memoryPaused=e.active===0;
  if(m.memoryPaused)wait('memory-wait');else if(m.workState==='memory-wait')wait('waiting');
  m.log('内存','BNT CPU '+e.active+' / '+(e.requested||'自动')+' · '+(e.active?'已按可用内存调整线程':'等待内存恢复，自动继续'));
 }
 else if(event==='memory_stop'||event==='memory_wait')m.log('内存',e.message);
 else if(event==='pool_log')m.log('矿池',e.message);
 else if(['connection_error','pool_transport_error'].includes(event)){wait(m.memoryPaused?'memory-wait':'reconnecting');m.coreSample=null;m.log('连接',coin+' · '+(e.reason||e.error||event));}
 else if(event==='power_state'){m.powerPaused=!!e.paused;if(e.paused)wait('power-paused');else if(m.workState==='power-paused')wait('waiting');m.log('内核',coin+' · '+event+' · '+e.source);}
 else if(event==='job'||event==='pool_job'){if(m.workState!=='mining'&&!m.powerPaused&&!m.memoryPaused)wait('waiting');m.log('任务',coin+' · '+(e.job_id||e.pool_job_id));}
 else if(event==='share_submitted'){m.totals.submitted++;m.log('份额',coin+' share submitted');}
 else if(event==='share_accepted'||event==='share_rejected'){m.totals[event==='share_accepted'?'accepted':'rejected']++;m.log('份额',coin+' '+event.replace('_',' '));}
 else if(event==='pool_outcome'){
  m.totals.submitted=e.submitted;m.totals.accepted=e.accepted;
  if(['stale','duplicate','low-difficulty','invalid'].includes(e.classification))m.totals.rejected++;
  m.log('份额','PRL share '+e.classification);
 }else if(event==='summary'||event==='pool_summary'){
  m.coreSummary=e;for(const key of ['accepted','rejected','submitted'])if(Number.isInteger(e[key]))m.totals[key]=e[key];
  if(event==='pool_summary'&&Number.isInteger(e.stale))m.totals.rejected+=e.stale;
 }else if(['authorized','pool_authorized'].includes(event))m.log('内核','矿池授权成功');
 else if(!['power_telemetry'].includes(event))m.log('内核',coin+' · '+event+' · '+JSON.stringify(e).slice(0,450));
 m.update();
}
module.exports={launchSpec,coreEvent};
