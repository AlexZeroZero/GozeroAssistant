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
 return{describe};
});
