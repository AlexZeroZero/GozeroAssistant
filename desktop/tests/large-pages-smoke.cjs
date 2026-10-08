const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const js=s=>win.webContents.executeJavaScript(s,true),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(fn){const end=Date.now()+25000;while(Date.now()<end){if(await fn())return;await sleep(100)}throw Error('Large pages UI timed out')}
 await until(()=>js('state?.ready&&document.querySelectorAll(".large-pages-row").length===3'));
 assert.notEqual(getState().largePages.phase,'error');
 await js("showView('mining');chooseCoin('BNT')");await until(()=>getState().config.coin==='BNT');
 await until(()=>js('!document.querySelector("[data-location=single]").hidden'));
 const out=path.resolve(__dirname,'../artifacts/large-pages'+getState().version.replaceAll('.',''));await fs.mkdir(out,{recursive:true});
 await js('document.querySelector("[data-location=single]").scrollIntoView({block:"nearest"})');
 await fs.writeFile(path.join(out,'workbench-dark.png'),(await win.webContents.capturePage()).toPNG());
 const size=await js('(()=>{const b=document.querySelector("[data-location=single] .large-pages-enable");return{height:b.getBoundingClientRect().height,font:parseFloat(getComputedStyle(b).fontSize)}})()');
 assert.ok(size.height>=36&&size.font>=14);
 await js("(async()=>{await gozer.save({...state.config,theme:'light'});state=await gozer.bootstrap();render()})()");await sleep(200);await fs.writeFile(path.join(out,'workbench-light.png'),(await win.webContents.capturePage()).toPNG());await js("(async()=>{await gozer.save({...state.config,theme:'dark'});state=await gozer.bootstrap();render()})()");await sleep(200);
 // Exercise the real IPC and app confirmation, but never modify host policy.
 const dialog=require('electron').dialog,originalDialog=dialog.showMessageBox;
 const proto=require('../src/large-pages.cjs').LargePages.prototype,originalInvoke=proto.invoke;let requests=0,confirmations=0;
 proto.invoke=async function(mode){if(mode==='--request'){requests++;return{ok:true,granted:true,assigned:true,tokenAvailable:false,allocationAvailable:false}}return originalInvoke.call(this,mode)};
 try{
  dialog.showMessageBox=async()=>{confirmations++;return{response:1}};
  await js('gozer.largePagesEnable()');assert.equal(requests,0);assert.equal(confirmations,1);
  dialog.showMessageBox=async()=>{confirmations++;return{response:0}};
  await js('gozer.largePagesEnable()');assert.equal(requests,1);assert.equal(getState().largePages.phase,'pending');assert.equal(getState().largePages.preferred,true);
  await until(()=>js('document.querySelector("[data-location=single] span").textContent.includes("注销")'));
  await js("gozer.workbenchMode('dual')");await until(()=>js('!document.querySelector("[data-location=dual]").hidden'));
  await js("showView('settings')");assert.equal(await js('document.querySelector("[data-location=settings] span").textContent.includes("注销")'),true);
  await fs.writeFile(path.join(out,'settings.png'),(await win.webContents.capturePage()).toPNG());
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify({version:getState().version,readOnlyHostProbe:true,policyChangeMocked:true,cancelPreventedElevation:true,pendingState:true,singleDualSettings:true,miningStarted:getState().miner.status!=='idle'},null,2));
 }finally{dialog.showMessageBox=originalDialog;proto.invoke=originalInvoke}
}
module.exports={run};
