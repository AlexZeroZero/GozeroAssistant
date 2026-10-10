'use strict';
const p=require('./ysr-protocol.cjs');
function args(config,gpu,logFile){
 if(!p.validAddress(config.wallets.YSR))throw Error('YSR 需要有效的 ysr1 主网地址');
 if(gpu.vendor!=='NVIDIA'||!/^GPU-[a-f0-9-]{36}$/i.test(gpu.sensors?.uuid||''))throw Error('YSR 当前内核需要具有有效 UUID 的 NVIDIA RTX 30 或更新显卡');
 const urls=require('./pool-catalog.cjs').poolUrls(config).map(p.validateApi);
 if(!urls.length)throw Error('请选择 YSR HTTPS 矿池');
 return ['--mine','--wallet',config.wallets.YSR,'--worker',require('./pool-identity.cjs').identity(config,gpu).worker,'--device-model',require('./pool-identity.cjs').identity(config,gpu).model,'--device','0','--api',urls[0],...urls.slice(1).flatMap(u=>['--backup',u]),'--stop-file',logFile+'.stop'];
}
function network(raw,now=Date.now()){
 if(raw?.token?.token_symbol!=='YSR'||raw.token.decimals!==8||!Number.isSafeInteger(raw.height)||raw.height<0)throw Error('YSR 网络数据身份或高度无效');
 const difficulty=Number(raw.difficultyWert??raw.difficulty),reward=Number(raw.nextReward)/1e8,networkHash=Number(raw.hashrate);
 if(!Number.isFinite(difficulty)||difficulty<=0||!Number.isFinite(reward)||reward<0||!Number.isFinite(networkHash)||networkHash<0)throw Error('YSR 网络数据无效');
 return {coin:'YSR',name:'YSKAR',algorithm:'SHA-256d / 136-byte header',unit:'H/s',height:raw.height,difficulty,difficultyText:String(raw.difficultyWert??raw.difficulty),networkHash,networkUnit:'H/s',networkAt:now,networkStale:false,networkSource:'Gozero YSR',price:null,priceAt:null,priceSource:null,priceStale:true,coinsPerUnitDay:reward*86400/(difficulty*65536),referenceAt:now,referenceStale:false,basis:'YSR 当前难度 × SHA-256d 尝试次数估算；随机出块，非保证收益',reward,blockSeconds:Number(raw.targetBlockTime)||600,models:[],fetchedAt:now,sourceUrl:p.PUBLIC_API,error:null};
}
function amount(v){if(typeof v!=='string'||!/^\d{1,30}$/.test(v))return null;const n=Number(v)/1e8;return Number.isFinite(n)?n:null}
function account(raw,wallet){
 if(raw?.address!==wallet||amount(raw.balance)===null||!Array.isArray(raw.history))throw Error('YSR 地址账本格式无效');
 const rewards=raw.history.filter(r=>['pool','mining','solo','coinbase'].includes(r.kind));
 const rows=rewards.slice(0,10).map(r=>({at:/^\d{1,12}$/.test(String(r.timestamp))?Number(r.timestamp)*1000:null,amount:amount(r.amount),txid:/^[a-f0-9]{64}$/i.test(r.txid||'')?r.txid:null,status:'区块直接入账'}));
 return {balance:{confirmed:amount(raw.balance),pending:null,threshold:null},stats:{paid:rewards.length&&rewards.every(r=>amount(r.amount)!==null)?rewards.reduce((sum,r)=>sum+amount(r.amount),0):rewards.length?null:0,week:null,month:null},payouts:{count:rewards.length,rows}};
}
module.exports={...p,args,network,account};
