(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GozerLogFilter=api})(typeof globalThis==='object'?globalThis:this,()=>{
 const choices=['all','gpu','cpu'],selection={page:'all',workbench:'all'};
 const kind=row=>row.task==='gpu'||row.task==='cpu'?row.task:null;
 return{selection,filter:(rows,mode)=>rows.filter(row=>mode==='all'||kind(row)===mode),label:row=>(kind(row)?kind(row).toUpperCase()+' · ':'')+row.type,set:(scope,mode)=>{if(!['page','workbench'].includes(scope)||!choices.includes(mode))throw Error('无效日志筛选');selection[scope]=mode}};
});
