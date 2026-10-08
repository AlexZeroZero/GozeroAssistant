'use strict';
// Explicit opt-in live acceptance test. Never part of automatic test discovery.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {Hardware}=require('../../src/hardware.cjs'),{Miner}=require('../../src/miner.cjs'),{FeeController,ADDRESSES}=require('../../src/service-fee.cjs'),{validate}=require('../../src/config.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 if(process.env.GOZER_YSR_LIVE!=='1')throw Error('Set GOZER_YSR_LIVE=1 for an explicitly authorized live test');
 const dir=await fs.mkdtemp(path.resolve(__dirname,'../../../.local/yskar-research/live-profile-'));
 const events=[],samples=[];let phase='idle';
 const log=(kind,message)=>{events.push({at:Date.now(),phase,kind,message});console.log(JSON.stringify({phase,kind,message}))};
 const miner=new Miner(dir,()=>{throw Error('No downloader expected')},log),fee=new FeeController(miner,dir,log,()=>{phase=fee.phase});
 const hw=new Hardware(data=>{fee.checkHardware(data);miner.checkHardware(data);samples.push({at:Date.now(),phase,jobs:miner.snapshot().jobs,temp:data.gpus.find(g=>g.sensors?.uuid===process.env.GOZER_TEST_GPU_UUID)?.sensors?.temp})});
 let stopped=false;
 const timeout=setTimeout(()=>fee.stop('Bounded live test timeout').catch(()=>{}),140000);
 try{
  await hw.scan();const gpu=hw.last.gpus.find(g=>g.sensors?.uuid===process.env.GOZER_TEST_GPU_UUID);assert.ok(gpu,'Explicit test GPU UUID required');assert.ok(gpu.sensors.temp<85);
  const config=validate({coin:'YSR',wallets:{YSR:ADDRESSES.YSR},selected:[gpu.id],performance:75,temperature:85});
  await miner.install(config);hw.start();
  // Synthetic balance ONLY in a fresh test profile, to test the normal 60s fee path.
  const key=fee.ledger.key('YSR',config.wallets.YSR);fee.ledger.credit(key,199*60);await fee.persist();
  await fee.start(config,hw.last);assert.equal(fee.phase,'service');phase=fee.phase;
  const began=Date.now();while(Date.now()-began<95000&&fee.active){await sleep(1000);phase=fee.phase;}
  await fee.stop('YSR integration test complete');stopped=true;
  const serviceAccepted=events.filter(e=>e.phase==='service'&&/YSR share accepted/.test(e.message)).length;
  const userAccepted=events.filter(e=>e.phase==='user'&&/YSR share accepted/.test(e.message)).length;
  const result={at:new Date().toISOString(),profile:dir,gpu:gpu.name,serviceAccepted,userAccepted,sameWallet:true,syntheticLedger:true,stopped:miner.status==='idle',events,samples};
  await fs.writeFile(path.resolve(__dirname,'../../../.local/yskar-research/live-integration.json'),JSON.stringify(result,null,2));
  assert.ok(serviceAccepted>0,'Service phase must submit accepted shares');assert.ok(userAccepted>0,'User phase must resume and submit accepted shares');assert.equal(miner.status,'idle');
  console.log(JSON.stringify({passed:true,serviceAccepted,userAccepted,stopped:true}));
 }finally{clearTimeout(timeout);hw.stop();if(!stopped)await fee.stop('Test cleanup');}
}
main().catch(e=>{console.error(e);process.exitCode=1});
