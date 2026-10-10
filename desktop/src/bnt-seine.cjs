'use strict';
const {poolUrls}=require('./pool-catalog.cjs');
function fee(url){const host=new URL(url).hostname.toLowerCase();return host==='bntpool.com'||host.endsWith('.bntpool.com')?0.01:0.025}
function args(config,threads,url,dataDir,largePages=false,device=null){
 require('./bnt.cjs').address(config.wallets.BNT);
 if(!Number.isInteger(threads)||threads<1)throw Error('Seine 线程数无效');
 // Upstream v0.2.15 only implements plain Stratum TCP. Never downgrade TLS silently.
 if(new URL(url).protocol!=='stratum+tcp:')throw Error('Seine 0.2.15 仅支持 stratum+tcp 矿池地址');
 return['--mode','pool','--backend','cpu','--threads',String(threads),'--cpu-affinity','auto',
  '--cpu-page-mode',largePages?'auto':'regular','--disable-cpu-autotune-threads',
  '--pool-url',url,'--pool-worker',require('./pool-identity.cjs').label(config,device),'--address',config.wallets.BNT,
  '--data-dir',dataDir,'--ui','plain','--stats-secs','5'];
}
function urls(config){const list=poolUrls(config);for(const url of list)if(new URL(url).protocol!=='stratum+tcp:')throw Error('Seine 0.2.15 仅支持 stratum+tcp 矿池地址');return list}
function parse(line){
 const text=line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
 const tag=/^\s*[\d.]+s\s+(INFO|OK|WARN|ERROR)\s+(\w+)\s+(.+)$/.exec(text);
 if(!tag)return null;const [,level,kind,message]=tag;
 if(kind==='STATS'){
  const m=/^elapsed=([\d.]+)s hashes=(\d+) rate=([\d.]+) ([kMGT]?)H\/s\b/.exec(message);
  if(!m)return null;
  const elapsed=Number(m[1]),hashes=Number(m[2]),accepted=Number(/\baccepted=(\d+)/.exec(message)?.[1]||0);
  if(!Number.isFinite(elapsed)||elapsed<=0||!Number.isSafeInteger(hashes)||!Number.isSafeInteger(accepted))return null;
  return{kind:'stats',elapsed,hashes,accepted};
 }
 if(kind==='SHARE'&&/^accepted\b/.test(message))return{kind:'accepted'};
 if(kind==='SHARE'&&/^rejected\b/.test(message))return{kind:'rejected'};
 if(kind==='JOB'&&/^(new|updated) job\b/.test(message))return{kind:'work'};
 if(kind==='AUTH'&&/^login accepted\b/.test(message))return{kind:'auth'};
 if(kind==='AUTH'&&/^login rejected\b/.test(message)||kind==='CONN'&&['WARN','ERROR'].includes(level))return{kind:'offline'};
 if(kind==='CONN'&&message==='connected')return{kind:'connected'};
 return null;
}
// Upstream STATS rate is a lifetime average; derive each interval from actual
// cumulative completed hashes, then feed the Assistant's 5/10-minute window.
function interval(previous,current){if(!previous)return null;const dt=current.elapsed-previous.elapsed,n=current.hashes-previous.hashes;return dt>0&&n>=0?n/dt:null}
module.exports={args,parse,interval,urls,fee};
