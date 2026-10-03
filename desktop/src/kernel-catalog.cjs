'use strict';
const KRIG=Object.freeze({version:'1.5.4',url:'https://github.com/kryptex-miners-org/kryptex-miners/releases/download/krig-1-5-4/krig-miner-1.5.4-win-x64.zip',sha256:'648ad3f88d530d21efe08bf071000e2ec555b3bd26fb94541a37d4b4e2afe7a6',exeSha256:'954d688058a6ec650f2de5101cb8f3d5cef2ce88f9397ff1d21df3e6e4efc7f2',source:'https://miner.download/en/krig/description/'});
const ID='krig-1.5.4';
function choices(coin){
 const supported=['PRL','QTC'].includes(coin);
 const rows=[{id:'auto',label:supported?'默认推荐 · KRig 1.5.4':'默认推荐 · 暂无可用内核',disabled:false}];
 if(supported)rows.push({id:ID,label:'KRig 1.5.4 · 手动指定',disabled:false});
 if(coin==='QTC')rows.push({id:'gozer-qtc-experimental',label:'Gozer QTC CUDA · 实验 / 未接矿池',disabled:true});
 if(coin==='TSC')rows.push({id:'racer-pending',label:'Racer · Windows 待适配',disabled:true});
 return rows;
}
function validChoice(coin,id){return choices(coin).some(c=>!c.disabled&&c.id===id)}
function resolve(config){
 const selection=config.kernels?.[config.coin]??'auto';
 if(!validChoice(config.coin,selection))throw Error('该币种不支持所选内核');
 if(!['PRL','QTC'].includes(config.coin))throw Error('TSC Windows 内核尚未接入');
 return{id:ID,selection,...KRIG};
}
module.exports={KRIG,choices,validChoice,resolve};
