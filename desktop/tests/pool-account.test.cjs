const {test}=require('node:test'),assert=require('node:assert/strict');
const {PoolAccount,normalize,accountFor}=require('../src/pool-account.cjs');
const {DEFAULT,validate}=require('../src/config.cjs');
const wallet='qznnTestPublicAddressNotUsedForNetwork123';
const config=()=>({...structuredClone(DEFAULT),coin:'QTC',wallets:{QTC:wallet}});
const reply=url=>Buffer.from(JSON.stringify(url.includes('/balance/')?{confirmed:0.00001,unconfirmed:0,threshold:.1}:url.endsWith('/stats')?{paid:2,reward:{week:3,month:4}}:{count:1,results:[{received:2,date:1700000000,status:'FINISHED',txid:'abcdef1234'}]}));
test('public account routes are fixed to configured coins and known pool endpoints',()=>{
 assert.equal(accountFor(config()).page,'https://pool.kryptex.com/qtc/miner/payouts/'+wallet);
 assert.ok(accountFor({...config(),wallets:{QTC:''}}).reason);
 assert.ok(accountFor({...config(),coin:'TSC'}).reason);
 assert.ok(accountFor({...config(),pools:{QTC:'stratum+ssl://evil-kryptex.network:8049'},poolBackups:{QTC:[]}}).reason);
 assert.ok(accountFor({...config(),wallets:{QTC:'../other'}}).reason);
});
test('normalization keeps small real balances, zero, pending amounts and payment status separate',()=>{
 assert.deepEqual(normalize('balance',{confirmed:1e-8,unconfirmed:0,threshold:.1}),{confirmed:1e-8,pending:0,threshold:.1});
 const p=normalize('payouts',{count:2,results:[{received:1.2,date:1700000000,status:'FINISHED',txid:'abc'},{received:0,date:1700000001,status:'NEW',txid:'<script>'}]});
 assert.equal(p.rows[0].status,'已支付');assert.equal(p.rows[0].at,1700000000000);assert.equal(p.rows[1].status,'待确认');assert.equal(p.rows[1].txid,null);
 assert.throws(()=>normalize('balance',{}));assert.throws(()=>normalize('stats',{paid:NaN}));assert.throws(()=>normalize('payouts',{count:-1,results:[]}));
});
test('automatic queries coalesce, respect cadence, preserve source failures and never mix addresses',async()=>{
 let now=1000,calls=0,fail=false;const a=new PoolAccount(async url=>{calls++;assert.match(url,/^https:\/\/pool\.kryptex\.com\/qtc\/api\/v1\/miner\//);if(fail&&url.includes('/balance/'))throw Error('private raw URL error');return reply(url)},()=>{},()=>now);
 a.configure(config());await Promise.all([a.refresh(),a.refresh()]);assert.equal(calls,3);let s=a.snapshot();assert.equal(s.sections.balance.value.confirmed,.00001);assert.equal(s.sections.payouts.value.rows[0].amount,2);assert.ok(!JSON.stringify(s).includes(wallet));
 await a.refresh();assert.equal(calls,3);now+=60000;fail=true;await a.refresh();s=a.snapshot();assert.equal(s.sections.balance.stale,true);assert.equal(s.sections.balance.value.confirmed,.00001);assert.equal(s.sections.stats.stale,false);assert.ok(!JSON.stringify(s).includes('private'));
 a.configure({...config(),wallets:{QTC:''}});assert.equal(a.snapshot().supported,false);assert.equal(a.snapshot().sections.balance,null);a.stop();
});
test('switching addresses while fetch is pending cannot show an earlier wallet result',async()=>{
 const queued=[];const a=new PoolAccount(url=>new Promise(resolve=>queued.push(()=>resolve(reply(url)))),()=>{});
 a.configure(config());const first=a.refresh();a.configure({...config(),wallets:{QTC:''}});queued.forEach(done=>done());await first;assert.equal(a.snapshot().sections.balance,null);assert.throws(()=>a.url());a.stop();
});
test('90C is the new default while saved protection thresholds remain unchanged',()=>{
 assert.equal(DEFAULT.temperature,90);assert.equal(validate({}).temperature,90);assert.equal(validate({...DEFAULT,temperature:82}).temperature,82);
});
