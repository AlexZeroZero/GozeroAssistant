'use strict';
const path=require('node:path');
const run=require('node:util').promisify(require('node:child_process').execFile);
const FILE=path.join(__dirname,'../vendor/Inventory.exe');
function scanError(error){
 if(error.code==='ENOENT')return Error('硬件扫描组件缺失，请完整解压新版 Gozero助手后重试');
 if(error.killed||error.code==='ETIMEDOUT')return Error('硬件扫描超时，请稍后重新扫描；若持续失败，请检查 Windows WMI 服务');
 if(error.code==='EACCES'||error.code==='EPERM')return Error('Windows 阻止了硬件扫描组件，请检查系统应用控制或安全软件的拦截记录');
 if(String(error.stderr||'').includes('INVENTORY_UNAVAILABLE'))return Error('Windows 硬件信息服务暂不可用，请检查 WMI 服务后重新扫描');
 return Error('硬件扫描组件运行失败，请重新扫描；若持续失败，请检查 WMI 服务或重新解压新版');
}
async function readInventory(execute=run){
 let stdout;try{({stdout}=await execute(FILE,[],{windowsHide:true,timeout:45000,maxBuffer:2*1024*1024,encoding:'utf8'}))}catch(error){throw scanError(error)}
 try{const raw=JSON.parse(stdout.replace(/^\uFEFF/,''));if(!raw||typeof raw!=='object'||!['gpus','cpu','memory','board','bios','os','cache','warnings'].every(k=>Array.isArray(raw[k])))throw Error();if(raw.gpus.some(g=>!g||typeof g.pnp!=='string'||typeof g.name!=='string'))throw Error();return raw}catch{throw Error('硬件扫描结果格式无效，请完整解压新版扫描组件后重试')}
}
module.exports={readInventory,scanError,FILE};
