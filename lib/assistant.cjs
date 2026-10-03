'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const FIELDS=['schema','id','at','coin','algorithm','model','vendor','memoryMiB','driver','kernel','kernelVersion','appVersion','performance','duty','hash','hashMin','hashMax','unit','watts','seconds','samples','kind','verification'];
const fail=(s,status=400)=>{throw Object.assign(Error(s),{status})};
function validateRecord(r,now=Date.now()){
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!FIELDS.includes(k))||r.schema!==1)fail('记录格式无效');
 if(!/^[a-f0-9-]{36}$/i.test(r.id||'')||!['PRL','QTC'].includes(r.coin)||r.algorithm!==(r.coin==='PRL'?'PearlHash':'Poseidon2')||r.unit!=='H/s'||r.verification!=='client-reported'||!['mining','benchmark'].includes(r.kind))fail('记录类型无效');
 for(const [key,max]of [['model',120],['vendor',20],['driver',60],['kernel',40],['kernelVersion',30],['appVersion',30]])if(typeof r[key]!=='string'||r[key].length>max||/[\x00-\x1f<>]/.test(r[key]))fail('设备字段无效');
 for(const [k,min,max]of [['at',now-90*86400000,now+60000],['hash',1e-9,1e22],['hashMin',1e-9,1e22],['hashMax',1e-9,1e22],['seconds',30,3600],['samples',10,10000],['performance',50,100],['duty',5,90]])if(!Number.isFinite(r[k])||r[k]<min||r[k]>max)fail('实测数值无效');
 if(r.hashMin>r.hash||r.hashMax<r.hash||r.memoryMiB!==null&&(!Number.isFinite(r.memoryMiB)||r.memoryMiB<1||r.memoryMiB>1048576)||r.watts!==null&&(!Number.isFinite(r.watts)||r.watts<=0||r.watts>10000))fail('测量范围无效');
 return Object.fromEntries(FIELDS.map(k=>[k,r[k]]));
}
function createStore(dir=path.resolve(__dirname,'../.local/assistant')){
 const file=path.join(dir,'benchmarks.json'),clients=new Map();let rows=[],loaded=false,queue=Promise.resolve(),windowAt=0,uploads=0;
 async function load(){if(loaded)return;try{const d=JSON.parse(await fs.readFile(file,'utf8'));if(Array.isArray(d))rows=d.slice(-10000)}catch{}loaded=true;}
 async function accept(input,ip){const r=validateRecord(input),now=Date.now();if(now-windowAt>60000){windowAt=now;uploads=0}if(++uploads>120)fail('上传服务繁忙，请稍后重试',429);let c=clients.get(ip);if(!c||now-c.at>3600000){c={at:now,count:0};if(clients.size>=4096){for(const[k,v]of clients)if(now-v.at>3600000)clients.delete(k);if(clients.size>=4096)fail('服务繁忙',503)}clients.set(ip,c)}if(++c.count>240)fail('上传频率过高',429);
  const op=queue.catch(()=>{}).then(async()=>{await load();if(rows.some(x=>x.id===r.id))return{accepted:true,duplicate:true};rows.push(r);rows=rows.filter(x=>now-x.at<90*86400000).slice(-10000);await fs.mkdir(dir,{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(rows));await fs.rename(file+'.tmp',file);return{accepted:true,verification:'client-reported'}});queue=op;return op;
 }
 async function prune(){const op=queue.catch(()=>{}).then(async()=>{await load();const kept=rows.filter(r=>Date.now()-r.at<90*86400000);if(kept.length!==rows.length){rows=kept;await fs.mkdir(dir,{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(rows));await fs.rename(file+'.tmp',file)}});queue=op;return op}
 async function summary(){await prune();const groups=new Map();for(const r of rows){const key=[r.coin,r.model,r.kernel,r.kernelVersion,r.performance].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}const median=a=>{a.sort((a,b)=>a-b);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2};return{schema:1,verification:'unverified-community',note:'用户自愿上报，未经矿池或硬件证明；样本数不是独立设备数。',groups:[...groups.values()].slice(0,1000).map(a=>({coin:a[0].coin,model:a[0].model,kernel:a[0].kernel,kernelVersion:a[0].kernelVersion,performance:a[0].performance,samples:a.length,hashMedian:median(a.map(x=>x.hash)),unit:'H/s',wattsMedian:a.some(x=>x.watts!==null)?median(a.filter(x=>x.watts!==null).map(x=>x.watts)):null}))};}
 return{accept,summary,prune};
}
async function readBody(req){if(req.headers['content-type']?.split(';')[0]!=='application/json')fail('需要JSON',415);const parts=[];let n=0;for await(const b of req){n+=b.length;if(n>8192)fail('记录过大',413);parts.push(b)}try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{fail('JSON无效')}}
module.exports={validateRecord,createStore,readBody};
