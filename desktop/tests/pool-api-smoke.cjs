const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(win,getState){
 const js=s=>win.webContents.executeJavaScript(s,true),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const out=path.resolve(__dirname,'../artifacts/pool-api138');await fs.mkdir(out,{recursive:true});const report=[];
 async function until(fn,ms=40000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await sleep(150)}throw Error('Pool UI timeout '+JSON.stringify(getState().poolAccount))}
 const errors=[];win.webContents.on('console-message',(_e,level,message)=>{if(level===3)errors.push(message)});
 await until(()=>getState().ready);
 for(const coin of ['YSR','ZCD','BNT']){
  const wallet=require('../src/service-fee.cjs').ADDRESSES[coin];
  await js(`(async()=>{const s=await gozer.bootstrap();await gozer.save({...s.config,coin:${JSON.stringify(coin)},wallets:{...s.config.wallets,[${JSON.stringify(coin)}]:${JSON.stringify(wallet)}}});state=await gozer.bootstrap();configInputs();showView('mining')})()`);
  await until(()=>getState().poolAccount.coin===coin&&getState().poolAccount.sections.mining?.value&&getState().poolAccount.sections.balance?.value&&getState().poolAccount.sections.payouts?.value&&!getState().poolAccount.loading);
  const a=getState().poolAccount;assert.equal(a.adapter,'gozero');assert.equal(a.sections.balance.error,null);assert.equal(a.sections.mining.error,null);assert.equal(a.sections.payouts.error,null);
  await js("document.querySelector('[data-pool-account]').scrollIntoView({block:'center'});renderPoolAccount(state.poolAccount)");await sleep(300);
  const shown=await js("document.querySelector('[data-pool-account]').textContent");assert.ok(shown.includes('Gozero Pool'));assert.ok(!shown.includes('接口待适配'));
  if(a.sections.balance.value.confirmed!==null)assert.ok(shown.includes(a.sections.balance.value.confirmed.replace(/\B(?=(\d{3})+\.)/g,',')));
  await fs.writeFile(path.join(out,coin.toLowerCase()+'.png'),(await win.webContents.capturePage()).toPNG());
  if(coin==='YSR'&&a.sections.payouts.value.pages>1){await js('gozer.poolAccountPage(2)');await until(()=>getState().poolAccount.sections.payouts?.value?.page===2);await js('gozer.poolAccountPage(1)')}
  await js("document.querySelector('.account-payouts').click()");assert.ok(await js("document.querySelector('#payout-dialog').open"));await fs.writeFile(path.join(out,coin.toLowerCase()+'-payments.png'),(await win.webContents.capturePage()).toPNG());await js("document.querySelector('#payout-dialog').close()");
  report.push({coin,source:a.source,sections:Object.fromEntries(Object.entries(a.sections).map(([k,v])=>[k,{received:!!v?.value,stale:v?.stale,error:v?.error}])),balance:a.sections.balance.value,payments:a.sections.payouts.value.count});
 }
 await js("gozer.language('en')");await sleep(200);await fs.writeFile(path.join(out,'bnt-en.png'),(await win.webContents.capturePage()).toPNG());
 await js("(async()=>{const s=await gozer.bootstrap();await gozer.save({...s.config,theme:'light'});state=await gozer.bootstrap();render()})()");await sleep(200);await fs.writeFile(path.join(out,'bnt-light-en.png'),(await win.webContents.capturePage()).toPNG());
 await js("gozer.workbenchMode('dual')");await js(`gozer.taskSave('cpu',{coin:'BNT',wallets:{BNT:${JSON.stringify(require('../src/service-fee.cjs').ADDRESSES.BNT)}}})`);await until(()=>js("state.config.workbenchMode==='dual'"));
 await js("openPoolAccount('cpu')");await until(()=>getState().poolAccount.coin==='BNT');assert.ok(await js("document.querySelector('#pool-account-dialog').open"));await sleep(300);await fs.writeFile(path.join(out,'dual-account.png'),(await win.webContents.capturePage()).toPNG());await js("document.querySelector('#pool-account-dialog').close()");
 assert.equal(getState().miner.status,'idle');assert.equal(getState().dual.tasks.cpu.miner.status,'idle');assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify({version:getState().version,readOnly:true,noMining:true,report},null,2));
}
module.exports={run};
