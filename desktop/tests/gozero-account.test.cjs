const test=require('node:test'),assert=require('node:assert/strict');
const {amount,identify,normalize,GozeroAccount}=require('../src/gozero-account.cjs');
const {PoolAccount,accountFor}=require('../src/pool-account.cjs'),{validate}=require('../src/config.cjs'),{ADDRESSES}=require('../src/service-fee.cjs');
const cfg=coin=>validate({coin,wallets:{[coin]:ADDRESSES[coin]}});
const raw=(kind,coin='ZCD',at=1000)=>({mining:{available:true,stale:false,updatedAt:at,displayHashrate:12,hashrate:10,averages:{m15:null},accepted:3,rejected:null,onlineWorkers:0,workers:[],history:[{t:at,hashrate:12}]},wallet:coin==='YSR'?{account:{balance:'100000001',historyDepth:4000},queriedAt:at,note:'chain balance'}:{balance:{available:'85050558',immature:'200000000',reserved:'300000000',paid:'400000000'},queriedAt:at},payments:{records:[],total:0,page:1,pages:2,totalAmount:'900000000',complete:false,updatedAt:at},overview:{settlement:coin==='ZCD'?{minimum:'100000000',maturity:240,safety:1}:{minPayout:.1,confirmations:61},updatedAt:at}}[kind]);
test('Gozero matches exact primary host, validates addresses and isolates custom pools',()=>{
 for(const coin of ['YSR','ZCD','BNT'])assert.equal(accountFor(cfg(coin)).adapter,'gozero');
 assert.equal(identify({...cfg('BNT'),wallets:{BNT:'invalid'}}).key,undefined);
 assert.equal(identify({...cfg('ZCD'),pools:{ZCD:'stratum+tcp://zcd.pool.gozero.trade.evil:3333'}}),null);
 assert.equal(identify({...cfg('ZCD'),pools:{ZCD:'stratum+tcp://other.pool:3333'},poolBackups:{ZCD:[cfg('ZCD').pools.ZCD]}}),null);
 assert.equal(identify({...cfg('BNT'),poolBackups:{BNT:['stratum+tcp://other.pool:1234']}}).mixed,true);
});
test('smallest-unit strings retain all digits; missing values stay unknown and money classes stay separate',()=>{
 assert.equal(amount('85050558'),'0.85050558');assert.equal(amount('1'),'0.00000001');assert.equal(amount('900719925474099312345'),'9007199254740.99312345');
 for(const v of [null,undefined,85050558,'1e8','-1','bad'])assert.equal(amount(v),null);
 const b=normalize('wallet',raw('wallet'),'ZCD','test');assert.equal(b.confirmed,'0.85050558');assert.equal(b.reserved,'3.00000000');assert.equal(b.paid,'4.00000000');
 assert.equal(normalize('wallet',{balance:{}},'ZCD','test').paid,null);
 assert.equal(normalize('overview',raw('overview','BNT'),'BNT','test').threshold,'0.10000000');
 const m=normalize('mining',raw('mining'),'ZCD','test');assert.equal(m.hash,12);assert.equal(m.rejected,null);assert.equal(m.averages.h24,null);assert.equal(m.online,0);
 assert.throws(()=>normalize('wallet',{address:'other',balance:{}},'ZCD','test'),/地址/);
});
test('unconfirmed payment records never become paid; YSR total uses address-filtered index not recent ownRewards',()=>{
 const p=normalize('payments',{...raw('payments'),records:['confirmed','submitted','signed','reserved',undefined].map(state=>({state,amount:'1',timestamp:'1700000000'}))},'BNT','test');
 assert.deepEqual(p.rows.map(r=>r.status),['已支付','已广播 / 待确认','已签名 / 未支付','已预留 / 未支付','待确认']);assert.equal(p.rows[0].at,1700000000000);
 const y=normalize('wallet',{...raw('wallet','YSR'),ownRewards:[{amount:'999999999'}]},'YSR','test');assert.equal(y.confirmed,'1.00000001');assert.equal(y.paid,null);
});
test('per-section cadence, single flight, backoff and cached errors never turn into zero balances',async()=>{
 let now=1000,fail=false;const calls=[];const account=new PoolAccount(async url=>{calls.push(url);const kind=new URL(url).pathname.split('/').at(-1);if(fail&&kind==='wallet')throw Error('HTTP 429 secret');return Buffer.from(JSON.stringify(raw(kind,'ZCD',now)))},()=>{},()=>now);
 account.configure(cfg('ZCD'));await Promise.all([account.refresh(),account.refresh()]);assert.equal(calls.length,4);
 now+=30000;await account.refresh();assert.equal(calls.length,5);
 now+=30000;fail=true;await account.refresh();assert.equal(calls.length,9);
 let s=account.snapshot();assert.equal(s.sections.balance.value.confirmed,'0.85050558');assert.equal(s.sections.balance.stale,true);assert.equal(s.sections.balance.error,'HTTP 429');assert.equal(s.sections.mining.stale,false);
 now+=60000;await account.refresh();assert.equal(calls.filter(u=>u.includes('/wallet?')).length,2);
 assert.ok(calls.every(u=>u.startsWith('https://pool.gozero.trade/portal-api/zcd/')));assert.ok(!JSON.stringify(s).includes(ADDRESSES.ZCD));account.stop();
});
test('late address responses are discarded even after switching away and back; pagination is isolated',async()=>{
 let now=1000,queued=[];const a=identify(cfg('YSR'));const g=new GozeroAccount(url=>new Promise(resolve=>queued.push(()=>{const u=new URL(url),kind=u.pathname.split('/').at(-1),data=raw(kind,'YSR',now);if(kind==='payments')data.page=Number(u.searchParams.get('page'));resolve(Buffer.from(JSON.stringify(data)))})),()=>{},()=>now);
 g.configure(a);const first=g.refresh(a);g.configure(null);g.configure(a);queued.splice(0).forEach(f=>f());await first;assert.equal(g.snapshot(a).sections.balance.value,null);
 const second=g.refresh(a);queued.splice(0).forEach(f=>f());await second;assert.equal(g.snapshot(a).sections.stats.value.paid,'9.00000000');assert.equal(g.snapshot(a).sections.payouts.value.complete,false);
 const next=g.setPage(a,2);queued.splice(0).forEach(f=>f());await next;assert.equal(g.snapshot(a).sections.payouts.value.page,2);await assert.rejects(()=>g.setPage(a,3));g.stop();
});
test('HTTP 200 with upstream error preserves balances and server stale flag remains visible',async()=>{
 let now=1000,bad=false;const a=new PoolAccount(async url=>{const kind=new URL(url).pathname.split('/').at(-1),d=raw(kind,'ZCD',now);if(bad&&kind==='wallet')return Buffer.from(JSON.stringify({error:'upstream scan failed',balance:{available:'0'}}));if(bad&&kind==='mining')d.stale=true;return Buffer.from(JSON.stringify(d))},()=>{},()=>now);
 a.configure(cfg('ZCD'));await a.refresh();now+=60000;bad=true;await a.refresh();const s=a.snapshot();assert.equal(s.sections.balance.value.confirmed,'0.85050558');assert.equal(s.sections.balance.stale,true);assert.equal(s.sections.mining.stale,true);a.stop();
});
