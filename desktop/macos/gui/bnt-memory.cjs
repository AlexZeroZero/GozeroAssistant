'use strict';
function threadLimit(requested){
 if(!Number.isInteger(requested)||requested<0||requested>8)throw Error('Invalid BNT thread limit');
 return requested||8; // 0 is automatic; explicit values remain upper limits.
}
function validateInfo(info){
 if(!info||!Number.isInteger(info.maxThreads)||info.maxThreads<0||![0,1,2,4].includes(info.pressureLevel))throw Error('Invalid BNT memory status');
}
function startThreads(requested,info){
 const limit=threadLimit(requested);validateInfo(info);
 return info.pressureLevel>=4?0:Math.min(limit,info.maxThreads,info.pressureLevel===2?1:8);
}
function runningThreads(active,pressure){return pressure>=4?0:pressure===2?Math.min(active,1):active;}
function memoryPlan(requested,allocated,info){
 const limit=threadLimit(requested);validateInfo(info);
 let keep=Math.min(limit,runningThreads(allocated,info.pressureLevel));
 // maxThreads is ADDITIONAL capacity, not the total including allocated scratch.
 // A zero additional budget alone must not evict a healthy existing worker.
 if(info.pressureLevel===1&&Number.isFinite(info.availableMemory)&&Number.isFinite(info.headroomBytes)&&info.availableMemory<info.headroomBytes)keep=Math.max(0,keep-1);
 return {keep,grow:keep===allocated&&allocated<limit&&info.maxThreads>0&&(info.pressureLevel===1||info.pressureLevel===2&&allocated===0)};
}
module.exports={startThreads,runningThreads,threadLimit,memoryPlan};
