'use strict';
const {resolve,choices}=require('./kernel-catalog.cjs');
const {poolChoices}=require('./pool-catalog.cjs');
const GPU_COINS=['PRL','QTC','NOID','YSR'];
const PROFILE_KEYS=['reportPoolIdentity','coin','performance','worker','selected','hashWindowMinutes','cpuThreads','zcdPassword','wallets','pools','poolBackups','kernels','noidConnection'];
function taskConfig(base,id){
 if(!['gpu','cpu'].includes(id))throw Error('无效任务');
 const {taskProfiles,workbenchMode,...shared}=base;
 const defaults=id==='cpu'?{coin:'ZCD',performance:75,cpuThreads:0}:{coin:GPU_COINS.includes(base.coin)?base.coin:'YSR'};
 return {...shared,...defaults,...taskProfiles?.[id]};
}
function normalizeProfiles(base,profiles,validate){
 if(!profiles||typeof profiles!=='object'||Array.isArray(profiles)||Object.keys(profiles).some(k=>!['gpu','cpu'].includes(k)))throw Error('双挖配置无效');
 const result={};
 for(const id of ['gpu','cpu']){
  const input=profiles[id];if(input!==undefined&&(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!PROFILE_KEYS.includes(k))))throw Error('任务配置字段无效');
  const cfg=validate({...taskConfig({...base,taskProfiles:undefined},id),...input});
  if(id==='cpu'?!['ZCD','BNT'].includes(cfg.coin):!GPU_COINS.includes(cfg.coin))throw Error('币种与设备任务不匹配');
  result[id]=Object.fromEntries(PROFILE_KEYS.map(k=>[k,cfg[k]]));
 }
 return result;
}
// Independent process controllers share one serialized ledger. Different task
// algorithms use different ledger keys; legacy single-mining balances remain intact.
class DualTasks{
 constructor({store,gpu,cpu,gpuFee,cpuFee,hardware,ready,changed}){
  Object.assign(this,{store,hardware,ready,changed});
  this.tasks={gpu:{miner:gpu,fee:gpuFee},cpu:{miner:cpu,fee:cpuFee}};
  cpuFee.ledger=gpuFee.ledger;cpuFee.persist=()=>gpuFee.persist();
  this.queue=Promise.resolve();this.revision=0;
 }
 config(id){return taskConfig(this.store.value,id)}
 task(id){if(!Object.hasOwn(this.tasks,id))throw Error('无效任务');return this.tasks[id]}
 busy(id){const t=this.task(id);return !!(t.pending||t.miner.installing||t.miner.status!=='idle'||t.fee.active||t.fee.switching||t.fee.stopping)}
 anyBusy(){return ['gpu','cpu'].some(id=>this.busy(id))}
 assertMode(){if(this.store.value.workbenchMode!=='dual')throw Error('请先切换到 GPU＋CPU 双挖')}
 enqueue(fn){const next=this.queue.catch(()=>{}).then(fn);this.queue=next;return next}
 async refresh(){await Promise.all(Object.keys(this.tasks).map(async id=>{this.task(id).installed=await this.task(id).miner.installed(this.config(id))}));this.changed()}
 save(id,patch){this.assertMode();this.task(id);if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!PROFILE_KEYS.includes(k)))throw Error('任务配置字段无效');return this.enqueue(async()=>{
  this.assertMode();if(this.busy(id))throw Error('请先停止此任务再修改配置');const t=this.task(id);t.pending=true;this.changed();
  try{await this.store.update(value=>({...value,taskProfiles:{...value.taskProfiles,[id]:{...value.taskProfiles?.[id],...patch}}}));t.installed=await t.miner.installed(this.config(id));this.revision++;return this.config(id)}finally{t.pending=false;this.changed()}
 })}
 async start(id,benchmark=false){this.assertMode();if(typeof benchmark!=='boolean')throw Error('请求无效');const t=this.task(id);if(!this.ready())throw Error('设备正在扫描，请稍候');if(this.busy(id))throw Error('此任务忙，请稍候');t.pending=true;this.changed();try{return await t.fee.start(this.config(id),this.hardware(),benchmark)}finally{t.pending=false;this.changed()}}
 async install(id){this.assertMode();const t=this.task(id);if(this.busy(id))throw Error('请先停止此任务');t.pending=true;this.changed();try{await t.miner.install(this.config(id));t.installed=true}finally{t.pending=false;this.changed()}}
 stop(id,reason='用户停止'){return this.task(id).fee.stop(reason)}
 async startAll(){this.assertMode();return Promise.all(['gpu','cpu'].map(async id=>{try{if(!this.busy(id))await this.start(id);return{id,ok:true}}catch(e){return{id,ok:false,error:e.message}}}))}
 async stopAll(reason='停止全部任务'){const results=await Promise.allSettled(['gpu','cpu'].map(id=>this.stop(id,reason)));const error=results.find(r=>r.status==='rejected');if(error)throw error.reason}
 snapshot(){return{revision:this.revision,tasks:Object.fromEntries(Object.keys(this.tasks).map(id=>{const t=this.task(id),c=this.config(id);return[id,{config:c,busy:this.busy(id),pending:!!t.pending,miner:t.miner.snapshot(),fee:t.fee.snapshot(),kernel:{...resolve(c),installed:!!t.installed,options:choices(c.coin)},pools:poolChoices(c.coin)}]}))}}
}
module.exports={DualTasks,taskConfig,normalizeProfiles,PROFILE_KEYS};
