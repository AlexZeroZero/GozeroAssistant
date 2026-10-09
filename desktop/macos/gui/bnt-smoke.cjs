'use strict';
// Opt-in real-GUI test. Public payout address comes only from the test environment.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run({win,state,dir,menubar}){
 const out=path.join(dir,'qa');await fs.mkdir(out,{recursive:true});
 const js=s=>win.webContents.executeJavaScript(s,true),errors=[];
 win.webContents.on('console-message',(_e,level,message)=>{if(level===3)errors.push(message);});
 const wait=async(fn,seconds=60)=>{const until=Date.now()+seconds*1000;while(Date.now()<until){if(await fn())return;await sleep(250);}throw Error('BNT GUI timeout '+JSON.stringify(state().logs.slice(-8)));};
 const click=s=>js(`document.querySelector(${JSON.stringify(s)}).click()`);
 await wait(()=>state().ready);await click('[data-view="mining"]');
 for(const coin of ['PRL','QTC','NOID','BNT']){await click('[data-coin="'+coin+'"]');await wait(()=>state().config.coin===coin);assert.ok(await js(`document.querySelector('#kernel-name').textContent.length>5`));}
 const wallet=process.env.GOZERO_BNT_TEST_WALLET;assert.ok(wallet);
 await js(`document.querySelector('#wallet').value=${JSON.stringify(wallet)};document.querySelector('#wallet').type='password';document.querySelector('#save-mining').click()`);
 await wait(()=>state().config.wallet===wallet);assert.equal(state().config.cpuThreads,1);
 assert.equal(await js(`document.querySelector('#cpu-threads').disabled`),false);
 assert.equal(await js(`document.querySelector('#benchmark').disabled`),true);
 if(process.env.GOZERO_BNT_VISUAL_ONLY==='1'){
  for(const language of ['en','zh']){
   await js(`window.gozero.language('${language}')`);await wait(()=>state().config.language===language);
   for(const view of ['mining','about']){
    await click('[data-view="'+view+'"]');win.setSize(780,620);await sleep(300);
    assert.ok(await js(`document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth`));
    if(language==='en'){
     const untranslated=await js(`(()=>{const w=document.createTreeWalker(document.querySelector('#view-'+${JSON.stringify(view)}),NodeFilter.SHOW_TEXT);let n,a=[];while(n=w.nextNode())if(/[\\u4e00-\\u9fff]/.test(n.nodeValue))a.push(n.nodeValue);return a;})()`);
     assert.deepEqual(untranslated,[]);
    }
    await fs.writeFile(path.join(out,'BNT-'+language+'-'+view+'.png'),(await win.webContents.capturePage()).toPNG());
   }
  }
  await fs.writeFile(path.join(out,'visual-smoke.json'),JSON.stringify({passed:true,languages:['zh','en'],views:['mining','about'],minimumWidth:780}));
  return;
 }
 await click('#start');await wait(()=>state().miner.rate.cpu>0,90);assert.equal(state().miner.rate.gpu,0);
 const began=state().miner.session.startedAt;
 await js(`window.gozero.language('en')`);await wait(()=>state().config.language==='en');
 win.setSize(780,620);await sleep(500);
 assert.ok(await js(`document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth`));
 await fs.writeFile(path.join(out,'BNT-en.png'),(await win.webContents.capturePage()).toPNG());
 await click('[data-window="close"]');await wait(()=>!win.isVisible());await sleep(12000);
 assert.equal(state().miner.session.startedAt,began);assert.equal(state().miner.status,'running');assert.match(menubar.tray.getTitle(),/H\/s/);
 menubar.menu.items[0].click();await wait(()=>win.isVisible());win.setSize(920,740);
 await js(`window.gozero.language('zh')`);await wait(()=>state().config.language==='zh');
 // Bound pool observation even if no share happens to meet the current target.
 for(let i=0;i<160&&state().miner.totals.accepted===0;i++)await sleep(1000);
 const report={seconds:(Date.now()-began)/1000,rate:state().miner.rate,totals:state().miner.totals,points:state().miner.points,hiddenWindowContinued:true,rendererErrors:errors};
 await fs.writeFile(path.join(out,'BNT-live.png'),(await win.webContents.capturePage()).toPNG());
 await click('[data-stop]');await wait(()=>state().miner.status==='idle'&&!state().fee.active,30);
 const {execFile}=require('node:child_process'),exec=require('node:util').promisify(execFile);
 assert.equal((await exec('/usr/bin/pgrep',['-f','/gozero-blocknet-core worker']).catch(e=>{if(e.code===1)return{stdout:''};throw e})).stdout.trim(),'');
 const current=state().config.wallet;await js('location.reload()');await wait(()=>js(`document.querySelector('#wallet')?.value===${JSON.stringify(current)}`));
 assert.deepEqual(errors,[]);report.stopClean=true;report.profileReload=true;
 // Exercise active Quit: main's shutdown runs immediately after this returns.
 await click('[data-view="mining"]');await click('#start');await wait(()=>state().miner.rate.cpu>0,90);
 report.activeQuit=true;await fs.writeFile(path.join(out,'bnt-smoke.json'),JSON.stringify(report,null,2));
 console.log('BNT_GUI_PASS '+JSON.stringify({rate:report.rate,totals:report.totals}));
}
module.exports={run};
