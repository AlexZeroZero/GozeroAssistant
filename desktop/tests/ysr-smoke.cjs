'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const js=s=>win.webContents.executeJavaScript(s,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const out=path.resolve(__dirname,'../artifacts/ysr');await fs.mkdir(out,{recursive:true});
 const gpu=getState().hardware.gpus.find(g=>g.vendor==='NVIDIA');assert.ok(gpu);
 await js(`(async()=>{const s=await gozer.bootstrap();await gozer.save({...s.config,coin:'YSR',selected:[${JSON.stringify(gpu.id)}]});state=await gozer.bootstrap();configInputs();showView('mining');render()})()`);await pause(300);
 assert.equal(getState().config.coin,'YSR');assert.equal(getState().kernel.id,'gozero-ysr-0.1.3');
 assert.equal(await js("document.querySelector('#noid-connection-row').hidden"),true);
 assert.equal(await js("document.querySelector('#pool').value"),'https://ysr.pool.gozero.trade:8443');
 assert.equal(await js("document.querySelector('#coin-tabs button[data-coin=YSR]').classList.contains('active')"),true);
 await js("(async()=>{await gozer.install();state=await gozer.bootstrap();render()})()");assert.equal(getState().kernel.installed,true);assert.equal(getState().miner.status,'idle');
 assert.equal(await js("new Set([...document.querySelectorAll('#coin-tabs button')].map(b=>b.getBoundingClientRect().top)).size"),1);
 await js("(async()=>{await gozer.network();state=await gozer.bootstrap();render()})()");
 const network=getState().network.find(n=>n.coin==='YSR');assert.ok(network.networkHash>0);assert.equal(network.price,null);assert.equal(network.networkStale,false);
 for(const lang of ['zh-CN','en','ja','ru']){
  await js(`(async()=>{await gozer.language(${JSON.stringify(lang)});state=await gozer.bootstrap();GozerI18n.setLocale(state.config.language);render()})()`);await pause(100);
  assert.equal(getState().miner.status,'idle');
  assert.equal(await js("document.querySelector('#compatibility').textContent"),require('../renderer/i18n.js').t('YSR：NVIDIA RTX 30 或更新显卡；HTTP 矿池独立会话，候选份额 CPU 复核；CPU / AMD 挖矿尚未开放。',lang));
 }
 await js("(async()=>{await gozer.language('zh-CN');state=await gozer.bootstrap();GozerI18n.setLocale('zh-CN');showView('mining');render()})()");
 await fs.writeFile(path.join(out,'ysr-workbench.png'),(await win.webContents.capturePage()).toPNG());
 await js("showView('earnings');render()");assert.equal(await js("document.querySelectorAll('#profit-cards [data-coin=YSR]').length"),1);
 await fs.writeFile(path.join(out,'ysr-earnings.png'),(await win.webContents.capturePage()).toPNG());
 await fs.writeFile(path.join(out,'ui-result.json'),JSON.stringify({passed:true,coin:'YSR',installed:getState().kernel.installed,miningStarted:false,liveNetwork:network,languages:['zh-CN','en','ja','ru']},null,2));
}
module.exports={run};
