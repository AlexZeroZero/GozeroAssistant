(()=>{
 const accountDialog=node('dialog');accountDialog.id='pool-account-dialog';const dialogHead=node('div','dialog-head');dialogHead.append(node('b','','矿池实际收益'));const close=node('button','','×');close.onclick=()=>accountDialog.close();dialogHead.append(close);const accountPanel=node('article','panel pool-account');accountPanel.dataset.poolAccount='';accountDialog.append(dialogHead,accountPanel);document.body.append(accountDialog);
 window.openPoolAccount=async id=>{accountDialog.showModal();const value=await api.poolAccountRefresh(id);state.poolAccount=value;renderPoolAccount(value)};
 const panels=[...document.querySelectorAll('[data-pool-account]')];
 const fields=[['已确认余额','balance','confirmed'],['待确认收益','balance','pending'],['累计已支付','stats','paid'],['近7日收益','stats','week'],['近30日收益','stats','month'],['支付门槛','balance','threshold']];
 const amount=n=>typeof n==='string'&&/^\d+\.\d{8}$/.test(n)?n.replace(/\B(?=(\d{3})+\.)/g,','):typeof n!=='number'?'—':n>0&&n<1e-8?n.toExponential(3):n.toLocaleString('en-US',{maximumFractionDigits:8});
 for(const panel of panels){
  const head=node('div','panel-head');head.append(node('b','','矿池实际收益'),node('span','account-identity','Kryptex · 地址账本'));
  for(const [label,handler,cls]of [['刷新',async()=>{const value=await api.poolAccountRefresh();state.poolAccount=value;renderPoolAccount(value)},'account-refresh'],['支付记录',()=>$('#payout-dialog').showModal(),'account-payouts'],['账单 ↗',()=>api.poolAccountOpen(),'account-open']]){const b=node('button','link '+cls,label);b.onclick=()=>action(handler,b);head.append(b)}
  const values=node('div','account-values');for(const [label,section,key]of fields){const cell=node('div');cell.dataset.section=section;cell.dataset.field=key;cell.append(node('small','',label),node('b','','—'));values.append(cell)}
  const mining=node('div','portal-mining');mining.hidden=true;panel.append(head,values,mining,node('div','account-note','保存收款地址后自动查询'));
 }
 let paymentsKey='';
 function portalTable(headers,rows){const table=node('table'),head=node('thead'),tr=node('tr');for(const h of headers)tr.append(node('th','',h));head.append(tr);table.append(head);const body=node('tbody');for(const row of rows){const tr=node('tr');for(const v of row)tr.append(node('td','',v??'—'));body.append(tr)}table.append(body);return table}
 const scalar=v=>v===null||v===undefined?'—':String(v),rate=v=>typeof v==='number'?hash(v):'—';
 function renderPortal(a){
  const s=a.sections,b=s.balance?.value,p=s.payouts?.value,m=s.mining?.value,policy=s.policy?.value,ysr=a.coin==='YSR';
  for(const panel of panels){
   text(panel.querySelector('.account-identity'),a.coin+' · Gozero Pool · '+a.address);
   text(panel.querySelector('.account-payouts'),ysr?'奖励记录':'支付记录');
   const items=ysr?[['链上余额',amount(b?.confirmed),s.balance],['本池已索引奖励',amount(s.stats?.value?.paid),s.stats],['已索引区块',scalar(p?.indexedBlocks),s.payouts],['矿池区块',scalar(p?.poolBlocks),s.payouts],['链查询深度',scalar(b?.historyDepth),s.balance],['结算方式','区块奖励直付',s.payouts]]:
    [['可用未支付',amount(b?.confirmed),s.balance],[a.coin==='BNT'?'待成熟 / 预估':'待成熟收益',amount(b?.pending),s.balance],['支付预留',amount(b?.reserved),s.balance],['累计已支付',amount(s.stats?.value?.paid),s.stats],['支付门槛',amount(policy?.threshold),s.policy],['成熟确认数',scalar(policy?.maturity)+(policy?.safety!==null&&policy?.safety!==undefined?' + '+policy.safety:''),s.policy]];
   [...panel.querySelectorAll('.account-values>div')].forEach((cell,i)=>{text(cell.querySelector('small'),items[i][0]);text(cell.querySelector('b'),items[i][1]);cell.classList.toggle('cached',!!items[i][2]?.stale)});
   const box=panel.querySelector('.portal-mining');box.hidden=false;const key=JSON.stringify([s.mining,b?.note,p?.complete,policy]);
   if(box.dataset.key!==key){const opened=box.querySelector('details')?.open;box.dataset.key=key;box.replaceChildren();
    const summary=node('div','portal-rates');for(const [label,value]of [['矿池估算',rate(m?.hash)],['15m',rate(m?.averages?.m15)],['1h',rate(m?.averages?.h1)],['24h',rate(m?.averages?.h24)],['在线 Worker',scalar(m?.online)],['接受 / 拒绝',scalar(m?.accepted)+' / '+scalar(m?.rejected)]]){const v=node('span');v.append(node('small','',label),node('b','',value));summary.append(v)}summary.classList.toggle('cached',!!s.mining?.stale);box.append(summary);
    const detail=node('details');detail.open=!!opened;detail.append(node('summary','','Worker 明细 · '+scalar(m?.workers?.length)));const scroll=node('div','portal-workers');
    if(m?.workers?.length)scroll.append(portalTable(['Worker','状态','矿池算力','接受 / 拒绝','最近份额'],m.workers.map(w=>[w.name||'—',w.online===true?'在线':w.online===false?'离线':'—',rate(w.hash),scalar(w.accepted)+' / '+scalar(w.rejected),w.lastShare?new Date(w.lastShare).toLocaleString(GozerI18n.locale):'—'])));else scroll.append(node('p','note',s.mining?.error||'矿池未返回 Worker 记录。'));detail.append(scroll,node('p','note',m?.note||'Worker 是矿池会话，不等于物理设备数量。'));box.append(detail);
    if(b?.note)box.append(node('p','note',b.note));if(ysr&&p?.complete!==true)box.append(node('p','note','奖励索引尚不完整，金额仅覆盖已索引区块。'));if(policy?.enabled===false)box.append(node('p','note','矿池自动支付暂未启用'));if(policy?.window)box.append(node('p','note','支付窗口 · '+policy.window));
   }
   const errors=Object.entries(s).filter(([k,v])=>k!=='stats'&&v?.error).map(([k,v])=>({balance:'余额',mining:'算力',payouts:'支付记录',policy:'支付规则'}[k]||k)+' '+v.error),old=Object.values(s).some(v=>v?.stale),at=Math.min(...Object.values(s).map(v=>v?.at).filter(Boolean));
   text(panel.querySelector('.account-note'),(a.loading?'查询中 · ':'')+(errors.length?errors.join(' · ')+' · ':old?'缓存数据 · ':'')+(Number.isFinite(at)?'查询 '+time(at)+' · ':'')+'算力30秒 / 账本60秒 · 单位 '+a.coin+' · 矿池估算不等于本机实时算力'+(a.mixed?' · 其它矿池收益不在本账本内':''));
   panel.querySelector('.account-refresh').disabled=a.loading;panel.querySelector('.account-open').disabled=false;panel.querySelector('.account-payouts').disabled=false;
  }
  const key=JSON.stringify([a.coin,a.address,s.payouts,GozerI18n.locale]);if(paymentsKey===key)return;paymentsKey=key;
  text('#payout-dialog .dialog-head b',ysr?'本池链上奖励记录':'矿池支付记录');const body=$('#payout-body');body.replaceChildren(node('p','note','Gozero Pool · '+a.coin+' · '+a.address+(s.payouts?.stale?' · 缓存数据':'')));
  if(p?.note)body.append(node('p','note',p.note));
  if(p?.complete===false)body.append(node('p','note','记录覆盖不完整，请以矿池说明为准。'));
  if(!p)body.append(node('p','note',s.payouts?.error||'正在读取支付记录…'));
  else if(!p.rows.length)body.append(node('p','note','矿池未返回支付记录。余额达到门槛后，支付时间以矿池规则为准。'));
  else body.append(portalTable(['时间','金额 / '+a.coin,'状态','交易ID'],p.rows.map(r=>[r.at?new Date(r.at).toLocaleString(GozerI18n.locale):'—',amount(r.amount),r.status,r.txid?r.txid.slice(0,8)+'…'+r.txid.slice(-6):'—'])));
  if(p){const nav=node('div','portal-pages');for(const [label,n]of [['上一页',p.page-1],['下一页',p.page+1]]){const btn=node('button','link',label);btn.disabled=n<1||n>p.pages||a.loading;btn.onclick=()=>action(async()=>{const value=await api.poolAccountPage(n);state.poolAccount=value;renderPoolAccount(value)},btn);nav.append(btn)}nav.append(node('span','note',p.page+' / '+p.pages+' · '+p.count+' 条'));body.append(nav)}
  const link=node('button','link','查看矿池完整账单 ↗');link.onclick=()=>action(()=>api.poolAccountOpen(),link);body.append(link);
 }
 function renderPoolAccount(a){
  if(a?.adapter==='gozero'){renderPortal(a);return}for(const panel of panels)panel.querySelector('.portal-mining').hidden=true;
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
