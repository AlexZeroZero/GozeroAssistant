const test=require('node:test'),assert=require('node:assert/strict');
const {memoryBudget,threadLimit,threads}=require('../src/bnt.cjs');
const {bntThreadBudget}=require('../renderer/performance.js');
const G=1024**3;
const hardware=(total,free,logical=128)=>({cpu:[{NumberOfLogicalProcessors:logical}],metrics:{totalMemory:total*G,freeMemory:free*G}});
test('64 GiB BNT host uses available RAM and SMT rather than an eight-worker cap',()=>{
 const hw=hardware(64,56),b=memoryBudget(hw);
 assert.equal(b.maxThreads,23);assert.equal(b.reserveBytes,6.4*G);
 assert.deepEqual([50,75,100].map(performance=>threads({cpuThreads:0,performance},hw)),[11,17,23]);
 assert.deepEqual([50,75,100].map(p=>bntThreadBudget(b.maxThreads,p)),[11,17,23]);
 assert.equal(threads({cpuThreads:20,performance:100},hw),20);
 assert.ok(23*b.perThreadBytes+b.reserveBytes<=56*G);
 assert.throws(()=>threads({cpuThreads:24,performance:100},hw));
});
test('BNT budget responds to memory pressure, topology and reserves on smaller/larger machines',()=>{
 assert.equal(threadLimit(hardware(64,24)),8);
 assert.equal(threadLimit(hardware(128,112)),46);
 assert.equal(threadLimit(hardware(64,56,12)),12);
 assert.equal(threadLimit(hardware(16,12)),3);
 assert.equal(threadLimit(hardware(64,5)),0);
 assert.equal(bntThreadBudget(0,100),0);
 assert.throws(()=>threads({cpuThreads:0,performance:100},hardware(64,5)));
 const twoSockets=hardware(64,56);twoSockets.cpu=[{NumberOfLogicalProcessors:16},{NumberOfLogicalProcessors:16}];
 assert.equal(threadLimit(twoSockets),23);
 // A launch estimate must reject a saved 23-thread setting after RAM is consumed.
 assert.throws(()=>threads({cpuThreads:23,performance:100},hardware(64,24)));
});
test('missing or invalid memory never invents a positive BNT allowance',()=>{
 for(const hw of [{},{cpu:[{NumberOfLogicalProcessors:128}]},hardware(NaN,56),hardware(64,NaN),hardware(64,-1),hardware(64,56,NaN)])assert.equal(threadLimit(hw),0);
 const h=hardware(64,56);delete h.metrics.totalMemory;h.memory=[{Capacity:String(32*G)},{Capacity:String(32*G)}];
 assert.equal(threadLimit(h),23);
});
