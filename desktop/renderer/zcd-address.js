(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.GozerZcdAddress=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 function validAddress(value){return typeof value==='string'&&/^(?:0x)?02[a-f0-9]{62}$/i.test(value)}
 function inspect(value){
  const input=typeof value==='string'?value.trim():'';
  if(!input)return {valid:false,code:'empty',message:'请填写 ZCD 的 02 永久收款地址'};
  if(/^(?:0x)?01/i.test(input))return {valid:false,code:'one-shot',message:'01 是一次性地址，不能挖矿；请从钱包获取 02 永久地址'};
  if(!/^(?:0x)?02/i.test(input))return {valid:false,code:'prefix',message:'仅支持 02 永久收款地址（可带 0x 前缀）'};
  if(!validAddress(input))return {valid:false,code:'format',message:'地址不完整或含非法字符：02 开头，共 64 位十六进制字符'};
  return {valid:true,code:'valid',message:'02 永久地址格式正确',normalized:'0x'+input.replace(/^0x/i,'').toLowerCase()};
 }
 return Object.freeze({validAddress,inspect});
});
