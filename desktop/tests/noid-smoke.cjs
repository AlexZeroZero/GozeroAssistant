'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const js=s=>win.webContents.executeJavaScript(s,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const out=path.resolve(__dirname,'../artifacts/noid');await fs.mkdir(out,{recursive:true});
 const gpu=getState().hardware.gpus.find(g=>g.vendor==='NVIDIA');assert.ok(gpu);
 await js(`(async()=>{const s=await gozer.bootstrap();await gozer.save({...s.config,coin:'NOID',kernels:{...s.config.kernels,NOID:'auto'},noidConnection:'auto',selected:[${JSON.stringify(gpu.id)}]});state=await gozer.bootstrap();configInputs();showView('mining');render()})()`);await pause(500);
 assert.equal(getState().kernel.installed,false);assert.equal(getState().config.coin,'NOID');
 const recipient='o1g87q6yrrsnay5czqzggvdy9lyvxjtjzkycp0kzz3z9wx45u2m6uqwd8yjg';
 assert.equal(getState().serviceFee.addresses.NOID,recipient);
 await js("document.querySelector('#fee-details').click()");
 assert.ok((await js("[...document.querySelectorAll('.fee-address')].map(n=>n.value)")).includes(recipient));
 await js("document.querySelector('#details').close()");
 assert.equal(await js("document.querySelector('#noid-requirements').hidden"),false);
 assert.match(await js("document.querySelector('#noid-specs').textContent"),/CPU.*x64.*GPU.*NVIDIA.*610/s);
 assert.match(await js("document.querySelector('#app-version').textContent"),new RegExp(getState().version.replaceAll('.','\\.')));
 assert.equal(await js("[...document.querySelector('#kernel-select').options].some(o=>o.value.startsWith('gozero'))"),false);
 await js("document.querySelector('#pool-backups-open').click()");
 await js("document.querySelector('#pool-backup-preset-1').value='stratum+ssl://stratum-us.suprnova.cc:3341';document.querySelector('#pool-backup-preset-1').onchange();document.querySelector('#pool-backup-preset-2').value='';document.querySelector('#pool-backup-preset-2').onchange()");
 await js("document.querySelector('#pool-backups-save').onclick()");
 assert.deepEqual(getState().config.poolBackups.NOID,['stratum+ssl://stratum-us.suprnova.cc:3341']);
 await js("document.querySelector('#pool-backups-open').click();document.querySelector('#pool-backup-preset-1').value='stratum+ssl://noid.suprnova.cc:3341';document.querySelector('#pool-backup-preset-1').onchange();document.querySelector('#pool-backup-preset-2').value='stratum+ssl://stratum-us.suprnova.cc:3341';document.querySelector('#pool-backup-preset-2').onchange()");
 await js("document.querySelector('#pool-backups-save').onclick()");
 const reports=[];
 const kernelReports=[];
 for(const id of ['suprminer-noid-1.9.27','fl4shminer-noid-1.5.0','auto']){
  await js(`(async()=>{document.querySelector('#kernel-select').value=${JSON.stringify(id)};await document.querySelector('#kernel-select').onchange();render()})()`);
  await pause(180);const current=getState();assert.match(await js("document.querySelector('#kernel-state').textContent"),new RegExp(current.kernel.name));assert.equal(current.config.kernels.NOID,id);
  assert.equal(current.kernel.id,id==='auto'?'suprminer-noid-1.9.27':id);
  assert.equal(current.kernel.installed,!!current.kernel.bundled);
  if(!current.kernel.bundled){assert.equal(await js("document.querySelector('#install').disabled"),false);assert.equal(await js("document.querySelector('#start').disabled"),true)}
  assert.equal(await js("document.querySelector('#pool-backups-open').disabled"),false);
  assert.equal(await js("document.querySelector('#noid-connection-row').hidden"),false);
  if(id==='suprminer-noid-1.9.27'){
   await js("(async()=>{document.querySelector('#noid-connection').value='auto';await document.querySelector('#noid-connection').onchange();render()})()");
   assert.equal(getState().config.noidConnection,'auto');
   assert.equal(await js("document.querySelector('#pool-backups-open').disabled"),false);
   if(process.env.GOZER_CONNECTION_TEST==='1'){
    const result=await js("(async()=>{const r=await gozer.poolConnectionCheck();state=await gozer.bootstrap();render();return r})()");assert.equal(result.protocol,'parano1d-stratum-v1');
    assert.equal(getState().config.pools.NOID,'stratum+ssl://stratum-apac.suprnova.cc:3341');
    assert.equal(getState().miner.status,'idle');
    await fs.writeFile(path.join(out,'connection-ui-1.0.11.json'),JSON.stringify({...result,miningExecuted:false},null,2));
   }
   await js("(async()=>{document.querySelector('#noid-connection').value='auto';await document.querySelector('#noid-connection').onchange();render()})()");
  }
  if(current.kernel.bundled)assert.equal(await js("document.querySelector('#noid-connection').disabled"),true);
  kernelReports.push({id,name:current.kernel.name,fee:current.kernel.kernelFee,installed:current.kernel.installed});
  await fs.writeFile(path.join(out,id+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 await js("(async()=>{document.querySelector('#kernel-select').value='suprminer-noid-1.9.27';await document.querySelector('#kernel-select').onchange();render()})()");
 for(const language of ['zh-CN','en','ja','ru']){
  await js(`(async()=>{await gozer.language(${JSON.stringify(language)});state=await gozer.bootstrap();render()})()`);await pause(250);
  reports.push(await js("({language:state.config.language,overflow:document.documentElement.scrollWidth-innerWidth,coin:state.config.coin,installed:state.kernel.installed})"));
  await fs.writeFile(path.join(out,language+'.png'),(await win.webContents.capturePage()).toPNG());
  await js("document.querySelector('#pool-backups-open').click()");await pause(80);
  assert.ok(await js("document.querySelector('#pool-dialog').scrollWidth<=document.querySelector('#pool-dialog').clientWidth+1"));
  await fs.writeFile(path.join(out,'pools-'+language+'.png'),(await win.webContents.capturePage()).toPNG());
  await js("document.querySelector('#pool-backups-close').click()");
 }
 await js("(async()=>{await gozer.language('zh-CN');document.querySelector('#kernel-select').value='auto';await document.querySelector('#kernel-select').onchange();await chooseCoin('PRL')})()");assert.equal(getState().config.coin,'PRL');
 await js("(async()=>{await chooseCoin('NOID');showView('earnings')})()");await pause(500);assert.equal(await js("document.querySelectorAll('#profit-cards .profit-card').length"),3);
 await fs.writeFile(path.join(out,'earnings.png'),(await win.webContents.capturePage()).toPNG());
 assert.equal(getState().miner.status,'idle');assert.ok(reports.every(r=>r.overflow<=1));
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({reports,kernelReports,actualHardware:gpu.name,miningExecuted:false},null,2));
}
module.exports={run};
