'use strict';
const {poolChoices,poolUrls}=require('./pool-catalog.cjs');
const ORIGIN='https://pool.kryptex.com',INTERVAL=60000;
function accountFor(config){
 const coin=config.coin,wallet=config.wallets?.[coin]||'';
 if(!['PRL','QTC'].includes(coin))return{coin,reason:'此币种矿池账本接口尚未适配'};
 if(!wallet)return{coin,reason:'保存收款地址后自动查询矿池账本'};
 if(!/^[A-Za-z0-9]{20,140}$/.test(wallet))return{coin,reason:'收款地址格式不正确'};
 const known=poolChoices(coin).map(r=>r.url),urls=poolUrls(config);
 if(!urls.some(url=>known.includes(url)))return{coin,reason:'当前矿池尚未适配地址账本接口'};
 return{coin,wallet,key:coin+':'+wallet,mixed:urls.some(url=>!known.includes(url)),page:`${ORIGIN}/${coin.toLowerCase()}/miner/payouts/${encodeURIComponent(wallet)}`};
}
function number(v){if((typeof v!=='number'&&typeof v!=='string')||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null}
function normalize(kind,data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('矿池返回格式无效');
 if(kind==='balance'){
  const result={confirmed:number(data.confirmed),pending:number(data.unconfirmed),threshold:number(data.threshold)};
  if(result.confirmed===null||result.pending===null)throw Error('矿池余额字段缺失');return result;
 }
 if(kind==='stats'){
  const result={paid:number(data.paid),week:number(data.reward?.week),month:number(data.reward?.month)};
  if(result.paid===null||result.week===null||result.month===null)throw Error('矿池收益字段缺失');return result;
 }
 if(!Array.isArray(data.results)||!Number.isSafeInteger(data.count)||data.count<0)throw Error('支付记录格式无效');
 return{count:data.count,rows:data.results.slice(0,10).map(r=>{
  const date=number(r.date),amount=number(r.received);return{at:date!==null&&date<1e11?date*1000:null,amount,txid:typeof r.txid==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(r.txid)?r.txid:null,status:r.status==='FINISHED'?'已支付':r.status==='PENDING'?'处理中':'待确认'};
 })};
}
class PoolAccount{
 constructor(request,changed=()=>{},clock=Date.now){this.request=request;this.changed=changed;this.clock=clock;this.cache=new Map();this.current={reason:'保存收款地址后自动查询矿池账本'};this.stopped=false}
 configure(config){this.current=accountFor(config);this.refresh().catch(()=>{});this.changed()}
 snapshot(){
  const a=this.current,c=this.cache.get(a.key),now=this.clock();
  return{coin:a.coin,source:'Kryptex',supported:!!a.key,reason:a.reason||null,address:a.wallet?`${a.wallet.slice(0,8)}…${a.wallet.slice(-6)}`:null,mixed:!!a.mixed,loading:!!c?.pending,sections:Object.fromEntries(['balance','stats','payouts'].map(k=>{const d=c?.[k];return[k,d?{...d,stale:!!d.error||!d.at||now-d.at>180000}:null]}))};
 }
 async refresh(){
  const a=this.current;if(!a.key||this.stopped)return this.snapshot();
  let c=this.cache.get(a.key);if(!c){c={attempt:null};this.cache.set(a.key,c);if(this.cache.size>6)this.cache.delete(this.cache.keys().next().value)}
  if(c.pending)return c.pending;
  if(c.attempt!==null&&this.clock()-c.attempt<INTERVAL)return this.snapshot();
  c.attempt=this.clock();
  const work=async()=>{
   await Promise.all(['balance','stats','payouts'].map(async kind=>{
    const address=encodeURIComponent(a.wallet),route=kind==='balance'?`balance/${address}`:kind==='stats'?`payouts/${address}/stats`:`payouts/${address}?page=1`;
    try{const raw=await this.request(`${ORIGIN}/${a.coin.toLowerCase()}/api/v1/miner/${route}`,{maxBytes:512*1024,timeout:12000});if(this.stopped)return;c[kind]={value:normalize(kind,JSON.parse(raw.toString())),at:this.clock(),error:null}}
    catch(e){if(!this.stopped)c[kind]={...c[kind],error:/HTTP \d{3}/.exec(e.message)?.[0]||'接口暂不可用，请稍后重试'}}
   }));
  };
  c.pending=work().finally(()=>{c.pending=null;if(!this.stopped)this.changed()});this.changed();await c.pending;return this.snapshot();
 }
 url(){if(!this.current.page)throw Error('当前地址暂无已适配账单页面');return this.current.page}
 start(){this.timer=setInterval(()=>this.refresh().catch(()=>{}),INTERVAL)}
 stop(){this.stopped=true;clearInterval(this.timer);this.cache.clear()}
}
module.exports={PoolAccount,accountFor,normalize};
