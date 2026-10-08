'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Rentals,query,apiUrl,normalize,externalLink,LINKS,TTL}=require('../src/rentals.cjs');
const fixture={items:[{id:42,provider:'vast',gpu:'RTX 4090',count:2,gpuMemory:24,ram:64,cpu:'CPU',effectiveVcpus:16,country:'JP',wholeAvailable:true,prices:{on_demand:{USD:12},spot:{USD:8}},reliability:.999,maxHours:168,source_url:'javascript:alert(1)'}],summary:{machines:10,available:5,models:2,lowest_per_gpu:6},total:7,page:1,pages:2,updated_at:1700000000,countries:['JP','US']};

test('rental page capacity is bounded and preserved through the API and normalization',()=>{
 for(const limit of [1,6,12,48,96]){
  const q=query({limit});assert.equal(new URL(apiUrl(q)).searchParams.get('limit'),String(limit));
  const raw={...fixture,pages:undefined,total:120,items:Array.from({length:120},(_,i)=>({...fixture.items[0],id:i+1}))};
  const result=normalize(raw,q);assert.equal(result.items.length,limit);assert.equal(result.pages,Math.ceil(120/limit));
 }
 for(const limit of [0,97,1.5,Infinity,'12'])assert.throws(()=>query({limit}));
});
test('rental queries use only fixed catalogue URLs and bounded validated parameters',()=>{
 const q=query({kind:'gpu',model:'RTX 4090',q:'a&provider=evil',sort:'priceDesc'}),u=new URL(apiUrl(q));assert.equal(u.origin,'https://gozero.trade');assert.equal(u.pathname,'/api/gpu-rentals');assert.equal(u.searchParams.get('q'),'a&provider=evil');assert.equal(u.searchParams.get('provider'),'all');assert.equal(u.searchParams.get('model'),'RTX 4090');assert.equal(u.searchParams.get('limit'),'6');assert.equal(u.searchParams.get('income'),'0');
 for(const bad of [{kind:'file'},{provider:'__proto__'},{model:'javascript:'},{sort:'random'},{country:'JP&x=1'},{q:'a'.repeat(81)},{q:'a\n'},{page:0},{page:1.5},{minRam:-2},{maxPrice:Infinity},{minThreads:'64'}])assert.throws(()=>query(bad));
 const cpu=new URL(apiUrl(query({kind:'cpu',brand:'AMD',minThreads:64})));assert.equal(cpu.searchParams.get('sort'),'price');assert.equal(cpu.searchParams.get('brand'),'AMD');assert.equal(cpu.searchParams.get('minThreads'),'64');assert.equal(cpu.searchParams.get('model'),null);
});
test('rental normalization preserves unknown values and never trusts provider links',()=>{
 const d=normalize(fixture,query({}));assert.equal(d.items[0].price,12);assert.equal(d.items[0].cores,null);assert.equal(d.items[0].threads,null);assert.equal(d.items[0].vcpus,16);assert.equal(d.items[0].url,undefined);assert.equal(d.items[0].reliability,.999);assert.equal(d.summary.lowest,6);
 assert.equal(normalize(fixture,query({rental:'spot'})).items[0].price,8);
 const bad={...fixture,items:[{...fixture.items[0],prices:{},reliability:99},{...fixture.items[0]}, {...fixture.items[0],id:'<script>'}]};const rows=normalize(bad,query({})).items;assert.equal(rows.length,1);assert.equal(rows[0].price,null);assert.equal(rows[0].reliability,null);
 assert.throws(()=>normalize({items:'bad'},query({})));
});
test('only the exact authorized rental referral links can be opened',()=>{
 assert.equal(externalLink('clore'),'https://clore.ai/register?ref_id=ebgzlv4d');assert.equal(externalLink('vast'),'https://cloud.vast.ai/?ref_id=133254');
 for(const id of ['https://evil.test','__proto__','constructor','file:///C:/Windows','javascript:alert(1)',{},null])assert.throws(()=>externalLink(id));assert.equal(Object.keys(LINKS).length,4);
});
test('catalogue requests coalesce, expire, retain stale data, and never substitute another filter',async()=>{
 let clock=100000,calls=0,fail=false,release;const service=new Rentals(async()=>{calls++;if(release)await new Promise(r=>release=r);if(fail)throw Error('offline');return Buffer.from(JSON.stringify(fixture))},()=>clock);
 const [a,b]=await Promise.all([service.get({model:'RTX 4090'}),service.get({model:'RTX 4090'})]);assert.equal(calls,1);assert.deepEqual(a,b);await service.get({model:'RTX 4090'});assert.equal(calls,1);
 clock+=TTL+1;fail=true;const stale=await service.get({model:'RTX 4090'});assert.equal(calls,2);assert.equal(stale.stale,true);assert.equal(stale.items[0].price,12);assert.ok(stale.error);await assert.rejects(service.get({model:'RTX 5090'}));
 fail=false;clock+=TTL+1;assert.equal((await service.get({model:'RTX 4090'})).stale,false);
});
test('rental cache remains bounded and loading responses are refreshed promptly',async()=>{
 let now=1,calls=0;const service=new Rentals(async()=>{calls++;return Buffer.from(JSON.stringify({...fixture,loading:true}))},()=>now);
 await service.get({});now+=4000;await service.get({});assert.equal(calls,2);
 for(let i=0;i<55;i++)await service.get({q:String(i)});assert.equal(service.cache.size,48);
});
