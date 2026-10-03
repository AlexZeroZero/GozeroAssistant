'use strict';
// Bounded real samples only; shared by the renderer and offline regression tests.
(function(root){
 class HashHistory{
  constructor(){this.key=null;this.points=[];this.signature=''}
  update(miner,now=Date.now()){
   const key=miner.session?.startedAt??null;
   if(key!==this.key){this.key=key;this.points=[];this.signature=''}
   const jobs=miner.jobs||[],valid=miner.status==='running'&&jobs.length>0&&jobs.every(j=>j.status==='running'&&Number.isFinite(j.telemetry?.hash)&&j.telemetry.hash>=0&&j.telemetry.at<=now&&now-j.telemetry.at<20000);
   if(!valid){if(this.points.length&&this.points.at(-1).value!==null)this.points.push({at:now,value:null});this.signature='';}
   else{
    const signature=jobs.map(j=>j.id+':'+j.telemetry.at).join('|');
    if(signature!==this.signature){const at=Math.max(...jobs.map(j=>j.telemetry.at));if(!this.points.length||at>this.points.at(-1).at){if(this.points.length&&at-this.points.at(-1).at>=20000)this.points.push({at:at-1,value:null});this.points.push({at,value:jobs.reduce((sum,j)=>sum+j.telemetry.hash,0)})}this.signature=signature}
   }
   if(this.points.length>120)this.points.splice(0,this.points.length-120);
   const end=this.points.at(-1)?.at??now;this.points=this.points.filter(p=>p.at>=end-120000);
   return valid?jobs.reduce((sum,j)=>sum+j.telemetry.hash,0):null;
  }
  geometry(){
   const samples=this.points.filter(p=>p.value!==null),max=Math.max(1,...samples.map(p=>p.value)),end=this.points.at(-1)?.at??0,start=end-120000;
   let open=false,line='',dot=null;
   for(const p of this.points){if(p.value===null){open=false;dot=null;continue}const x=4+(p.at-start)/120000*672,y=46-p.value/max*38;line+=(open?' L':' M')+x.toFixed(1)+' '+y.toFixed(1);open=true;dot={x,y}}
   return{line,dot,max,count:samples.length};
  }
 }
 function thermalLevel(temp,limit){return Number.isFinite(temp)?temp>=(limit||90)?'hot':temp>=(limit||90)-5?'warm':'normal':'unknown'}
 const exports={HashHistory,thermalLevel};if(typeof module!=='undefined')module.exports=exports;else root.GozerTelemetry=exports;
})(globalThis);
