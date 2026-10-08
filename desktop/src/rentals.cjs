'use strict';
// Public catalogue requests stay in the main process. No provider-supplied URL is opened.
const LINKS=Object.freeze({clore:'https://clore.ai/register?ref_id=ebgzlv4d',vast:'https://cloud.vast.ai/?ref_id=133254',gpu:'https://gozero.trade/scash?view=gpu-rentals',cpu:'https://gozero.trade/scash?view=cpu-rentals'});
const TTL=60000,MAX_CACHE=48;
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const text=(v,max=160)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max):'';
function externalLink(id){if(typeof id!=='string'||!Object.hasOwn(LINKS,id))throw Error('Invalid rental link');return LINKS[id]}
function query(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid rental query');
 const choice=(k,list,fallback)=>{const v=input[k]??fallback;if(!list.includes(v))throw Error('Invalid '+k);return v};
 const q={kind:choice('kind',['gpu','cpu'],'gpu'),provider:choice('provider',['all','clore','vast'],'all'),rental:choice('rental',['on_demand','spot'],'on_demand'),sort:choice('sort',['perGpu','price','priceDesc','ram','cores','threads','count','vram','newest'],'perGpu'),model:choice('model',['','RTX 4090','RTX 5090','RTX 3090'],''),q:input.q??'',country:input.country??'',page:input.page??1,brand:choice('brand',['','AMD','Intel','ARM','Other'],'')};
 if(typeof q.q!=='string'||q.q.length>80||/[\u0000-\u001f\u007f]/.test(q.q))throw Error('Invalid search');q.q=q.q.trim();
 if(typeof q.country!=='string'||!/^([A-Z]{2})?$/.test(q.country))throw Error('Invalid country');
 if(!Number.isSafeInteger(q.page)||q.page<1||q.page>10000)throw Error('Invalid page');
 q.limit=input.limit??6;if(!Number.isSafeInteger(q.limit)||q.limit<1||q.limit>96)throw Error('Invalid page size');
 for(const k of ['minVram','minRam','minCount','minThreads','maxPrice']){const v=input[k]??'';if(v!==''&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1000000))throw Error('Invalid '+k);q[k]=v}
 if(q.kind==='cpu'&&q.sort==='perGpu')q.sort='price';
 return q;
}
function apiUrl(q){
 const p=new URLSearchParams({provider:q.provider,q:q.q,country:q.country,sort:q.sort,currency:'USD',rental:q.rental,available:'1',page:String(q.page),limit:String(q.limit),maxPrice:String(q.maxPrice),minRam:String(q.minRam)});
 if(q.kind==='gpu'){p.set('model',q.model);p.set('minVram',String(q.minVram));p.set('minCount',String(q.minCount));p.set('income','0')}
 else{p.set('minThreads',String(q.minThreads));p.set('brand',q.brand);p.set('scope','all')}
 return 'https://gozero.trade/api/'+q.kind+'-rentals?'+p;
}
function normalize(raw,q,now=Date.now()){
 if(!raw||!Array.isArray(raw.items)||raw.items.length>200)throw Error('Invalid rental response');
 const seen=new Set();
 const items=raw.items.slice(0,q.limit).flatMap(x=>{
  const provider=x.provider||'clore',id=String(x.id??'');
  if(!['clore','vast'].includes(provider)||!/^\d{1,20}$/.test(id))return[];
  const key=provider+':'+id;if(seen.has(key))return[];seen.add(key);
  const price=finite(x.prices?.[q.rental]?.USD),reliability=finite(x.reliability);
  return[{key,id,provider,model:text(q.kind==='gpu'?x.gpu:x.cpuModel||x.cpu),gpu:text(x.gpu),cpu:text(x.cpu),count:finite(x.count),vram:finite(x.gpuMemory),ram:finite(x.ram),cores:finite(x.cores),threads:finite(x.threads),vcpus:finite(x.effectiveVcpus),disk:text(x.disk),diskCapacity:finite(x.diskCapacity),diskSpeed:finite(x.diskSpeed),cuda:text(x.cuda,24),pcie:text(x.pcie,24),country:/^[A-Z]{2}$/.test(x.country)?x.country:'',down:finite(x.down),up:finite(x.up),maxHours:finite(x.maxHours),price,reliability:reliability!==null&&reliability<=1?reliability:null,available:x.wholeAvailable===true||(finite(x.available)>0),stale:!!x.sourceStale,storage:finite(x.storageUsdGbMonth),download:finite(x.downloadUsdGb),upload:finite(x.uploadUsdGb)}];
 });
 const total=finite(raw.total)??items.length;
 const s=raw.summary||{};
 return{kind:q.kind,items,total,page:finite(raw.page)||q.page,pages:Math.max(1,finite(raw.pages)||Math.ceil(total/q.limit)),summary:{machines:finite(s.machines),available:finite(s.available),models:finite(s.models),lowest:finite(q.kind==='gpu'?s.lowest_per_gpu:s.lowest_machine)},countries:(Array.isArray(raw.countries)?raw.countries:[]).slice(0,250).map(c=>typeof c==='string'?c:typeof c?.code==='string'?c.code:'').filter(c=>/^[A-Z]{2}$/.test(c)),at:finite(raw.updated_at)?raw.updated_at*1000:now,fetchedAt:now,stale:!!raw.stale,loading:!!raw.loading,sources:(raw.sources||[]).slice(0,4).map(s=>({provider:text(s.provider,16),status:text(s.status,32),limited:!!s.limited})),error:null};
}
class Rentals{
 constructor(request,clock=Date.now){this.request=request;this.clock=clock;this.cache=new Map();this.pending=new Map()}
 async get(input){
  const q=query(input),url=apiUrl(q),now=this.clock(),cached=this.cache.get(url);
  if(cached&&now-cached.checkedAt<(cached.data.loading?3000:TTL))return{...cached.data,cached:true};
  if(this.pending.has(url))return this.pending.get(url);
  if(this.pending.size>=3)throw Error('Rental requests busy; retry shortly');
  const job=Promise.resolve().then(async()=>{
   try{
    const bytes=await this.request(url,{maxBytes:2*1024*1024,timeout:18000});
    const data=normalize(JSON.parse(bytes.toString('utf8')),q,this.clock());
    this.cache.delete(url);this.cache.set(url,{checkedAt:this.clock(),data});
    while(this.cache.size>MAX_CACHE)this.cache.delete(this.cache.keys().next().value);
    return data;
   }catch(e){
    if(cached){const data={...cached.data,stale:true,error:'Rental data temporarily unavailable'};this.cache.set(url,{checkedAt:this.clock(),data});return data}
    throw Error('Rental data temporarily unavailable');
   }finally{this.pending.delete(url)}
  });
  this.pending.set(url,job);return job;
 }
}
module.exports={Rentals,query,apiUrl,normalize,externalLink,LINKS,TTL};
