const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const dir=path.resolve(__dirname,'../artifacts/transport142');await fs.mkdir(dir,{recursive:true});
 const js=s=>win.webContents.executeJavaScript(s,true),sleep=ms=>new Promise(r=>setTimeout(r,ms)),errors=[];
 win.webContents.on('console-message',(_e,level,msg)=>{if(level===3)errors.push(msg)});
 async function until(code){for(let i=0;i<100;i++){if(await js(code))return;await sleep(100)}throw Error('Timed out: '+code)}
 const shot=async name=>{await sleep(100);await fs.writeFile(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG())};
 await until('state?.ready&&!!window.setMiningTransport');await js("showView('mining')");
 async function pick(coin){await js(`(async()=>{await save({coin:'${coin}'});configInputs();render()})()`);await sleep(100)}
 async function select(value){await js(`(()=>{const n=document.querySelector('#pool-transport-row select');n.value='${value}';n.dispatchEvent(new Event('change'))})()`)}
 for(const [coin,port]of [['PRL','7048'],['QTC','7049']]){await pick(coin);await select('tcp');await until(`state.config.pools.${coin}.startsWith('stratum+tcp://')&&state.config.pools.${coin}.endsWith(':${port}')`);assert.equal(getState().config.pools[coin].endsWith(':'+port),true);await select('ssl');await until(`state.config.pools.${coin}.startsWith('stratum+ssl://')`)}
 await pick('PRL');await select('tcp');await until("state.config.pools.PRL.endsWith(':7048')");await js("document.querySelector('#pool-transport-row').scrollIntoView({block:'center'})");await shot('prl-tcp');
 await pick('YSR');assert.equal(await js("document.querySelector('#pool-transport-row select').disabled"),true);assert.equal(await js("document.querySelector('#pool-transport-row select').value"),'https');
 await pick('ZCD');assert.equal(await js("document.querySelector('#pool-transport-row select').value"),'tcp');await select('ssl');await until("state.config.pools.ZCD==='stratum+ssl://zcd.pool.gozero.trade:3333'");await select('tcp');await until("state.config.pools.ZCD.startsWith('stratum+tcp://')");
 await pick('BNT');assert.equal(await js("document.querySelector('#pool-transport-row select').value"),'tcp');
 await js("(async()=>{await save({kernels:{...state.config.kernels,BNT:'seine-bnt-0.2.15'}});configInputs();render()})()");await sleep(150);assert.equal(await js("document.querySelectorAll('#pool-transport-row option').length"),1);
 await js("document.querySelector('[data-mode=dual]').click()");await until("state.config.workbenchMode==='dual'");
 await js("(()=>{const n=document.querySelector('[data-task=gpu] .task-coin');n.value='NOID';n.dispatchEvent(new Event('change'))})()");await until("state.dual.tasks.gpu.config.coin==='NOID'");
 await js("(()=>{const n=document.querySelector('[data-task=gpu] .pool-transport-select');n.value='tcp';n.dispatchEvent(new Event('change'))})()");await until("state.dual.tasks.gpu.config.pools.NOID.endsWith(':3337')&&state.dual.tasks.gpu.config.noidConnection==='native'");
 await js("document.querySelector('[data-task=gpu] details').open=true;(()=>{const n=document.querySelector('[aria-label=\"NOID 连接模式\"]');n.value='auto';n.dispatchEvent(new Event('change'))})()");await until("state.dual.tasks.gpu.config.noidConnection==='auto'");assert.equal(getState().dual.tasks.cpu.config.pools.ZCD,'stratum+tcp://zcd.pool.gozero.trade:3333');await shot('dual-protocols');
 for(const language of ['en','ja','ru']){await js(`gozer.language('${language}')`);await sleep(100);assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false)}
 await js("(async()=>{await save({theme:'light'});render()})()");await shot('dual-light');
 assert.equal(getState().miner.status,'idle');assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({version:getState().version,errors,noMining:true}));
}
module.exports={run};
