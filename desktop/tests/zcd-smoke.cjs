'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const js=s=>win.webContents.executeJavaScript(s,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const dir=path.resolve(__dirname,'../artifacts/zcd');await fs.mkdir(dir,{recursive:true});
 const original=getState().config.selected;
 await js("(async()=>{await chooseCoin('ZCD');showView('mining');render()})()");await pause(200);
 assert.equal(getState().config.coin,'ZCD');assert.deepEqual(getState().config.selected,original);
 assert.equal(await js("$('#cpu-options').hidden"),false);assert.equal(await js("$('#pool-row').hidden"),false);assert.equal(await js("$('#pool').value"),'stratum+tcp://zcd.pool.gozero.trade:3333');assert.equal(await js("$('#start').disabled"),true);
 await js("document.querySelector('[data-coin-kind=CPU]').click()");assert.equal(await js("[...$('#coin-tabs').children].filter(b=>!b.hidden).map(b=>b.dataset.coin).join(',')"),'ZCD');
 await js("$('#coin-search').value='nothing found';$('#coin-search').dispatchEvent(new Event('input'))");assert.equal(await js("$('#coin-empty').hidden"),false);
 await js("$('#coin-search').value='RandomX';$('#coin-search').dispatchEvent(new Event('input'))");assert.equal(await js("$('#coin-empty').hidden"),true);
 await js("$('#coin-search').value='';$('#coin-search').dispatchEvent(new Event('input'));document.querySelector('[data-coin-kind=all]').click()");
 assert.equal(getState().kernel.installed,false);assert.equal(getState().kernel.bundled,undefined);assert.equal(await js("$('#install').disabled"),false);assert.equal(await js("$('#start').disabled"),true);
 await js("(async()=>{await gozer.install();state=await gozer.bootstrap();render()})()");assert.equal(getState().kernel.installed,true);assert.equal(getState().kernel.id,'gozero-xmrig-cpu-6.26.0-2');assert.equal(getState().miner.status,'idle');
 for(const level of [50,75,100]){
  await js(`$('#performance').value=${level};$('#performance').dispatchEvent(new Event('input'))`);
  assert.equal(await js("Number($('#cpu-threads').value)===GozerPerformance.cpuThreadBudget(state.cpuDevice,Number($('#performance').value))"),true);
  await js(`(async()=>{state.config=await api.performance(${level});render()})()`);
  assert.equal(getState().config.performance,level);
  assert.equal(getState().config.cpuThreads,await js("GozerPerformance.cpuThreadBudget(state.cpuDevice,state.config.performance)"));
 }
 // Invalid drafts must remain visible across telemetry renders and cannot save/start/test.
 for(const value of ['', '0x01'+'a'.repeat(62), '03'+'a'.repeat(62), '02'+'a'.repeat(61), '02'+'g'.repeat(62)]){
  await js(`$('#wallet').value=${JSON.stringify(value)};$('#wallet').dispatchEvent(new Event('input'));render()`);
  assert.equal(await js("$('#wallet').value"),value);
  assert.equal(await js("['#save-mining','#start','#benchmark'].every(id=>$(id).disabled)"),true);
  assert.equal(await js("(async()=>{try{await saveMining();return false}catch{return true}})()"),true);
  assert.equal(getState().config.wallets.ZCD,'');
 }
 const address='0x02e1ff8af95ce35bc07a60ff7dfec2f1caa7fedc13f53ae1d7c1d0c6d7b15a6b';
 for(const value of [address,address.slice(2),address.toUpperCase()]){
  await js(`$('#wallet').value=${JSON.stringify(value)};$('#wallet').dispatchEvent(new Event('input'))`);
  assert.equal(await js("$('#save-mining').disabled"),false);
  assert.equal(await js("$('#wallet').getAttribute('aria-invalid')"),'false');
  assert.equal(await js("$('#wallet-validation').dataset.status"),'valid');
 }
 await js("$('#wallet').value='';$('#wallet').dispatchEvent(new Event('input'))");
 for(const lang of ['zh-CN','en','ja','ru']){
  await js(`(async()=>{await gozer.language('${lang}');state=await gozer.bootstrap();GozerI18n.setLocale('${lang}');render()})()`);await pause(120);
  assert.equal(await js("document.documentElement.scrollWidth<=innerWidth"),true);
  assert.equal(await js("$('#coin-tabs').getBoundingClientRect().height<=50"),true);
  await fs.writeFile(path.join(dir,'workbench-'+lang+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 // Replay a native XMRig telemetry line through the actual parser and renderer.
 const now=Date.now(),rate=require('../src/zcd.cjs').parseTelemetry('miner speed 10s/60s/15m 1131.9 n/a n/a H/s max 1500 H/s',now);
 const cpu=getState().cpuDevice,averages=new (require('../src/hash-windows.cjs').HashWindows)([cpu.id],5,now-5000);
 averages.sample(cpu.id,rate,now);const average=averages.snapshot(now+1000);
 const fixture={status:'running',session:{coin:'ZCD',startedAt:now-5000,selected:[cpu.id]},hashAverage:average,jobs:[{id:cpu.id,name:cpu.name,status:'running',telemetry:rate,shares:{accepted:1,rejected:0}}]};
 await js(`state.miner=${JSON.stringify(fixture)};state.logs=[{id:99999,at:${now},type:'矿工',text:'CPU · miner speed 10s/60s/15m 1131.9 n/a n/a H/s'}];render()`);
 assert.match(await js("$('#worker-rows').textContent"),/1[.,]13/);
 assert.notEqual(await js("$('#total-hash').textContent"),'—');
 assert.ok(await js("$('#hash-line').getAttribute('d').length>0"));
 assert.match(await js("$('#workbench-log-list').textContent"),/1131\.9/);
 await fs.writeFile(path.join(dir,'telemetry-replay.png'),(await win.webContents.capturePage()).toPNG());
 await js("(async()=>{state=await gozer.bootstrap();await gozer.language('zh-CN');await chooseCoin('YSR');state=await gozer.bootstrap();render()})()");
 assert.equal(await js("$('#cpu-options').hidden"),true);assert.equal(await js("$('#pool-row').hidden"),false);assert.equal(await js("$('#pool').value"),'https://ysr.pool.gozero.trade:8443');assert.deepEqual(getState().config.selected,original);
 assert.equal(await js("$('#wallet-validation').hidden"),true);assert.equal(await js("$('#wallet').validationMessage"),'');assert.equal(await js("$('#save-mining').disabled"),false);
 await js("(async()=>{await chooseCoin('ZCD');showView('earnings');render()})()");await fs.writeFile(path.join(dir,'earnings.png'),(await win.webContents.capturePage()).toPNG());
 await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({passed:true,installed:true,miningStarted:false,languages:4,cpuGpuSwitch:true,coinSearch:true},null,2));
 if(process.env.GOZER_RELEASE_SHOTS==='1'){
  const shots=path.resolve(__dirname,'../artifacts/release-1.0.24');await fs.mkdir(shots,{recursive:true});win.setSize(1000,880);
  await js("(async()=>{await gozer.language('zh-CN');state=await gozer.bootstrap();GozerI18n.setLocale('zh-CN');showView('overview');render()})()");await pause(250);
  await fs.writeFile(path.join(shots,'hardware-overview.png'),(await win.webContents.capturePage()).toPNG());
  for(const coin of ['ZCD','YSR']){
   await js(`(async()=>{await chooseCoin('${coin}');if('${coin}'==='ZCD')await gozer.performance(100);else{const current=await gozer.bootstrap(),gpu=current.hardware.gpus.find(g=>g.vendor==='NVIDIA');if(gpu)await gozer.save({...current.config,selected:[gpu.id]});await gozer.install();}state=await gozer.bootstrap();configInputs();showView('mining');render()})()`);await pause(250);
   assert.equal(getState().miner.status,'idle');
   await fs.writeFile(path.join(shots,coin.toLowerCase()+'-workbench.png'),(await win.webContents.capturePage()).toPNG());
  }
 }
}
module.exports={run};
