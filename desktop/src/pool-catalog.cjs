'use strict';
// Official Kryptex pool pages /prl and /qtc; TLS ports are coin-specific.
function poolChoices(coin){
 if(!['PRL','QTC'].includes(coin))return [];
 const base=coin.toLowerCase(),port=coin==='PRL'?8048:8049;
 return [['sg','新加坡'],['hk','香港'],['us','美国'],['eu','欧洲'],['','全球']].map(([region,label])=>({label:'Kryptex · '+label,url:`stratum+ssl://${base}${region?'-'+region:''}.kryptex.network:${port}`}));
}
function recommendedBackups(coin,primary){const rows=poolChoices(coin);return rows.some(r=>r.url===primary)?rows.slice(0,3).filter(r=>r.url!==primary).slice(0,2).map(r=>r.url):[]}
function poolUrls(config){return [...new Set([config.pools[config.coin],...(config.poolBackups?.[config.coin]||[])].filter(Boolean))]}
module.exports={poolChoices,recommendedBackups,poolUrls};
