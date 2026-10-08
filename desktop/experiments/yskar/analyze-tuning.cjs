'use strict';
// Preserve the original benchmark result. Derive all four rates using the same
// raw native-log source, and replay every rate through the corrected app parser.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parseExternalTelemetry,Miner}=require('../../src/miner.cjs');
const root=path.resolve(__dirname,'../../../.local/yskar-research');
const live=JSON.parse(fs.readFileSync(path.join(root,'tuning-live-comparison.json'),'utf8'));
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const output=live.output.map(result=>{
 const hardware=live.rows.filter(r=>r.case===result.case),began=median(hardware.map(r=>r.at-r.elapsed));
 const miner=new Miner(root,()=>{throw Error('Replay never downloads or mines')},()=>{});
 miner.currentKernel={captureOutput:true};const job={id:'replay',name:result.device,samples:[],telemetry:null};
 const values=[];
 for(const event of live.events.filter(e=>e.case===result.case&&/GPU hashrate [\d.]+ H\/s/.test(e.message))){
  const t=parseExternalTelemetry(event.message);assert.ok(t,`Missing real rate: ${event.message}`);
  miner.ingestLine(job,event.message);assert.equal(job.telemetry.hash,t.hash);
  if(event.at-began>=15000&&event.at-began<=90000&&t.hash>0)values.push(t.hash/1e6);
 }
 assert.ok(values.length>=20,'Not enough completed-work samples');assert.ok(job.samples.length>=20);
 return {...result,samples:values.length,medianMhs:median(values),meanMhs:values.reduce((a,b)=>a+b,0)/values.length,minDuty:Math.min(...hardware.map(r=>r.duty).filter(Number.isFinite)),maxDuty:Math.max(...hardware.map(r=>r.duty).filter(Number.isFinite)),source:'native rate log; replayed through app ingestion'};
});
fs.writeFileSync(path.join(root,'tuning-live-analysis.json'),JSON.stringify({at:new Date().toISOString(),source:'tuning-live-comparison.json',note:'Initial new-core telemetry parser rejected retargeted diagnostics; this derivation uses native logs identically for every case. App parser and ingestion replay verified.',output},null,2));
console.log(JSON.stringify(output));
