'use strict';
const SERVICE_ADDRESS='j1smg6356c2ef4yedx4025vlj2xrmdyktzu58kqnj5l0p0lfa4crpq6fanj6';
const DEFAULT_POOL='https://jtm.pool.gozero.trade/rpc',POOL_PAGE='https://pool.gozero.trade/JTM';
function isGozeroPool(s){try{const u=new URL(s);return u.origin==='https://jtm.pool.gozero.trade'&&['/rpc','/rpc/'].includes(u.pathname)&&!u.search&&!u.hash&&!u.username&&!u.password}catch{return false}}
function token(c,benchmark=false){if(benchmark)return '';if(!isGozeroPool(endpoint(c.pools.JTM)))return c.jtmKey||'';return address(c.wallets.JTM)+'.'+(c.reportPoolIdentity===false?'Gozer':c.worker.replace(/\./g,'_'));}
function migrateDefaultPool(raw){
 let changed=false;
 for(const profile of [raw,...Object.values(raw.taskProfiles||{})]){
  if(!profile||typeof profile!=='object')continue;
  const current=profile.pools?.JTM;
  if(typeof current==='string'&&current){
   const normalized=endpoint(current);
   if(normalized!==current){profile.pools={...profile.pools,JTM:normalized};changed=true;}
  }
  if(raw.jtmPoolVersion!==1&&[undefined,'',POOL_PAGE,POOL_PAGE+'/'].includes(current)){
   profile.pools={...profile.pools,JTM:DEFAULT_POOL};changed=true;
  }
 }
 raw.jtmPoolVersion=1;return changed;
}
function validAddress(s){
 if(typeof s!=='string'||s.length!==60||!s.startsWith('j1')||s!==s.toLowerCase())return false;
 const chars='qpzry9x8gf2tvdw0s3jn54khce6mua7l',values=[3,0,10],gen=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
 for(const c of s.slice(2)){const v=chars.indexOf(c);if(v<0)return false;values.push(v)}
 let chk=1;for(const v of values){const top=chk>>>25;chk=(((chk&0x1ffffff)<<5)^v)>>>0;for(let i=0;i<5;i++)if((top>>>i)&1)chk=(chk^gen[i])>>>0}
 return chk===0x2bc830a3&&(chars.indexOf(s[53])&15)===0;
}
function address(s){if(!validAddress(s))throw Error('JTM 需要校验有效的 j1 主网收款地址');return s}
function endpoint(s){
 if(s===POOL_PAGE||s===POOL_PAGE+'/')return DEFAULT_POOL;
 if(s==='')return s;
 if(typeof s!=='string'||s.length>240)throw Error('JTM 接口地址无效');
 let u;try{u=new URL(s)}catch{throw Error('JTM 需要 HTTP / HTTPS JSON-RPC 接口')}
 if(!['https:','http:'].includes(u.protocol)||!u.hostname||u.username||u.password||u.search||u.hash)throw Error('JTM 需要 HTTP / HTTPS JSON-RPC 接口，不支持 Stratum 地址');
 if(require('../renderer/pool-transport.js').requiresHttps(s,'JTM')&&u.protocol==='http:'){
  if(u.port)throw Error('Gozero JTM 矿池仅支持 HTTPS，请使用 https://jtm.pool.gozero.trade/rpc');
  u.protocol='https:';return u.href;
 }
 return s;
}
function validateStart(c,hw,benchmark=false){
 if(!benchmark){address(c.wallets.JTM);if(!endpoint(c.pools.JTM))throw Error('请填写支持 TowerWalk 的 JTM JSON-RPC 矿池接口');}
 if(!hw.metrics?.at||Date.now()-hw.metrics.at>15000||hw.metrics.freeMemory<512*1024**2)throw Error('请刷新 CPU / 内存监控后重试');
 require('./mining-devices.cjs').cpuThreads(c,hw);
}
function args(c,cpu,benchmark=false){
 const threads=c.cpuThreads||require('../renderer/performance.js').cpuThreadBudget(cpu,c.performance);
 if(!Number.isInteger(threads)||threads<1||threads>cpu.logical)throw Error('JTM 线程数超出设备范围');
 const a=['--threads',String(threads),'--threads-per-core','2','--status-json','--report-secs','5','--no-tune-file'];
 if(benchmark)return [...a,'--bench-walk','30','--idle-secs','0'];
 address(c.wallets.JTM);if(!endpoint(c.pools.JTM))throw Error('请填写 JTM 矿池接口');
 const rpc=endpoint(c.pools.JTM);
 a.push('--rpc',rpc);
 if(!isGozeroPool(rpc))a.push('--coinbase',c.wallets.JTM);
 if(c.reportPoolIdentity!==false)a.push('--worker-name',isGozeroPool(rpc)?c.worker.replace(/\./g,'_'):c.worker);else a.push('--no-report-hardware');
 return a;
}
function parse(line,benchmark=false){
 // The Windows capture file receives both streams. A complete JSON event can
 // be surrounded by a concurrent human-readable stderr line.
 const first=line.indexOf('{'),last=line.lastIndexOf('}');
 for(const candidate of [line,...(first>=0&&last>first?[line.slice(first,last+1)]:[])])try{const p=JSON.parse(candidate);if(p.type==='status'&&typeof p.hps==='number'&&Number.isFinite(p.hps)&&p.hps>=0&&['mining','waiting','error'].includes(p.state))return{...p,hash:p.state==='mining'?p.hps:0};if(['profile','block','share','error'].includes(p.type))return p}catch{}
 if(benchmark){const m=/\bhps=([\d.]+)/.exec(line),r=/\brate=([\d.]+)\s*([kM]?)H\/s/.exec(line);const h=m?Number(m[1]):r?Number(r[1])*({'':1,k:1000,M:1e6}[r[2]]):null;if(Number.isFinite(h))return{type:'status',state:'mining',hash:h,benchmark:true,final:!!m}}
 return null;
}
function ingest(miner,j,line){
 const p=parse(line,miner.session?.benchmark);let message=line;
 if(p?.type==='status'){
  j.status=p.state==='mining'?'running':'waiting';
  const t={hash:p.hash,unit:'H/s',at:Date.now()};j.telemetry=t;j.samples.push(t);if(j.samples.length>300)j.samples.shift();miner.hashWindows?.sample(j.id,t);
  if(p.final)miner.benchmark={coin:'JTM',at:Date.now(),offline:true,devices:[{id:j.id,name:j.name,hash:p.hash,watts:null,samples:j.samples.length}]};
  if(!p.benchmark)j.shares={accepted:Number(p.accepted)||0,rejected:Number(p.refused)||0,unknown:Number(p.unknown)||0};
  message=(p.benchmark?'JTM 离线测试':'JTM '+p.state)+' · '+p.hash.toFixed(2)+' H/s'+(p.message?' · '+p.message:'');
 }else if(p?.type==='profile'){message='JTM · '+p.backend+' · '+p.threads+' T · '+p.pads+' pads · '+p.pages+' · '+p.kernel;}
 else if(p?.type==='block')message='JTM '+p.result+' · #'+p.height;
 else if(p?.type==='share')message='JTM share '+p.result+' · #'+p.height;
 else if(p?.type==='error')message='JTM 错误：'+p.message;
 j.lastMessage=message.replace(/\x1b\[[0-9;]*m/g,'').slice(0,500);miner.log('矿工',j.name+' · '+j.lastMessage);
}
module.exports={DEFAULT_POOL,POOL_PAGE,isGozeroPool,token,migrateDefaultPool,SERVICE_ADDRESS,validAddress,address,endpoint,validateStart,args,parse,ingest};
