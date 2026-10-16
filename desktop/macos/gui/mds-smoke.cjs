'use strict';
// Opt-in real-GUI test. Public payout address comes only from the test environment.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run({win,state,dir,menubar}){
 const out=path.join(dir,'qa');await fs.mkdir(out,{recursive:true});
 const js=s=>win.webContents.executeJavaScript(s,true),errors=[];
 win.webContents.on('console-message',(_e,level,message)=>{if(level===3)errors.push(message);});
 const wait=async(fn,seconds=60)=>{const until=Date.now()+seconds*1000;while(Date.now()<until){if(await fn())return;await sleep(250);}throw Error('MDS GUI timeout '+JSON.stringify(state().logs.slice(-8)));};
 const click=s=>js(`document.querySelector(${JSON.stringify(s)}).click()`);
 const capture=async name=>{
  // Refresh the compositor on remote/occluded desktops; retain actual DOM readings.
  const dom=await js(`({version:document.querySelector('#app-version').textContent,accepted:document.querySelector('#accepted').textContent,rate:document.querySelector('#total-hash').textContent,runtime:document.querySelector('#runtime').textContent})`);
  assert.equal(dom.version,state().version);
  await fs.writeFile(path.join(out,name+'.json'),JSON.stringify(dom,null,2));
  win.webContents.invalidate();await sleep(500);
  await fs.writeFile(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
 };
 await wait(()=>state().ready);await click('[data-view="mining"]');
 for(const coin of ['PRL','QTC','NOID','BNT','MDS']){await click('[data-coin="'+coin+'"]');await wait(()=>state().config.coin===coin);assert.ok(await js(`document.querySelector('#kernel-name').textContent.length>5`));}
 const wallet=process.env.GOZERO_MDS_TEST_WALLET;assert.ok(wallet);
 const threads=Number(process.env.GOZERO_MDS_TEST_THREADS||0);assert.ok([0,2,4,8].includes(threads));
 await js(`document.querySelector('#wallet').value=${JSON.stringify(wallet)};document.querySelector('#wallet').type='password';document.querySelector('#cpu-threads').value=${JSON.stringify(String(threads))};document.querySelector('#mds-mss').checked=true;document.querySelector('#save-mining').click()`);
 await wait(()=>state().config.wallet===wallet);assert.equal(state().config.mdsMssConfirmed,true);
 assert.equal(state().config.cpuThreads,threads);
 assert.equal(await js(`document.querySelector('#cpu-threads').disabled`),false);
 assert.equal(await js(`document.querySelector('#benchmark').disabled`),true);
 if(process.env.GOZERO_MDS_VISUAL_ONLY==='1'){
  for(const language of ['en','zh']){
   await js(`window.gozero.language('${language}')`);await wait(()=>state().config.language===language);
   for(const view of ['mining','about']){
    await click('[data-view="'+view+'"]');win.setSize(780,620);await sleep(300);
    assert.ok(await js(`document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth`));
    if(language==='en'){
     const untranslated=await js(`(()=>{const w=document.createTreeWalker(document.querySelector('#view-'+${JSON.stringify(view)}),NodeFilter.SHOW_TEXT);let n,a=[];while(n=w.nextNode())if(/[\\u4e00-\\u9fff]/.test(n.nodeValue))a.push(n.nodeValue);return a;})()`);
     assert.deepEqual(untranslated,[]);
    }
    await capture('MDS-'+language+'-'+view);
   }
  }
  await fs.writeFile(path.join(out,'visual-smoke.json'),JSON.stringify({passed:true,languages:['zh','en'],views:['mining','about'],minimumWidth:780}));
  return;
 }
 const observations=[];const observe=()=>observations.push({at:Date.now(),threads:state().miner.session?.cpuThreads??0,rate:state().miner.rate.total,gpu:state().miner.rate.gpu,cpu:state().miner.rate.cpu,workState:state().miner.workState});
 const observationTimer=setInterval(observe,1000);
 await click('#start');await wait(()=>state().miner.rate.gpu>0,90);
 if(threads)assert.ok(state().miner.rate.cpu>0);else assert.equal(state().miner.rate.cpu,0);
 assert.ok(Math.abs(state().miner.rate.total-state().miner.rate.gpu-state().miner.rate.cpu)<1e-6);
 const began=state().miner.session.startedAt;
 await js(`window.gozero.language('en')`);await wait(()=>state().config.language==='en');
 win.setSize(780,620);await sleep(500);
 assert.ok(await js(`document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth`));
 await capture('MDS-en');
 await click('[data-window="close"]');await wait(()=>!win.isVisible());await sleep(12000);
 assert.equal(state().miner.session.startedAt,began);assert.equal(state().miner.status,'running');assert.match(menubar.tray.getTitle(),/N\/s/);
 menubar.menu.items[0].click();await wait(()=>win.isVisible());win.setSize(920,740);
 await js(`window.gozero.language('zh')`);await wait(()=>state().config.language==='zh');
 // Bound pool observation even if no share happens to meet the current target.
 for(let i=0;i<Number(process.env.GOZERO_MDS_OBSERVE_SECONDS||160)&&(state().miner.totals.accepted===0||(Date.now()-began)/1000<Number(process.env.GOZERO_MDS_MIN_SECONDS||0));i++)await sleep(1000);
 clearInterval(observationTimer);observe();
 const report={observations,logs:state().logs,requestedThreads:state().config.cpuThreads,activeThreads:state().miner.session.cpuThreads,seconds:(Date.now()-began)/1000,rate:state().miner.rate,totals:state().miner.totals,points:state().miner.points,hiddenWindowContinued:true,rendererErrors:errors};
 await wait(()=>js(`Number(document.querySelector('#accepted').textContent)===${report.totals.accepted}`));
 await capture('MDS-live');
 await click('[data-stop]');await wait(()=>state().miner.status==='idle'&&!state().fee.active,30);
 const {execFile}=require('node:child_process'),exec=require('node:util').promisify(execFile);
 assert.equal((await exec('/usr/bin/pgrep',['-x','GozeroMdsCore']).catch(e=>{if(e.code===1)return{stdout:''};throw e})).stdout.trim(),'');
 const current=state().config.wallet;await js('location.reload()');await wait(()=>js(`document.querySelector('#wallet')?.value===${JSON.stringify(current)}`));
 assert.deepEqual(errors,[]);report.stopClean=true;report.profileReload=true;
 // Exercise active Quit: main's shutdown runs immediately after this returns.
 await click('[data-view="mining"]');await click('#start');await wait(()=>state().miner.rate.gpu>0,90);
 report.activeQuit=true;await fs.writeFile(path.join(out,'mds-smoke.json'),JSON.stringify(report,null,2));
 console.log('MDS_GUI_PASS '+JSON.stringify({rate:report.rate,totals:report.totals}));
}
module.exports={run};
