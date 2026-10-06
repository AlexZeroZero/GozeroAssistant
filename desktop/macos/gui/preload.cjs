'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=(channel,...args)=>ipcRenderer.invoke(channel,...args).then(r=>{if(!r.ok)throw Error(r.error);return r.value;});
contextBridge.exposeInMainWorld('gozero',Object.freeze({bootstrap:()=>invoke('bootstrap'),save:c=>invoke('save',c),start:()=>invoke('start'),stop:()=>invoke('stop'),benchmark:()=>invoke('benchmark'),scan:()=>invoke('scan'),window:a=>invoke('window',a),open:id=>invoke('open',id),exportLogs:()=>invoke('exportLogs'),subscribe:fn=>{const handler=(_e,s)=>fn(s);ipcRenderer.on('state',handler);return()=>ipcRenderer.removeListener('state',handler);}}));
