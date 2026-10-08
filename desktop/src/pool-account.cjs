'use strict';
const {poolChoices,poolUrls}=require('./pool-catalog.cjs');
const {PUBLIC_API:YSR_API,LEGACY_API:YSR_LEGACY_API}=require('./ysr-protocol.cjs');
const ORIGIN='https://pool.kryptex.com',INTERVAL=60000;
function accountFor(config){
 const coin=config.coin,wallet=config.wallets?.[coin]||'';const gozero=require('./gozero-account.cjs').identify(config);if(gozero)return gozero;
 if(coin==='ZCD')return{coin,source:'Zycord',reason:'ZCD 矿池账本接口待适配；填入矿池后可挖矿，余额与支付请到该矿池查询'};
 // The Gozero mining gateway does not expose /account (verified 404). This is
 // explicitly the official chain ledger, not a gateway-specific payout balance.
 if(coin==='YSR'){if(!require('./ysr.cjs').validAddress(wallet))return{coin,reason:'保存有效 YSR 地址后查询链上收益'};const pool=config.pools.YSR;if(![YSR_API,YSR_LEGACY_API].includes(pool))return{coin,reason:'自定义 YSR 节点暂未适配账本查询'};return{coin,wallet,api:YSR_LEGACY_API,key:coin+':'+pool+':'+wallet,source:'YSKAR 节点',page:'https://www.yskar.app/explorer#adr-'+encodeURIComponent(wallet)}}
 if(coin==='NOID'){if(!require('./noid.cjs').validWallet(wallet))return{coin,reason:'保存有效 NOID 地址后查询 Suprnova 账本'};const urls=poolUrls(config),supported=urls.some(url=>{const h=new URL(url).hostname;return h==='noid.suprnova.cc'||/^stratum-(apac|us|eu2)\.suprnova\.cc$/.test(h)});if(!supported)return{coin,reason:'当前矿池尚未适配地址账本接口'};return{coin,wallet,key:coin+':'+wallet,source:'Suprnova',mixed:urls.some(url=>!new URL(url).hostname.endsWith('.suprnova.cc')),page:'https://noid.suprnova.cc/YourStats#noid/dashboard?address='+encodeURIComponent(wallet)}}
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
 constructor(request,changed=()=>{},clock=Date.now){this.request=request;this.changed=changed;this.clock=clock;this.gozero=new (require('./gozero-account.cjs').GozeroAccount)(request,changed,clock);this.cache=new Map();this.current={reason:'保存收款地址后自动查询矿池账本'};this.stopped=false}
 configure(config){this.current=accountFor(config);this.gozero.configure(this.current);this.refresh().catch(()=>{});this.changed()}
 snapshot(){
  const a=this.current;if(a.adapter==='gozero')return this.gozero.snapshot(a);const c=this.cache.get(a.key),now=this.clock();
  return{coin:a.coin,source:a.source||'Kryptex',supported:!!a.key,reason:a.reason||null,address:a.wallet?`${a.wallet.slice(0,8)}…${a.wallet.slice(-6)}`:null,mixed:!!a.mixed,loading:!!c?.pending,sections:Object.fromEntries(['balance','stats','payouts'].map(k=>{const d=c?.[k];return[k,d?{...d,stale:!!d.error||!d.at||now-d.at>180000}:null]}))};
 }
 async refresh(){
  const a=this.current;if(!a.key||this.stopped)return this.snapshot();if(a.adapter==='gozero'){await this.gozero.refresh(a);return this.snapshot()}
  let c=this.cache.get(a.key);if(!c){c={attempt:null};this.cache.set(a.key,c);if(this.cache.size>6)this.cache.delete(this.cache.keys().next().value)}
  if(c.pending)return c.pending;
  if(c.attempt!==null&&this.clock()-c.attempt<INTERVAL)return this.snapshot();
  c.attempt=this.clock();
  const work=async()=>{
   if(a.coin==='YSR'){try{const raw=JSON.parse((await this.request(a.api+'/api/v2/account/'+encodeURIComponent(a.wallet),{maxBytes:512*1024,timeout:12000})).toString('utf8'));if(this.stopped)return;const data=require('./ysr.cjs').account(raw,a.wallet);for(const kind of ['balance','stats','payouts'])c[kind]={value:data[kind],at:this.clock(),error:null}}catch{if(!this.stopped)for(const kind of ['balance','stats','payouts'])c[kind]={...c[kind],error:'YSR 节点账本暂不可用'}}return}

   if(a.coin==='NOID'){const base='https://noid.suprnova.cc/api/pools/noid/miners/'+encodeURIComponent(a.wallet);await Promise.all([['balance','stats'],['payouts']].map(async kinds=>{try{const raw=JSON.parse((await this.request(base+(kinds[0]==='payouts'?'/payments':''),{maxBytes:512*1024,timeout:12000})).toString('utf8'));if(this.stopped)return;for(const kind of kinds)c[kind]={value:require('./noid.cjs').account(kind,raw),at:this.clock(),error:null}}catch{if(!this.stopped)for(const kind of kinds)c[kind]={...c[kind],error:'NOID 矿池接口暂不可用'}}}));return}
   await Promise.all(['balance','stats','payouts'].map(async kind=>{
    const address=encodeURIComponent(a.wallet),route=kind==='balance'?`balance/${address}`:kind==='stats'?`payouts/${address}/stats`:`payouts/${address}?page=1`;
    try{const raw=await this.request(`${ORIGIN}/${a.coin.toLowerCase()}/api/v1/miner/${route}`,{maxBytes:512*1024,timeout:12000});if(this.stopped)return;c[kind]={value:normalize(kind,JSON.parse(raw.toString())),at:this.clock(),error:null}}
    catch(e){if(!this.stopped)c[kind]={...c[kind],error:/HTTP \d{3}/.exec(e.message)?.[0]||'接口暂不可用，请稍后重试'}}
   }));
  };
  c.pending=work().finally(()=>{c.pending=null;if(!this.stopped)this.changed()});this.changed();await c.pending;return this.snapshot();
 }
 url(){if(!this.current.page)throw Error('当前地址暂无已适配账单页面');return this.current.page}
 async setPage(page){const a=this.current;if(a.adapter!=='gozero')throw Error('当前来源不支持翻页');await this.gozero.setPage(a,page);return this.snapshot()}
 start(){this.timer=setInterval(()=>this.refresh().catch(()=>{}),5000)}
 stop(){this.stopped=true;clearInterval(this.timer);this.cache.clear();this.gozero.stop()}
}
module.exports={PoolAccount,accountFor,normalize};
