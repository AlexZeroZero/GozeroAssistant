'use strict';
(()=>{
 const label=node('label','note'),check=node('input');check.type='checkbox';check.id='mds-mss';
 label.id='mds-mss-row';label.hidden=true;label.append(check,node('span','','此地址由 generate-mss 生成，可重复收款（不能使用 WOTS 一次性地址）'));$('#wallet-validation').after(label);
 window.syncMdsInputs=()=>{check.checked=state.config.mdsMssConfirmed===true};
 window.renderMds=()=>{
  const active=state.config.coin==='MDS';label.hidden=!active;if(!active)return;
  const busy=!state.ready||state.miner.status!=='idle'||state.serviceFee?.active||state.serviceFee?.switching||state.miner.installing;
  check.disabled=busy;$('#performance').disabled=busy;$('#performance').title=GozerI18n.t('MDS 挖矿中：停止后可切换性能档位');
  $('#pool-backups-open').disabled=true;
  $('#wallet').placeholder=GozerI18n.t('MSS 可重复收款地址 · 64 / 72 位十六进制');
  text('#compatibility','MDS CUDA 0.1.12-rc.2 · NVIDIA RTX 30 / 40 / 50 · 需支持 PTX 9.0 的较新驱动；首启执行完整自检。');
  text('#fee-note','内核费 0% · 软件服务费 0.5%');
  text('.performance-note','MDS 由内核按调度执行性能预算，最高档90%；停止后切换档位，设置自动保存。');
  text('#measured-net','MDS 收益估算尚未接入；以矿池账本为准');
  if(!check.checked||!/^(?:[a-f0-9]{64}|[a-f0-9]{72})$/i.test($('#wallet').value.trim()))$('#start').disabled=true;
 };
 if(state){syncMdsInputs();renderMds()}
})();
