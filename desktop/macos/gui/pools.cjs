'use strict';
// Official NOID TLS endpoints, checked 2026-10-06. These are two operators,
// not ten independent pools. HTTP-only pools require a different adapter.
const SOURCES={innovlab:'https://noid.innovlab.cc/',suprnova:'https://noid.suprnova.cc/StartMining'};
const PRESETS=Object.freeze([
 ['innovlab-hk','Innovlab · 香港 HK2','innovlab','hk2.innovlab.cc',19601],
 ['innovlab-eu','Innovlab · 欧洲 EU2','innovlab','eu2.innovlab.cc',19601],
 ['innovlab-eu1','Innovlab · 欧洲 EU','innovlab','eu.innovlab.cc',19601],
 ['innovlab-us','Innovlab · 美国 US','innovlab','us.innovlab.cc',19601],
 ['innovlab-us2','Innovlab · 美国 US2','innovlab','us2.innovlab.cc',19601],
 ['innovlab-ru','Innovlab · 俄罗斯','innovlab','ru.innovlab.cc',19601],
 ['suprnova-eu','Suprnova · 欧洲（Windows 同矿池）','suprnova','noid.suprnova.cc',3341],
 ['suprnova-eu2','Suprnova · 欧洲二区','suprnova','stratum-eu2.suprnova.cc',3341],
 ['suprnova-apac','Suprnova · 亚太','suprnova','stratum-apac.suprnova.cc',3341],
 ['suprnova-us','Suprnova · 美国','suprnova','stratum-us.suprnova.cc',3341],
 // Official noid.suprnova.cc A record independently checked via Google DoH
 // on 2026-10-06, and TCP subscribe verified on the user's M3. Explicit choice
 // avoids silently downgrading TLS or relying on the local poisoned DNS answer.
 ['suprnova-eu-tcp','Suprnova · 欧洲 TCP兼容（非加密）','suprnova','51.89.7.224',3337,'tcp'],
].map(([id,label,pool,host,port,transport='tls'])=>Object.freeze({id,label,pool,host,port,transport,source:SOURCES[pool]})));
function presetFor(c){return PRESETS.find(p=>p.pool===c.pool&&p.host.toLowerCase()===c.host.toLowerCase()&&p.port===c.port&&p.transport===(c.transport||'tls'))||null;}
module.exports={PRESETS,presetFor};
