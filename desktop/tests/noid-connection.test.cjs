'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),net=require('node:net');
const {prepare,probe,dnsAnswers,publicIPv4,resolveOfficial}=require('../src/noid-connection.cjs');
const {validate}=require('../src/config.cjs'),{argsFor}=require('../src/miner.cjs');
const wallet='o1mlk6uluf2dghqzz0etew4u9wq6clnnr4y4wuv20q2m255mj9crjquzyr4r';
const cfg=()=>validate({coin:'NOID',noidConnection:'compatible',wallets:{NOID:wallet},kernels:{NOID:'suprminer-noid-1.9.27'}});
test('DNS accepts matching answers and CNAMEs but rejects unrelated/private addresses',()=>{
 const host='noid.suprnova.cc',base={Status:0,Question:[{name:host+'.',type:1}]};
 assert.deepEqual(dnsAnswers({...base,Answer:[{name:host,type:5,data:'edge.example.'},{name:'edge.example.',type:1,data:'51.89.7.224'}]},host),['51.89.7.224']);
 for(const ip of ['127.0.0.1','10.0.1.2','172.16.1.2','192.168.1.2','100.64.1.2','169.254.1.2','0.0.0.0','224.0.0.1','::1','garbage'])assert.equal(publicIPv4(ip),false);
 for(const data of [{...base,Status:3},{...base,Answer:[{name:'evil.example',type:1,data:'51.89.7.224'}]},{...base,Answer:[{name:host,type:1,data:'127.0.0.1'}]},{...base,Question:[]}])assert.throws(()=>dnsAnswers(data,host));
});
test('HTTPS DNS is bounded and only queries official hosts',async()=>{
 let calls=0;const request=async(url,options)=>{calls++;assert.equal(url,'https://dns.google/resolve?name=noid.suprnova.cc&type=A');assert.equal(options.maxBytes,32768);assert.equal(options.timeout,4000);return Buffer.from(JSON.stringify({Status:0,Question:[{name:'noid.suprnova.cc.',type:1}],Answer:[{name:'noid.suprnova.cc.',type:1,data:'51.89.7.224'}]}))};
 assert.deepEqual(await resolveOfficial('noid.suprnova.cc',request),['51.89.7.224']);await assert.rejects(resolveOfficial('other.example',request));assert.equal(calls,1);
});
test('compatibility selects tested backup only; original config, wallets and fees survive',async()=>{
 const c=cfg(),before=structuredClone(c),seen=[];
 const r=await prepare(c,{resolve:async host=>{seen.push(host);return host.startsWith('stratum-apac')?['8.8.8.8']:['51.89.7.224']},check:async url=>{if(url.includes('8.8.8.8'))throw Error('timeout')}});
 assert.deepEqual(c,before);assert.deepEqual(seen,['stratum-apac.suprnova.cc','noid.suprnova.cc']);assert.equal(r.url,'stratum+tcp://51.89.7.224:3337');assert.deepEqual(r.config.poolBackups.NOID,[]);assert.deepEqual(r.config.wallets,c.wallets);assert.equal(r.config.poolFee,c.poolFee);
 const gpu={vendor:'NVIDIA',pci:'01:00.0',architecture:'Ampere',driver:'610.62',sensors:{uuid:'GPU-12345678-1234-1234-1234-123456789abc',at:Date.now(),temp:60}};
 for(const id of ['suprminer-noid-1.9.27','fl4shminer-noid-1.5.0']){r.config.kernels.NOID=id;const args=argsFor(r.config,gpu,'unused');assert.ok(args.includes(r.url));assert.ok(args.includes(wallet+'.Gozer'));assert.equal(args.filter(v=>v.startsWith('stratum')).length,1)}
});
test('native mode preserves TLS, hostname and config; never invokes alternate DNS',async()=>{
 const c={...cfg(),noidConnection:'native'},urls=[];const r=await prepare(c,{resolve:()=>{throw Error('unexpected DNS')},check:async u=>urls.push(u)});
 assert.equal(r.config.pools.NOID,c.pools.NOID);assert.deepEqual(r.config.poolBackups.NOID,[]);assert.deepEqual(urls,[c.pools.NOID]);
 await assert.rejects(prepare(c,{check:async()=>{throw Error('offline')}}),/兼容 TCP/);
});
test('custom pools and nonstandard ports cannot silently become official TCP',async()=>{
 for(const url of ['stratum+ssl://other.example:3341','stratum+ssl://noid.suprnova.cc:9999']){const c=cfg();c.pools.NOID=url;await assert.rejects(prepare(c),/仅支持/)}
 assert.equal(validate({}).noidConnection,'auto');assert.throws(()=>validate({noidConnection:'evil'}));
});
test('cancelled routing never returns a launch config',async()=>{
 const ac=new AbortController();let checks=0;
 await assert.rejects(prepare(cfg(),{signal:ac.signal,resolve:async()=>{ac.abort(Error('cancelled'));return['51.89.7.224']},check:async()=>checks++}),/cancelled/);assert.equal(checks,0);
});
test('assistant stop cancels connection before any miner process is launched',async()=>{
 const {Miner}=require('../src/miner.cjs'),routing=require('../src/noid-connection.cjs');
 const previous=routing.prepare;let entered;
 const ready=new Promise(r=>entered=r);
 routing.prepare=async(_c,{signal})=>{entered();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))};
 const m=new Miner(require('node:os').tmpdir(),async()=>{},()=>{});m.installed=async()=>true;
 const id='a'.repeat(20),c=cfg();c.selected=[id];
 const hardware={scannedAt:Date.now(),gpus:[{id,vendor:'NVIDIA',pci:'01:00.0',architecture:'Ampere',driver:'610.62',sensors:{uuid:'GPU-12345678-1234-1234-1234-123456789abc',at:Date.now(),temp:60}}]};
 try{const running=m.start(c,hardware);const rejected=assert.rejects(running,/取消/);await ready;assert.equal(m.status,'starting');await m.stop();await rejected;assert.equal(m.jobs.size,0);assert.equal(m.status,'idle')}finally{routing.prepare=previous;await m.stop()}
});
async function server(t,respond){const sockets=new Set();const s=net.createServer(c=>{sockets.add(c);c.on('error',()=>{});c.on('close',()=>sockets.delete(c));respond(c)});await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>{for(const c of sockets)c.destroy();s.close()});return 'stratum+tcp://127.0.0.1:'+s.address().port}
test('probe validates split NOID protocol responses and sends no wallet/auth',async t=>{
 let sent='';const u=await server(t,c=>c.once('data',d=>{sent+=d;c.write('{"id":1,"result":');setTimeout(()=>c.write('{"protocol":"parano1d-stratum-v1"}}\n'),5)}));
 const r=await probe(u);assert.equal(r.protocol,'parano1d-stratum-v1');assert.equal(JSON.parse(sent).method,'mining.subscribe');assert.ok(!sent.includes(wallet));
});
test('probe rejects incorrect protocol, malformed/oversized data and timeout',async t=>{
 for(const reply of ['{"id":1,"result":{"protocol":"bitcoin"}}\n','invalid\n','x'.repeat(33000)]){const u=await server(t,c=>c.once('data',()=>c.end(reply)));await assert.rejects(probe(u,{timeout:400}))}
 const u=await server(t,()=>{});await assert.rejects(probe(u,{timeout:50}),/超时/);
 const ac=new AbortController(),pending=probe(u,{signal:ac.signal});ac.abort(Error('cancelled'));await assert.rejects(pending,/cancelled/);
});

