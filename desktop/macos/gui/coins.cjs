'use strict';
const COINS=Object.freeze({
 NOID:{name:'Parano1d',kernel:'Gozero NOID · Apple Metal / PMULL',unit:'MH/s',divisor:1e6,cpu:true,benchmark:true,pool:'innovlab',host:'hk2.innovlab.cc',port:19601,site:'https://noid.innovlab.cc/'},
 QTC:{name:'Quantus',kernel:'Quantus 4.2.0 · Poseidon2 / Metal',unit:'MH/s',divisor:1e6,cpu:false,benchmark:false,pool:'kryptex',host:'qtc-hk.kryptex.network',port:8049,site:'https://pool.kryptex.com/qtc'},
 PRL:{name:'Pearl',kernel:'Pearl · v3 / Metal',unit:'TMAC/s',divisor:1e12,cpu:false,benchmark:false,pool:'kryptex',host:'prl-eu.kryptex.network',port:8048,site:'https://pool.kryptex.com/prl'},
});
function formatRate(n,coin='NOID',digits=3){const c=COINS[coin]||COINS.NOID;return Number.isFinite(n)?(n/c.divisor).toFixed(digits)+' '+c.unit:'—';}
module.exports={COINS,formatRate};
