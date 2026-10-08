const test=require('node:test'),assert=require('node:assert/strict');
const {hideNetworkAddresses}=require('../src/log-privacy.cjs');

test('connection logs hide IPv4, IPv6 and mapped IPv4 without changing domain names',()=>{
 const text='pool.example:14444 ECONNREFUSED 203.0.113.15:4444 [2001:db8::12]:4444 ::ffff:192.0.2.3';
 assert.equal(hideNetworkAddresses(text),'pool.example:14444 ECONNREFUSED [IP已隐藏]:4444 [IP已隐藏]:4444 [IP已隐藏]');
});
test('IP filtering preserves timestamps, kernel versions, PCI IDs and hashrate',()=>{
 const text='18:33:02 v1.9.27 GPU0 61:00.0 CPU TOTAL 1.200 H/s accepted=2 height=123456';
 assert.equal(hideNetworkAddresses(text),text);
});