test('auto prefers reachable original backups and only then tries compatible TCP',async()=>{
 const c={...cfg(),noidConnection:'auto'},seen=[];
 const first=await prepare(c,{resolve:()=>{throw Error('must not use TCP')},check:async u=>{seen.push(u);if(u.includes('apac'))throw Error('offline')}});
 assert.equal(first.original,c.poolBackups.NOID[0]);assert.equal(first.compatible,false);assert.equal(seen.length,2);
 seen.length=0;const second=await prepare(c,{resolve:async()=>['51.89.7.224'],check:async u=>{seen.push(u);if(u.startsWith('stratum+ssl:'))throw Error('TLS unavailable')}});
 assert.equal(second.compatible,true);assert.equal(seen.length,4);assert.ok(seen.slice(0,3).every(u=>u.startsWith('stratum+ssl:')));assert.equal(c.noidConnection,'auto');
});
test('auto never changes a custom pool to an unrelated official pool',async()=>{
 const c={...cfg(),noidConnection:'auto',pools:{NOID:'stratum+ssl://custom.example:443'},poolBackups:{NOID:[]}};
 let resolved=false;await assert.rejects(prepare(c,{resolve:async()=>{resolved=true;return[]},check:async()=>{throw Error('offline')}}));assert.equal(resolved,false);
});
test('legacy saved settings migrate connection and self core without losing wallet or backups',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),{ConfigStore}=require('../src/config.cjs');
 const dir=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'gozero-config-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const c=cfg();delete c.noidConnectionVersion;c.noidConnection='native';c.kernels.NOID='gozero-noid-0.2.0';
 await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify(c));const store=new ConfigStore(dir);await store.load();
 assert.equal(store.value.noidConnection,'auto');assert.equal(store.value.kernels.NOID,'auto');assert.deepEqual(store.value.wallets,c.wallets);assert.deepEqual(store.value.poolBackups,c.poolBackups);
 await store.save({...store.value,noidConnection:'native'});await store.load();assert.equal(store.value.noidConnection,'native');
});
