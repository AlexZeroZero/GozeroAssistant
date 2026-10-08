const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const js=s=>win.webContents.executeJavaScript(s,true),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(fn){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await sleep(100)}throw Error('Memory UI timeout')}
 await until(()=>js('state?.ready&&!!window.renderCpuMining&&!!window.renderDual'));
 await js("showView('mining');chooseCoin('BNT')");await until(()=>getState().config.coin==='BNT');
 assert.equal(getState().config.pools.BNT,'stratum+tcp://bnt.pool.gozero.trade:14444');
 const budget=require('../src/bnt.cjs').memoryBudget({cpu:[{NumberOfLogicalProcessors:128}],metrics:{totalMemory:64*1024**3,freeMemory:56*1024**3}});
 const rows=await js(`(()=>{const actual=state;try{state=structuredClone(state);state.config.coin='BNT';state.config.cpuThreads=0;state.bntMemory=${JSON.stringify(budget)};state.bntThreadLimit=23;state.hardware.metrics.freeMemory=56*1073741824;const rows=[];for(const value of [50,75,100]){document.querySelector('#performance').value=value;document.querySelector('#performance').dispatchEvent(new Event('input'));rows.push({value,threads:Number(document.querySelector('#cpu-threads').value),max:Number(document.querySelector('#cpu-threads').max),note:document.querySelector('.performance-note').textContent})}return rows}finally{state=actual;configInputs();render()}})()`);
 assert.deepEqual(rows.map(r=>r.threads),[11,17,23]);assert.ok(rows.every(r=>r.max===23));assert.ok(rows.every(r=>r.note.includes('6.4')));
 await js("(async()=>{await gozer.workbenchMode('dual');await gozer.taskSave('cpu',{coin:'BNT',cpuThreads:0});state=await gozer.bootstrap();configInputs();render();renderDual(state)})()");
 const dual=await js(`(()=>{const fake=structuredClone(state);fake.bntMemory=${JSON.stringify(budget)};fake.bntThreadLimit=23;fake.hardware.metrics.freeMemory=56*1073741824;renderDual(fake);const n=document.querySelector('[data-task="cpu"] input[type="range"]'),threads=document.querySelector('[data-task="cpu"] input[type="number"]');return [50,75,100].map(value=>{n.value=value;n.dispatchEvent(new Event('input'));return Number(threads.value)})})()`);
 assert.deepEqual(dual,[11,17,23]);
 // Exercise actual backend mode application without launching any miner.
 await js("(async()=>{state=await gozer.workbenchMode('cpu');configInputs();render()})()");
 await until(()=>js("!document.querySelector('#performance-apply').disabled"));
 await js("document.querySelector('#performance').value=100;document.querySelector('#performance-apply').click()");
 await until(()=>getState().config.performance===100);
 assert.ok(getState().config.cpuThreads>0);
 assert.equal(getState().miner.status,'idle');
 const dir=path.resolve(__dirname,'../artifacts/bnt-memory-132');await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({version:getState().version,fixture:'64 GiB total / 56 GiB free / 128 logical threads; UI only',single:rows,dual,actualBudget:getState().bntMemory,actualThreads:getState().config.cpuThreads,miningStarted:false},null,2));
 await fs.writeFile(path.join(dir,'actual-workbench.png'),(await win.webContents.capturePage()).toPNG());
}
module.exports={run};
