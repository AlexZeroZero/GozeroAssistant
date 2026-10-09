'use strict';
function startThreads(requested,info){
 if(!Number.isInteger(requested)||requested<1||requested>8)throw Error('Invalid BNT thread limit');
 if(!Number.isInteger(info.maxThreads)||info.maxThreads<0||!Number.isInteger(info.pressureLevel))throw Error('Invalid BNT memory status');
 return info.pressureLevel>=4?0:Math.min(requested,info.maxThreads,info.pressureLevel===2?1:8);
}
function runningThreads(active,pressure){return pressure>=4?0:pressure===2?Math.min(active,1):active;}
module.exports={startThreads,runningThreads};
