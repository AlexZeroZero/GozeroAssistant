'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const os=require('node:os'),fs=require('node:fs/promises'),path=require('node:path');
const {deviceId,reconcileSelection}=require('../src/device-selection.cjs');
const {DEFAULT,ConfigStore}=require('../src/config.cjs');
const {normalizeInventory,mergeSmi}=require('../src/hardware.cjs');
const {Miner}=require('../src/miner.cjs');
function fixture(){
 const inventory=normalizeInventory({gpus:[
  {pnp:'PCI\\VEN_10DE&DEV_1\\A',name:'Same-model GPU',pci:'01:00.0'},
  {pnp:'PCI\\VEN_10DE&DEV_1\\B',name:'Same-model GPU',pci:'02:00.0'}
 ]});
 mergeSmi(inventory,[{uuid:'GPU-b',pci:'02:00.0'},{uuid:'GPU-a',pci:'01:00.0'}]);
 return inventory;
}
test('legacy UUID plus current PnP selection becomes one GPU, preserving saved settings',()=>{
 const hardware=fixture(),id=hardware.gpus[0].id,old=deviceId('GPU-a');
 const config={...structuredClone(DEFAULT),selected:[old,id],performance:50};
 config.manualInputs.QTC[old]={hash:123,unit:'H/s',watts:100};
 const result=reconcileSelection(config,hardware);
 assert.equal(result.migrated,1);assert.equal(result.changed,true);assert.deepEqual(result.missing,[]);
 assert.deepEqual(result.config.selected,[id]);assert.equal(result.config.performance,50);
 assert.equal(result.config.manualInputs.QTC[id].hash,123);assert.equal(result.config.manualInputs.QTC[old],undefined);
 assert.deepEqual(config.selected,[old,id]);assert.equal(reconcileSelection(result.config,hardware).changed,false);
});
test('same-model GPUs retain exact UUID mapping regardless of scan order; canonical manual input wins',()=>{
 const hardware=fixture(),[a,b]=hardware.gpus;
 const config={...structuredClone(DEFAULT),selected:[deviceId('GPU-b'),deviceId('GPU-a')]};
 config.manualInputs.PRL[deviceId('GPU-a')]={hash:1,unit:'H/s',watts:100};
 config.manualInputs.PRL[a.id]={hash:2,unit:'H/s',watts:100};
 const result=reconcileSelection(config,{...hardware,gpus:[b,a]});
 assert.deepEqual(result.config.selected,[b.id,a.id]);assert.equal(result.config.manualInputs.PRL[a.id].hash,2);
});
test('unknown, removed, or ambiguous identities are retained and flagged; never substitute another GPU',()=>{
 const hardware=fixture(),unknown=deviceId('GPU-removed');
 let result=reconcileSelection({...DEFAULT,selected:[unknown]},hardware);
 assert.deepEqual(result.config.selected,[unknown]);assert.deepEqual(result.missing,[unknown]);assert.equal(result.changed,false);
 hardware.gpus[1].sensors.uuid='GPU-a';
 result=reconcileSelection({...DEFAULT,selected:[deviceId('GPU-a')]},hardware);
 assert.deepEqual(result.missing,[deviceId('GPU-a')]);assert.equal(result.changed,false);
});
test('driver-only enumeration never duplicates the same UUID when PCI is unavailable',()=>{
 const hardware=normalizeInventory({gpus:[]}),row={uuid:'GPU-a',pci:null,name:'GPU'};
 mergeSmi(hardware,[row]);mergeSmi(hardware,[row]);mergeSmi(hardware,[{...row,pci:'01:00.0'}]);
 assert.equal(hardware.gpus.length,1);assert.equal(hardware.gpus[0].id,deviceId('GPU-a'));assert.equal(hardware.gpus[0].pci,'01:00.0');
});
test('corrected config survives restart and reaches kernel validation without starting mining',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozer-selection-'));
 try{
  const hardware=fixture(),id=hardware.gpus[0].id,store=new ConfigStore(dir);
  await store.save({...DEFAULT,selected:[deviceId('GPU-a'),id],wallets:{...DEFAULT.wallets,PRL:'prl1testaddressnotarealwallet'}});
  await store.save(reconcileSelection(store.value,hardware).config);
  const reloaded=new ConfigStore(dir);await reloaded.load();assert.deepEqual(reloaded.value.selected,[id]);
  const miner=new Miner(dir,()=>{throw Error('unexpected request')},()=>{});
  let reached=false;miner.installed=async()=>{reached=true;return false};
  await assert.rejects(miner.start(reloaded.value,hardware),/安装并校验/);
  assert.equal(reached,true);assert.equal(miner.jobs.size,0);
  reached=false;
  await assert.rejects(miner.start({...reloaded.value,selected:[id,deviceId('GPU-removed')]},hardware),/设备已变化/);
  assert.equal(reached,false);assert.equal(miner.jobs.size,0);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
