const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const dir=path.resolve(__dirname,'../artifacts/release128');await fs.mkdir(dir,{recursive:true});const js=code=>win.webContents.executeJavaScript(code,true),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const errors=[];win.webContents.on('console-message',(_e,level,msg)=>{if(level===3)errors.push(msg)});
 async function until(code){for(let i=0;i<150;i++){if(await js(code))return;await sleep(100)}throw Error('Timed out: '+code)}
 const shot=async name=>{await sleep(180);await fs.writeFile(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG())};
 await until('state?.ready&&!!window.openKernelLibrary');const dims=await js('({width:innerWidth,height:innerHeight})');assert.ok(Math.abs(dims.width-792)<2&&Math.abs(dims.height-594)<2);
 await js("showView('mining');chooseCoin('BNT')");await until("state.config.coin==='BNT'");assert.equal(getState().config.pools.BNT,'stratum+tcp://bnt.pool.gozero.trade:14444');await shot('bnt-workbench-dark');
 await js("openKernelLibrary('NOID')");assert.equal(await js("document.querySelectorAll('.library-kernel').length"),2);await shot('noid-library-dark');
 await js(`(async()=>{await gozer.libraryInstall('BNT',${JSON.stringify(require('../src/bnt-kernel.json').id)});state=await gozer.bootstrap();render();openKernelLibrary('BNT')})()`);assert.equal(getState().kernelLibrary.find(c=>c.symbol==='BNT').kernels[0].installed,true);
 await js("window.saved=structuredClone(state);state.miner.status='running';state.serviceFee.active=true;render();showView('mining');document.querySelector('[data-coin=NOID]').click()");await until("view==='kernels'");assert.equal(await js('state.config.coin'), 'BNT');await js("document.querySelector('.library-info button').click()");await until("!document.querySelector('#toast').hidden");assert.match(await js("document.querySelector('#toast').textContent"),/已有挖矿任务/);assert.equal(getState().miner.status,'idle','fixture must not start a real miner');
 await js("state=saved;render();showView('overview');document.querySelector('[data-detail=cpu]').click()");assert.ok(await js("document.querySelector('#details').open"));await js("document.querySelector('#details-close').click()");
 await js("(async()=>{await save({theme:'light'});configInputs();showView('mining')})()");await shot('bnt-workbench-light');await js("openKernelLibrary('NOID')");await shot('noid-library-light');
 // Real pinned NOID download, install and hashes. No miner is executed.
 if(process.env.GOZER_DOWNLOAD_TEST==='1'){await js("gozer.libraryInstall('NOID','fl4shminer-noid-1.5.0')");await js("gozer.libraryInstall('NOID','suprminer-noid-1.9.27')");assert.equal(getState().kernelLibrary.find(c=>c.symbol==='NOID').kernels.find(k=>k.id==='fl4shminer-noid-1.5.0').installed,true);await shot('noid-download-verified')}
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(dir,'result.json'),JSON.stringify({dims,errors,coins:getState().coins.map(c=>c.symbol)},null,2));
}
module.exports={run};
