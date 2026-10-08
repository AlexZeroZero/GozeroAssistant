'use strict';
const {sha3_256}=require('./sha3-256.cjs');
const GIB=1024**3;
function address(address){
 if(typeof address!=='string'||address.length<80||address.length>100)throw Error('BNT 需要有效的主网收款地址');
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;
 for(const c of address){const v=alphabet.indexOf(c);if(v<0)throw Error('BNT 地址包含无效字符');n=n*58n+BigInt(v)}
 let hex=n.toString(16);if(hex.length%2)hex='0'+hex;
 const b=Buffer.concat([Buffer.alloc(address.match(/^1*/)[0].length),Buffer.from(hex,'hex')]);
 const sum=sha3_256(Buffer.concat([Buffer.from('blocknet_stealth_address_checksumblocknet_mainnet'),b.subarray(0,64)]));
 if(b.length!==68||!sum.subarray(0,4).equals(b.subarray(64)))throw Error('BNT 主网地址校验失败');return address;
}
function memoryBudget(hw){
 const logical=(hw?.cpu||[]).reduce((n,c)=>{const v=Number(c.NumberOfLogicalProcessors);return n+(Number.isInteger(v)&&v>0?v:0)},0);
 const installed=(hw?.memory||[]).reduce((n,m)=>n+(Number(m.Capacity)||0),0);
 const total=hw?.metrics?.totalMemory||installed,available=hw?.metrics?.freeMemory;
 const valid=Number.isFinite(total)&&total>0&&Number.isFinite(available)&&available>=0;
 const free=valid?Math.min(available,total):0,reserve=valid?Math.max(4*GIB,total*.1):0;
 // Argon2 scratch is exactly 2 GiB. Budget 128 MiB per worker for the
 // process, libraries and allocator, in addition to system/GPU headroom.
 const perThread=2*GIB+128*1024**2;
 return{valid,logical,totalBytes:valid?total:0,freeBytes:free,reserveBytes:reserve,perThreadBytes:perThread,maxThreads:valid?Math.max(0,Math.min(logical,Math.floor((free-reserve)/perThread))):0};
}
function threadLimit(hw){return memoryBudget(hw).maxThreads}
function threads(cfg,hw){const max=threadLimit(hw),n=cfg.cpuThreads||require('../renderer/performance.js').bntThreadBudget(max,cfg.performance);if(!max||!Number.isInteger(n)||n<1||n>max)throw Error('BNT 内存预算不足或线程超限，当前最多 '+max+' 个线程；请重新应用性能档位或减少线程数');return n}
module.exports={address,memoryBudget,threadLimit,threads};
