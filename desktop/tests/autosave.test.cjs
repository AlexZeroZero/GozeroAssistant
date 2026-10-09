const{test}=require('node:test'),assert=require('node:assert/strict');
const{Queue}=require('../renderer/autosave.js');
test('latest edits coalesce; starting waits for in-flight save and the newest budget',async()=>{
 let release;const gate=new Promise(r=>release=r),writes=[];
 const q=new Queue(async v=>{writes.push(v);if(writes.length===1)await gate},()=>{},10000);
 q.set('performance',50);q.set('performance',75);const first=q.flush();
 q.set('performance',100);q.set('threads',128);let started=false;const start=q.flush().then(()=>started=true);
 assert.equal(started,false);release();await Promise.all([first,start]);
 assert.deepEqual(writes,[{performance:75},{performance:100,threads:128}]);assert.equal(started,true);assert.equal(q.dirty,false);
});
test('a failed save retains the newest draft, blocks start and can retry',async()=>{
 let fail=true;const writes=[],q=new Queue(async v=>{if(fail){q.set('performance',100);throw Error('disk error')}writes.push(v)},()=>{},10000);
 q.set('performance',50);await assert.rejects(q.flush(),/disk error/);assert.equal(q.dirty,true);assert.equal(q.error.message,'disk error');
 fail=false;await q.flush();assert.deepEqual(writes,[{performance:100}]);assert.equal(q.error,null);assert.equal(q.dirty,false);
});
