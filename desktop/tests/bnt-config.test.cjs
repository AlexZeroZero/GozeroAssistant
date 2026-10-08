const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {DEFAULT,ConfigStore}=require('../src/config.cjs');
const {poolChoices}=require('../src/pool-catalog.cjs');
const old='stratum+tcp://bnt.pool.gozero.trade:4444',current='stratum+tcp://bnt.pool.gozero.trade:14444';
test('BNT primary defaults to the verified domain port',()=>{assert.equal(DEFAULT.pools.BNT,current);assert.equal(poolChoices('BNT')[0].url,current)});
test('legacy BNT core selection migrates without discarding user settings',()=>{
 const {validate}=require('../src/config.cjs');
 for(const id of ['gozero-bnt-0.1.0','gozero-bnt-0.2.0']){
 const cfg=validate({...DEFAULT,coin:'BNT',worker:'my-worker',kernels:{...DEFAULT.kernels,BNT:id},taskProfiles:{cpu:{coin:'BNT',kernels:{BNT:id}}}});
 assert.equal(cfg.worker,'my-worker');assert.equal(cfg.kernels.BNT,'auto');assert.equal(cfg.taskProfiles.cpu.kernels.BNT,'auto');
 }
});
test('upgrade migrates legacy BNT defaults in single and dual profiles, preserving custom pools',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bnt-config-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 for(const custom of [false,true]){
  const raw=structuredClone(DEFAULT);delete raw.bntPoolVersion;raw.pools.BNT=old;
  raw.taskProfiles={cpu:{coin:'BNT',pools:{BNT:custom?'stratum+tcp://custom.example:5555':old}}};
  await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify(raw));
  const store=new ConfigStore(dir),cfg=await store.load();assert.equal(store.warning,undefined);assert.equal(cfg.pools.BNT,current);
  assert.equal(cfg.taskProfiles.cpu.pools.BNT,custom?'stratum+tcp://custom.example:5555':current);
  assert.equal(cfg.bntPoolVersion,1);
  await store.save({...cfg,pools:{...cfg.pools,BNT:old}});
  assert.equal((await new ConfigStore(dir).load()).pools.BNT,old,'keep an explicit post-upgrade choice');
 }
});
