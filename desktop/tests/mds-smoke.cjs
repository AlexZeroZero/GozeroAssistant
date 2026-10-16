'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const js=s=>win.webContents.executeJavaScript(s,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const out=path.resolve(__dirname,'../artifacts/mds021');await fs.mkdir(out,{recursive:true});
 const gpu=getState().hardware.gpus.find(g=>g.vendor==='NVIDIA'&&g.sensors?.uuid);assert(gpu);
 await js(`(async()=>{const s=await gozer.bootstrap();await gozer.save({...s.config,coin:'MDS',selected:[${JSON.stringify(gpu.id)}],wallets:{...s.config.wallets,MDS:'9bd7f16ae5827118e93239e75a98a6ec564c9247f94b5c5de63d1be4d083af03c1f035b7'}});state=await gozer.bootstrap();configInputs();showView('mining');render()})()`);
 await pause(200);assert.equal(getState().kernel.version,'0.1.12-rc.2');assert.equal(getState().config.pools.MDS,'stratum+tcp://mds.gozero.trade:13333');
 assert.equal(await js("document.querySelector('#mds-mss-row').hidden"),false);
 assert.equal(await js("document.querySelector('#start').disabled"),true);
 await js("(async()=>{await gozer.install();state=await gozer.bootstrap();render();document.querySelector('#mds-mss').checked=true;document.querySelector('#mds-mss').dispatchEvent(new Event('change'));await flushMiningSettings();state=await gozer.bootstrap();configInputs();render()})()");
 assert.equal(getState().kernel.installed,true);assert.equal(getState().config.mdsMssConfirmed,true);assert.equal(getState().miner.status,'idle');
 assert.equal(await js("document.querySelector('#start').disabled"),false);
 assert.equal(await js("[...document.querySelectorAll('#pool-transport-row option')].map(o=>o.value).join()"),'tcp');
 await fs.writeFile(path.join(out,'mds-workbench.png'),(await win.webContents.capturePage()).toPNG());
 await js("openKernelLibrary('MDS')");await pause(100);await fs.writeFile(path.join(out,'mds-kernel-library.png'),(await win.webContents.capturePage()).toPNG());
 await js("(async()=>{state=await gozer.workbenchMode('dual');render();await gozer.taskSave('gpu',{coin:'MDS',mdsMssConfirmed:true});state=await gozer.bootstrap();render()})()");await pause(100);
 assert.equal(getState().dual.tasks.gpu.config.coin,'MDS');assert.equal(getState().dual.tasks.cpu.config.coin,'ZCD');
 assert.equal(await js("document.querySelector('.dual-card.gpu .task-coin').value"),'MDS');
 await fs.writeFile(path.join(out,'ui-result.json'),JSON.stringify({passed:true,version:getState().version,kernel:'0.1.12-rc.2',miningStarted:false},null,2));
}
module.exports={run};
