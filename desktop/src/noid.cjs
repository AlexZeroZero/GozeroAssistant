'use strict';
function validWallet(s){
 if(typeof s!=='string'||s.length!==60||!s.startsWith('o1')||s!==s.toLowerCase())return false;
 const chars='qpzry9x8gf2tvdw0s3jn54khce6mua7l',values=[3,0,15],gen=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
 for(const c of s.slice(2)){const n=chars.indexOf(c);if(n<0)return false;values.push(n)}
 let chk=1;for(const value of values){const top=chk>>>25;chk=(((chk&0x1ffffff)<<5)^value)>>>0;for(let i=0;i<5;i++)if((top>>>i)&1)chk=(chk^gen[i])>>>0}
 return chk===0x2bc830a3&&(chars.indexOf(s[53])&15)===0;
}
function compatibility(hardware,selected,kernel=require('./noid-kernels.json')['suprminer-noid-1.9.27']){
 const gpus=(hardware?.gpus||[]).filter(g=>selected.includes(g.id));
 return {cpu:'Windows x64 CPU；GPU 模式，CPU 用于调度',gpu:'NVIDIA Compute Capability ≥ 8.0；RTX 30 / 40 / 50 系列',memory:'建议系统内存 ≥ 8 GB；矿池挖矿无需运行全节点',driver:kernel.minimumDriver?'NVIDIA 驱动 ≥ 610；Suprminer NOID 要求':'需支持 CUDA 13 的 NVIDIA 驱动，启动时检查',mode:'NOID 单币 · Poseidon2b · 无合并证明',devices:gpus.map(g=>({id:g.id,name:g.name,status:g.vendor!=='NVIDIA'?'不支持：当前内核仅支持 NVIDIA':g.architecture&&['Kepler','Maxwell','Pascal','Volta','Turing'].includes(g.architecture)?'不支持：需要 Ampere 或更新架构':'启动时校验 CUDA 兼容性'})),blocked:gpus.some(g=>g.vendor!=='NVIDIA'||['Kepler','Maxwell','Pascal','Volta','Turing'].includes(g.architecture))};
}
function network(raw,now=Date.now()){
 const p=raw?.pool,n=p?.networkStats;
 if(p?.id!=='noid'||p.coin?.symbol!=='NOID'||p.coin?.algorithm!=='Poseidon2b'||![n?.networkHashrate,n?.networkDifficulty,p.blockTime,p.blockReward].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0))throw Error('NOID 矿池网络数据无效');
 return {coin:'NOID',name:'Parano1d',algorithm:'Poseidon2b',unit:'H/s',height:n.blockHeight,networkHash:n.networkHashrate,difficulty:n.networkDifficulty,networkUnit:'H/s',networkAt:now,networkStale:false,networkSource:'Suprnova NOID / 即时查询（上游未提供快照时间）',price:null,priceAt:null,priceStale:true,priceSource:null,coinsPerUnitDay:86400/p.blockTime*p.blockReward/n.networkHashrate,referenceAt:now,referenceStale:false,reward:p.blockReward,blockSeconds:p.blockTime,models:[],basis:'Suprnova 全网算力、奖励与出块周期估算；PPLNS 实际收益可能不同',sourceUrl:'https://noid.suprnova.cc/',fetchedAt:now,error:null};
}
function account(kind,data){
 const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
 if(kind==='balance'){const confirmed=number(data?.pendingBalance),pending=number(data?.unconfirmedBalance);if(confirmed===null||pending===null)throw Error('NOID 余额字段无效');return{confirmed,pending,threshold:number(data.payoutLimit)}}
 if(kind==='stats'){const paid=number(data?.totalPaid);if(paid===null)throw Error('NOID 支付字段无效');return{paid,week:null,month:null}}
 if(!Array.isArray(data))throw Error('NOID 支付记录无效');const rows=data.filter(r=>r.type==='Debit'&&r.status==='paid');
 return{count:rows.length,rows:rows.slice(0,10).map(r=>({at:Number.isFinite(Date.parse(r.created))?Date.parse(r.created):null,amount:number(r.amount),txid:typeof r.transactionConfirmationData==='string'&&/^[a-f0-9]{64}$/i.test(r.transactionConfirmationData)?r.transactionConfirmationData:null,status:'已支付'}))};
}
module.exports={validWallet,compatibility,network,account};
