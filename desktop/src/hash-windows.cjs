'use strict';
// Fixed, non-overlapping windows. Integrate each GPU independently so uneven
// log cadence cannot overweight a device or turn a missing device into a total.
const FRESH_MS=60000;
class HashWindows{
 constructor(ids,minutes=5,now=Date.now()){
  this.ms=minutes*60000;this.start=now;this.cursor=now;this.running=true;this.last=null;this.lastAttempt=null;
  this.rows=new Map(ids.map(id=>[id,{id,hash:null,at:null,area:0,covered:0,count:0}]));
 }
 result(end){
  const duration=Math.max(0,end-this.start),devices=[...this.rows.values()].map(r=>({id:r.id,hash:r.covered>0?r.area/r.covered:null,coverage:duration?r.covered/duration:0,samples:r.count}));
  return{from:this.start,to:end,hash:devices.length&&devices.every(r=>r.hash!==null)?devices.reduce((n,r)=>n+r.hash,0):null,coverage:devices.length?Math.min(...devices.map(r=>r.coverage)):0,devices};
 }
 advance(now){
  if(!this.running||!Number.isFinite(now)||now<this.cursor)return;
  while(this.cursor<now){
   const end=Math.min(now,this.start+this.ms);
   for(const r of this.rows.values())if(r.hash!==null){const dt=Math.max(0,Math.min(end,r.at+FRESH_MS)-this.cursor);r.area+=r.hash*dt;r.covered+=dt}
   this.cursor=end;
   if(end===this.start+this.ms){
    const result=this.result(end);this.lastAttempt=end;if(result.hash!==null)this.last=result;
    this.start=end;for(const r of this.rows.values()){r.area=0;r.covered=0;r.count=0}
    // Sleep/clock jumps cannot generate unbounded empty windows.
    if(now-this.start>this.ms*2){this.start+=Math.floor((now-this.start)/this.ms)*this.ms;this.cursor=this.start;for(const r of this.rows.values()){r.hash=null;r.at=null}}
   }
  }
 }
 sample(id,t,now=Date.now()){
  const r=this.rows.get(id);
  if(!this.running||!r||!Number.isFinite(t?.hash)||t.hash<0||!Number.isFinite(t.at)||t.at>now||t.at<this.cursor||(r.at!==null&&t.at<=r.at))return;
  this.advance(t.at);r.hash=t.hash;r.at=t.at;r.count++;
 }
 unavailable(id,now=Date.now()){this.advance(now);const r=this.rows.get(id);if(r){r.hash=null;r.at=null}}
 stop(now=Date.now()){this.advance(now);this.running=false}
 snapshot(now=Date.now()){
  this.advance(now);const partial=this.result(this.cursor),display=this.last||partial;
  const fresh=this.running&&this.rows.size>0&&[...this.rows.values()].every(r=>r.hash!==null&&now-r.at<FRESH_MS);
  return{...display,minutes:this.ms/60000,complete:!!this.last,running:this.running,fresh,retained:!!this.last&&this.lastAttempt>this.last.to,elapsedMs:this.cursor-this.start,remainingMs:this.ms-(this.cursor-this.start)};
 }
}
module.exports={HashWindows,FRESH_MS};
