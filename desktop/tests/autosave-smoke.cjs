const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const dir=path.resolve(__dirname,'../artifacts/autosave140');await fs.mkdir(dir,{recursive:true});
 const js=code=>win.webContents.executeJavaScript(code,true),sleep=ms=>new Promise(r=>setTimeout(r,ms)),errors=[];
 win.webContents.on('console-message',(_e,level,msg)=>{if(level===3)errors.push(msg)});
 async function until(code){for(let i=0;i<150;i++){if(await js(code))return;await sleep(100)}throw Error('Timed out: '+code)}
 const shot=async name=>{await sleep(200);await fs.writeFile(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG())};
 const change=async(selector,value)=>js(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(String(value))};n.dispatchEvent(new Event('input'));n.dispatchEvent(new Event('change'))})()`);
 await until('state?.ready&&!!window.flushMiningSettings');await js("showView('mining')");
 assert.equal(await js("!!document.querySelector('#save-mining')||!!document.querySelector('#performance-apply')"),false);
 await change('#performance',50);await until('state.config.performance===50');await js('window.flushMiningSettings()');
 assert.equal(getState().config.performance,50);
 await change('#performance',75);await change('#performance',100);await js('window.flushMiningSettings()');assert.equal(getState().config.performance,100);
 await change('#worker','AutoSaveTest');await js('window.flushMiningSettings()');assert.equal(getState().config.worker,'AutoSaveTest');
 await shot('single-auto-saved');
 await js("document.querySelector('[data-mode=dual]').click()");await until("state.config.workbenchMode==='dual'");
 assert.equal(await js("document.querySelectorAll('.dual-actions button').length"),4);
 assert.equal(await js("getComputedStyle(document.querySelector('.dual-settings summary')).display"),'list-item');
 await js("document.querySelector('[data-task=cpu] .dual-settings summary').click()");assert.equal(await js("document.querySelector('[data-task=cpu] .dual-settings').open"),true);
 await change('[data-task=cpu] .dual-fields input[placeholder="矿机名"]','cpu-autosave');await until("state.dual.tasks.cpu.config.worker==='cpu-autosave'");await js("document.querySelector('[data-task=cpu] .dual-settings summary').click()");
 await change('[data-task=cpu] input[type=range]',100);await change('[data-task=gpu] input[type=range]',50);
 await until('state.dual.tasks.cpu.config.performance===100&&state.dual.tasks.gpu.config.performance===50');
 assert.equal(getState().dual.tasks.cpu.config.cpuThreads,getState().cpuDevice.logical);
 await until("document.querySelector('[data-task=cpu] .task-note').textContent.includes('设置已保存')");
 // A partially typed wallet must not prevent an independent performance edit.
 await js("(()=>{const w=document.querySelector('[data-task=cpu] .dual-connection input');w.value='invalid';w.dispatchEvent(new Event('input'))})()");
 await change('[data-task=cpu] input[type=range]',75);await until('state.dual.tasks.cpu.config.performance===75');
 assert.equal(await js("document.querySelector('[data-task=cpu] .dual-connection input').value"),'invalid');
 assert.equal(await js("document.querySelector('[data-task=cpu] .dual-actions .primary').disabled"),true);
 await change('[data-task=cpu] .dual-connection input','invalid');await until("document.querySelector('[data-task=cpu] .task-note').textContent.includes('设置未保存')");
 await change('[data-task=cpu] .dual-connection input','');await until("document.querySelector('[data-task=cpu] .task-note').textContent.includes('设置已保存')");
 await shot('dual-auto-saved');
 for(const language of ['en','ja','ru']){await js(`gozer.language('${language}')`);await sleep(250);assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);await shot('dual-'+language)}
 await js("gozer.language('zh-CN')");await sleep(250);await js("document.querySelector('[data-mode=cpu]').click()");await until("state.config.workbenchMode==='cpu'");
 await change('#performance',50);await js('window.flushMiningSettings()');assert.equal(getState().config.performance,50);assert.equal(getState().config.cpuThreads,Math.max(1,Math.floor(getState().cpuDevice.logical*.5)));
 await js("(async()=>{await save({theme:'light'});render()})()");await shot('cpu-auto-saved-light');
 assert.equal(getState().miner.status,'idle');assert.ok(Object.values(getState().dual.tasks).every(t=>t.miner.status==='idle'));assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({version:getState().version,errors,noMining:true,singleAndDualSaved:true,logicalThreads:getState().cpuDevice.logical},null,2));
}
module.exports={run};
