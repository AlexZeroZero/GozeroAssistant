'use strict';
// The native core additionally validates the BLAKE3 address checksum.
const SERVICE_ADDRESS='01572f7d2efa32fb412d53542f5ab4b11f352f16ccb51b63be9d99297e32629f24b6237d';
function address(value){if(typeof value!=='string'||! /^(?:[a-f0-9]{64}|[a-f0-9]{72})$/i.test(value))throw Error('MDS 需要 64 或 72 位十六进制 MSS 可重复收款地址');return value;}
function confirm(c){address(c.wallets?.MDS||c.wallet);if(c.mdsMssConfirmed!==true)throw Error('请确认 MDS 收款地址由 generate-mss 生成，不能使用一次性 WOTS 地址');}
function event(m,e){
 const {coreEvent}=require('./core-adapter.cjs');
 const log=s=>m.log('内核','MDS · '+s);
 if(e.type==='telemetry'){
  if(e.unit!=='N/s'||!Number.isFinite(e.hash)||e.hash<0||![e.accepted,e.rejected].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('Invalid MDS telemetry');
  const split=e.gpuHash!==undefined||e.cpuHash!==undefined;
  if(split&&(![e.gpuHash,e.cpuHash].every(n=>Number.isFinite(n)&&n>=0)||Math.abs(e.gpuHash+e.cpuHash-e.hash)>Math.max(1e-6,e.hash*1e-9)))throw Error('Invalid MDS component rates');
  coreEvent(m,{event:'hashrate',hashes_per_second:m.workState==='paused'?0:e.hash,accepted:e.accepted,rejected:e.rejected});
  if(split){
   const active=m.workState==='mining'&&m.rate.total===e.hash;
   m.rate.gpu=active?e.gpuHash:0;m.rate.cpu=active?e.cpuHash:0;
   const point=m.points.at(-1);if(point){point.gpu=m.rate.gpu;point.cpu=m.rate.cpu;}
  }
 }else if(e.type==='job')coreEvent(m,{event:'job',job_id:e.job});
 else if(e.type==='submitted')coreEvent(m,{event:'share_submitted'});
 else if(e.type==='share'){
  if(typeof e.accepted!=='boolean')throw Error('Invalid MDS share');
  coreEvent(m,{event:e.accepted?'share_accepted':'share_rejected'});
  if(!e.accepted)log(JSON.stringify(e.error));
 }else if(e.type==='status'&&(e.message==='Pool authorized'||e.message?.startsWith('Current job expired:'))){
  m.workState=e.message==='Pool authorized'?'waiting':'paused';m.rate={total:0,gpu:0,cpu:null};
  const j=m.jobs.get(require('./config.cjs').GPU_ID);if(j)j.telemetry=null;
  log(e.message);
 }else if(e.type==='error'||e.type==='fatal'||e.type==='status'&&/^(Connecting |Reconnecting )/.test(e.message||'')){
  coreEvent(m,{event:'connection_error',reason:e.message});
 }else if(e.type==='selftest')log(e.backend+' selftest '+(e.passed?'passed':'failed')+(e.device?' · '+e.device:''));
 else if(e.type==='status')log(e.message);
 else if(e.type==='benchmark')m.coreSummary=e;
 m.update();
}
module.exports={SERVICE_ADDRESS,address,confirm,event};
