const{test}=require('node:test'),assert=require('node:assert/strict'),t=require('../renderer/pool-transport.js');
test('official protocols switch matching ports, including regional Kryptex and NOID',()=>{
 for(const [coin,host,tcp,ssl]of [['PRL','prl-sg.kryptex.network',7048,8048],['QTC','qtc-hk.kryptex.network',7049,8049],['NOID','stratum-apac.suprnova.cc',3337,3341]]){
  const plain=`stratum+tcp://${host}:${tcp}`,secure=`stratum+ssl://${host}:${ssl}`;
  assert.deepEqual(t.convert(secure,coin,'tcp'),{url:plain,mapped:true});assert.deepEqual(t.convert(plain,coin,'ssl'),{url:secure,mapped:true});
 }
});
test('custom ports and hostnames are preserved, not guessed or matched by suffix',()=>{
 for(const [coin,url]of [['ZCD','stratum+tcp://zcd.pool.gozero.trade:3333'],['BNT','stratum+tcp://bnt.pool.gozero.trade:14444'],['PRL','stratum+tcp://prl-sg.kryptex.network.evil.example:7048'],['QTC','stratum+tcp://qtc.kryptex.network:1234'],['BNT','stratum+tcp://[::1]:5555']])assert.deepEqual(t.convert(url,coin,'ssl'),{url:url.replace('stratum+tcp','stratum+ssl'),mapped:false});
});
test('HTTPS coins and TCP-only Seine do not advertise unsupported protocols',()=>{
 assert.throws(()=>t.convert('https://ysr.pool.gozero.trade:8443','YSR','tcp'));
 assert.throws(()=>t.convert('stratum+tcp://bnt.pool.gozero.trade:14444','BNT','ssl','bnt-seine'));
 assert.equal(t.mode('https://ysr.pool.gozero.trade:8443'),'https');assert.equal(t.mode('bad'),'');
 for(const url of ['bad','https://host:1234','stratum+tcp://user:pass@host:1234','stratum+tcp://host:1234/other','stratum+tcp://host'])assert.throws(()=>t.convert(url,'BNT','tcp'));
});
