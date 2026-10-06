'use strict';
// Explicit --ui-smoke only, using a caller-provided isolated profile. No mining
// unless the operator also explicitly supplies GOZERO_SMOKE_WALLET_FILE.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const sleep=n=>new Promise(r=>setTimeout(r,n));
async function run({win,state,dir,menubar,showMain}){
 const threads=Number(process.env.GOZERO_SMOKE_CPU_THREADS||0),duration=Number(process.env.GOZERO_SMOKE_SECONDS||60);
 assert.ok([0,2,4,8].includes(threads));assert.ok([60,180,300,600].includes(duration));
 const fullRun=process.env.GOZERO_SMOKE_FULL_RUN==='1',publicCapture=process.env.GOZERO_PUBLIC_CAPTURE==='1';
 const out=path.join(dir,'qa');await fs.mkdir(out,{recursive:true});const errors=[];win.webContents.on('console-message',(_event,level,message)=>{if(level===3)errors.push(message);});
 const js=s=>win.webContents.executeJavaScript(s,true),wait=async(fn,seconds=15)=>{const until=Date.now()+seconds*1000;while(Date.now()<until){if(await fn())return;await sleep(200);}throw Error('GUI wait timed out: '+JSON.stringify(state().logs.slice(-5)));};
 const capture=async name=>{await sleep(300);await fs.writeFile(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 const language=async value=>{await js(`document.querySelector('#language').value='${value}';document.querySelector('#language').dispatchEvent(new Event('change'))`);await wait(()=>state().config.language===value);await wait(()=>js(`document.documentElement.lang==='${value==='en'?'en':'zh-CN'}'`));};
 const englishClean=()=>js(`(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n,rows=[];while(n=w.nextNode()){if(n.parentElement.closest('[data-no-i18n],script,style'))continue;if(/[\\u4e00-\\u9fff]/.test(n.nodeValue))rows.push(n.nodeValue.trim());}return rows;})()`);
 const layout=await js(`({title:document.title,node:typeof require,bodyWidth:document.body.clientWidth,navWidth:document.querySelector('nav').scrollWidth,views:document.querySelectorAll('.view').length})`);
 assert.equal(layout.node,'undefined');assert.equal(layout.views,6);assert.ok(layout.navWidth<=layout.bodyWidth);
 await wait(()=>js(`document.querySelector('#overview-status').textContent.includes('已连接')`));await capture('overview');
 const initialConfig={...state().config};
 assert.equal(state().pools.length,11);assert.ok(menubar.available());
 for(const p of state().pools){
  await js(`document.querySelector('#preset').value=${JSON.stringify(p.id)};document.querySelector('#preset').dispatchEvent(new Event('change'));document.querySelector('#save-mining').click()`);
  await wait(()=>state().config.host===p.host&&state().config.pool===p.pool&&state().config.port===p.port&&state().config.transport===p.transport);
  assert.equal(await js(`document.querySelector('#preset').value`),p.id);
 }
 await js(`window.gozero.save(${JSON.stringify(initialConfig)})`);
 // Rehydrate after the direct IPC restoration before entering a mining task.
 await js(`location.reload()`);await wait(()=>js(`!!document.querySelector('#preset')?.options.length`));
 await js(`document.querySelector('[data-view="mining"]').click()`);await capture('mining-idle');
 await language('en');assert.deepEqual(await englishClean(),[]);assert.equal(menubar.tray.getTitle(),'Gozero Idle');
 assert.equal(menubar.menu.items[0].label,'Open main window');
 const savedLanguage=JSON.parse(await fs.readFile(path.join(dir,'settings.json'),'utf8'));assert.equal(savedLanguage.language,'en');
 await js(`location.reload()`);await wait(()=>js(`document.documentElement.lang==='en'`));
 win.setSize(780,620);
 for(const v of ['overview','performance','mining','logs','settings','about']){
  await js(`document.querySelector('[data-view="${v}"]').click()`);await capture('en-'+v);
  const fits=await js(`document.querySelector('nav').scrollWidth<=document.body.clientWidth&&document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth`);assert.ok(fits,'English layout overflow: '+v);
 }
 win.setSize(920,740);await language('zh');await js(`document.querySelector('[data-view="mining"]').click()`);
 let live=null,menuLiveTitle=null;
 if(process.env.GOZERO_SMOKE_PRESET){
  const p=state().pools.find(p=>p.id===process.env.GOZERO_SMOKE_PRESET);assert.ok(p);
  await js(`document.querySelector('#preset').value=${JSON.stringify(p.id)};document.querySelector('#preset').dispatchEvent(new Event('change'));document.querySelector('#save-mining').click()`);
  await wait(()=>state().config.host===p.host&&state().config.transport===p.transport);
 }
 if(process.env.GOZERO_SMOKE_WALLET_FILE){
  const wallet=JSON.parse(await fs.readFile(process.env.GOZERO_SMOKE_WALLET_FILE,'utf8')).wallet;
  await js(`document.querySelector('#wallet').value=${JSON.stringify(wallet)};document.querySelector('#duration').value='${duration}';document.querySelector('#cpu-threads').value='${threads}';document.querySelector('#save-mining').click()`);
  await wait(()=>state().config.wallet===wallet&&state().config.seconds===duration&&state().config.cpuThreads===threads);
  if(publicCapture)await js(`document.querySelector('#wallet').type='password';document.querySelector('#wallet').title='测试收款地址已遮挡'`);
  await js(`document.querySelector('#start').click()`);await wait(()=>state().miner.status==='running');
  await wait(()=>state().logs.some(l=>l.text==='矿池授权成功'),30);await wait(()=>state().miner.rate.total>0,30);
  const began=state().miner.session.startedAt,at=state().miner.points.at(-1).at;
  await language('en');assert.equal(state().miner.session.startedAt,began);assert.equal(state().miner.status,'running');assert.deepEqual(await englishClean(),[]);await capture('en-live');await language('zh');
  menuLiveTitle=menubar.tray.getTitle();assert.match(menuLiveTitle,/MH\/s/);
  await js(`document.querySelector('[data-window="close"]').click()`);await wait(()=>!win.isVisible());
  await sleep(3000);assert.equal(state().miner.status,'running');assert.equal(state().miner.session.startedAt,began);
  assert.ok(state().miner.points.at(-1).at>at,'Sampling stopped while hidden');
  menubar.menu.items[0].click();await wait(()=>win.isVisible());
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
  else {win.close();await wait(()=>!win.isVisible());}
  await wait(()=>state().miner.status==='idle'&&!state().fee.active,fullRun?duration+15:15);
  assert.equal(menubar.tray.getTitle(),'Gozero 待机');showMain();await wait(()=>win.isVisible());
  live.finalTotals={...state().miner.totals};live.automaticDurationStop=fullRun;
  const runReport=JSON.parse(await fs.readFile(state().miner.lastReport,'utf8'));
  live.poolPausedSeconds=runReport.poolPausedSeconds;live.pauses=runReport.pauses;
  live.workResumptions=runReport.events.filter(e=>e.type==='work-resumed').length;
  assert.ok(live.workResumptions>0,'No verified work completion event');
  assert.ok(state().logs.some(l=>l.text.includes('NOID share accepted')),'Accepted shares missing from GUI log');
  assert.ok(state().logs.some(l=>l.type==='算力'),'Periodic rate missing from GUI log');
  await js(`document.querySelector('[data-view="logs"]').click()`);await capture('logs-live');
  await language('en');assert.deepEqual(await englishClean(),[]);await capture('en-logs-complete');await language('zh');
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
 const report={passed:true,layout,small,hardware:state().hardware,live,benchmark,rendererErrors:errors,settingsPersisted:true,stopReturnedIdle:true,poolPresets:state().pools.length,selectedPool:{pool:state().config.pool,host:state().config.host,port:state().config.port,transport:state().config.transport},menuBar:{available:menubar.available(),liveTitle:menuLiveTitle,bounds:menubar.tray.getBounds(),hideContinuesMining:!!live,showFromMenu:!!live,hiddenDurationStop:!!live&&fullRun},screenshotRedactions:publicCapture?['wallet input rendered as password; performance values unchanged']:[]};
 report.language={englishViews:6,persisted:true,switchWhileMining:!!live,translatedMenu:true,translatedLogs:true};
 await js(`document.querySelector('[data-view="performance"]').click();document.querySelector('#benchmark').click()`);
 await wait(()=>state().miner.status==='running');
 const stopItem=menubar.menu.items.find(i=>i.label==='停止挖矿 / 测速');assert.ok(stopItem.enabled);stopItem.click();
 await wait(()=>state().miner.status==='idle'&&!state().fee.active);report.menuBar.stopFromMenu=true;
 if(process.env.GOZERO_SMOKE_SHUTDOWN_ACTIVE==='1'){
  await js(`document.querySelector('[data-view="performance"]').click();document.querySelector('#benchmark').click()`);
  await wait(()=>state().miner.status==='running');await sleep(1500);assert.equal(state().miner.status,'running');report.shutdownWithActiveWorker=true;
 }
 await fs.writeFile(path.join(out,'gui-smoke.json'),JSON.stringify(report,null,2));console.log('GOZERO_GUI_SMOKE_PASS '+JSON.stringify(report));
}
module.exports={run};
