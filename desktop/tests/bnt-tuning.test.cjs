const test=require('node:test'),assert=require('node:assert/strict');
const {placements,engines,candidates,choose,fingerprint,validPlan}=require('../src/bnt-tuning.cjs');
function cpu(group,logical,core,cache=0,efficiency=0){return{group,logical,core,cache,numa:group,efficiency,flags:0,id:group*64+logical}}
test('BNT placement spreads NUMA/cache domains and physical cores before SMT, across Windows groups',()=>{
 const info={cpus:[cpu(0,0,0),cpu(0,1,0),cpu(0,2,1),cpu(0,3,1),cpu(1,0,0),cpu(1,1,0),cpu(1,2,1),cpu(1,3,1)]};
 assert.deepEqual(placements(info).map(r=>[r.group,r.logical]),[[0,0],[1,0],[0,2],[1,2],[0,1],[1,1],[0,3],[1,3]]);
 const hybrid={cpus:[cpu(0,0,0,0,0),cpu(0,1,1,0,1),cpu(0,2,1,0,1),cpu(0,3,2,0,0)]};
 assert.deepEqual(placements(hybrid).map(r=>r.logical),[1,0,3,2]);
});
test('tuning never selects unsupported AVX-512 and never exceeds the memory ceiling',()=>{
 assert.deepEqual(engines({avx2:false,avx512f:false}),['sse2']);
 assert.ok(!engines({avx2:true,avx512f:false}).includes('avx512'));
 assert.ok(engines({avx2:true,avx512f:true}).includes('avx512'));
 assert.deepEqual(candidates(23),[1,2,4,8,12,16,23]);assert.deepEqual(candidates(0),[]);
});
test('recommendation uses medians instead of peaks and favors fewer threads within 3%',()=>{
 const a={threads:8},b={threads:16},rows=[...([9,10,11].map(hs=>({plan:a,hs}))),...([9.8,10.2,100].map(hs=>({plan:b,hs})))];
 assert.equal(choose(rows).plan.threads,8);assert.equal(choose(rows).hs,10);
});
test('cached tuning invalidates on hardware/kernel change but ignores parked flags',()=>{
 const info={version:'0.2.0',avx2:true,avx512f:false,cpus:[cpu(0,0,0)]},hw={cpu:[{Name:'test'}],memory:[],metrics:{totalMemory:64}};
 const a=fingerprint(info,hw);assert.equal(a,fingerprint({...info,cpus:[{...info.cpus[0],flags:1}]},hw));
 assert.notEqual(a,fingerprint({...info,version:'0.2.1'},hw));assert.notEqual(a,fingerprint(info,{...hw,metrics:{totalMemory:128}}));
 assert.notEqual(a,fingerprint({...info,binarySha256:'different-build'},hw));
 assert.equal(a,fingerprint(info,{...hw,cpu:[{Name:'test',CurrentClockSpeed:1200}]}),'live CPU clock must not invalidate saved tuning');
 assert.notEqual(a,fingerprint(info,{...hw,cpu:[{Name:'different CPU'}]}));
 const p={engine:'avx2',threads:8,performance:100,pages:'off',affinity:true};assert.equal(validPlan(p,info,8,100),true);
 assert.equal(validPlan({...p,engine:'avx512'},info,8,100),false);assert.equal(validPlan(p,info,4,100),false);assert.equal(validPlan(p,info,8,75),false);
});
test('cancelled tuning trial cannot start a compute process',async()=>{
 const signal=AbortSignal.abort();
 await assert.rejects(require('../src/bnt-tuning.cjs').trial('does-not-exist.exe',{}, {},{}, {signal}),/已取消/);
});
test('stream path requires explicit new-core capability and AVX2; old cores and saved paths remain usable',()=>{
 const {resolvePlan}=require('../src/bnt-tuning.cjs');
 const info={version:'0.2.1',streamPrefetch:true,avx2:true,avx512f:false,cpus:[]};
 const hw={cpu:[],memory:[],metrics:{totalMemory:64}},c={performance:100};
 assert.ok(engines(info).includes('stream'));
 assert.ok(!engines({...info,streamPrefetch:false}).includes('stream'));
 assert.deepEqual(engines({...info,avx2:false}),['sse2']);
 assert.equal(resolvePlan(info,hw,c,4,null,null).plan.engine,'gozero');
 assert.equal(resolvePlan(info,hw,c,8,null,null).plan.engine,'gozero');
 assert.equal(resolvePlan({...info,streamPrefetch:false},hw,c,4,null,null).plan.engine,'gozero');
 assert.equal(resolvePlan({...info,avx2:false},hw,c,4,null,null).plan.engine,'sse2');
 const selected={engine:'gozero',threads:4,performance:100,pages:'off',affinity:true};
 assert.equal(resolvePlan(info,hw,c,4,null,{fingerprint:fingerprint(info,hw),selected}).plan.engine,'gozero');
 assert.equal(resolvePlan(info,hw,c,4,null,{fingerprint:fingerprint(info,hw),selected:{...selected,engine:'stream'}}).plan.engine,'stream');
 assert.equal(validPlan({...selected,engine:'stream'},{...info,streamPrefetch:false},4,100),false);
});
test('1.0.33-1.0.35 profiles survive updates and page-right changes without losing SIMD or affinity',()=>{
 const {resolvePlan,compatibleFingerprints}=require('../src/bnt-tuning.cjs');
 const info={version:'0.2.0',binarySha256:'same-core',avx2:true,avx512f:false,cpus:[cpu(0,0,0)]},hw={cpu:[{Name:'3995WX'}],memory:[{Capacity:64*1024**3}],metrics:{totalMemory:64*1024**3}};
 const selected={engine:'prefetch',threads:23,performance:100,pages:'off',affinity:true},c={performance:100};
 const signatures=compatibleFingerprints(info,hw);assert.equal(new Set(signatures).size,3);
 for(const signature of signatures)for(const pref of [null,{enabled:true,enabledAt:'2026-10-08'}]){
  const r=resolvePlan(info,hw,c,23,pref,{fingerprint:signature,at:'2026-10-01',selected});assert.equal(r.source,'saved');assert.deepEqual(r.plan,{...selected,tuned:true});
 }
 const profile={fingerprint:signatures[0],selected};
 assert.equal(resolvePlan(info,hw,c,12,null,profile).reason,'settings');
 assert.equal(resolvePlan(info,hw,{performance:75},23,null,profile).reason,'settings');
 assert.equal(resolvePlan({...info,binarySha256:'different-core'},hw,c,23,null,profile).reason,'hardware');
 assert.equal(resolvePlan(info,hw,c,23,null,null).plan.pages,'off');
 assert.equal(resolvePlan(info,hw,c,23,null,null).plan.affinity,false);
});
