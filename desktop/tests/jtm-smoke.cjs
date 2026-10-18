'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const js=s=>win.webContents.executeJavaScript(s,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const out=process.env.GOZER_JTM_ARTIFACTS||path.resolve(__dirname,'../artifacts/jtm');await fs.mkdir(out,{recursive:true});
 async function until(fn,ms=15000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await pause(200)}throw Error('JTM UI condition timed out '+JSON.stringify(getState().logs.slice(-6)))}
 await until(()=>js('state?.ready&&!!window.selectLayoutCoin'));
 await js("selectLayoutCoin('JTM')");await js("gozer.install()");
 await js("(async()=>{state=await gozer.bootstrap();configInputs();render();showView('mining');document.querySelector('#cpu-threads').value='2';document.querySelector('#cpu-threads').dispatchEvent(new Event('change'));await flushMiningSettings()})()");
 await until(()=>getState().config.cpuThreads===2&&getState().kernel.installed);
 assert.equal(getState().config.pools.JTM,require('../src/jtm.cjs').DEFAULT_POOL);assert.equal(await js("document.querySelector('#start').disabled"),true);
 assert.equal(await js("document.querySelector('#jtm-key-row').hidden"),true);
 assert.deepEqual(await js("[...document.querySelectorAll('#pool-transport-row option')].map(o=>o.value)"),['https']);
 assert.equal(await js("document.querySelector('#pool-transport-row select').disabled"),true);
 await js("(async()=>{await gozer.save({...state.config,pools:{...state.config.pools,JTM:'http://jtm.pool.gozero.trade/rpc'}});state=await gozer.bootstrap();configInputs();render()})()");
 assert.equal(getState().config.pools.JTM,require('../src/jtm.cjs').DEFAULT_POOL);
 assert.equal(await js("document.querySelector('#pool').value"),require('../src/jtm.cjs').DEFAULT_POOL);
 assert.equal(await js("document.querySelector('#jtm-bench').disabled"),false);
 await js("document.querySelector('#jtm-bench').click()");await until(()=>getState().miner.status==='running');
 await until(()=>getState().miner.jobs.some(j=>j.telemetry?.hash>0),20000);
 assert.equal(getState().serviceFee.active,false);
 await js("showView('logs')");await fs.writeFile(path.join(out,'jtm-benchmark-running.png'),(await win.webContents.capturePage()).toPNG());
 await until(()=>getState().miner.status==='idle',45000);
 assert(getState().miner.benchmark?.offline&&getState().miner.benchmark.devices[0].hash>0);
 for(const theme of ['dark','light']){
  await js(`(async()=>{await gozer.save({...state.config,theme:'${theme}'});state=await gozer.bootstrap();configInputs();render();showView('mining');document.querySelector('#workspace-panel-config').scrollIntoView()})()`);
  await pause(100);await fs.writeFile(path.join(out,'jtm-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
  await js("document.querySelector('#jtm-guide').open=true;document.querySelector('#jtm-guide').scrollIntoView({block:'start'})");
  await pause(100);await fs.writeFile(path.join(out,'jtm-guide-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());
  await js("document.querySelector('#jtm-guide').open=false");
 }
 await js("openKernelLibrary('JTM')");await pause(100);await fs.writeFile(path.join(out,'jtm-library.png'),(await win.webContents.capturePage()).toPNG());
 await fs.writeFile(path.join(out,'ui-smoke.json'),JSON.stringify({passed:true,benchmark:getState().miner.benchmark},null,2));
}
module.exports={run};
