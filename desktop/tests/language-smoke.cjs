'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {t}=require('../renderer/i18n.js'),{compactState}=require('../src/floating.cjs');
async function run(win,getState,floating){
 const out=path.resolve(__dirname,'../artifacts/languages');await fs.mkdir(out,{recursive:true});
 const js=s=>win.webContents.executeJavaScript(s,true),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const errors=[];win.webContents.on('console-message',(_e,level,message)=>{if(level===3)errors.push(message)});
 await sleep(300);
 await js("(async()=>{const s=await gozer.bootstrap();const gpu=s.hardware.gpus.find(g=>g.vendor==='NVIDIA'&&g.pci);if(gpu)await gozer.save({...s.config,selected:[gpu.id]})})()");await sleep(100);
 await js("window.languageProbe={wallet:document.querySelector('#wallet'),gpu:document.querySelector('.gpu-row')};document.querySelector('#wallet').value='prl1UnsavedInput'");
 const report=[];
 // Check actual IPC and both selectors without starting a miner or native compute core.
 for(const language of ['en','ja','ru','zh-CN']){
  await js(`document.querySelector('#language-top').value=${JSON.stringify(language)};document.querySelector('#language-top').dispatchEvent(new Event('change'))`);
  for(let i=0;i<100&&getState().config.language!==language;i++)await sleep(20);
  await sleep(200);assert.equal(getState().config.language,language);
  assert.equal(await js('document.documentElement.lang'),language);
  assert.equal(await js("document.querySelector('#language-settings').value"),language);
  assert.equal(await js("document.querySelector('#wallet').value"),'prl1UnsavedInput');
  assert.equal(await js("languageProbe.wallet===document.querySelector('#wallet')"),true);
  assert.equal(await js("languageProbe.gpu===document.querySelector('.gpu-row')"),true);
  assert.equal(await js("document.querySelector('nav [data-view=mining]').textContent"),'ϟ '+t('挖矿工作台',language));
  for(const view of ['overview','earnings','mining','logs','settings','information']){
   await js(`showView('${view}')`);await sleep(70);
   const metrics=await js(`({width:innerWidth,height:innerHeight,overflow:document.querySelector('#${view}').scrollWidth-document.querySelector('#${view}').clientWidth,navOverflow:document.querySelector('nav').scrollWidth-document.querySelector('nav').clientWidth})`);
   report.push({language,view,...metrics});
   await fs.writeFile(path.join(out,`${language}-${view}.png`),(await win.webContents.capturePage()).toPNG());
  }
  await js("window.renderUpgrade({...state,information:{at:Date.now(),tracked:63,events:[{id:'test-only',at:Date.now(),kind:'price',title:'↑ QTC 短时价格变化 4.14%',body:'本机观察窗口≤5分钟；141 → 146.844 USD。来源 SafeTrade'}]}})");
  if(language==='en'||language==='ru'){
   const untranslated=await js(`(()=>{const rows=[],walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walk.nextNode()){const n=walk.currentNode;if(n.parentElement.closest('script,style,[data-i18n-skip],#os-name,#toast'))continue;if(/[\u3400-\u9fff]/.test(n.data))rows.push(n.data)}return [...new Set(rows)]})()`);
   report.push({language,untranslated});
  }
  await js("showDetails('cpu')");await sleep(70);await fs.writeFile(path.join(out,`${language}-cpu-dialog.png`),(await win.webContents.capturePage()).toPNG());await js("document.querySelector('#details-close').click()");
  await js("document.querySelector('#fee-details').click()");await sleep(70);await fs.writeFile(path.join(out,`${language}-fee-dialog.png`),(await win.webContents.capturePage()).toPNG());await js("document.querySelector('#details-close').click()");
  await floating.create();
  const snapshot={...compactState(getState()),language,hash:116.53e6,coin:'QTC',status:'idle',stopped:true,hashAverage:{hash:116.53e6,minutes:5,complete:true,running:false,coverage:.97},performance:75,deviceLabel:'1 GPU · RTX 5060 Laptop GPU'};
  await floating.win.webContents.executeJavaScript(`render(${JSON.stringify(snapshot)})`);await sleep(80);
  const mini=await floating.win.webContents.executeJavaScript(`({phase:document.querySelector('#phase').textContent,font:parseFloat(getComputedStyle(document.querySelector('#phase')).fontSize),phaseFits:document.querySelector('#phase').scrollWidth<=document.querySelector('#phase').clientWidth,hash:document.querySelector('#hash').textContent,overflow:document.querySelector('.monitor-card').scrollWidth-document.querySelector('.monitor-card').clientWidth,language:document.documentElement.lang})`);
  assert.equal(mini.phase,'■ '+t('已停止',language));assert.ok(mini.font>=12);assert.ok(mini.phaseFits);assert.equal(mini.hash,'116.53 MH/s');
  report.push({language,mini});await fs.writeFile(path.join(out,`${language}-stopped.png`),(await floating.win.webContents.capturePage()).toPNG());
  await floating.win.webContents.executeJavaScript(`render({...${JSON.stringify(snapshot)},status:'running',stopped:false})`);assert.equal(await floating.win.webContents.executeJavaScript("document.body.classList.contains('stopped')"),false);
 }
 // Repeated numeric updates must not replace DOM rows or translate user inputs.
 await js("GozerI18n.setLocale('en');window.languageProbe.rate=document.querySelector('#total-hash').firstChild;text('#total-hash','123.45 MH/s');window.languageProbe.rate=document.querySelector('#total-hash').firstChild;for(let i=0;i<100;i++)text('#total-hash','123.45 MH/s')");
 assert.equal(await js("languageProbe.rate===document.querySelector('#total-hash').firstChild"),true);
 await js("window.dynamicLanguageTest=document.createElement('span');dynamicLanguageTest.textContent='内核退出 42';dynamicLanguageTest.title='设置自动切换的备用矿池';document.body.append(dynamicLanguageTest)");await sleep(40);
 assert.equal(await js('dynamicLanguageTest.textContent'),'Engine exited 42');
 await js("GozerI18n.setLocale('ru')");await sleep(40);assert.equal(await js('dynamicLanguageTest.textContent'),'Ядро завершилось 42');
 await js("dynamicLanguageTest.textContent='内核退出 43'");await sleep(40);assert.equal(await js('dynamicLanguageTest.textContent'),'Ядро завершилось 43');
 await js("GozerI18n.setLocale('zh-CN')");assert.equal(await js('dynamicLanguageTest.textContent'),'内核退出 43');assert.equal(await js('dynamicLanguageTest.title'),'设置自动切换的备用矿池');await js('dynamicLanguageTest.remove()');
 await js("GozerI18n.setLocale('zh-CN')");
 assert.equal(getState().miner.status,'idle');assert.equal(getState().miner.jobs.length,0);
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({report,errors,noMiningExecuted:true},null,2));
 assert.deepEqual(errors,[]);
 assert.deepEqual(report.filter(r=>r.overflow>2||r.navOverflow>2||r.mini?.overflow>2),[],'localized layout overflow');
 assert.deepEqual(report.filter(r=>r.untranslated?.length),[],'untranslated interface text');
}
module.exports={run};
