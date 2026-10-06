'use strict';
// Explicit --ui-smoke only, using a caller-provided isolated profile. No mining
// unless the operator also explicitly supplies GOZERO_SMOKE_WALLET_FILE.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const sleep=n=>new Promise(r=>setTimeout(r,n));
async function run({win,state,dir}){
 const threads=Number(process.env.GOZERO_SMOKE_CPU_THREADS||0),duration=Number(process.env.GOZERO_SMOKE_SECONDS||60);
 assert.ok([0,2,4,8].includes(threads));assert.ok([60,180,300,600].includes(duration));
 const fullRun=process.env.GOZERO_SMOKE_FULL_RUN==='1',publicCapture=process.env.GOZERO_PUBLIC_CAPTURE==='1';
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
  await js(`document.querySelector('#wallet').value=${JSON.stringify(wallet)};document.querySelector('#duration').value='${duration}';document.querySelector('#cpu-threads').value='${threads}';document.querySelector('#save-mining').click()`);
  await wait(()=>state().config.wallet===wallet&&state().config.seconds===duration&&state().config.cpuThreads===threads);
  if(publicCapture)await js(`document.querySelector('#wallet').type='password';document.querySelector('#wallet').title='测试收款地址已遮挡'`);
  await js(`document.querySelector('#start').click()`);await wait(()=>state().miner.status==='running');
  await wait(()=>state().logs.some(l=>l.text==='矿池授权成功'),30);await wait(()=>state().miner.rate.total>0,30);
  await wait(()=>state().miner.totals.accepted>0||state().miner.status==='idle',duration+5);
  if(fullRun)await wait(()=>Date.now()-state().miner.session.startedAt>=Math.min(90,duration-10)*1000&&state().miner.rate.gpu>0&&(!threads||state().miner.rate.cpu>0),duration);
  // A pool pause can arrive between a stats event and a screenshot. Read the
  // actual rendered values on both sides of capture; retry changed/paused frames.
  const rendered=()=>js(`({total:parseFloat(document.querySelector('#total-hash').textContent),cpu:parseFloat(document.querySelector('#cpu-hash').textContent),gpu:parseFloat(document.querySelector('#gpu-hash').textContent),accepted:Number(document.querySelector('#accepted').textContent),rejected:Number(document.querySelector('#rejected').textContent),submitted:Number(document.querySelector('#submitted').textContent)})`);
  const captureDeadline=Date.now()+30000;
  while(Date.now()<captureDeadline){
   const frame=await rendered();
   if(state().miner.status!=='running')throw Error('Task ended before an active frame could be captured');
   if(!(frame.gpu>0&&(!threads||frame.cpu>0))){await sleep(50);continue;}
   const pixels=(await win.webContents.capturePage()).toPNG();const after=await rendered();
   if(JSON.stringify(frame)!==JSON.stringify(after))continue;
   await fs.writeFile(path.join(out,'mining-live.png'),pixels);
   live={accepted:frame.accepted,rejected:frame.rejected,submitted:frame.submitted,rate:{total:frame.total*1e6,cpu:frame.cpu*1e6,gpu:frame.gpu*1e6},elapsedSeconds:(Date.now()-state().miner.session.startedAt)/1000,cpuThreads:threads};break;
  }
  assert.ok(live,'No stable active UI frame');
  await js(`document.querySelector('[data-view="overview"]').click()`);await capture('overview-live');
  if(!fullRun)await js(`document.querySelector('#stop').click()`);
  await wait(()=>state().miner.status==='idle'&&!state().fee.active,fullRun?duration+15:15);
  live.finalTotals={...state().miner.totals};live.automaticDurationStop=fullRun;
  if(threads){const result=JSON.parse(await fs.readFile(state().miner.lastReport,'utf8'));assert.ok(result.cpuHashes>0,'CPU did not contribute hashes');live.cpuHashes=result.cpuHashes;live.gpuHashes=result.gpuHashes;}
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
 const report={passed:true,layout,small,hardware:state().hardware,live,benchmark,rendererErrors:errors,settingsPersisted:true,stopReturnedIdle:true,screenshotRedactions:publicCapture?['wallet input rendered as password; performance values unchanged']:[]};
 if(process.env.GOZERO_SMOKE_SHUTDOWN_ACTIVE==='1'){
  await js(`document.querySelector('[data-view="performance"]').click();document.querySelector('#benchmark').click()`);
  await wait(()=>state().miner.status==='running');await sleep(1500);assert.equal(state().miner.status,'running');report.shutdownWithActiveWorker=true;
 }
 await fs.writeFile(path.join(out,'gui-smoke.json'),JSON.stringify(report,null,2));console.log('GOZERO_GUI_SMOKE_PASS '+JSON.stringify(report));
}
module.exports={run};
