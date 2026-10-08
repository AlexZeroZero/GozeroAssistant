'use strict';
// UI-only theme verification: never starts a miner or changes the real profile.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState,floating){
 const js=s=>win.webContents.executeJavaScript(s,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const out=path.resolve(__dirname,'../artifacts/light-theme');await fs.mkdir(out,{recursive:true});
 await js("(async()=>{state=await gozer.bootstrap();await gozer.save({...state.config,theme:'light'});state=await gozer.bootstrap();configInputs();render()})()");await pause(200);
 assert.equal(await js("document.querySelector('#earnings,[data-view=earnings],#benchmark')===null"),true);
 const report=[];
 // Contrast uses composited solid surfaces; gradients are inspected in screenshots.
 const audit=`(()=>{
  const rgb=s=>(s.match(/[\\d.]+/g)||[]).map(Number),over=(a,b)=>{const alpha=a[3]??1;return a.slice(0,3).map((c,i)=>c*alpha+b[i]*(1-alpha))},lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  return [...document.querySelectorAll('button,input,select,label,small,b,strong,.muted,.note,.badge,.task-status,.task-note,.quality,.dual-log-row span')].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden'&&(n.textContent.trim()||n.value||n.placeholder)).map(n=>{
   const c=getComputedStyle(n),parents=[];for(let e=n;e;e=e.parentElement)parents.unshift(e);let bg=[255,255,255];for(const e of parents)bg=over(rgb(getComputedStyle(e).backgroundColor),bg);const color=over(rgb(c.color),bg),a=lum(color),b=lum(bg);return{text:(n.value||n.textContent||n.placeholder).slice(0,65),selector:n.id||n.className||n.tagName,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),opacity:c.opacity,color:c.color,bg};
  })
 })()`;
 for(const view of ['overview','mining','rentals','logs','settings','information']){
  await js(`showView('${view}')`);await pause(140);
  report.push({view,contrast:await js(audit)});
  await fs.writeFile(path.join(out,view+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 await js("(async()=>{await gozer.workbenchMode('dual');showView('mining')})()");await pause(250);
 for(const language of ['zh-CN','en','ja','ru']){
  await js(`gozer.language('${language}')`);await pause(180);
  // Reproduce the reported selected + disabled state without starting mining.
  await js("document.querySelector('[data-mode=dual]').disabled=true;document.querySelectorAll('.dual-card input,.dual-card select,.task-install').forEach(n=>n.disabled=true);document.querySelector('.dual-log-head [data-filter=cpu]').click()");
  assert.equal(await js("getComputedStyle(document.querySelector('.dual-connection input')).webkitTextFillColor"),'rgb(81, 70, 94)');
  const rows=await js(audit);report.push({view:'dual',language,contrast:rows});
  for(const row of rows.filter(r=>r.selector==='active'||r.selector==='primary'))assert.ok(row.ratio>=4.5,JSON.stringify(row));
  assert.equal(await js("getComputedStyle(document.querySelector('[data-mode=dual]')).opacity"),'1');
  await fs.writeFile(path.join(out,'dual-'+language+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 await js("gozer.language('zh-CN')");await pause(120);await floating.show();await pause(120);
 await fs.writeFile(path.join(out,'floating-dual.png'),(await floating.win.webContents.capturePage()).toPNG());
 await js("gozer.workbenchMode('gpu')");await pause(150);
 await fs.writeFile(path.join(out,'floating-single.png'),(await floating.win.webContents.capturePage()).toPNG());
 await js("showDetails('cpu')");await pause(100);await fs.writeFile(path.join(out,'cpu-dialog.png'),(await win.webContents.capturePage()).toPNG());await js("document.querySelector('#details-close').click()");
 await fs.writeFile(path.join(out,'contrast.json'),JSON.stringify(report,null,2));
 assert.ok(Object.values(getState().dual.tasks).every(t=>t.miner.status==='idle'));
 // Verify light palette cannot leak into dark mode.
 await js("(async()=>{const s=await gozer.bootstrap();await gozer.save({...s.config,theme:'dark'})})()");await pause(160);
 assert.equal(await js("getComputedStyle(document.body).getPropertyValue('--text').trim()"),'#e1d8eb');
 console.log('LIGHT_THEME_AUDIT',report.flatMap(r=>r.contrast).filter(r=>r.ratio<4.5).map(r=>({selector:r.selector,text:r.text,ratio:r.ratio.toFixed(2)})));
}
module.exports={run};
