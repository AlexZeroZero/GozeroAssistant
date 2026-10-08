const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const streamTest=process.env.GOZER_BNT_STREAM_TEST==='1',workerCount=streamTest?2:1;
 const address=require('../src/service-fee.cjs').ADDRESSES.BNT;
 assert.equal(require('../src/bnt.cjs').address(address),address);
 const js=code=>win.webContents.executeJavaScript(code,true),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const output=path.resolve(__dirname,'../artifacts/bnt'+getState().version.replaceAll('.',''));await fs.mkdir(output,{recursive:true});
 async function until(fn,ms=20000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await sleep(150)}throw Error('BNT desktop condition timed out; '+JSON.stringify(getState().logs.slice(-5)))}
 await until(()=>js('state?.ready&&!!window.openKernelLibrary'));
 try{
 await js("showView('mining');chooseCoin('BNT')");await until(()=>getState().config.coin==='BNT');
 await js(`document.querySelector('#wallet').value=${JSON.stringify(address)};document.querySelector('#cpu-threads').value=${JSON.stringify(String(workerCount))};document.querySelector('#save-mining').click()`);
 await until(()=>getState().config.wallets.BNT===address&&getState().config.cpuThreads===workerCount);
 await js("document.querySelector('#install').click()");await until(()=>getState().kernel.installed);
 const tuning=require('../src/bnt-tuning.cjs'),info=await tuning.coreInfo(path.resolve(__dirname,'../native/bnt/GozeroBlocknetCore.exe'));
 if(streamTest)assert.equal(info.streamPrefetch,true,'stream test requires the new AVX2 core');
 const savedPlan={engine:streamTest?'stream':info.avx2?'prefetch':'sse2',threads:workerCount,pages:'off',affinity:true,performance:getState().config.performance};
 await fs.writeFile(path.join(require('electron').app.getPath('userData'),'bnt-tuning.json'),JSON.stringify({at:'2026-10-01',fingerprint:tuning.compatibleFingerprints(info,getState().hardware)[1],selected:savedPlan}));
 await until(()=>js("!document.querySelector('#start').disabled"));
 await js("document.querySelector('#start').click()");await until(()=>getState().miner.status==='running');
 await until(()=>getState().miner.jobs.some(j=>j.telemetry?.hash>0)&&getState().logs.some(l=>l.text.includes('收到新任务')),60000);
 await sleep(6000);const s=getState();
 assert.equal(s.miner.session.bntOptimization.tuned,true,'legacy profile must actually reach running workers');
 assert.equal(s.miner.session.bntOptimization.source,'saved');assert.equal(s.miner.session.bntOptimization.engine.toLowerCase(),savedPlan.engine);
 assert.equal(s.miner.session.bntOptimization.boundWorkers,workerCount);
 assert.ok(await js("document.querySelector('#worker-rows').textContent.includes('H/s')"));
 assert.equal(s.bntThreadLimit,s.miner.session.bntBudget.maxThreads,'active budget remains stable after worker allocation');assert.ok(s.logs.some(l=>l.text.includes('CPU TOTAL')));assert.equal(s.serviceFee.active,true);assert.equal(s.serviceFee.recipient,address);
 await fs.writeFile(path.join(output,'running.png'),(await win.webContents.capturePage()).toPNG());
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify({version:s.version,optimization:s.miner.session.bntOptimization,cryptoHasSha3:require('node:crypto').getHashes().includes('sha3-256'),addressVerified:true,startedFromButton:true,hash:s.miner.jobs[0]?.telemetry,shares:s.miner.jobs[0]?.shares,feeRate:s.serviceFee.rate},null,2));
 }finally{await js('gozer.stop()');await until(()=>getState().miner.status==='idle')}
 await js("document.querySelector('#wallet').value='invalid';document.querySelector('#save-mining').click()");await sleep(300);
 assert.equal(getState().config.wallets.BNT,address,'invalid address must not replace valid settings');
 assert.equal(getState().miner.status,'idle');
}
module.exports={run};
