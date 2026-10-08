const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {DEFAULT,validate,ConfigStore}=require('../src/config.cjs'),{choices,resolve}=require('../src/kernel-catalog.cjs'),{argsFor}=require('../src/miner.cjs');
test('legacy settings choose recommended kernel; per-coin manual choice persists independently',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gozer-kernel-choice-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const old=structuredClone(DEFAULT);delete old.kernels;assert.deepEqual(validate(old).kernels,{PRL:'auto',QTC:'auto',TSC:'auto',NOID:'auto',YSR:'auto',ZCD:'auto',BNT:'auto'});
 const store=new ConfigStore(dir);await store.save({...old,kernels:{PRL:'krig-1.5.4',QTC:'auto',TSC:'auto'}});const next=new ConfigStore(dir);await next.load();assert.equal(next.value.kernels.PRL,'krig-1.5.4');assert.equal(next.value.kernels.QTC,'auto');
});
test('disabled experimental, unsupported coin and arbitrary kernel IDs cannot reach launch resolution',()=>{
 assert.equal(choices('QTC').find(k=>k.id==='gozer-qtc-experimental').disabled,true);
 for(const kernels of [{QTC:'gozer-qtc-experimental'},{TSC:'krig-1.5.4'},{PRL:'C:\\unknown.exe'},{PRL:'racer-pending'}])assert.throws(()=>validate({...DEFAULT,kernels}),/内核/);
 assert.throws(()=>resolve({...DEFAULT,coin:'TSC'}),/Windows/);
});
test('recommended and explicitly selected verified KRig retain exact coin, wallet and PCI arguments',()=>{
 const c={...structuredClone(DEFAULT),wallets:{...DEFAULT.wallets,PRL:'prl1fixturewalletnotusedfornetwork'}},gpu={vendor:'NVIDIA',pci:'61:00.0'};
 assert.equal(resolve(c).id,'krig-1.5.4');const auto=argsFor(c,gpu,'fixture.log');c.kernels.PRL='krig-1.5.4';assert.equal(resolve(c).selection,'krig-1.5.4');assert.deepEqual(argsFor(c,gpu,'fixture.log'),auto);
});
