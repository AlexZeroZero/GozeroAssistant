const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const js=s=>win.webContents.executeJavaScript(s,true),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(fn){const end=Date.now()+25000;while(Date.now()<end){if(await fn())return;await sleep(100)}throw Error('BNT optimization UI timed out: '+JSON.stringify(getState().bntTuning))}
 await until(()=>js('state?.ready&&!!window.renderCpuMining'));
 await js("showView('mining');chooseCoin('BNT')");await until(()=>getState().config.coin==='BNT');
 await js("document.querySelector('#install').click()");await until(()=>getState().kernel.installed);
 assert.equal(getState().kernel.version,require('../src/bnt-kernel.json').version);
 await until(()=>js("!document.querySelector('#bnt-tuning button').disabled"));
 await js('saveMining()');const before=getState().config.cpuThreads;
 await js("document.querySelector('#bnt-tuning button').click()");await until(()=>getState().bntTuning.running);
 await until(()=>js("!document.querySelector('#bnt-tuning button:nth-child(2)').hidden"));
 await js("document.querySelector('#bnt-tuning button:nth-child(2)').click()");await until(()=>!getState().bntTuning.running);
 assert.equal(getState().config.cpuThreads,before);assert.equal(getState().miner.status,'idle');assert.equal(getState().bntTuning.result,null);
 await until(()=>js("!document.querySelector('#bnt-tuning button').disabled"));
 const dir=path.resolve(__dirname,'../artifacts/bnt-optimization-133');await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'cancelled.png'),(await win.webContents.capturePage()).toPNG());
 await js('gozer.bntTune()');
 assert.ok(getState().bntTuning.result);assert.equal(getState().config.cpuThreads,1);assert.equal(getState().miner.status,'idle');
 await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({completionApplied:true,version:getState().version,kernel:getState().kernel.version,tuning:getState().bntTuning,threadsUnchanged:true,miningStarted:false},null,2));
}
module.exports={run};
