'use strict';
const path=require('node:path');
const {cpuThreads}=require('./mining-devices.cjs');
const MIN_MEMORY=4*1024**3;
const {validAddress}=require('../renderer/zcd-address.js');
function address(s){if(!validAddress(s))throw Error('ZCD 需要 02 开头的 32 字节永久地址，不能使用一次性地址');return '0x'+s.replace(/^0x/i,'').toLowerCase()}
function poolConfig(config,hw,logFile=null){
 const user=address(config.wallets.ZCD),threads=cpuThreads(config,hw),identity=require('./pool-identity.cjs'),device=require('./mining-devices.cjs').cpuDevice(hw),worker=identity.identity(config,device).worker;
 if(!config.pools.ZCD)throw Error('请先填写 ZCD 主矿池地址');
 const urls=require('./pool-catalog.cjs').poolUrls(config);
 const pools=urls.map(value=>{require('./config.cjs').validatePool(value);const u=new URL(value);return {algo:'rx/2',coin:null,url:u.host,user,pass:config.zcdPassword||'x','rig-id':worker,keepalive:true,enabled:true,tls:u.protocol==='stratum+ssl:','tls-fingerprint':null,'socks5':null}});
 return {'user-agent':identity.agent(config,device),autosave:false,background:false,colors:false,title:false,http:{enabled:false},api:{id:null,'worker-id':worker},
  randomx:{init:Math.min(threads,4),mode:'fast','1gb-pages':false,rdmsr:false,wrmsr:false,numa:true},
  cpu:{enabled:true,'huge-pages':true,'huge-pages-jit':false,'hw-aes':null,priority:1,yield:true,asm:true,'rx':Array(threads).fill(-1),'rx/2':Array(threads).fill(-1),'*':false},
  opencl:{enabled:false},cuda:{enabled:false},'donate-level':Math.round(require('./kernel-catalog.cjs').resolve(config).kernelFee*100),'donate-over-proxy':0,'log-file':logFile,'print-time':5,'health-print-time':60,'pause-on-battery':true,'pause-on-active':false,retries:2,'retry-pause':5,pools};
}
function args(config,_cpu,logFile){address(config.wallets.ZCD);if(!config.pools.ZCD)throw Error('请先填写 ZCD 主矿池地址');return ['--config',path.resolve(logFile+'.json')]}
function parseTelemetry(line,at=Date.now()){
 const clean=String(line).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'');
 // Use XMRig's 10-second sample, never its trailing lifetime maximum.
 const m=/\bspeed\s+10s\/60s\/15m\s+(\d+(?:\.\d+)?)\s+(?:\d+(?:\.\d+)?|n\/a)\s+(?:\d+(?:\.\d+)?|n\/a)\s+([kMGT]?)H\/s\b/i.exec(clean);
 if(!m)return null;const hash=Number(m[1])*({'':1,K:1e3,M:1e6,G:1e9,T:1e12}[m[2].toUpperCase()]);
 return Number.isFinite(hash)&&hash>=0?{hash,unit:'H/s',at}:null;
}
function parseShares(line){const m=/\b(?:accepted|rejected)\s+\((\d+)\/(\d+)\)/i.exec(String(line));return m?{accepted:Number(m[1]),rejected:Number(m[2])}:null}
module.exports={parseShares,MIN_MEMORY,validAddress,address,poolConfig,args,parseTelemetry};
