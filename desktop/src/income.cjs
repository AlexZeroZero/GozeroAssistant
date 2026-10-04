'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const URL='https://pro.gozero.trade/api/hardware/state';
const canonical=s=>String(s).toLowerCase().replace(/\(r\)|\(tm\)|[®™]/g,'').replace(/\b(nvidia|amd|intel|geforce|radeon)\b/g,'').replace(/[^a-z0-9]/g,'');
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
function matchDevice(device,rows){const key=canonical(device.name);const matches=rows.filter(r=>r.kind==='GPU'&&canonical(r.name)===key);return matches.length===1?matches[0]:null}
function evaluate(data,hardware,config,benchmark=null,networks=[]){
 const {RATE,kernelFee}=require('./service-fee.cjs');const devices=hardware.gpus.filter(d=>config.selected.includes(d.id));
 return{at:data?.receivedAt||null,sources:data?.sources||[],fx:data?.fx||null,coins:['PRL','QTC','TSC','NOID'].map(coin=>{
  const n=networks.find(n=>n.coin===coin),rows=devices.map(d=>{
   const ref=matchDevice(d,data?.devices||[]),p=ref?.profiles?.find(p=>p.coin===coin),m=benchmark?.coin===coin?benchmark.devices.find(x=>x.id===d.id):null,manual=config.manualInputs?.[coin]?.[d.id];
   const unit=coin==='TSC'?'N/s':'H/s',measured=!!(m&&finite(m.hash)&&(m.unit||'H/s')===unit),typed=!measured&&!!manual;
   const model=n?.models?matchDevice(d,n.models.map(r=>({...r,kind:'GPU'}))):null;
   const hash=measured?m.hash:typed?manual.hash:(model?.hash??p?.hash??null),watts=measured?(finite(m.watts)?m.watts:null):typed?manual.watts:(model?.watts??p?.watts??null);
   let dailyCoins=null,gross=null,source=null,at=null,stale=false,basis=null;
   if(finite(hash)&&finite(n?.coinsPerUnitDay)&&n.unit===unit){dailyCoins=hash*n.coinsPerUnitDay;gross=finite(n.price)?dailyCoins*n.price:null;source=n.basis;at=n.referenceAt;stale=!!n.referenceStale||!!n.priceStale||(coin!=='TSC'&&!!n.networkStale);basis=n.basis}
   else if(p&&finite(p.grossUsd)&&finite(hash)&&p.hash>0&&p.unit===unit){gross=p.grossUsd*hash/p.hash;dailyCoins=finite(p.dailyCoins)?p.dailyCoins*hash/p.hash:null;source=p.source||ref.source;at=p.at||ref.at;stale=!!p.stale||!!ref.stale||Date.now()-(at||0)>900000;basis='来源同算法单位算力收益 × 本机/输入/参考算力'}
   return{id:d.id,name:d.name,matched:gross!==null,algorithm:n?.algorithm||p?.algorithm||null,hash,unit,watts:finite(watts)?watts:null,gross,dailyCoins,measured,manual:typed,source,sourceUrl:n?.sourceUrl||ref?.sourceUrl||null,at,stale,basis};
  });
  const complete=rows.length>0&&rows.every(r=>finite(r.gross)),watts=config.manualWatts??(rows.length&&rows.every(r=>finite(r.watts))?rows.reduce((s,r)=>s+r.watts,0):null),gross=complete?rows.reduce((s,r)=>s+r.gross,0):null,cost=watts===null?null:watts/1000*24*config.electricity;
  const kernel=coin==='TSC'?null:kernelFee({...config,coin}),afterService=gross===null?null:gross*(1-RATE),afterKernel=afterService===null||kernel===null?null:afterService*(1-kernel),afterPool=afterKernel===null?null:afterKernel*(1-config.poolFee/100);
  const dailyCoins=rows.length&&rows.every(r=>finite(r.dailyCoins))?rows.reduce((s,r)=>s+r.dailyCoins,0):null;
  return{coin,rows,matched:rows.filter(r=>r.matched).length,total:rows.length,gross,watts,cost,dailyCoins,serviceFeeRate:RATE,serviceFeeUsd:gross===null?null:gross*RATE,kernelFeeRate:kernel,net:afterPool!==null&&cost!==null?afterPool-cost:null,stale:rows.some(r=>r.stale),network:n||null,basis:config.manualWatts!==null?'用户填写整机功耗':'所选算力来源功耗；不含整机其他配件'};
 })};
}
class Income{constructor(dir,request){this.file=path.join(dir,'income-cache.json');this.request=request;this.data=null;this.checked=0;this.pending=null;this.error=null}async load(){try{const d=JSON.parse(await fs.readFile(this.file,'utf8'));if(Array.isArray(d.devices)&&d.devices.length<=10000)this.data=d}catch{}}async refresh(){if(this.pending)return this.pending;if(Date.now()-this.checked<60000&&this.data)return this.data;this.pending=(async()=>{this.checked=Date.now();try{const d=JSON.parse((await this.request(URL,{maxBytes:16*1024*1024})).toString('utf8'));if(!Array.isArray(d.devices)||d.devices.length>10000||!Array.isArray(d.sources))throw Error('收益源数据结构无效');this.data=d;this.error=null;await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file+'.tmp',JSON.stringify(d));await fs.rename(this.file+'.tmp',this.file);return d}catch(e){this.error=e.message;if(!this.data)throw e;return this.data}finally{this.pending=null}})();return this.pending}result(hw,cfg,benchmark,networks=[]){return{...evaluate(this.data,hw,cfg,benchmark,networks),error:this.error,checkedAt:this.checked}}}
module.exports={Income,evaluate,matchDevice,canonical,URL};
