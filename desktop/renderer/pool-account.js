(()=>{
 const panels=[...document.querySelectorAll('[data-pool-account]')];
 const earnings=document.createElement('article');earnings.className='panel pool-account';document.querySelector('#earnings').append(earnings);panels.push(earnings);
 const fields=[['已确认余额','balance','confirmed'],['待确认收益','balance','pending'],['累计已支付','stats','paid'],['近7日收益','stats','week'],['近30日收益','stats','month'],['支付门槛','balance','threshold']];
 const amount=n=>typeof n!=='number'?'—':n>0&&n<1e-8?n.toExponential(3):n.toLocaleString('en-US',{maximumFractionDigits:8});
 for(const panel of panels){
  const head=node('div','panel-head');head.append(node('b','','矿池实际收益'),node('span','account-identity','Kryptex · 地址账本'));
  for(const [label,handler,cls]of [['刷新',async()=>{const value=await api.poolAccountRefresh();state.poolAccount=value;renderPoolAccount(value)},'account-refresh'],['支付记录',()=>$('#payout-dialog').showModal(),'account-payouts'],['账单 ↗',()=>api.poolAccountOpen(),'account-open']]){const b=node('button','link '+cls,label);b.onclick=()=>action(handler,b);head.append(b)}
  const values=node('div','account-values');for(const [label,section,key]of fields){const cell=node('div');cell.dataset.section=section;cell.dataset.field=key;cell.append(node('small','',label),node('b','','—'));values.append(cell)}
  panel.append(head,values,node('div','account-note','保存收款地址后自动查询'));
 }
 let paymentsKey='';
 function renderPoolAccount(a){
  for(const panel of panels){
   const sections=a?.sections||{},times=Object.values(sections).map(s=>s?.at).filter(Boolean),old=Object.values(sections).some(s=>s?.stale),failed=Object.values(sections).some(s=>s?.error);
   text(panel.querySelector('.account-identity'),a?.supported?(a.coin+' · '+a.source+' · '+a.address):a?.coin||'Kryptex');
   for(const cell of panel.querySelectorAll('.account-values>div')){const d=sections[cell.dataset.section];text(cell.querySelector('b'),amount(d?.value?.[cell.dataset.field]));cell.classList.toggle('cached',!!d?.stale)}
   text(panel.querySelector('.account-note'),!a?.supported?a?.reason||'保存地址后自动查询':a.loading?'正在读取矿池账本…':(failed?'部分接口不可用 · 保留可用数据 · ':old?'缓存 · ':'')+(times.length?'查询 '+time(Math.min(...times))+' · ':'')+'每60秒刷新 · 单位 '+a.coin+' · 仅本池此地址全部矿机'+(a.mixed?'（含备用矿池）':''));
   panel.querySelector('.account-refresh').disabled=!a?.supported||a.loading;panel.querySelector('.account-open').disabled=!a?.supported;panel.querySelector('.account-payouts').disabled=!a?.supported;
  }
  const p=a?.sections?.payouts,key=JSON.stringify([a?.coin,a?.address,p]);if(key!==paymentsKey){
   paymentsKey=key;const body=$('#payout-body');body.replaceChildren();body.append(node('p','note',(a?.source||'Kryptex')+' · '+(a?.coin||'')+' · '+(a?.address||'')+' · '+(p?.stale?'缓存数据 · ':'')+(p?.at?'查询 '+time(p.at):'等待来源')));
   if(!p?.value)body.append(node('p','note',p?.error||'正在读取支付记录…'));
   else if(!p.value.rows.length)body.append(node('p','note','矿池未返回支付记录。余额达到门槛后，支付时间以矿池规则为准。'));
   else{const table=node('table'),head=node('thead'),tr=node('tr');['时间','金额 / '+a.coin,'状态','交易ID'].forEach(x=>tr.append(node('th','',x)));head.append(tr);table.append(head);const rows=node('tbody');for(const r of p.value.rows){const tr=node('tr');for(const value of [r.at?new Date(r.at).toLocaleString(GozerI18n.locale):'—',amount(r.amount),r.status,r.txid?r.txid.slice(0,8)+'…'+r.txid.slice(-6):'—'])tr.append(node('td','',value));tr.lastChild.title=r.txid||'';rows.append(tr)}table.append(rows);body.append(table)}
   if(p?.value)body.append(node('p','note','矿池共 '+p.value.count+' 笔，展示接口第一页最近最多10笔。完整记录请查看矿池账单。'));
   const link=node('button','link','查看矿池完整账单 ↗');link.disabled=!a?.supported;link.onclick=()=>action(()=>api.poolAccountOpen(),link);body.append(link);
  }
 }
 $('#payout-close').onclick=()=>$('#payout-dialog').close();
 $('#temperature-default').onclick=()=>{$('#temperature').value=90;toast('已填入90°C，点击保存设置后生效')};
 window.renderPoolAccount=renderPoolAccount;if(state)renderPoolAccount(state.poolAccount);
})();
