'use strict';
// Explicit --ui-smoke only, using a caller-provided isolated profile. No mining
// unless the operator also explicitly supplies GOZERO_SMOKE_WALLET_FILE.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const sleep=n=>new Promise(r=>setTimeout(r,n));
async function run({win,state,dir}){
 const out=path.join(dir,'qa');await fs.mkdir(out,{recursive:true});const errors=[];win.webContents.on('console-message',(_event,level,message)=>{if(level===3)errors.push(message);});
 const js=s=>win.webContents.executeJavaScript(s,true),wait=async(fn,seconds=15)=>{const until=Date.now()+seconds*1000;while(Date.now()<until){if(await fn())return;await sleep(200);}throw Error('GUI wait timed out: '+JSON.stringify(state().logs.slice(-5)));};
 const capture=async name=>{await sleep(300);await fs.writeFile(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 const layout=await js(`({title:document.title,node:typeof require,bodyWidth:document.body.clientWidth,navWidth:document.querySelector('nav').scrollWidth,views:document.querySelectorAll('.view').length})`);
 assert.equal(layout.node,'undefined');assert.equal(layout.views,6);assert.ok(layout.navWidth<=layout.bodyWidth);
 await wait(()=>js(`document.querySelector('#overview-status').textContent.includes('已连接')`));await capture('overview');
 await js(`document.querySelector('[data-view="mining"]').click()`);await capture('mining-idle');
 let live=null;
 if(process.env.GOZERO_SMOKE_WALLET_FILE){
  const wallet=JSON.parse(await fs.readFile(process.env.GOZERO_SMOKE_WALLET_FILE,'utf8')).wallet;
  await js(`document.querySelector('#wallet').value=${JSON.stringify(wallet)};document.querySelector('#duration').value='60';document.querySelector('#save-mining').click()`);
  await wait(()=>state().config.wallet===wallet&&state().config.seconds===60);
  await js(`document.querySelector('#start').click()`);await wait(()=>state().miner.status==='running');
  await wait(()=>state().logs.some(l=>l.text==='矿池授权成功'),30);await wait(()=>state().miner.rate.total>0,30);
  await wait(()=>state().miner.totals.accepted>0||state().miner.status==='idle',65);await capture('mining-live');
  live={...state().miner.totals,rate:state().miner.rate};
  await js(`document.querySelector('#stop').click()`);await wait(()=>state().miner.status==='idle'&&!state().fee.active,12);
  assert.ok(live.accepted>0,'No accepted share in bounded GUI pool test');assert.equal(live.rejected,0);
 }
 await js(`document.querySelector('[data-view="performance"]').click();document.querySelector('#benchmark').click()`);
 await wait(()=>state().miner.status==='running');await wait(()=>state().miner.status==='idle',50);
 assert.ok(state().miner.rate.total>0);assert.ok(state().miner.session.benchmark);await capture('benchmark');
 const benchmark=state().miner.rate;
 await js(`document.querySelector('[data-view="settings"]').click();document.querySelector('#theme-select').value='light';document.querySelector('#save-settings').click()`);
 await wait(()=>state().config.theme==='light');await capture('settings-light');
 const saved=JSON.parse(await fs.readFile(path.join(dir,'settings.json'),'utf8'));assert.equal(saved.theme,'light');
 assert.deepEqual(errors,[]);
 win.setSize(780,620);await js(`document.querySelector('[data-view="mining"]').click()`);await capture('mining-small');
 const small=await js(`({width:document.body.clientWidth,nav:document.querySelector('nav').scrollWidth,main:document.querySelector('main').clientWidth,scroll:document.querySelector('main').scrollWidth})`);
 assert.ok(small.nav<=small.width);assert.ok(small.scroll<=small.main,'Small window horizontal overflow');
 const report={passed:true,layout,small,hardware:state().hardware,live,benchmark,rendererErrors:errors,settingsPersisted:true,stopReturnedIdle:true};
 if(process.env.GOZERO_SMOKE_SHUTDOWN_ACTIVE==='1'){
  await js(`document.querySelector('[data-view="performance"]').click();document.querySelector('#benchmark').click()`);
  await wait(()=>state().miner.status==='running');await sleep(1500);assert.equal(state().miner.status,'running');report.shutdownWithActiveWorker=true;
 }
 await fs.writeFile(path.join(out,'gui-smoke.json'),JSON.stringify(report,null,2));console.log('GOZERO_GUI_SMOKE_PASS '+JSON.stringify(report));
}
module.exports={run};
