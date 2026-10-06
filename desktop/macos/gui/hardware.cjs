'use strict';
const os=require('node:os'),{execFile}=require('node:child_process'),{promisify}=require('node:util'),path=require('node:path');
const exec=promisify(execFile),{GPU_ID}=require('./config.cjs');
const options={timeout:6000,maxBuffer:2*1024*1024,windowsHide:true};
function delta(before,after){return after.map((c,i)=>{const p=before?.[i]?.times;if(!p)return null;const total=Object.keys(c.times).reduce((a,k)=>a+c.times[k]-p[k],0);return total>0?Math.max(0,Math.min(100,100*(1-(c.times.idle-p.idle)/total))):null;});}
function parseGPU(text){const m=/"Device Utilization %"\s*=\s*(\d+)/.exec(text);return m?Math.max(0,Math.min(100,+m[1])):null;}
class Hardware{
 constructor(nativeDir,onChange){this.nativeDir=nativeDir;this.onChange=onChange;this.previous=os.cpus();this.value={chip:os.cpus()[0]?.model||'Apple Silicon',model:'—',gpu:'Apple GPU',memoryBytes:os.totalmem(),cpuCores:os.cpus().length,performanceCores:null,efficiencyCores:null,os:os.release(),gpuLoad:null,cpuLoad:null,perCore:[],freeMemory:os.freemem(),thermalState:null,temperatureC:null,powerWatts:null,gpus:[]};this.timer=null;this.busy=false;}
 async scan(){const result=await exec('/usr/sbin/system_profiler',['SPHardwareDataType','SPDisplaysDataType','-json'],{...options,timeout:15000});const d=JSON.parse(result.stdout),h=d.SPHardwareDataType?.[0]||{},g=d.SPDisplaysDataType?.[0]||{};
  Object.assign(this.value,{chip:h.chip_type||this.value.chip,model:h.machine_name||h.machine_model||'Apple Silicon',modelId:h.machine_model,gpu:g.sppci_model||this.value.chip,gpuCores:Number(g.sppci_cores)||null,scannedAt:Date.now()});
  for(const [field,key] of [['performanceCores','hw.perflevel0.physicalcpu'],['efficiencyCores','hw.perflevel1.physicalcpu']]){try{this.value[field]=Number((await exec('/usr/sbin/sysctl',['-n',key],options)).stdout.trim())}catch{this.value[field]=null;}}
  await this.sample();return this.value;
 }
 async sample(){if(this.busy)return;this.busy=true;try{const cpus=os.cpus(),perCore=delta(this.previous,cpus);this.previous=cpus;const valid=perCore.filter(Number.isFinite);Object.assign(this.value,{perCore,cpuLoad:valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null,freeMemory:os.freemem(),at:Date.now()});
  const [gpu,thermal]=await Promise.allSettled([exec('/usr/sbin/ioreg',['-r','-c','AGXAccelerator','-l'],options),exec(path.join(this.nativeDir,'mac-telemetry'),[],options)]);
  this.value.gpuLoad=gpu.status==='fulfilled'?parseGPU(gpu.value.stdout):null;
  try{this.value.thermalState=thermal.status==='fulfilled'?JSON.parse(thermal.value.stdout).thermalState:null;}catch{this.value.thermalState=null;}
  this.value.gpus=[{id:GPU_ID,name:this.value.gpu,vendor:'Apple',sensors:{at:Date.now(),load:this.value.gpuLoad,temp:null,power:null}}];this.onChange?.(this.value);
 }finally{this.busy=false;}}
 start(interval){clearInterval(this.timer);this.timer=setInterval(()=>this.sample().catch(()=>{}),interval);}
 stop(){clearInterval(this.timer);}
}
module.exports={Hardware,delta,parseGPU};
