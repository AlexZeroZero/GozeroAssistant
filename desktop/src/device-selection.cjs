'use strict';
const crypto=require('node:crypto');
const deviceId=value=>crypto.createHash('sha256').update(value).digest('hex').slice(0,20);

// Only a driver UUID attached to a currently enumerated device proves that an
// old driver-only ID and the current PnP ID refer to the same GPU. Never infer
// identity from the display name, array order, or a previously used PCI slot.
function reconcileSelection(config,hardware){
 const gpus=hardware?.gpus||[],current=new Set(gpus.map(g=>g.id)),aliases=new Map();
 for(const g of gpus){
  const uuid=g.sensors?.uuid;
  if(g.vendor!=='NVIDIA'||typeof uuid!=='string'||!uuid.startsWith('GPU-'))continue;
  const old=deviceId(uuid);
  if(current.has(old))continue;
  if(!aliases.has(old))aliases.set(old,g.id);
  else if(aliases.get(old)!==g.id)aliases.set(old,null);
 }
 const next=structuredClone(config);let migrated=0;
 next.selected=[...new Set(config.selected.map(id=>{const target=aliases.get(id);if(target){migrated++;return target}return id}))];
 for(const rows of Object.values(next.manualInputs||{}))for(const [old,target]of aliases){
  if(!target||!Object.hasOwn(rows,old))continue;
  if(!Object.hasOwn(rows,target))rows[target]=rows[old];
  delete rows[old];
 }
 return{config:next,changed:JSON.stringify(next)!==JSON.stringify(config),migrated,missing:next.selected.filter(id=>!current.has(id))};
}
module.exports={deviceId,reconcileSelection};
