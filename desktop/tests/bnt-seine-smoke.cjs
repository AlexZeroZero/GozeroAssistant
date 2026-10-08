const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const js=code=>win.webContents.executeJavaScript(code,true),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const id=require('../src/bnt-seine-kernel.json').id,address=require('../src/service-fee.cjs').ADDRESSES.BNT;
 const out=path.resolve(__dirname,'../artifacts/bnt-seine-137');await fs.mkdir(out,{recursive:true});
 async function until(fn,ms=25000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await sleep(200)}throw Error('Seine condition timed out '+JSON.stringify(getState().logs.slice(-6)))}
 await until(()=>js('state?.ready&&!!window.openKernelLibrary'));
 let pid;
 try{
  await js("showView('mining');chooseCoin('BNT')");await until(()=>js(`state.config.coin==='BNT'&&!document.querySelector('#save-mining').disabled&&!!document.querySelector('#kernel-select option[value="${id}"]')`));
  await js(`document.querySelector('#wallet').value=${JSON.stringify(address)};document.querySelector('#cpu-threads').value='2';document.querySelector('#kernel-select').value=${JSON.stringify(id)};saveMining()`);
  await until(()=>getState().config.kernels.BNT===id&&getState().config.cpuThreads===2);
  await until(()=>js("document.querySelector('#bnt-tuning').hidden"));
  await js("openKernelLibrary('BNT')");assert.ok(await js("document.querySelector('.library-body').textContent.includes('Blocknet Core')"));
  if(!getState().kernel.installed)await js(`gozer.libraryInstall('BNT',${JSON.stringify(id)})`);
  await until(()=>js('state.kernel.installed&&!state.kernel.installing&&!state.miner.installing'));
  await sleep(150);
  await fs.writeFile(path.join(out,'downloads.png'),(await win.webContents.capturePage()).toPNG());
  if(process.env.GOZER_SEINE_VIEW_ONLY==='1'){
   await js("gozer.language('en')");await until(()=>js("document.documentElement.lang==='en'"));
   await fs.writeFile(path.join(out,'downloads-en.png'),(await win.webContents.capturePage()).toPNG());
   await js("gozer.language('zh-CN')");await js("showView('mining')");await sleep(200);
   assert.equal(await js("document.querySelector('#bnt-tuning').hidden"),true);
   await fs.writeFile(path.join(out,'selection.png'),(await win.webContents.capturePage()).toPNG());return;
  }
  await js("showView('mining')");await until(()=>js("!document.querySelector('#start').disabled"));
  await js("document.querySelector('#start').click()");
  await until(()=>getState().miner.jobs.some(j=>j.telemetry?.hash>0),90000);
  pid=getState().miner.jobs[0].pid;assert.ok(pid);
  await until(()=>getState().miner.jobs[0]?.shares?.accepted>0,120000);
  const s=getState();assert.equal(s.miner.session.kernelId,id);assert.equal(s.miner.session.cpuThreads,2);
  assert.equal(s.bntThreadLimit,s.miner.session.bntBudget.maxThreads);assert.equal(s.serviceFee.active,true);assert.ok(s.serviceFee.ledger.userGpuSeconds>0);
  assert.ok(await js("document.querySelector('#worker-rows').textContent.includes('H/s')"));
  assert.ok(s.logs.some(l=>/SHARE\s+accepted/.test(l.text)));
  await fs.writeFile(path.join(out,'running.png'),(await win.webContents.capturePage()).toPNG());
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify({version:s.version,downloaded:true,kernel:s.miner.session.kernelId,threads:s.miner.session.cpuThreads,telemetry:s.miner.jobs[0].telemetry,shares:s.miner.jobs[0].shares,fee:s.serviceFee.ledger,pid},null,2));
 }catch(e){await fs.writeFile(path.join(out,'failure.png'),(await win.webContents.capturePage()).toPNG());throw e}
 finally{await js('gozer.stop()');await until(()=>getState().miner.status==='idle')}
 if(pid){let alive=false;try{process.kill(pid,0);alive=true}catch{}assert.equal(alive,false,'Seine child must exit after Stop')}
}
module.exports={run};
