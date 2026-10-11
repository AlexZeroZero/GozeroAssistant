'use strict';
(()=>{
 const edits=new Set();let saved=false;
 const status=node('span','mining-save-state','设置自动保存');status.id='mining-save-state';status.setAttribute('role','status');$('#start').before(status);
 const queue=new GozerAutosave.Queue(async values=>{
  if(Object.hasOwn(values,'performance'))await enqueueConfig(async()=>{state.config=await api.performance(values.performance);render()});
  const cfg=state.config,coin=cfg.coin,patch={};
  for(const[key,value]of Object.entries(values)){
   if(key==='performance')continue;
   if(key==='wallet')patch.wallets={...cfg.wallets,[coin]:value};
   else if(key==='pool')patch.pools={...cfg.pools,[coin]:value};
   else if(key==='backups')patch.poolBackups={...cfg.poolBackups,[coin]:value};
   else patch[key]=value;
  }
  if(Object.keys(patch).length)await save(patch);saved=true;
 },q=>{
  text(status,q.error?'设置未保存，请检查输入':q.busy?'正在保存…':q.dirty||edits.size?'修改后自动保存':saved?'设置已保存':'设置自动保存');
  status.classList.toggle('save-error',!!q.error);
  if(q.error)toast('设置未保存：'+q.error.message);else if(!q.dirty&&!edits.size&&saved)toast('设置已保存');
 });
 const watch=(selector,key,read)=>{const n=$(selector);n.addEventListener('input',()=>{edits.add(n);text(status,'修改后自动保存')});n.addEventListener('change',()=>{edits.delete(n);queue.set(key,read())})};
 watch('#performance','performance',()=>+$('#performance').value);
 watch('#wallet','wallet',()=>$('#wallet').value.trim());watch('#pool','pool',()=>$('#pool').value.trim());watch('#worker','worker',()=>$('#worker').value.trim());watch('#cpu-threads','cpuThreads',()=>+$('#cpu-threads').value);watch('#zcd-password','zcdPassword',()=>$('#zcd-password').value);
 watch('#hash-window','hashWindowMinutes',()=>+$('#hash-window').value);
 const backups=()=>[1,2].map(i=>$('#pool-backup-'+i).value.trim()).filter(Boolean);
 for(const i of [1,2]){
  watch('#pool-backup-'+i,'backups',backups);
  const preset=$('#pool-backup-preset-'+i),previous=preset.onchange;
  preset.onchange=()=>{previous?.();queue.set('backups',backups())};
 }
 const preset=$('#pool-preset'),previousPreset=preset.onchange;
 preset.onchange=()=>{previousPreset?.();if(preset.value!=='custom'){queue.set('pool',$('#pool').value.trim());queue.set('backups',backups())}};
 text('#pool-backups-save','完成');$('#pool-backups-save').onclick=()=>action(async()=>{await window.flushMiningSettings();$('#pool-dialog').close()});
 window.flushMiningSettings=async()=>{if(state?.config.workbenchMode==='dual')return;for(const n of [...edits])n.dispatchEvent(new Event('change'));await queue.flush()};
 window.setMiningTransport=value=>{edits.delete($('#pool'));$('#pool').value=value;queue.set('pool',value);if(state.config.coin==='NOID'){queue.set('noidConnection','native');$('#noid-connection').value='native'}syncPoolPreset(value)};
 const start=$('#start');start.onclick=()=>action(async()=>{await window.flushMiningSettings();await saveMining();await api.start(false)},start);
 // Existing selectors persist their own settings. Flush the budget before them
 // so a response from an earlier edit cannot overwrite a later selection.
 for(const selector of ['#kernel-select','#noid-connection','#pool-connection-check','#bnt-connection-check']){
  const n=$(selector),event=selector.endsWith('check')?'onclick':'onchange',previous=n[event];
  n[event]=()=>action(async()=>{await window.flushMiningSettings();return previous?.()});
 }
})();
