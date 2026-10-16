const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {DEFAULT,validate,ConfigStore}=require('../src/config.cjs');
const {migrateRetiredCoins}=require('../src/retired-coins.cjs');
test('removed coin cannot be selected by new requests',()=>{
 assert.throws(()=>validate({...DEFAULT,coin:'VELA'}));
 assert.throws(()=>validate({...DEFAULT,taskProfiles:{gpu:{coin:'VELA'}}}));
 assert.throws(()=>require('../src/kernel-catalog.cjs').resolve({coin:'VELA'}));
});
test('legacy VELA profiles migrate without losing CPU, wallet or custom pool settings',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozero-retired-'));
 try{
  const raw=structuredClone(DEFAULT);
  Object.assign(raw,{coin:'VELA',workbenchMode:'dual',performance:90,worker:'MyRig',selected:['a'.repeat(20)]});
  raw.wallets.PRL='prlSavedWallet';raw.wallets.VELA='legacyWallet';raw.pools.VELA='http://159.69.194.46:3349';raw.kernels.VELA='gozero-vela-0.1.0';
  raw.pools.BNT='stratum+tcp://custom.example:14444';
  raw.taskProfiles={gpu:{coin:'VELA',selected:['b'.repeat(20)],performance:85,kernels:{VELA:'gozero-vela-0.1.0'}},cpu:{coin:'BNT',cpuThreads:24,performance:80}};
  await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify(raw));
  const store=new ConfigStore(dir),c=await store.load();
  assert.equal(store.warning,undefined);assert.match(store.notice,/VELA/);
  assert.equal(c.coin,'YSR');assert.deepEqual(c.selected,[]);
  assert.equal(c.taskProfiles.gpu.coin,'YSR');assert.deepEqual(c.taskProfiles.gpu.selected,[]);
  assert.equal(c.taskProfiles.gpu.performance,85);assert.equal(c.taskProfiles.cpu.cpuThreads,24);
  assert.equal(c.taskProfiles.cpu.coin,'BNT');assert.equal(c.taskProfiles.cpu.performance,80);
  assert.equal(c.wallets.PRL,'prlSavedWallet');assert.equal(c.worker,'MyRig');
  assert.equal(c.pools.BNT,'stratum+tcp://custom.example:14444');
  assert.equal(JSON.stringify(c).includes('VELA'),false);
  assert.equal(migrateRetiredCoins(c),false);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
