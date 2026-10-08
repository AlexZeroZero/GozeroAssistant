'use strict';
const ORIGIN='https://pool.gozero.trade';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const str=v=>typeof v==='string'?v.slice(0,1500):null;
function amount(v){if(typeof v!=='string'||!/^\d{1,80}$/.test(v))return null;const n=BigInt(v);return(n/100000000n).toString()+'.'+(n%100000000n).toString().padStart(8,'0')}
function identify(config){
 const coin=config.coin;if(!['YSR','ZCD','BNT'].includes(coin))return null;
 const pool=config.pools?.[coin];let url;try{url=new URL(pool)}catch{return null}
 const host=coin.toLowerCase()+'.pool.gozero.trade';
 if(url.hostname!==host||(coin==='YSR'?url.protocol!=='https:':!['stratum+tcp:','stratum+ssl:','stratum+tls:'].includes(url.protocol)))return null;
 const wallet=config.wallets?.[coin]||'';let valid=false;try{valid=coin==='YSR'?require('./ysr.cjs').validAddress(wallet):coin==='ZCD'?require('./zcd.cjs').validAddress(wallet):!!require('./bnt.cjs').address(wallet)}catch{}
 if(!valid)return{coin,source:'Gozero Pool',reason:'保存有效收款地址后查询矿池账本'};
 const mixed=(config.poolBackups?.[coin]||[]).some(p=>{try{return new URL(p).hostname!==host}catch{return true}});
 return{coin,wallet,key:'gozero:'+coin+':'+wallet,adapter:'gozero',source:'Gozero Pool',mixed,page:ORIGIN+'/?'+new URLSearchParams({coin:coin.toLowerCase(),address:wallet})+'#wallet'};
}
function normalize(kind,raw,coin,wallet){
 if(!object(raw))throw Error('矿池返回格式无效');
 if(raw.address&&raw.address!==wallet||raw.account?.address&&raw.account.address!==wallet)throw Error('矿池返回地址不匹配');
 if(raw.available===false)throw Error('矿池数据暂不可用');
 if(kind==='mining'){
  if(!Array.isArray(raw.workers)||!Object.hasOwn(raw,'hashrate'))throw Error('矿池算力字段缺失');
  const rate=r=>num(r.displayHashrate)??num(r.hashrate);
  return{hash:rate(raw),shortHash:num(raw.hashrate),averages:Object.fromEntries(['m15','h1','h24'].map(k=>[k,num(raw.averages?.[k])])),online:num(raw.onlineWorkers),active:num(raw.activeWorkers),offline:num(raw.offlineWorkers),accepted:num(raw.accepted),rejected:num(raw.rejected),rejectRate:num(raw.rejectRate),note:str(raw.note),
   workers:raw.workers.slice(0,200).filter(object).map(r=>({id:str(r.id),name:str(r.name)||str(r.id),platform:str(r.platform),online:typeof r.online==='boolean'?r.online:null,hash:rate(r),accepted:num(r.accepted),rejected:num(r.rejected),lastShare:num(r.lastShare),lastSeen:num(r.lastSeen)})),
   history:(Array.isArray(raw.history)?raw.history:[]).filter(r=>object(r)&&num(r.t)!==null&&num(r.hashrate)!==null).slice(-1440).map(r=>({t:r.t,hashrate:r.hashrate}))};
 }
 if(kind==='wallet'){
  const b=coin==='YSR'?raw.account:raw.balance;if(!object(b))throw Error('矿池余额字段缺失');
  return coin==='YSR'?{confirmed:amount(b.balance),pending:null,reserved:null,paid:null,note:str(raw.note),historyDepth:num(b.historyDepth)}:{confirmed:amount(b.available),pending:amount(b.immature),reserved:amount(b.reserved),paid:amount(b.paid),matureTotal:amount(b.mature_total),note:str(raw.note)};
 }
 if(kind==='payments'){
  if(!Array.isArray(raw.records)||!Number.isSafeInteger(raw.total)||raw.total<0)throw Error('支付记录格式无效');
  return{count:raw.total,page:Math.max(1,num(raw.page)||1),pages:Math.max(1,num(raw.pages)||1),totalAmount:amount(raw.totalAmount),complete:raw.complete===true,indexedBlocks:num(raw.indexedBlocks),poolBlocks:num(raw.poolBlocks),note:str(raw.note),rows:raw.records.slice(0,100).filter(object).map(r=>({at:/^\d{1,12}$/.test(String(r.timestamp))?Number(r.timestamp)*1000:null,amount:amount(r.amount),txid:typeof r.txid==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(r.txid)?r.txid:null,confirmations:num(r.confirmations),status:r.state==='confirmed'?'已支付':r.state==='submitted'?'已广播 / 待确认':r.state==='signed'?'已签名 / 未支付':r.state==='reserved'?'已预留 / 未支付':coin==='YSR'&&!r.state?'链上奖励':'待确认'}))};
 }
 const p=raw.settlement;if(coin!=='YSR'&&!object(p))throw Error('矿池支付规则暂不可用');
 return{threshold:coin==='ZCD'?amount(p.minimum):coin==='BNT'&&num(p.minPayout)!==null?p.minPayout.toFixed(8):null,maturity:num(p?.maturity)??num(p?.confirmations),safety:num(p?.safety),enabled:typeof p?.enabled==='boolean'?p.enabled:null,window:str(p?.window)};
}
class GozeroAccount{
 constructor(request,changed,clock=Date.now){Object.assign(this,{request,changed,clock});this.cache=new Map();this.epoch=0;this.key=null;this.stopped=false}
 configure(a){const key=a?.adapter==='gozero'?a.key:null;if(this.key!==key){this.key=key;this.epoch++}}
 entry(a){if(!this.cache.has(a.key)){this.cache.set(a.key,{page:1,sections:{}});if(this.cache.size>6)this.cache.delete(this.cache.keys().next().value)}return this.cache.get(a.key)}
 async refresh(a){if(this.stopped||a.key!==this.key)return;const c=this.entry(a);await Promise.all(['mining','wallet','payments','overview'].map(k=>this.read(a,c,k,k==='payments'?c.page:1)));}
 async read(a,c,kind,page){
  const key=kind==='payments'?kind+':'+page:kind,period=kind==='mining'?30000:60000;
  const s=c.sections[key]||(c.sections[key]={next:0,failures:0});if(s.pending)return s.pending;if(this.clock()<s.next)return;
  const epoch=this.epoch,q=new URLSearchParams({address:a.wallet});if(kind==='payments')q.set('page',page);
  const url=ORIGIN+'/portal-api/'+a.coin.toLowerCase()+'/'+kind+(kind==='overview'?'':'?'+q);
  const valid=()=>!this.stopped&&this.epoch===epoch&&this.key===a.key;
  s.pending=(async()=>{try{
   const raw=JSON.parse((await this.request(url,{maxBytes:2*1024*1024,timeout:25000})).toString('utf8'));
   if(!valid())return;if(raw?.error)throw Error('矿池数据暂不可用');const value=normalize(kind,raw,a.coin,a.wallet);
   if(kind==='payments'&&value.page!==page)throw Error('矿池支付页码不匹配');
   const bad=raw.stale===true||!!raw.error;
   s.value=value;s.at=num(raw.updatedAt)??num(raw.queriedAt)??this.clock();s.error=raw.error?'矿池数据暂不可用':null;s.sourceStale=bad;s.failures=bad?s.failures+1:0;
   s.next=this.clock()+(bad?Math.min(900000,period*2**Math.min(s.failures,4)):period);
  }catch(e){if(valid()){s.error=/HTTP \d{3}/.exec(e.message)?.[0]||'矿池数据暂不可用';s.failures++;s.next=this.clock()+Math.min(900000,period*2**Math.min(s.failures,4))}}
  finally{s.pending=null;if(valid())this.changed()}})();this.changed();return s.pending;
 }
 snapshot(a){
  const c=this.entry(a),now=this.clock();
  const section=(key,period)=>{const s=c.sections[key];return s?{value:s.value||null,at:s.at||null,error:s.error||null,loading:!!s.pending,stale:!!s.error||!!s.sourceStale||!s.at||now-s.at>period*3}:null};
  const balance=section('wallet',60000),payouts=section('payments:'+c.page,60000),policy=section('overview',60000);
  const source=a.coin==='YSR'?(payouts?.value?payouts:section('payments:1',60000)):balance,stats=source?{...source,value:source.value?{paid:a.coin==='YSR'?source.value.totalAmount:source.value.paid,week:null,month:null}:null}:null;
  return{coin:a.coin,source:a.source,adapter:'gozero',supported:true,address:a.wallet.slice(0,8)+'…'+a.wallet.slice(-6),mixed:a.mixed,loading:Object.values(c.sections).some(s=>s.pending),sections:{balance,stats,payouts,policy,mining:section('mining',30000)}};
 }
 async setPage(a,page){if(!Number.isSafeInteger(page)||page<1||page>100000)throw Error('无效支付页码');const c=this.entry(a),p=c.sections['payments:'+c.page]?.value;if(page>(p?.pages||1))throw Error('支付页码超出范围');c.page=page;await this.read(a,c,'payments',page);return this.snapshot(a)}
 stop(){this.stopped=true;this.epoch++;this.cache.clear()}
}
module.exports={ORIGIN,amount,identify,normalize,GozeroAccount};
