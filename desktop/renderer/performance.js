(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.GozerPerformance=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 function describe(value){
  const percent=Number.isInteger(value)&&value>=50&&value<=100?value:75;
  const mode=percent<65?'eco':percent<90?'balanced':'high';
  const label={eco:'节能',balanced:'均衡',high:'高性能'}[mode];
  return{percent,mode,label,text:label+' · '+percent+'%'};
 }
 function cpuThreadBudget(device,value){
  const logical=Math.max(1,Math.floor(Number(device?.logical)||1));
  const maximum=logical;
  const percent=describe(value).percent;
  // CPU modes budget logical threads, including SMT / Hyper-Threading.
  return Math.max(1,Math.min(maximum,Math.floor(logical*percent/100)));
 }
 function bntThreadBudget(limit,value){
  const maximum=Number.isInteger(limit)&&limit>0?limit:0;
  return maximum?Math.max(1,Math.floor(maximum*describe(value).percent/100)):0;
 }
 return{describe,cpuThreadBudget,bntThreadBudget};
});
