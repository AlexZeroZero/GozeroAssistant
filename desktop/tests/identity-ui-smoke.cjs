const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState,floating){
 const dir=path.resolve(__dirname,'../artifacts/identity141');await fs.mkdir(dir,{recursive:true});
 const js=s=>win.webContents.executeJavaScript(s,true),sleep=ms=>new Promise(r=>setTimeout(r,ms)),errors=[];
 win.webContents.on('console-message',(_e,level,msg)=>{if(level===3)errors.push(msg)});
 async function until(code){for(let i=0;i<150;i++){if(await js(code))return;await sleep(100)}throw Error('Timed out: '+code)}
 const shot=async name=>{await sleep(150);await fs.writeFile(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG())};
 await until('state?.ready&&!!window.renderPoolReporting');assert.equal(win.webContents.getZoomFactor(),1.1);assert.ok(win.getContentSize().every((n,i)=>Math.abs(n-[872,654][i])<=1));
 await js("showView('mining')");assert.equal(await js("document.querySelector('#report-pool-identity').checked"),true);
 await js("document.querySelector('#report-pool-identity').click()");await until('state.config.reportPoolIdentity===false');assert.equal(getState().config.reportPoolIdentity,false);
 await js("document.querySelector('#report-pool-identity').click()");await until('state.config.reportPoolIdentity===true');
 await js("document.querySelector('#report-pool-identity').scrollIntoView({block:'center'})");await shot('reporting-enabled');
 const fixture=JSON.stringify([{id:100001,at:Date.now(),type:'系统',task:null,text:'界面验证示例 · 不启动挖矿'},{id:100002,at:Date.now(),type:'矿工',task:'gpu',text:'GPU 日志筛选测试'},{id:100003,at:Date.now(),type:'矿工',task:'cpu',text:'CPU 日志筛选测试'}]);
 await js(`state.logs=${fixture};showView('logs');document.querySelector('#logs [data-log-kind=gpu]').click()`);
 assert.equal(await js("document.querySelectorAll('#log-list .log-row').length"),1);assert.match(await js("document.querySelector('#log-list').textContent"),/GPU/);await shot('logs-gpu');
 await js(`state.logs=${fixture};document.querySelector('#logs [data-log-kind=cpu]').click()`);assert.equal(await js("document.querySelectorAll('#log-list .log-row').length"),1);assert.match(await js("document.querySelector('#log-list').textContent"),/CPU/);
 await js(`state.logs=${fixture};document.querySelector('#logs [data-log-kind=all]').click()`);assert.equal(await js("document.querySelectorAll('#log-list .log-row').length"),3);
 await js(`state.logs=${fixture};showView('mining');document.querySelector('.workbench-log [data-log-kind=cpu]').click()`);assert.equal(await js("document.querySelectorAll('#workbench-log-list .workbench-log-row').length"),1);
 await js("document.querySelector('[data-mode=dual]').click()");await until("state.config.workbenchMode==='dual'");
 await js("document.querySelector('[data-task=cpu] .dual-settings summary').click();document.querySelector('[data-task=cpu] input[placeholder=\"向矿池上报矿工名和设备型号\"]').click()");await until('state.dual.tasks.cpu.config.reportPoolIdentity===false');assert.equal(getState().dual.tasks.gpu.config.reportPoolIdentity,true);
 await shot('dual-reporting');
 for(const language of ['en','ja','ru']){await js(`gozer.language('${language}')`);await sleep(200);assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false)}
 await js("(async()=>{await save({theme:'light'});render()})()");await shot('dual-light-ru');
 await floating.show();await sleep(200);assert.equal(floating.win.webContents.getZoomFactor(),1.1);assert.ok(floating.win.getContentSize().every((n,i)=>Math.abs(n-[317,240][i])<=4),JSON.stringify(floating.win.getContentSize()));
 await fs.writeFile(path.join(dir,'floating.png'),(await floating.win.webContents.capturePage()).toPNG());
 assert.deepEqual(errors,[]);assert.equal(getState().miner.status,'idle');
 await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({version:getState().version,size:win.getContentSize(),zoom:win.webContents.getZoomFactor(),errors,noMining:true},null,2));
}
module.exports={run};
