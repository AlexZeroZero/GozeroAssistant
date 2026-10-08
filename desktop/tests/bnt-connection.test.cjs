const test=require('node:test'),assert=require('node:assert/strict'),net=require('node:net');
const {Pool}=require('../src/bnt-pool.cjs'),{report}=require('../src/bnt-runtime.cjs');
const address=require('../src/service-fee.cjs').ADDRESSES.BNT;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function serverFor(handler){const sockets=new Set(),server=net.createServer(s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));handler(s)});await new Promise(r=>server.listen(0,'127.0.0.1',r));return{url:'stratum+tcp://127.0.0.1:'+server.address().port,close:async()=>{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r))}}}
test('connected TCP without login acknowledgement reports login stage and backs off; stop cancels reconnect',async()=>{
 let connections=0;const srv=await serverFor(()=>connections++),logs=[],p=new Pool([srv.url],address,'test',{loginMs:30,retryMs:150,retryMaxMs:300});p.on('log',v=>logs.push(v));
 try{await new Promise((r,j)=>{const t=setTimeout(()=>j(Error('timeout')),2000);p.on('state',s=>{if(s.stage==='retry'){clearTimeout(t);r()}});p.connect()});assert.ok(logs.some(x=>x.includes('TCP 已连接')));assert.ok(logs.some(x=>x.includes('登录响应超时')));assert.ok(!logs.some(x=>x.includes('TCP 连接超时')));assert.equal(p.failures,1);assert.equal(p.logged,false);p.stop();await sleep(200);assert.equal(connections,1)}finally{p.stop();await srv.close()}
});
test('login without work times out distinctly; consecutive failures increase reconnect delay',async()=>{
 const srv=await serverFor(s=>s.on('data',()=>s.write('{"id":1,"status":"ok"}\n'))),delays=[],logs=[],p=new Pool([srv.url],address,'test',{jobMs:25,retryMs:30,retryMaxMs:120});p.on('log',v=>logs.push(v));
 try{await new Promise((r,j)=>{const t=setTimeout(()=>j(Error('timeout')),2000);p.on('state',s=>{if(s.stage==='retry'){delays.push(s.retryAt-Date.now());if(delays.length===2){clearTimeout(t);p.stop();r()}}});p.connect()});assert.ok(logs.some(l=>l.includes('已登录但矿池未下发任务')));assert.ok(delays[0]<=30&&delays[0]>15);assert.ok(delays[1]<=60&&delays[1]>45)}finally{p.stop();await srv.close()}
});
test('no pool work leaves rate unavailable without producing repeated zero-rate samples',()=>{
 const lines=[],miner={changed(){},hashWindows:{unavailable(){}},ingestLine(j,line){lines.push(line)}},j={id:'cpu',shares:{accepted:0,rejected:0}},stats={hashes:0,lastHashes:0,lastAt:0,started:false,workers:1};
 const p={logged:false,job:null,connection:{message:'TCP 连接超时'}};
 report(miner,j,p,stats,5000);report(miner,j,p,stats,10000);assert.equal(lines.length,0);assert.equal(j.telemetry,null);assert.equal(j.status,'waiting');
 p.logged=true;p.job={next:0n,end:10n};report(miner,j,p,stats,15000);assert.equal(lines.length,0);
 stats.hashes=5;report(miner,j,p,stats,20000);assert.equal(lines.length,1);assert.match(lines[0],/1.000 H\/s/);assert.equal(j.status,'running');
 p.logged=false;p.job=null;report(miner,j,p,stats,25000);assert.equal(lines.length,1);assert.equal(j.telemetry,null);
});
test('diagnostic confirms a complete job handshake and closes the socket without computing',async()=>{
 const srv=await serverFor(s=>s.on('data',()=>{s.write('{"id":1,"status":"ok"}\n');s.write(JSON.stringify({method:'job',params:{job_id:'probe',header_base:'00'.repeat(92),target:'ff'.repeat(32),height:2,nonce_start:0,nonce_end:100}})+'\n')}));
 try{const result=await require('../src/bnt-pool.cjs').probe({coin:'BNT',pools:{BNT:srv.url},wallets:{BNT:address},worker:'probe'},{timeout:1000});assert.equal(result.jobReceived,true);assert.equal(result.ip,undefined);assert.equal(result.endpoint,'[IP已隐藏]:'+new URL(srv.url).port);assert.equal(result.protocol,'Blocknet Stratum v2')}finally{await srv.close()}
});

test('domain connection and socket errors never expose resolved IPs in logs or connection state',async()=>{
 const srv=await serverFor(s=>s.on('data',()=>s.write('{"id":1,"status":"error","error":"upstream 203.0.113.21 [2001:db8::21] unavailable"}\n')));
 const url=srv.url.replace('127.0.0.1','localhost'),logs=[],states=[],p=new Pool([url],address,'privacy',{retryMs:1000});
 p.on('log',s=>logs.push(s));p.on('state',s=>states.push(s));
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),3000);p.on('state',s=>{if(s.stage==='retry'){clearTimeout(timer);p.stop();resolve()}});p.connect()});
  assert.ok(logs.some(s=>s.includes('TCP 已连接 localhost:')));
  assert.ok(logs.some(s=>s.includes('upstream [IP已隐藏] [IP已隐藏] unavailable')));
  assert.ok(states.some(s=>s.endpoint==='localhost:'+new URL(url).port));
  assert.doesNotMatch(JSON.stringify({logs,states}),/127\.0\.0\.1|203\.0\.113\.21|2001:db8::21|"ip":/);
 }finally{p.stop();await srv.close()}
});
