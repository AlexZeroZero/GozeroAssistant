'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const out=path.resolve(__dirname,'../artifacts/rentals');await fs.mkdir(out,{recursive:true});
 const js=s=>win.webContents.executeJavaScript(s,true),sleep=ms=>new Promise(r=>setTimeout(r,ms));const errors=[],report=[];
 win.webContents.on('console-message',(_event,level,message)=>{if(level===3)errors.push(message)});
 await js("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});showView('rentals')");
 const wait=async()=>{for(let i=0;i<240;i++){if(await js("!document.querySelector('#rentals').classList.contains('rental-busy')"))return;await sleep(100)}throw Error('Rental UI timeout')};
 await wait();
 assert.equal(await js("document.querySelectorAll('.rental-card').length"),6);
 assert.equal(await js("[...document.querySelectorAll('.rental-model')].every(n=>n.textContent.includes('RTX 4090')&&!n.textContent.includes('Laptop'))"),true);
 for(const language of ['zh-CN','en','ja','ru']){
  await js(`gozer.language('${language}')`);await sleep(140);
  const metrics=await js("({language:document.documentElement.lang,viewOverflow:document.querySelector('#rentals').scrollWidth-document.querySelector('#rentals').clientWidth,navOverflow:document.querySelector('nav').scrollWidth-document.querySelector('nav').clientWidth,mainScroll:document.querySelector('main').scrollHeight-document.querySelector('main').clientHeight,height:innerHeight,statusBottom:document.querySelector('.rental-statusbar').getBoundingClientRect().bottom,footerTop:document.querySelector('footer').getBoundingClientRect().top})");
  report.push(metrics);await fs.writeFile(path.join(out,language+'-gpu.png'),(await win.webContents.capturePage()).toPNG());
 }
 await js("gozer.language('zh-CN')");await sleep(140);await js("document.querySelector('.rental-card').click()");await sleep(140);
 assert.equal(await js("document.querySelector('#rental-detail').hidden"),false);await fs.writeFile(path.join(out,'gpu-detail.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.querySelector('#rental-duration').value='1';document.querySelector('#rental-duration').dispatchEvent(new Event('change'))");assert.match(await js("document.querySelector('#rental-cost').textContent"),/^\$[0-9.]+$/);
 await js("document.querySelector('#rental-dialog-close').click();window.rentalProbe=document.querySelector('.rental-card');document.querySelector('#rental-refresh').click()");await wait();assert.equal(await js("rentalProbe===document.querySelector('.rental-card')"),true);
 await js("document.querySelector('[data-rmodel=\"RTX 5090\"]').click()");await wait();assert.equal(await js("[...document.querySelectorAll('.rental-model')].every(n=>n.textContent.includes('RTX 5090'))"),true);
 await js("document.querySelector('[data-rmodel=\"RTX 3090\"]').click()");await wait();assert.equal(await js("[...document.querySelectorAll('.rental-model')].every(n=>n.textContent.includes('RTX 3090'))"),true);
 await js("document.querySelector('[data-rmodel=pro]').click()");await wait();await fs.writeFile(path.join(out,'pro-6000.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.querySelector('[data-rkind=cpu]').click()");await wait();assert.ok(await js("document.querySelectorAll('.rental-card').length>0"));await fs.writeFile(path.join(out,'cpu.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.querySelector('#rental-more').click();document.querySelector('#rental-threads').value='64';document.querySelector('#rental-threads').dispatchEvent(new Event('change'))");await wait();await fs.writeFile(path.join(out,'cpu-filter.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.querySelector('#rental-reset').click()");await wait();
 await js("document.querySelector('#rental-search').value='not-found-abcdef';document.querySelector('#rental-search').dispatchEvent(new Event('input'))");await sleep(400);await wait();assert.equal(await js("document.querySelectorAll('.rental-card').length"),0);
 await js("document.querySelector('#rental-reset').click()");await wait();
 if(await js("!document.querySelector('#rental-next').disabled")){await js("document.querySelector('#rental-next').click()");await wait();assert.match(await js("document.querySelector('#rental-page').textContent"),/^2 /)}
 await js("document.querySelector('[data-rkind=gpu]').click()");await wait();
 await js("document.querySelector('#rental-more').click();document.querySelector('#theme').click()");await fs.writeFile(path.join(out,'light.png'),(await win.webContents.capturePage()).toPNG());
 assert.equal(getState().miner.status,'idle');assert.equal(getState().miner.jobs.length,0);
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({report,errors,noMiningExecuted:true},null,2));assert.deepEqual(errors,[]);assert.deepEqual(report.filter(x=>x.viewOverflow>2||x.navOverflow>2||x.statusBottom>x.footerTop+2),[],'rental layout must fit');
}
module.exports={run};
