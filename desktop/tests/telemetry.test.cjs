const {test}=require('node:test'),assert=require('node:assert/strict');
const {HashHistory,thermalLevel}=require('../renderer/telemetry.js');
function fixture(at,hash=100){return{status:'running',session:{startedAt:1},jobs:[{id:'gpu',status:'running',telemetry:{at,hash}}]}}
test('hash curve uses only fresh real samples, breaks on gaps and resets between sessions',()=>{
 const h=new HashHistory();assert.equal(h.update(fixture(1000),1000),100);h.update(fixture(1000),1500);assert.equal(h.points.length,1);
 h.update(fixture(2000,150),2000);assert.match(h.geometry().line,/ L/);
 assert.equal(h.update(fixture(2000),23000),null);assert.equal(h.geometry().dot,null);
 h.update(fixture(24000,120),24000);assert.equal(h.geometry().line.match(/ M/g).length,2);
 h.update({...fixture(25000),session:{startedAt:25000}},25000);assert.equal(h.points.length,1);
 h.update({...fixture(26000),status:'idle',session:{startedAt:25000}},26000);assert.equal(h.geometry().dot,null);
});
test('hash curve bounds memory and rejects partial, non-finite or future telemetry',()=>{
 const h=new HashHistory();for(let i=1;i<=1000;i++)h.update(fixture(i*1000,i),i*1000);assert.ok(h.points.length<=120);assert.ok(h.geometry().count<=120);
 const m=fixture(1001000);m.jobs.push({id:'other',status:'running',telemetry:null});assert.equal(h.update(m,1001000),null);
 assert.equal(h.update(fixture(1100000),1001000),null);assert.equal(h.update(fixture(1002000,NaN),1002000),null);
 assert.equal(h.update(fixture(1003000,0),1003000),0);assert.ok(!h.geometry().line.includes('NaN'));
});
test('temperature colours follow the configured stop threshold, never colour missing values hot',()=>{
 assert.equal(thermalLevel(82,82),'hot');assert.equal(thermalLevel(81,82),'warm');assert.equal(thermalLevel(76,82),'normal');
 assert.equal(thermalLevel(61,60),'hot');assert.equal(thermalLevel(null,82),'unknown');assert.equal(thermalLevel(NaN,82),'unknown');
});
