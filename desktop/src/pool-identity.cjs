'use strict';
const clean=v=>String(v||'').replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim().slice(0,120);
function identity(config,device){return config.reportPoolIdentity===false?{worker:'Gozer',model:''}:{worker:config.worker,model:clean(device?.name)}}
function label(config,device,max=64){const p=identity(config,device);if(!p.model)return p.worker;
 const model=p.model.replace(/NVIDIA |GeForce |AMD |Intel\(R\) |\(TM\)|\(R\)| CPU| Processor| \d+-Core.*| @ .*/gi,'').replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'');
 return (p.worker+'__'+model).slice(0,max);
}
function agent(config,device){const p=identity(config,device);return 'Gozero/'+require('../package.json').version+(p.model?' (CPU: '+p.model+')':'')}
module.exports={identity,label,agent};
