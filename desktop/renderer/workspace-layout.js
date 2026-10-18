'use strict';
// Presentation only: move existing controls without replacing their handlers or
// owning miner configuration. A running task keeps its original coin/profile.
(()=>{
 const el=(tag,cls,content)=>node(tag,cls,content),main=$('main'),mining=$('#mining');
 let current=state,libraryCoin=null,focus='gpu',tab='config';
 const icons={
  work:'M4 5h16v14H4z M4 10h16 M9 10v9',
  devices:'M3 5h18v12H3z M8 21h8 M12 17v4',
  kernel:'M12 3 3 8l9 5 9-5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5',
  rental:'M3 10h18L19 4H5l-2 6z M5 10v10h14V10 M9 20v-6h6v6',
  settings:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  news:'M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5',
  log:'M5 3h14v18H5z M9 8h6 M9 12h6 M9 16h4',
  cpu:'M7 7h10v10H7z M10 1v4 M14 1v4 M10 19v4 M14 19v4 M1 10h4 M1 14h4 M19 10h4 M19 14h4',
  gpu:'M3 6h17v12H3z M20 10h2 M20 14h2 M6 18v3 M10 18v3 M14 18v3 M7 10h3v4H7z M14 10h3v4h-3z',
  chart:'M3 3v18h18 M6 15l4-5 4 3 6-8',
  wallet:'M4 6h16v14H4z M4 6V3h13v3 M15 11h5v5h-5z',
  search:'M17 17l4 4 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  play:'M8 4 20 12 8 20Z',stop:'M6 6h12v12H6Z',
 };
 function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('ui-icon');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',icons[name]||icons.work);svg.append(p);return svg;}
 function button(label,cls,handler,name){const b=el('button',cls);b.type='button';if(name)b.append(icon(name));b.append(el('span','',label));if(handler)b.onclick=handler;return b;}
 const nav=$('nav');
 const navItems=[['mining','工作台','work'],['overview','设备总览','devices'],['kernels','内核库','kernel'],['rentals','租赁市场','rental'],['settings','偏好与保护','settings'],['information','信息窗口','news']];
 nav.replaceChildren(...navItems.map(([id,label,name])=>{const b=button(label,'',null,name);b.dataset.view=id;return b}));
 const strip=el('div','task-strip');strip.setAttribute('aria-label','运行任务');nav.after(strip);
 const tasks={};
 for(const id of ['gpu','cpu']){
  const b=button('','task-summary',()=>action(async()=>{focus=id;showView('mining');if(current?.config.workbenchMode==='dual')setFocus(id);else if(taskState(current,id)?.miner.status&&taskState(current,id).miner.status!=='idle')setTab('telemetry');else await window.selectLayoutCoin(id==='cpu'?'ZCD':(current?.coins.find(c=>c.hardware!=='CPU')?.symbol||'MDS'));}),id);
  b.dataset.kind=id;b.lastChild.remove();const kind=el('b','task-summary-kind',id.toUpperCase()),coin=el('b','task-summary-coin','—'),status=el('span','task-summary-status','待机'),rate=el('strong','task-summary-rate','—');
  b.append(kind,coin,status,rate);strip.append(b);tasks[id]={b,coin,status,rate};
 }
 const shell=el('div','workspace-shell');main.before(shell);shell.append(main);
 const directory=el('aside','coin-directory'),picker=$('.coin-picker');shell.prepend(directory);
 const directoryHead=el('div','directory-head');directoryHead.append(el('b','','币种目录'),$('#coin-count'));directory.append(directoryHead,picker);
 const searchRow=el('label','directory-search');searchRow.append(icon('search'),$('#coin-search'));const filters=$('.coin-filters');picker.prepend(searchRow,filters);
 $('#coin-search').placeholder=GozerI18n.t('搜索币种');
 $('.coin-tools').remove();
 const directoryNote=el('p','directory-note','浏览与安装不影响运行任务');directory.append(directoryNote);
 const caption=$('.coin-caption');caption.classList.add('workspace-caption');
 const workspace=$('.mining-workspace'),bar=workspace.querySelector('.section-bar');bar.after(caption);
 const title=bar.querySelector('b');
 const tabs=el('div','workspace-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','工作台内容');
 const panels={};
 for(const [id,label,name] of [['config','参数设置','settings'],['telemetry','设备与算力','chart'],['account','矿池账本','wallet']]){
  const b=button(label,'',()=>setTab(id),name);b.id='workspace-tab-'+id;b.dataset.workspaceTab=id;b.setAttribute('role','tab');b.setAttribute('aria-controls','workspace-panel-'+id);tabs.append(b);
  const p=el('section','workspace-tab-panel');p.id='workspace-panel-'+id;p.setAttribute('role','tabpanel');p.setAttribute('aria-labelledby',b.id);panels[id]=p;
 }
 const actions=$('#start').parentElement,saveStatus=$('#mining-save-state');caption.after(actions,tabs);
 const heading=el('div','workspace-heading'),identity=el('div','workspace-identity'),runNote=el('div','workspace-run-note');
 bar.before(heading);identity.append(bar,caption);heading.append(identity,actions);runNote.append($('#run-status'));tabs.after(runNote);
 const columns=el('div','workspace-columns'),detail=el('div','workspace-detail'),status=el('aside','workspace-status');columns.append(detail,status);workspace.append(columns);detail.append(...Object.values(panels));
 // Capture these panels by stable field IDs, never their rendered text.
 const workers=$('#worker-rows').closest('article'),chart=$('#hash-chart').closest('article'),stats=$('.mining-stats'),periods=$('.mining-periods'),account=workspace.querySelector('[data-pool-account]');
 panels.telemetry.append(workers);panels.account.append(periods,account);status.append(stats,chart);
 const accountButton=button('查看矿池账本','status-account-link',()=>setTab('account'),'wallet');status.append(accountButton);
 const config=$('.mining-config'),configTitle=el('div','workspace-config-title');configTitle.append(el('b','','设备与性能'),saveStatus);config.prepend(configTitle);
 const deviceRow=$('#mining-devices').parentElement,performance=$('.performance-row'),performanceNote=$('.performance-note');deviceRow.after(performance,performanceNote);
 performanceNote.after($('#cpu-options'),$('#bnt-tuning'));
 const settingsFooter=el('div','settings-footer');settingsFooter.append($('#app-quit'));$('#settings').append(settingsFooter);
 // Keep the offline CPU action next to the thread control, and its token with
 // the connection settings rather than after the miner library controls.
 $('#cpu-options').after($('#jtm-guide'),$('#jtm-bench'));
 $('#pool-row').after($('#jtm-key-row'));
 const advanced=el('details','workspace-advanced');advanced.append(el('summary','','高级设置 · 连接方式与设备上报'));
 for(const selector of ['#pool-transport-row','#noid-connection-row','.pool-report-row']){const n=$(selector);if(n)advanced.append(n)}config.append(advanced);
 // All remaining compatibility/install/CPU controls retain their original IDs.
 panels.config.append(config);
 for(const n of [...workspace.children])if(![heading,tabs,runNote,columns].includes(n))panels.config.append(n);
 const install=$('#kernel-install');config.after(install);
 const log=$('.workbench-log');log.classList.add('workspace-log');
 const logButton=log.querySelector('[data-view="logs"]');if(logButton)logButton.setAttribute('aria-label','展开运行日志');
 // Existing dual task cards remain alive. Compact windows show one task's
 // settings at a time; both tasks and their logs continue updating normally.
 const dual=$('#dual-workbench'),focusBar=el('div','dual-focus-tabs');focusBar.setAttribute('role','tablist');focusBar.setAttribute('aria-label','双挖任务设置');
 for(const id of ['gpu','cpu']){const b=button(id.toUpperCase()+' 参数','',()=>setFocus(id),id);b.dataset.taskFocus=id;b.id='task-focus-'+id;b.setAttribute('role','tab');b.setAttribute('aria-controls','task-panel-'+id);focusBar.append(b);const c=$('.dual-card.'+id);c.id='task-panel-'+id;c.setAttribute('role','tabpanel');c.setAttribute('aria-labelledby',b.id);}
 $('.dual-grid').before(focusBar);
 for(const c of document.querySelectorAll('.dual-card')){
  const connection=c.querySelector('.dual-connection');for(const [i,n]of [...connection.children].entries()){const l=el('label');l.append(el('span','control-label',i===0?'收款地址':'矿池地址'),n);connection.append(l)}
  const detail=c.querySelector('.dual-settings');text(detail.querySelector('summary'),'高级设置 · 矿池与设备');
  c.querySelector('.dual-head').after(c.querySelector('.dual-actions'));
  c.querySelector('.task-coin').title=GozerI18n.t('选择此任务的币种');
 }
 const dualLogLink=button('展开日志','link',()=>showView('logs'),'log');$('.dual-log-head').append(dualLogLink);
 function setTab(id){tab=Object.hasOwn(panels,id)?id:'config';workspace.dataset.tab=tab;for(const [name,p]of Object.entries(panels)){p.hidden=name!==tab;const b=tabs.querySelector('[data-workspace-tab="'+name+'"]');b.classList.toggle('active',name===tab);b.setAttribute('aria-selected',String(name===tab));}status.hidden=tab==='account';}
 function setFocus(id){focus=id;dual.dataset.focus=id;for(const b of focusBar.children){const on=b.dataset.taskFocus===id;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));}for(const c of document.querySelectorAll('.dual-card'))c.hidden=c.dataset.task!==id;if(current)updateDirectory(current);}
 function taskState(s,id){if(!s?.config)return null;if(s.config.workbenchMode==='dual')return s.dual?.tasks?.[id];if((['ZCD','BNT','JTM'].includes(s.config.coin)?'cpu':'gpu')!==id)return null;return{config:s.config,miner:s.miner,fee:s.serviceFee};}
 function rate(value,coin){if(!Number.isFinite(value))return'—';return coin==='MDS'?(value>=1000?num(value/1000,2)+' kN/s':num(value,2)+' N/s'):hash(value);}
 function taskUpdate(s){for(const id of ['gpu','cpu']){const t=taskState(s,id),m=t?.miner,r=tasks[id],active=m?.status&&m.status!=='idle';text(r.coin,t?.config.coin||'—');text(r.status,m?.installing?'安装中':({running:'运行中',starting:'启动中',stopping:'停止中',idle:m?.session?'已停止':'待机'}[m?.status]||'未启用'));text(r.rate,active?rate(m.hashAverage?.hash,t.config.coin):'—');r.b.classList.toggle('running',m?.status==='running');r.b.classList.toggle('selected',view==='mining'&&(s.config.workbenchMode==='dual'?focus===id:!!t));r.b.title=GozerI18n.t((t?.config.hashWindowMinutes||5)+'分钟均值')+' · '+GozerI18n.t(m?.hashAverage?.retained?'上次均值':m?.hashAverage?.complete?'已结算':'等待完整采样');}}
 function updateDirectory(s){
  window.refreshCoinGroups();
  const selected=view==='kernels'?libraryCoin:s.config.workbenchMode==='dual'?s.dual?.tasks?.[focus]?.config.coin:s.config.coin;
  for(const b of directory.querySelectorAll('[data-coin]')){const on=b.dataset.coin===selected;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}
 }
 window.refreshCoinGroups=()=>{
  const list=$('#coin-tabs'),buttons=[...list.querySelectorAll('[data-coin]')];
  if(buttons.length&&!list.querySelector('.directory-category'))for(const kind of ['GPU','CPU']){
   const items=buttons.filter(b=>b.dataset.kind===kind);if(!items.length)continue;
   const label=el('div','directory-category',kind);label.dataset.category=kind;list.append(label,...items);
  }
  for(const label of list.querySelectorAll('.directory-category')){const visible=buttons.filter(b=>b.dataset.kind===label.dataset.category&&!b.hidden);label.hidden=!visible.length;text(label,label.dataset.category+' · '+visible.length);}
 };
 window.selectLayoutCoin=async(symbol,configure=false)=>{
  if(!current?.ready)return;
  if(view==='kernels'&&!configure){openKernelLibrary(symbol);return;}
  if(current.config.workbenchMode==='dual'){
   const c=current.coins.find(c=>c.symbol===symbol),id=c?.hardware==='CPU'?'cpu':'gpu',t=current.dual.tasks[id];
   if(t.busy&&t.config.coin!==symbol){openKernelLibrary(symbol);toast('当前任务继续运行，可查看与安装其他内核');return;}
   await window.selectDualCoin(id,symbol);setFocus(id);showView('mining');return;
  }
  if(current.config.coin===symbol){setTab('config');showView('mining');return;}
  await chooseCoin(symbol);
  if(state.config.coin===symbol){setTab('config');showView('mining');}
 };
 window.renderWorkspaceLayout=s=>{if(!s?.config)return;current=s;taskUpdate(s);updateDirectory(s);const c=s.coins.find(c=>c.symbol===s.config.coin);text(title,c?c.symbol+' · '+c.name:'工作台');runNote.hidden=$('#run-status').textContent===GozerI18n.t('设置自动保存，手动启动挖矿');};
 window.getLayoutCoin=()=>view==='kernels'?libraryCoin:current?.config.workbenchMode==='dual'?current.dual?.tasks?.[focus]?.config.coin:current?.config.coin;
 document.addEventListener('gozer-library',e=>{libraryCoin=e.detail;if(current)updateDirectory(current)});
 document.addEventListener('gozer-view',()=>{shell.dataset.view=view;directory.hidden=!['mining','kernels'].includes(view);if(view==='kernels'&&!libraryCoin)openKernelLibrary(current?.config.coin);if(current)window.renderWorkspaceLayout(current)});
 document.addEventListener('gozer-language',()=>{if(current)window.renderWorkspaceLayout(current)});
 for(const selector of ['#start','#stop','.dual-actions .primary','.dual-actions .danger','.dual-toolbar .primary','.dual-toolbar .danger','.device-select-button'])for(const b of document.querySelectorAll(selector)){
  const name=b.matches('.device-select-button')?'devices':b.matches('.danger')?'stop':'play',label=b.textContent.replace(/^[▶■]\s*/,'').replace(/\s*↗$/,'');
  b.replaceChildren(icon(name),el('span','',label));
 }
 for(const id of ['wallet','worker','pool','kernel-select']){const row=$('#'+id).closest('.config-row');const label=id==='worker'?row.querySelector('.short'):row?.querySelector('label');if(label)label.htmlFor=id;}
 // Arrow/Home/End navigation supplements the normal keyboard tab order.
 for(const list of [tabs,focusBar])list.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const items=[...list.querySelectorAll('button')],i=items.indexOf(document.activeElement);if(i<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowRight'?1:-1)+items.length)%items.length;items[next].click();items[next].focus()});
 setTab('config');setFocus('gpu');api.subscribe(window.renderWorkspaceLayout);if(state)window.renderWorkspaceLayout(state);showView('mining');
})();
