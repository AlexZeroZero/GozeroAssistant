'use strict';
const COINS=Object.freeze({
 JTM:{name:'Jetsam',kernel:'Gozero JTM · TowerWalk / ARM64 CPU',unit:'kH/s',divisor:1e3,cpu:true,cpuOnly:true,benchmark:false,pool:'gozero',host:'jtm.pool.gozero.trade',port:443,transport:'https',site:'https://pool.gozero.trade/JTM'},
 MDS:{name:'Midstate',kernel:'Gozero MDS · BLAKE3 / Metal + NEON',unit:'N/s',divisor:1,cpu:true,benchmark:false,pool:'gozero',host:'mds.gozero.trade',port:13333,transport:'tcp',site:'https://midstate.cash/'},
 NOID:{name:'Parano1d',kernel:'Gozero NOID · Apple Metal / PMULL',unit:'MH/s',divisor:1e6,cpu:true,benchmark:true,pool:'innovlab',host:'hk2.innovlab.cc',port:19601,site:'https://noid.innovlab.cc/'},
 QTC:{name:'Quantus',kernel:'Quantus 4.2.0 · Poseidon2 / Metal',unit:'MH/s',divisor:1e6,cpu:false,benchmark:false,pool:'kryptex',host:'qtc-hk.kryptex.network',port:8049,site:'https://pool.kryptex.com/qtc'},
 BNT:{name:'Blocknet',kernel:'Gozero BNT · ARM64 CPU / Argon2id',unit:'H/s',divisor:1,cpu:true,cpuOnly:true,benchmark:false,pool:'gozero',host:'bnt.pool.gozero.trade',port:14444,transport:'tcp',site:'https://bnt.pool.gozero.trade'},
 PRL:{name:'Pearl',kernel:'Pearl · v3 / Metal',unit:'TMAC/s',divisor:1e12,cpu:false,benchmark:false,pool:'kryptex',host:'prl-eu.kryptex.network',port:8048,site:'https://pool.kryptex.com/prl'},
});
function formatRate(n,coin='NOID',digits=3){const c=COINS[coin]||COINS.NOID;return Number.isFinite(n)?(n/c.divisor).toFixed(digits)+' '+c.unit:'—';}
module.exports={COINS,formatRate};
