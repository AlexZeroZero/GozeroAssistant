'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState,floating){
 const js=s=>win.webContents.executeJavaScript(s.includes('await ')?'(async()=>{'+s+'})()':s,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const dir=path.resolve(__dirname,'../artifacts/dual');await fs.mkdir(dir,{recursive:true});
 const errors=[];win.webContents.on('console-message',(_e,_level,message)=>{if(/Uncaught|ReferenceError|TypeError/.test(message)){errors.push(message);console.error('RENDERER',message)}});
 await js("state=await gozer.bootstrap();configInputs();render();renderDual(state);showView('mining');document.querySelector('[data-mode=dual]').click()");await pause(600);
 assert.equal(getState().config.workbenchMode,'dual');assert.equal(await js("document.querySelectorAll('.dual-card').length"),2);
 assert.equal(getState().dual.tasks.cpu.config.performance,75);assert.equal(getState().dual.tasks.cpu.kernel.bundled,undefined);
 assert.ok(Object.values(getState().dual.tasks).every(t=>t.miner.status==='idle'));
 // Settings stay editable during telemetry refresh and CPU controls track logical threads.
 await js("(()=>{const r=document.querySelector('[data-task=cpu]');r.querySelector('input[placeholder=\"02 永久收款地址\"]').value='01invalid';r.querySelector('input[placeholder=\"02 永久收款地址\"]').dispatchEvent(new Event('input'));r.querySelector('input[type=range]').value=100;r.querySelector('input[type=range]').dispatchEvent(new Event('input'))})()");
 await pause(1200);assert.equal(await js("document.querySelector('[data-task=cpu] input[type=number]').value"),String(getState().cpuDevice.logical));assert.equal(await js("document.querySelectorAll('[data-task=cpu] .dual-actions button')[1].disabled"),true);
 // Blank wallets never block explicit on-demand kernel download, but remain required for start.
 assert.equal(await js("document.querySelector('[data-task=cpu] .task-install').disabled"),false);
 await js("(()=>{const w=document.querySelector('[data-task=cpu] input[placeholder=\"02 永久收款地址\"]');w.value='';w.dispatchEvent(new Event('input'));document.querySelectorAll('[data-task=cpu] .dual-actions button')[1].click()})()");await pause(300);
 await js("gozer.taskSave('gpu',{coin:'YSR'})");await pause(200);
 for(const language of ['zh-CN','en','ja','ru']){
  await js(`gozer.language(${JSON.stringify(language)})`);await pause(250);
  await fs.writeFile(path.join(dir,'dual-'+language+'.png'),(await win.webContents.capturePage()).toPNG());
  assert.equal(await js("document.documentElement.scrollWidth>innerWidth"),false);
 }
 await js("gozer.language('zh-CN')");await pause(200);
 await floating.show();await pause(200);await fs.writeFile(path.join(dir,'floating-dual.png'),(await floating.win.webContents.capturePage()).toPNG());
 win.setContentSize(1140,700);await pause(250);await fs.writeFile(path.join(dir,'dual-wide.png'),(await win.webContents.capturePage()).toPNG());assert.equal(await js("getComputedStyle(document.querySelector('.dual-grid')).gridTemplateColumns.split(' ').length"),2);
 await js("gozer.workbenchMode('cpu')");await pause(250);assert.equal(getState().config.coin,'ZCD');await js("gozer.workbenchMode('gpu')");await pause(250);assert.notEqual(getState().config.coin,'ZCD');
 assert.deepEqual(errors,[]);assert.ok(Object.values(getState().dual.tasks).every(t=>t.miner.status==='idle'));
}
module.exports={run};
