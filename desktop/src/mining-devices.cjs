'use strict';
const crypto=require('node:crypto');
const {cpuThreadBudget}=require('../renderer/performance.js');
function cpuDevice(hw){
 const rows=(hw?.cpu||[]).filter(c=>c.Name&&Number(c.NumberOfLogicalProcessors)>0);
 if(!rows.length)return null;
 const logical=rows.reduce((n,c)=>n+Number(c.NumberOfLogicalProcessors),0);
 const name=rows.map(c=>String(c.Name).trim()).join(' + ');
 return {id:crypto.createHash('sha256').update('CPU:'+name+':'+logical).digest('hex').slice(0,20),name,kind:'CPU',vendor:/AMD/i.test(name)?'AMD':/Intel/i.test(name)?'Intel':'CPU',logical,cores:rows.reduce((n,c)=>n+Number(c.NumberOfCores||0),0),maxThreads:logical,sensors:null};
}
function miningDevices(config,hw){return ['ZCD','BNT'].includes(config.coin)?[cpuDevice(hw)].filter(Boolean):(hw?.gpus||[]).filter(g=>config.selected.includes(g.id))}
function workerCount(config){return ['ZCD','BNT'].includes(config.coin)?1:config.selected.length}
function cpuThreads(config,hw){if(config.coin==='BNT')return require('./bnt.cjs').threads(config,hw);const cpu=cpuDevice(hw);if(!cpu)throw Error('未识别到可用 CPU');const n=config.cpuThreads||cpuThreadBudget(cpu,config.performance);if(!Number.isInteger(n)||n<1||n>cpu.maxThreads)throw Error('CPU 线程数超出可用范围，请重新设置');return n}
module.exports={cpuDevice,miningDevices,workerCount,cpuThreads};
