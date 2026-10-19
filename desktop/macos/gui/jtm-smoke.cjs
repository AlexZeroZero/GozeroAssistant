'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run({win,state,dir,menubar,downloads}){
 const out=path.join(dir,'qa');await fs.mkdir(out,{recursive:true});
 const js=s=>win.webContents.executeJavaScript(s,true),errors=[];
 win.webContents.on('console-message',(_e,level,message)=>{if(level===3)errors.push(message);});
 const wait=async(fn,seconds=70)=>{const end=Date.now()+seconds*1000;while(Date.now()<end){if(await fn())return;await sleep(250);}throw Error('JTM GUI timeout '+JSON.stringify(state().logs.slice(-8)));};
 const click=s=>js(`document.querySelector(${JSON.stringify(s)}).click()`);
 const capture=async name=>{win.webContents.invalidate();await sleep(400);await fs.writeFile(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 await wait(()=>state().ready);await click('[data-view="mining"]');
 for(const coin of ['NOID','QTC','PRL','BNT','MDS','JTM']){await click('[data-coin="'+coin+'"]');await wait(()=>state().config.coin===coin);}
 const wallet=process.env.GOZERO_JTM_TEST_WALLET;assert.ok(wallet);
 await js(`document.querySelector('#wallet').value=${JSON.stringify(wallet)};document.querySelector('#wallet').type='password';document.querySelector('#worker').value='GozeroM3GUI';document.querySelector('#cpu-threads').value='0';document.querySelector('#save-mining').click()`);
 await wait(()=>state().config.wallet===wallet);assert.equal(state().config.transport,'https');assert.equal(state().config.cpuThreads,0);
 assert.equal(state().config.pool,'gozero');assert.equal(await js("document.querySelector('#preset').value"),'jtm-gozero');
 assert.equal(require('./config.cjs').miningConfig(state().config).pools.JTM,'https://jtm.pool.gozero.trade/rpc');
 assert.equal(state().coreInstall.available.JTM,true);await click('#install-core');await wait(()=>!state().starting&&downloads.snapshot().stage==='ready');
 assert.equal(await js("document.querySelector('#benchmark').disabled"),true);
 for(const lang of ['en','zh']){
  await js(`window.gozero.language('${lang}')`);await wait(()=>state().config.language===lang);win.setSize(780,620);
  for(const view of ['mining','about']){
   await click('[data-view="'+view+'"]');await sleep(300);
   assert.ok(await js("document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth"));
   if(lang==='en'){
    const untranslated=await js(`(()=>{const w=document.createTreeWalker(document.querySelector('#view-${view}'),NodeFilter.SHOW_TEXT);let n,a=[];while(n=w.nextNode())if(!n.parentElement.closest('#work-log')&&/[\\u4e00-\\u9fff]/.test(n.nodeValue))a.push(n.nodeValue);return a;})()`);
    assert.deepEqual(untranslated,[]);
   }
   await capture('JTM-'+lang+'-'+view);
  }
 }
 win.setSize(920,740);await click('[data-view="mining"]');await click('#start');await wait(()=>state().miner.status==='running'&&state().miner.session.activeCpuThreads>0);await sleep(6000);
 assert.equal(state().miner.rate.gpu,0);assert.equal(state().miner.session.activeCpuThreads,require('node:os').availableParallelism());
 const began=state().miner.session.startedAt;
 await click('[data-window="close"]');await wait(()=>!win.isVisible());await sleep(11000);
 assert.equal(state().miner.session.startedAt,began);assert.equal(state().miner.status,'running');assert.match(menubar.tray.getTitle(),/kH\/s/);assert.match(require('./menubar.cjs').model(state()).summary,/^CPU/);
 menubar.menu.items[0].click();await wait(()=>win.isVisible());
 while(Date.now()-began<65000)await sleep(1000);
 const noWork=state().logs.some(l=>l.text.includes('node preparing work; retry'));
 assert.ok(state().miner.points.some(p=>p.cpu>0)||noWork,'Neither valid mining nor explicit pool no-work response');
 const report={seconds:(Date.now()-began)/1000,pool:'https://jtm.pool.gozero.trade/rpc',noWork,rate:state().miner.rate,totals:state().miner.totals,threads:state().miner.session.activeCpuThreads,points:state().miner.points,logs:state().logs,hiddenContinued:true,rendererErrors:errors};
 await capture('JTM-live');
 await click('[data-stop]');await wait(()=>state().miner.status==='idle'&&!state().fee.active,35);
 const exec=require('node:util').promisify(require('node:child_process').execFile);
 assert.equal((await exec('/usr/bin/pgrep',['-x','GozeroJtmCore']).catch(e=>{if(e.code===1)return{stdout:''};throw e;})).stdout.trim(),'');
 report.finalTotals=state().miner.totals;report.stopClean=true;
 await js('location.reload()');await wait(()=>js(`document.querySelector('#wallet')?.value===${JSON.stringify(wallet)}`));report.profileReload=true;assert.deepEqual(errors,[]);
 await click('[data-view="mining"]');await click('#start');await wait(()=>state().miner.status==='running'&&state().miner.session.activeCpuThreads>0);report.activeQuit=true;
 await fs.writeFile(path.join(out,'jtm-smoke.json'),JSON.stringify(report,null,2));console.log('JTM_GUI_PASS '+JSON.stringify({seconds:report.seconds,rate:report.rate,totals:report.finalTotals}));
}
module.exports={run};
