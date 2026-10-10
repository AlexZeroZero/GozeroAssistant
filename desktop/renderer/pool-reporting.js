'use strict';
(()=>{
 const row=node('div','config-row pool-report-row'),label=node('label'),check=node('input');check.id='report-pool-identity';check.type='checkbox';label.append(check,node('span','','向矿池上报矿工名和设备型号'));row.append(label,node('small','','关闭后使用通用矿工名；下次启动生效'));$('.mining-config').append(row);
 check.onchange=()=>{const enabled=check.checked;return action(async()=>{await window.flushMiningSettings();await save({reportPoolIdentity:enabled});toast('设置已保存')})};
 window.renderPoolReporting=s=>{check.checked=s.config.reportPoolIdentity!==false;check.disabled=!s.ready||s.miner.status!=='idle'||s.serviceFee?.active||s.serviceFee?.switching||s.miner.installing};
 api.subscribe(window.renderPoolReporting);if(state)window.renderPoolReporting(state);
 for(const [scope,parent]of [['page',$('#logs .log-toolbar')],['workbench',$('.workbench-log .panel-head')]]){
  const group=node('div','log-kind-filter');group.setAttribute('role','group');group.setAttribute('aria-label','日志设备筛选');
  for(const [mode,title]of [['all','全部'],['gpu','GPU'],['cpu','CPU']]){const b=node('button',mode==='all'?'active':'',title);b.dataset.logKind=mode;b.setAttribute('aria-pressed',String(mode==='all'));b.onclick=()=>{GozerLogFilter.set(scope,mode);for(const button of group.children){button.classList.toggle('active',button===b);button.setAttribute('aria-pressed',String(button===b))}if(scope==='page')renderLogs();else renderWorkbenchLogs()};group.append(b)}
  parent.prepend(group);
 }
})();
