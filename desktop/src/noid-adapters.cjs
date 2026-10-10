'use strict';
const {poolUrls}=require('./pool-catalog.cjs');
const UUID=/^GPU-[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
function device(config,gpu,kernel){
 if(!require('./noid.cjs').validWallet(config.wallets.NOID))throw Error('请填写有效的 NOID 主网收款地址');
 if(gpu.vendor!=='NVIDIA'||!gpu.pci||!/^\w{2,}:\w{2}\.[0-7]$/.test(gpu.pci))throw Error('NOID 需要具有 PCI 地址的 NVIDIA GPU');
 if(['Kepler','Maxwell','Pascal','Volta','Turing'].includes(gpu.architecture))throw Error('NOID 需要 Ampere 或更新架构');
 if(!UUID.test(gpu.sensors?.uuid||''))throw Error('第三方内核需要 NVIDIA GPU UUID，请重新扫描设备');
 if(!Number.isFinite(gpu.sensors?.temp)||!Number.isFinite(gpu.sensors?.at)||Date.now()-gpu.sensors.at>10000)throw Error('第三方 NOID 内核需要有效的显卡温度读数');
 if(kernel.minimumDriver&&(!/^\d{3,}\.\d+/.test(gpu.driver||'')||Number(gpu.driver.split('.')[0])<kernel.minimumDriver))throw Error(kernel.name+' NOID 要求 NVIDIA '+kernel.minimumDriver+' 或更新驱动');
}
function args(config,gpu,logFile,kernel){
 device(config,gpu,kernel);const pools=poolUrls(config);
 // Each guarded child sees only its selected physical UUID, so CUDA index 0
 // stays correct even for mixed cards or reordered Windows adapters.
 const user=config.wallets.NOID+'.'+require('./pool-identity.cjs').label(config,gpu);
 if(kernel.name==='Suprminer')return['-a','noid','-o',pools[0],'-u',user,'-p','x','--no-cpu','-d','0'];
 if(kernel.name==='Fl4shMiner')return['-a','noid',...pools.flatMap(url=>['--pool',url]),'-w',user,'-pass','x','-d','0','--ui','off','--no-color','--ascii','--noid-keep-warm=false','--pool-auto-region=false'];
 throw Error('未适配的 NOID 内核');
}
module.exports={args,device,UUID};
