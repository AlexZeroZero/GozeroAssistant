(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GozerPoolTransport=api})(typeof globalThis==='object'?globalThis:this,()=>{
 const stratum=['stratum+tcp:','stratum+ssl:'];
 function mode(value){try{const p=new URL(value).protocol;return p==='https:'?'https':p==='http:'?'http':p==='stratum+tcp:'?'tcp':p==='stratum+ssl:'?'ssl':''}catch{return ''}}
 function requiresHttps(value,coin){try{return coin==='JTM'&&new URL(value).hostname==='jtm.pool.gozero.trade'}catch{return false}}
 // Kryptex /prl and /qtc connection tables verified 2026-10-11.
 function ports(coin,u){
  const base=coin.toLowerCase();
  if(['PRL','QTC'].includes(coin)&&new RegExp('^'+base+'(?:-(?:sg|hk|us|eu|br|ru|ae))?\\.kryptex\\.network$','i').test(u.hostname))return coin==='PRL'?{tcp:'7048',ssl:'8048'}:{tcp:'7049',ssl:'8049'};
  if(coin==='NOID'&&['stratum-apac.suprnova.cc','noid.suprnova.cc','stratum-us.suprnova.cc'].includes(u.hostname.toLowerCase()))return{tcp:'3337',ssl:'3341'};
  return null;
 }
 function convert(value,coin,target,adapter){
  if(coin==='JTM'){let u;try{u=new URL(value)}catch{throw Error('请先填写有效矿池地址')}if(!['http','https'].includes(target)||!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('JTM 需要 HTTP / HTTPS JSON-RPC 接口');if(requiresHttps(value,coin)&&target!=='https')throw Error('Gozero JTM 矿池仅支持 HTTPS');u.protocol=target+':';return{url:u.href,mapped:false};}
  if(!['tcp','ssl'].includes(target)||coin==='YSR')throw Error('此币种使用 HTTPS 矿池接口');
  if(coin==='MDS'&&target!=='tcp')throw Error('MDS 当前仅支持 TCP');
  if(adapter==='bnt-seine'&&target!=='tcp')throw Error('Seine 0.2.15 仅支持 stratum+tcp 矿池地址');
  let u;try{u=new URL(value.trim())}catch{throw Error('请先填写有效矿池地址')}
  if(!stratum.includes(u.protocol)||!u.hostname||!u.port||u.username||u.password||u.search||u.hash||(u.pathname&&u.pathname!=='/'))throw Error('请先填写有效矿池地址');
  const pair=ports(coin,u),mapped=!!pair&&Object.values(pair).includes(u.port);
  // Unknown/custom ports must never be guessed or silently replaced.
  const port=mapped?pair[target]:u.port;
  return{url:'stratum+'+(target==='ssl'?'ssl':'tcp')+'://'+u.hostname+':'+port+u.pathname,mapped};
 }
 return{mode,convert,requiresHttps};
});
