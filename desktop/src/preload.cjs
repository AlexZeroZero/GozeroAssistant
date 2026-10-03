'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const call=(channel,...args)=>ipcRenderer.invoke(channel,...args).then(r=>{if(!r.ok)throw Error(r.error);return r.value});
contextBridge.exposeInMainWorld('gozer',Object.freeze({
 rentals:input=>call('rentals',input),rentalOpen:id=>call('rentalOpen',id),
 language:value=>call('language',value),poolAccountRefresh:()=>call('poolAccountRefresh'),poolAccountOpen:()=>call('poolAccountOpen'),checkUpdate:()=>call('checkUpdate'),downloadUpdate:()=>call('downloadUpdate'),shareRecords:value=>call('shareRecords',value),exportRecords:()=>call('exportRecords'),nativeCheck:()=>call('nativeCheck'),performance:value=>call('performance',value),network:()=>call('network'),information:()=>call('information'),infoSource:id=>call('infoSource',id),bootstrap:()=>call('bootstrap'),scan:()=>call('scan'),save:v=>call('save',v),income:()=>call('income'),install:()=>call('install'),start:test=>call('start',test===true),stop:()=>call('stop'),window:a=>call('window',a),open:id=>call('open',id),exportLogs:()=>call('exportLogs'),
 subscribe:handler=>{const listener=(_e,value)=>handler(value);ipcRenderer.on('state',listener);return()=>ipcRenderer.removeListener('state',listener)}
}));
