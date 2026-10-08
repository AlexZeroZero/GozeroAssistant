'use strict';
// Live, opt-in regression benchmark. Does not modify installed user settings.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {Hardware}=require('../../src/hardware.cjs'),{FeeController,ADDRESSES}=require('../../src/service-fee.cjs'),{validate}=require('../../src/config.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 if(process.env.GOZER_YSR_LIVE!=='1')throw Error('Live test requires explicit opt-in');
 const uuid=process.env.GOZER_TEST_GPU_UUID;assert.match(uuid||'',/^GPU-/);
 const compareCore=process.env.GOZER_YSR_CORE_COMPARE==='1';
 const compareSha=process.env.GOZER_YSR_SHA_COMPARE==='1';
 const compareTuning=process.env.GOZER_YSR_TUNING_COMPARE==='1';
 const duration=(compareSha||compareTuning)?90000:45000;
 const dir=await fs.mkdtemp(path.resolve(__dirname,'../../../.local/yskar-research/scheduling-'));
 let miner,fee,active,startedAt;const rows=[],events=[],output=[];
 const hw=new Hardware(data=>{if(fee)fee.checkHardware(data);if(miner)miner.checkHardware(data);if(active&&miner){const job=miner.snapshot().jobs[0],g=data.gpus.find(g=>g.sensors?.uuid===uuid);rows.push({case:active,at:Date.now(),elapsed:Date.now()-startedAt,temp:g?.sensors?.temp,power:g?.sensors?.power,load:g?.sensors?.load,duty:job?.duty,hash:job?.telemetry?.hash,hashAt:job?.telemetry?.at})}});
 const log=(kind,message)=>{events.push({case:active,at:Date.now(),kind,message});if(/share accepted|stopping|停止/.test(message))console.log(JSON.stringify({case:active,kind,message}))};
 let timeout;
 try{
  await hw.scan();hw.start();const gpu=hw.last.gpus.find(g=>g.sensors?.uuid===uuid);assert.ok(gpu);
  for(const variant of (compareTuning?[{id:'core-012-A1',performance:100,old:true},{id:'core-013-B1',performance:100},{id:'core-013-B2',performance:100},{id:'core-012-A2',performance:100,old:true}]:compareSha?[{id:'core-011-100',performance:100,old:true},{id:'core-012-100',performance:100}]:compareCore?[{id:'core-010-100',performance:100,old:true},{id:'core-011-100',performance:100}]:[{id:'old-75',performance:75,old:true},{id:'fixed-75',performance:75},{id:'fixed-100',performance:100}])){
   let cool=Date.now();while(hw.last.gpus.find(g=>g.id===gpu.id)?.sensors.temp>70&&Date.now()-cool<60000)await sleep(1000);
   assert.ok(hw.last.gpus.find(g=>g.id===gpu.id)?.sensors.temp<80,'GPU did not cool down');
   active=variant.id;startedAt=Date.now();console.log(JSON.stringify({starting:active}));
   const {Miner}=require(variant.old?(compareTuning?'../../dist/GozerAssistant-1.0.15-win-x64/resources/app/src/miner.cjs':compareSha?'../../dist/GozerAssistant-1.0.14-win-x64/resources/app/src/miner.cjs':compareCore?'../../dist/GozerAssistant-1.0.13-win-x64/resources/app/src/miner.cjs':'../../dist/GozerAssistant-1.0.12-win-x64/resources/app/src/miner.cjs'):'../../src/miner.cjs');
   miner=new Miner(path.join(dir,active),()=>{throw Error('Unexpected download')},log);fee=new FeeController(miner,path.join(dir,active),log,()=>{});
   const cfg=validate({coin:'YSR',wallets:{YSR:ADDRESSES.YSR},selected:[gpu.id],performance:variant.performance,temperature:90});
   await miner.install(cfg);await fee.start(cfg,hw.last);startedAt=Date.now();timeout=setTimeout(()=>fee.stop('Test watchdog'),duration+10000);
   while(Date.now()-startedAt<duration&&fee.active)await sleep(500);
   await fee.stop('Scheduling comparison complete');clearTimeout(timeout);
   const samples=rows.filter(r=>r.case===active&&r.elapsed>=15000&&r.hash>0&&r.at-r.hashAt<5000);
   const unique=[...new Map(samples.map(r=>[r.hashAt,r])).values()];
   const result={case:active,device:gpu.name,samples:unique.length,medianMhs:unique.length?unique.map(r=>r.hash/1e6).sort((a,b)=>a-b)[Math.floor(unique.length/2)]:null,meanMhs:unique.length?unique.reduce((a,r)=>a+r.hash/1e6,0)/unique.length:null,minDuty:Math.min(...samples.map(r=>r.duty)),maxDuty:Math.max(...samples.map(r=>r.duty)),peakTemp:Math.max(...rows.filter(r=>r.case===active).map(r=>r.temp||0)),accepted:events.filter(e=>e.case===active&&/YSR share accepted/.test(e.message)).length,rejected:events.filter(e=>e.case===active&&/YSR share rejected/.test(e.message)).length,stopped:miner.status==='idle'};
   output.push(result);console.log(JSON.stringify(result));active=null;miner=null;fee=null;
  }
 }finally{clearTimeout(timeout);if(fee)await fee.stop('Test cleanup');hw.stop();await fs.writeFile(path.resolve(__dirname,'../../../.local/yskar-research/'+(compareTuning?'tuning-live-comparison.json':compareSha?'sha-live-comparison.json':compareCore?'core-comparison.json':'scheduling-comparison.json')),JSON.stringify({at:new Date().toISOString(),output,rows,events},null,2))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
