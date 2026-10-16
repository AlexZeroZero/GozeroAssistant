'use strict';
const DEFAULT_POOL='stratum+tcp://mds.gozero.trade:13333';
const SERVICE_ADDRESS='01572f7d2efa32fb412d53542f5ab4b11f352f16ccb51b63be9d99297e32629f24b6237d';
function address(value){
 if(typeof value!=='string'||! /^(?:[a-f0-9]{64}|[a-f0-9]{72})$/i.test(value))throw Error('MDS 需要 64 或 72 位十六进制 MSS 可重复收款地址');
 return value;
}
function pool(value){const u=new URL(value);if(u.protocol!=='stratum+tcp:'||!u.hostname||!u.port||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('MDS 当前仅支持 stratum+tcp://主机:端口');return value;}
function args(config,gpu){
 address(config.wallets.MDS);
 if(config.mdsMssConfirmed!==true)throw Error('请确认 MDS 收款地址由 generate-mss 生成，不能使用一次性 WOTS 地址');
 if(gpu.vendor!=='NVIDIA'||!/^GPU-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(gpu.sensors?.uuid||''))throw Error('MDS CUDA 需要可读取 UUID 的 NVIDIA RTX 30 / 40 / 50 显卡');
 if(!Number.isFinite(gpu.sensors?.temp)||Date.now()-(gpu.sensors?.at||0)>10000)throw Error('MDS 需要有效的实时 GPU 温度读数');
 if((config.poolBackups?.MDS||[]).length)throw Error('MDS 当前支持单一矿池自动重连，暂不支持备用地址');
 return ['--backend','cuda','--gpu-index','0','--pool-url',pool(config.pools.MDS),'--payout-address',config.wallets.MDS,
  '--worker',require('./pool-identity.cjs').label(config,gpu,32),'--duty',(config.performance*.009).toFixed(3),
  '--cuda-batch','0','--cuda-dispatch','0','--cuda-block','0','--mss-confirmed'];
}
function record(line){if(!line.startsWith('MDS '))return null;try{const v=JSON.parse(line.slice(4));return v&&typeof v==='object'?v:null}catch{return null}}
function parseTelemetry(line,now=Date.now()){
 const v=record(line);if(v?.type!=='telemetry'||v.unit!=='N/s'||!Number.isFinite(v.hash)||v.hash<0||![v.accepted,v.rejected].every(n=>Number.isSafeInteger(n)&&n>=0))return null;
 return{hash:v.hash,unit:'N/s',at:now,accepted:v.accepted,rejected:v.rejected};
}
function message(line){const v=record(line);if(!v)return line;
 if(v.type==='telemetry')return `MDS GPU ${Number(v.hash).toFixed(2)} N/s · A ${v.accepted} / R ${v.rejected}`;
 if(v.type==='share')return `MDS ${v.accepted?'accepted':'rejected'} · job ${v.job}${v.error?' · '+v.error:''}`;
 if(v.type==='job')return `MDS 收到新任务 ${v.job}`;
 if(v.type==='selftest')return `MDS ${v.backend} 自检 ${v.passed?'通过':'失败'}${v.gpuSettings?' · '+v.gpuSettings.device+' · '+v.gpuSettings.registersPerThread+' registers · 预算 '+Math.round(v.gpuSettings.duty*100)+'% · U'+v.gpuSettings.chainUnroll+' · SM '+v.gpuSettings.smCount+' · 并行链 '+v.gpuSettings.batchNonces+' · 线程块 '+v.gpuSettings.workgroupSize+' · 分段 '+v.gpuSettings.itersPerDispatch+' · '+(v.gpuSettings.tuning?.length?'自动调优':'固定批量'):''}`;
 if(v.type==='cuda-diagnostics') {const g=v.gpuSettings;return `MDS 调度累计 · 计算 ${Number(g.computeSeconds).toFixed(2)}s · 休息 ${Number(g.pacingSeconds).toFixed(2)}s · 校验阻塞 ${Number(g.verificationBackpressureSeconds).toFixed(2)}s · 已完成 ${g.completedBatchNonces} N · U${g.chainUnroll} / B${g.workgroupSize} / D${g.itersPerDispatch} / N${g.batchNonces}`;}
 if(v.type==='pipeline')return `MDS 提交队列 ${v.queued} · 待确认 ${v.pending} · 窗口 ${v.submission?.window??'—'} · 最旧确认 ${Number(v.oldestAckSeconds).toFixed(2)}s${v.submission?.cooldownSeconds>0.2?' · 繁忙退避 '+v.submission.cooldownSeconds.toFixed(1)+'s':''}`;
 if(v.message==='Pool verifier busy: cooling down submissions; limit retained across reconnects')return 'MDS 矿池校验器繁忙，已降低提交并发并退避；重连后保留限制';
 if(v.message)return 'MDS '+v.message;
 return line;
}
module.exports={DEFAULT_POOL,SERVICE_ADDRESS,address,pool,args,parseTelemetry,record,message};
