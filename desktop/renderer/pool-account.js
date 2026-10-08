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
  text('#payout-dialog .dialog-head b',a?.coin==='YSR'?'链上奖励记录 · 最近10笔':'矿池支付记录 · 最近10笔');
  for(const panel of panels){
   text(panel.querySelector('.account-payouts'),a?.coin==='YSR'?'奖励记录':'支付记录');
   const sections=a?.sections||{},times=Object.values(sections).map(s=>s?.at).filter(Boolean),old=Object.values(sections).some(s=>s?.stale),failed=Object.values(sections).some(s=>s?.error);
   text(panel.querySelector('.account-identity'),a?.supported?(a.coin+' · '+a.source+' · '+a.address):a?.coin||'Kryptex');
   for(const cell of panel.querySelectorAll('.account-values>div')){const d=sections[cell.dataset.section];const original=fields.find(f=>f[1]===cell.dataset.section&&f[2]===cell.dataset.field)?.[0];text(cell.querySelector('small'),a?.coin==='YSR'?({confirmed:'链上余额',pending:'待确认（未提供）',paid:'返回记录收益',week:'近7日（未提供）',month:'近30日（未提供）',threshold:'直接入账 / 无门槛'}[cell.dataset.field]):original);text(cell.querySelector('b'),amount(d?.value?.[cell.dataset.field]));cell.classList.toggle('cached',!!d?.stale)}
   text(panel.querySelector('.account-note'),!a?.supported?a?.reason||'保存地址后自动查询':a.loading?'正在读取矿池账本…':(failed?'部分接口不可用 · 保留可用数据 · ':old?'缓存 · ':'')+(times.length?'查询 '+time(Math.min(...times))+' · ':'')+(a.coin==='YSR'?'链上余额及返回的奖励记录，非待提现账本 · ':'')+'每60秒刷新 · 单位 '+a.coin+' · 仅本池此地址全部矿机'+(a.mixed?'（含备用矿池）':''));
   panel.querySelector('.account-refresh').disabled=!a?.supported||a.loading;panel.querySelector('.account-open').disabled=!a?.supported;panel.querySelector('.account-payouts').disabled=!a?.supported;
  }
  const p=a?.sections?.payouts,key=JSON.stringify([a?.coin,a?.address,p]);if(key!==paymentsKey){
   paymentsKey=key;const body=$('#payout-body');body.replaceChildren();body.append(node('p','note',(a?.source||'Kryptex')+' · '+(a?.coin||'')+' · '+(a?.address||'')+' · '+(p?.stale?'缓存数据 · ':'')+(p?.at?'查询 '+time(p.at):'等待来源')));if(a?.coin==='NOID')body.append(node('p','note','NOID 支付记录金额为矿池出账额，可能包含支付手续费；累计已支付按矿池净额字段显示。'));
   if(a?.coin==='YSR')body.append(node('p','note','YSR 奖励随区块直接入账；仅列出节点返回的奖励记录，非全部历史收益，也不能单独归因于本次测试。'));
   if(!p?.value)body.append(node('p','note',p?.error||'正在读取支付记录…'));
   else if(!p.value.rows.length)body.append(node('p','note',a?.coin==='YSR'?'节点未返回奖励记录。':'矿池未返回支付记录。余额达到门槛后，支付时间以矿池规则为准。'));
   else{const table=node('table'),head=node('thead'),tr=node('tr');['时间','金额 / '+a.coin,'状态','交易ID'].forEach(x=>tr.append(node('th','',x)));head.append(tr);table.append(head);const rows=node('tbody');for(const r of p.value.rows){const tr=node('tr');for(const value of [r.at?new Date(r.at).toLocaleString(GozerI18n.locale):'—',amount(r.amount),r.status,r.txid?r.txid.slice(0,8)+'…'+r.txid.slice(-6):'—'])tr.append(node('td','',value));tr.lastChild.title=r.txid||'';rows.append(tr)}table.append(rows);body.append(table)}
   if(p?.value)body.append(node('p','note',(a?.coin==='YSR'?'本次返回奖励记录 ':'矿池共 ')+p.value.count+' 笔，展示最多10笔。完整记录请查看来源。'));
   const link=node('button','link','查看矿池完整账单 ↗');link.disabled=!a?.supported;link.onclick=()=>action(()=>api.poolAccountOpen(),link);body.append(link);
  }
 }
 $('#payout-close').onclick=()=>$('#payout-dialog').close();
 $('#temperature-default').onclick=()=>{$('#temperature').value=90;toast('已填入90°C，点击保存设置后生效')};
 window.renderPoolAccount=renderPoolAccount;if(state)renderPoolAccount(state.poolAccount);
})();
