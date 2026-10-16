'use strict';
// Prepared adapter; not registered in the production coin catalogue until the
// intended pool and service-fee recipient have been verified.
const DEFAULT_POOL='stratum+tcp://mds.gozero.trade:13333';
function validatePool(value){
 const u=new URL(value);
 if(u.protocol!=='stratum+tcp:'||!u.hostname||!u.port||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('MDS 需要 stratum+tcp://主机:端口');
 return u.origin==='null'?'stratum+tcp://'+u.host:u.origin;
}
function parseTelemetry(line,now=Date.now()){
 if(!line.startsWith('MDS '))return null;
 try{const v=JSON.parse(line.slice(4));if(v.type!=='telemetry'||v.unit!=='N/s'||!Number.isFinite(v.hash)||v.hash<0||!Number.isSafeInteger(v.accepted)||v.accepted<0||!Number.isSafeInteger(v.rejected)||v.rejected<0)return null;
 return{hash:v.hash,unit:'N/s',at:now,accepted:v.accepted,rejected:v.rejected};}catch{return null}
}
function args({pool=DEFAULT_POOL,wallet,worker,backend,gpuIndex=0,threads=1,performance=75,mssConfirmed=false,auditUrl=null}){
 if(!mssConfirmed)throw Error('MDS 需要确认使用 MSS 可重复收款地址');
 if(!/^(?:[a-f0-9]{64}|[a-f0-9]{72})$/i.test(wallet))throw Error('MDS 地址格式无效；内核还会校验地址校验和');
 if(!/^[A-Za-z0-9_.-]{1,32}$/.test(worker)||!['gpu','cpu'].includes(backend))throw Error('矿工或设备类型无效');
 if(!Number.isInteger(performance)||performance<50||performance>100||!Number.isInteger(gpuIndex)||gpuIndex<0||!Number.isInteger(threads)||threads<1||threads>1024)throw Error('设备性能参数无效');
 if(auditUrl){const u=new URL(auditUrl);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('矿池审计接口无效')}
 return['--pool-url',validatePool(pool),'--payout-address',wallet,'--worker',worker,'--backend',backend,'--gpu-index',String(gpuIndex),'--threads',String(threads),'--duty',String(performance*0.009),'--mss-confirmed',...(auditUrl?['--audit-url',auditUrl]:[])];
}
module.exports={DEFAULT_POOL,validatePool,parseTelemetry,args};
