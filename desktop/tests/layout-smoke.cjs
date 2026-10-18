'use strict';
// Isolated profile + offscreen Electron. Does not install or start a miner.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const js=s=>win.webContents.executeJavaScript(s,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const out=path.resolve(__dirname,'../artifacts/layout-refresh');await fs.mkdir(out,{recursive:true});
 const shot=async name=>{await pause(120);await fs.writeFile(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG())};
 const report=[];
 await js("(async()=>{state=await gozer.bootstrap();await chooseCoin('MDS');const gpu=state.hardware.gpus.find(g=>g.vendor==='NVIDIA'&&g.pci);if(gpu)await save({selected:[gpu.id]});showView('mining')})()");
 await shot('workbench-dark');
 assert.equal(await js("!!document.querySelector('.workspace-shell')"),true,'layout loaded');
 assert.equal(await js("document.querySelectorAll('.coin-directory [data-coin]').length"),getState().coins.length);
 assert.equal(await js("document.querySelector('#wallet').closest('#workspace-panel-config')!==null"),true);
 assert.equal(await js("document.querySelector('#worker-rows').closest('#workspace-panel-telemetry')!==null"),true);
 assert.equal(await js("document.querySelectorAll('[id]').length===new Set([...document.querySelectorAll('[id]')].map(n=>n.id)).size"),true,'no duplicated control IDs');
 for(const theme of ['dark','light']){
  await js(`save({theme:'${theme}'})`);
  for(const [w,h] of [[872,654],[1000,780],[1280,900]]){
   win.setContentSize(w,h);await pause(90);
   for(const page of ['mining','overview','kernels','rentals','settings','information','logs']){
    await js(page==='kernels'?"openKernelLibrary('MDS')":`showView('${page}')`);await pause(80);
    const bounds=await js(`(()=>{const m=document.querySelector('main'),v=document.querySelector('.view.active'),r=m.getBoundingClientRect();return{width:innerWidth,height:innerHeight,main:m.clientWidth,scroll:m.scrollWidth,view:v.id,body:document.body.scrollWidth,offscreen:[...document.querySelectorAll('nav button,.task-summary,.workspace-tabs button,#start,#stop')].filter(n=>n.getClientRects().length).filter(n=>{const b=n.getBoundingClientRect();return b.right>innerWidth+1||b.bottom>innerHeight+1}).map(n=>n.id||n.textContent)}})()`);
    report.push({theme,w,h,page,...bounds});assert(bounds.scroll<=bounds.main+2,JSON.stringify(report.at(-1)));assert.equal(bounds.offscreen.length,0,JSON.stringify(report.at(-1)));
    if(w===872&&page==='mining')await shot('compact-'+theme);
    if(w===1000&&['overview','rentals','settings','logs'].includes(page))await shot(page+'-'+theme);
   }
  }
 }
 win.setContentSize(1000,780);await js("showView('mining')");await shot('workbench-light');
 await js("(()=>{const q=document.querySelector('#coin-search');q.value='ZCD';q.dispatchEvent(new Event('input'))})()");
 assert.equal(await js("[...document.querySelectorAll('.coin-directory [data-coin]')].filter(b=>!b.hidden).length"),1);
 assert.equal(await js("document.querySelector('.directory-category[data-category=GPU]').hidden"),true);
 await js("(()=>{const q=document.querySelector('#coin-search');q.value='';q.dispatchEvent(new Event('input'))})()");
 for(const tab of ['telemetry','account','config']){await js(`document.querySelector('[data-workspace-tab=${tab}]').click()`);assert.equal(await js(`!document.querySelector('#workspace-panel-${tab}').hidden`),true);if(tab!=='config')await shot(tab+'-light');}
 // Keep input event listeners and auto-save intact after moving the controls.
 await js("(async()=>{const n=document.querySelector('#worker');n.value='Layout-test';n.dispatchEvent(new Event('input'));n.dispatchEvent(new Event('change'));await flushMiningSettings()})()");
 assert.equal(getState().config.worker,'Layout-test');
 await js("(async()=>{await selectLayoutCoin('ZCD');document.querySelector('#performance').value='100';document.querySelector('#performance').dispatchEvent(new Event('input'));document.querySelector('#performance').dispatchEvent(new Event('change'));await flushMiningSettings()})()");
 assert.equal(getState().config.performance,100);assert.equal(getState().config.cpuThreads,getState().cpuDevice.logical);
 await shot('cpu-light');
 await js("(async()=>{await selectLayoutCoin('JTM');showView('mining')})()");
 assert.equal(await js("document.querySelector('#jtm-key-row').hidden"),false);
 assert.equal(await js("document.querySelector('#jtm-bench').hidden"),false);
 assert.equal(await js("document.querySelector('#pool-backups-open').disabled"),true);
 assert.equal(await js("document.querySelector('#pool-transport-row select').options.length"),2);
 await shot('jtm-workbench-light');
 await js("(async()=>{state=await gozer.workbenchMode('dual');configInputs();render();renderDual(state);showView('mining');document.querySelector('[data-task-focus=cpu]').click()})()");await pause(100);
 assert.equal(await js("document.querySelector('.dual-card.gpu').hidden&&!document.querySelector('.dual-card.cpu').hidden"),true);
 await js("selectLayoutCoin('BNT')");assert.equal(getState().dual.tasks.cpu.config.coin,'BNT');
 await shot('dual-cpu-light');
 for(const lang of ['en','ja','ru','zh-CN']){
  await js(`(async()=>{state.config=await gozer.language('${lang}');render()})()`);await pause(100);
  assert.equal(await js("document.querySelector('.task-strip').getBoundingClientRect().bottom<innerHeight"),true);
  await shot('dual-'+lang);
 }
 // Render a busy task fixture without touching the backend or starting mining.
 const actualCoin=getState().dual.tasks.gpu.config.coin;
 await js("(()=>{const fixture=structuredClone(state);fixture.dual.tasks.gpu.busy=true;fixture.dual.tasks.gpu.miner.status='running';renderDual(fixture);renderWorkspaceLayout(fixture)})()");
 await js(`selectLayoutCoin('${actualCoin==='MDS'?'YSR':'MDS'}')`);
 assert.equal(await js('view'),'kernels');assert.equal(getState().dual.tasks.gpu.config.coin,actualCoin);
 await js("(async()=>{state=await gozer.bootstrap();render();renderDual(state);await save({theme:'dark'});openKernelLibrary('BNT')})()");await shot('kernel-library-dark');
 // Capture the action-heavy library in both themes and longer translations.
 for(const theme of ['dark','light'])for(const lang of ['zh-CN','en','ja','ru']){
  win.setContentSize(872,654);
  await js(`(async()=>{await save({theme:'${theme}'});state.config=await gozer.language('${lang}');render();openKernelLibrary('BNT')})()`);await pause(120);
  const actions=await js(`(()=>{const root=document.querySelector('#kernels');return [...root.querySelectorAll('.section-bar>button,.library-info>button,.library-install,.library-node-actions>button')].map(b=>{const r=b.getBoundingClientRect();return{width:r.width,height:r.height,right:r.right,clipped:b.scrollHeight>b.clientHeight+1||b.scrollWidth>b.clientWidth+1}})})()`);
  assert(actions.every(b=>Math.abs(b.width-actions[0].width)<1&&Math.abs(b.height-actions[0].height)<1&&!b.clipped),JSON.stringify({theme,lang,actions}));
  assert(actions.every(b=>Math.abs(b.right-actions[0].right)<2),JSON.stringify({theme,lang,actions}));
  await shot('library-'+theme+'-'+lang);
 }
 win.setContentSize(1000,780);await js("(async()=>{await save({theme:'dark'});state.config=await gozer.language('zh-CN');render();openKernelLibrary('BNT')})()");await pause(3200);await shot('kernel-library-dark');
 assert.equal(getState().miner.status,'idle');assert(Object.values(getState().dual.tasks).every(t=>t.miner.status==='idle'));
 await fs.writeFile(path.join(out,'layout-checks.json'),JSON.stringify({passed:true,miningStarted:false,report},null,2));
}
module.exports={run};
