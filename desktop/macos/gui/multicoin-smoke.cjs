'use strict';
// Explicit isolated-profile acceptance harness. Wallets are supplied by the tester.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run({win,state,dir,menubar}){
 const privateConfig=JSON.parse(await fs.readFile(process.env.GOZERO_COINS_CONFIG,'utf8'));
 const out=path.join(dir,'qa');await fs.mkdir(out,{recursive:true});
 const errors=[],report={coins:{},rendererErrors:errors};
 win.webContents.on('console-message',(_e,level,message)=>{if(level===3)errors.push(message);});
 const js=s=>win.webContents.executeJavaScript(s,true);
 const wait=async(fn,seconds=60)=>{const until=Date.now()+seconds*1000;while(Date.now()<until){if(await fn())return;await sleep(250);}throw Error('Acceptance timeout: '+JSON.stringify(state().logs.slice(-8)));};
 const click=selector=>js(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const runSeconds=Number(process.env.GOZERO_GUI_RUN_SECONDS||60);assert.ok(runSeconds>=30&&runSeconds<=600);
 await wait(()=>state().ready);
 await click('[data-view="mining"]');
 for(const coin of ['NOID','QTC','PRL']){
  await click('[data-coin="'+coin+'"]');await wait(()=>state().config.coin===coin);
  const c=privateConfig[coin];
  await js(`document.querySelector('#wallet').value=${JSON.stringify(c.wallet)};document.querySelector('#wallet').type='password';document.querySelector('#worker').value='GozeroGUIQA';document.querySelector('#preset').value=${JSON.stringify(c.preset)};document.querySelector('#preset').dispatchEvent(new Event('change'));document.querySelector('#save-mining').click()`);
  await wait(()=>state().config.wallet===c.wallet);
  assert.equal(state().config.seconds,0);
  if(coin!=='NOID'){assert.equal(await js(`document.querySelector('#cpu-threads').disabled`),true);assert.equal(await js(`document.querySelector('#benchmark').disabled`),true);}
  await click('#start');await wait(()=>state().miner.status==='running');await wait(()=>state().miner.rate.total>0,180);
  const began=state().miner.session.startedAt,first=state().miner.points.at(-1).at;
  await js(`window.gozero.language('en')`);await wait(()=>state().config.language==='en');
  await sleep(500);
  const untranslated=await js(`(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n,a=[];while(n=w.nextNode())if(!n.parentElement.closest('[data-no-i18n],script,style')&&/[\\u4e00-\\u9fff]/.test(n.nodeValue))a.push(n.nodeValue.trim());return a;})()`);
  assert.deepEqual(untranslated,[]);
  win.setSize(780,620);await sleep(500);
  assert.ok(await js(`document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth`),'Layout overflow');
  await fs.writeFile(path.join(out,coin+'-en.png'),(await win.webContents.capturePage()).toPNG());win.setSize(920,740);
  await js(`window.gozero.language('zh')`);await wait(()=>state().config.language==='zh');
  await click('[data-window="close"]');await wait(()=>!win.isVisible());
  await sleep(12000);assert.equal(state().miner.session.startedAt,began);assert.equal(state().miner.status,'running');
  assert.ok(state().miner.points.at(-1).at>first);assert.match(menubar.tray.getTitle(),coin==='PRL'?/TMAC\/s/:/MH\/s/);
  menubar.menu.items[0].click();await wait(()=>win.isVisible());
  await wait(()=>Date.now()-began>=runSeconds*1000,90);
  if(coin==='NOID')await wait(()=>state().miner.totals.accepted>0,120);
  report.coins[coin]={seconds:(Date.now()-began)/1000,rate:state().miner.rate,totals:state().miner.totals,hiddenWindowContinued:true,menuTitle:menubar.tray.getTitle()};
  await fs.writeFile(path.join(out,coin+'-live.png'),(await win.webContents.capturePage()).toPNG());
  menubar.menu.items.find(i=>i.label==='停止挖矿 / 测速').click();await wait(()=>state().miner.status==='idle'&&!state().fee.active,45);
  const savedReport=JSON.parse(await fs.readFile(state().miner.lastReport,'utf8'));report.coins[coin].report=savedReport;
  assert.equal(menubar.tray.getTitle(),'Gozero 待机');
  console.log('GUI_COIN_PASSED '+coin,JSON.stringify({...report.coins[coin],report:undefined}));
 }
 await click('[data-coin="QTC"]');await wait(()=>state().config.coin==='QTC');assert.equal(state().config.wallet,privateConfig.QTC.wallet);
 await js('location.reload()');await wait(()=>js(`document.querySelector('#wallet')?.value===${JSON.stringify(privateConfig.QTC.wallet)}`));
 assert.deepEqual(errors,[]);
 // Outer app shutdown must also clean up an active PRL runtime.
 await click('[data-coin="PRL"]');await wait(()=>state().config.coin==='PRL');
 await click('#start');await wait(()=>state().miner.rate.total>0,90);
 report.activeQuitCoin='PRL';report.passed=true;
 await fs.writeFile(path.join(out,'multicoin-smoke.json'),JSON.stringify(report,null,2));console.log('MULTICOIN_GUI_PASS');
}
module.exports={run};
