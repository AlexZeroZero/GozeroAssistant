'use strict';
const {Miner}=require('./miner.cjs');
const {resolve,choices}=require('./kernel-catalog.cjs');
// Installers never configure or replace an active mining controller.
class InstallManager {
 constructor(dir,request,log,changed,active=()=>[]){Object.assign(this,{dir,request,log,changed,active});this.entries=new Map()}
 entry(config){const k=resolve(config);let e=this.entries.get(k.id);if(!e){const miner=new Miner(this.dir,this.request,(type,message)=>this.log(type,k.name+' · '+message));e={miner,installed:false};miner.configure(config);miner.on('update',()=>this.changed());this.entries.set(k.id,e)}return e}
 async inspect(config){const e=this.entry(config);e.installed=await e.miner.installed(config);return this.snapshot(config)}
 snapshot(config){const k=resolve(config),e=this.entry(config);return{...k,options:choices(config.coin),installed:e.installed,installing:e.miner.installing,installation:e.miner.installation}}
 async install(config){const e=this.entry(config),k=resolve(config);if(this.active().includes(k.id))throw Error('此内核正在挖矿中，不能覆盖安装；其他内核仍可下载');if([...this.entries.values()].some(x=>x.miner.installing))throw Error('已有内核正在下载，请等待完成后重试');try{await e.miner.install(config);e.installed=true;return true}finally{this.changed()}}
}
module.exports={InstallManager};
