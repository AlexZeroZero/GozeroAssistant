'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const SERVICE_ADDRESS='j1smg6356c2ef4yedx4025vlj2xrmdyktzu58kqnj5l0p0lfa4crpq6fanj6';
function address(s){
 if(typeof s!=='string'||s.length!==60||!s.startsWith('j1')||s!==s.toLowerCase())throw Error('JTM 需要有效的 j1 主网公开收款地址');
 const chars='qpzry9x8gf2tvdw0s3jn54khce6mua7l',values=[3,0,10],gen=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
 for(const c of s.slice(2)){const n=chars.indexOf(c);if(n<0)throw Error('JTM 需要有效的 j1 主网公开收款地址');values.push(n);}
 let chk=1;for(const v of values){const top=chk>>>25;chk=(((chk&0x1ffffff)<<5)^v)>>>0;for(let i=0;i<5;i++)if((top>>>i)&1)chk=(chk^gen[i])>>>0;}
 if(chk!==0x2bc830a3||(chars.indexOf(s[53])&15)!==0)throw Error('JTM 需要有效的 j1 主网公开收款地址');return s;
}
function endpoint(c){
 const host=String(c.host).toLowerCase();
 if(c.pool==='gozero'||host==='jtm.pool.gozero.trade'){
  if(c.pool!=='gozero'||host!=='jtm.pool.gozero.trade'||c.port!==443||c.transport!=='https')throw Error('Gozero JTM requires https://jtm.pool.gozero.trade/rpc');
  return 'https://jtm.pool.gozero.trade/rpc';
 }
 return c.transport+'://'+c.host+':'+c.port;
}
function launch(root,cfg){
 const wallet=address(cfg.wallets.JTM),count=os.availableParallelism?.()||os.cpus().length;
 const threads=Math.max(1,Math.min(cfg.cpuThreads||count,count));
 return {executable:path.join(root,'jtm/GozeroJtmCore'),cwd:path.join(root,'jtm'),
  args:['--rpc',cfg.pools.JTM,'--worker-name',cfg.worker,'--threads',String(threads),'--pads','2','--prefetch','0','--no-huge','--no-tune-file','--priority','normal','--status-json','--report-secs','10','--parent-pid',String(process.pid)],
  env:{...process.env,TOWERMINER_KEY:wallet+'.'+cfg.worker}};
}
async function verify(root,signal){
 signal?.throwIfAborted();const p=path.join(root,'cores/jtm'),m=JSON.parse(await fs.readFile(path.join(p,'MANIFEST.json'),'utf8'));
 if(m.arch!=='arm64'||m.cpuTarget!=='apple-m1'||! /^[a-f0-9]{64}$/.test(m.sha256||'')||(await fs.lstat(path.join(p,'GozeroJtmCore'))).isSymbolicLink()||crypto.createHash('sha256').update(await fs.readFile(path.join(p,'GozeroJtmCore'))).digest('hex')!==m.sha256)throw Error('JTM 内核完整性校验失败');
 signal?.throwIfAborted();return true;
}
function event(m,e){
 const {CPU_ID}=require('./config.cjs');
 if(e.type==='profile'){
  if(!Number.isSafeInteger(e.threads)||e.threads<1)throw Error('Invalid JTM profile');
  m.session.activeCpuThreads=e.threads;m.log('内核','JTM · CPU × '+e.threads+' · '+e.backend);
 }else if(e.type==='status'){
  if(!Number.isFinite(e.hps)||e.hps<0||![e.found,e.accepted,e.refused,e.unknown].every(n=>Number.isSafeInteger(n)&&n>=0)||!['mining','waiting','error'].includes(e.state))throw Error('Invalid JTM status');
  const state={mining:'mining',waiting:'waiting',error:'reconnecting'}[e.state],before=m.workState;
  m.workState=state;const rate=state==='mining'?e.hps:0,at=Date.now();m.lastSampleAt=at;
  m.rate={total:rate,cpu:rate,gpu:0};m.points.push({at,total:rate,cpu:rate,gpu:0});if(m.points.length>120)m.points.shift();
  const j=m.jobs.get(CPU_ID);if(j)j.telemetry=state==='mining'?{hash:rate,at}:null;
  m.totals={submitted:e.found,accepted:e.accepted,rejected:e.refused,unknown:e.unknown};
  m.coreSummary={height:e.height,uptimeSeconds:e.uptime_s,threads:m.session.activeCpuThreads,unknown:e.unknown};
  if(before!==state&&e.message)m.log('矿池','JTM · '+e.message);
  if(!m.lastRateLog||at-m.lastRateLog>=10000){m.lastRateLog=at;m.log('算力','JTM · '+require('./coins.cjs').formatRate(rate,'JTM'));}
 }else if(e.type==='block'||e.type==='share'){
  // Snapshots own the counters; block events never double-count them.
  if(!['accepted','refused','unknown'].includes(e.result))throw Error('Invalid JTM outcome');
  m.log('份额','JTM share '+e.result+' · '+e.height);
 }else if(e.type==='error'){
  m.workState='reconnecting';m.rate={total:0,cpu:0,gpu:0};const j=m.jobs.get(CPU_ID);if(j)j.telemetry=null;m.log('错误','JTM · '+e.message);
 }
 m.update();
}
module.exports={SERVICE_ADDRESS,address,endpoint,launch,verify,event};
