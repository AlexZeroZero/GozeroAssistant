'use strict';
// Explicit opt-in GUI validation; never used in normal startup.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(context){
 const {win,state,downloads,dir}=context,js=s=>win.webContents.executeJavaScript(s,true);
 const wait=async fn=>{for(let i=0;i<9000;i++){if(await fn())return;await sleep(100);}throw Error('Download GUI timeout '+JSON.stringify(state().coreInstall));};
 await wait(()=>state().ready);assert.ok(downloads);
 await js(`document.querySelector('[data-view="mining"]').click();document.querySelector('[data-coin="MDS"]').click()`);await wait(()=>state().config.coin==='MDS');
 assert.equal(state().miner.status,'idle');assert.equal(state().coreInstall.available.MDS,false);
 await js(`document.querySelector('#install-core').click()`);await wait(()=>state().starting);
 await js(`window.gozero.stop()`);await wait(()=>!state().starting);
 assert.equal(state().miner.status,'idle');assert.equal(state().fee.active,false);
 await js(`document.querySelector('#install-core').click()`);await wait(()=>state().coreInstall.available.MDS&&!state().starting);
 assert.equal(state().miner.status,'idle');assert.equal(state().fee.active,false);
 const out=path.join(dir,'qa');await fs.mkdir(out,{recursive:true});
 await fs.writeFile(path.join(out,'download-smoke.json'),JSON.stringify({cancelNoMining:true,prepareNoMining:true,realGithubDownload:true,coreInstall:state().coreInstall},null,2));
 // The subsequent real-pool GUI test must use cached kernels even with download
 // networking unavailable. Pool sockets remain available for actual mining.
 downloads.deps.request=async()=>{throw Error('OFFLINE_CACHE_TEST: must not download');};
 await require('./mds-smoke.cjs').run(context);
}
module.exports={run};
