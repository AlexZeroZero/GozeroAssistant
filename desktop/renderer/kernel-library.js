'use strict';
(()=>{
 const panel=node('section','view');panel.id='kernels';
 const bar=node('div','section-bar');bar.append(node('b','','币种与内核库'));
 const back=node('button','','返回工作台');back.onclick=()=>showView('mining');bar.append(back);
 const note=node('p','note library-notice','挖矿期间可查看其他币种和安装其他内核；当前任务继续运行。');
 const tabs=node('div','library-tabs'),body=node('div','library-body');
 tabs.setAttribute('role','group');tabs.setAttribute('aria-label','选择挖矿币种');
 panel.append(bar,note,tabs,body);$('main').append(panel);
 const stages={connecting:'连接下载源',downloading:'下载内核',verifying:'校验安装包',extracting:'解压内核',checking:'校验可执行文件',ready:'可用内核',error:'安装失败 · 可重试',idle:'尚未安装'};
 let coin='NOID',key='',rows=new Map(),count;
 const busy=()=>state.miner.status!=='idle'||state.serviceFee?.active||state.serviceFee?.switching||Object.values(state.dual?.tasks||{}).some(t=>t.busy);
 window.openKernelLibrary=symbol=>{coin=symbol||state.config.coin;showView('kernels');update(state)};
 $('#kernel-library-open').onclick=()=>openKernelLibrary();
 const extra=node('button','library-mode-link','内核库 ↗');extra.onclick=()=>openKernelLibrary();$('.workbench-modes').append(extra);
 function cardHeader(name,version){
  const head=node('div','library-head'),identity=node('div','library-identity');
  identity.append(node('b','',name),node('span','library-version','v'+version));head.append(identity);return head;
 }
 function build(lib,current){
  tabs.replaceChildren(...lib.map(c=>{
   const b=node('button',c.symbol===coin?'active':'');b.setAttribute('aria-pressed',String(c.symbol===coin));
   b.append(node('b','',c.symbol),node('small','',c.hardware||'GPU'));b.onclick=()=>openKernelLibrary(c.symbol);return b;
  }));
  body.replaceChildren();rows=new Map();
  const info=node('div','panel library-info'),identity=node('div','library-summary');
  identity.append(node('b','',current.symbol+' · '+current.name),node('span','muted',current.algorithm));
  count=node('span','library-count');identity.append(count);
  const select=node('button','primary','配置此币种挖矿');select.onclick=()=>action(async()=>{
   if(busy())throw Error('已有挖矿任务运行。请先停止当前任务，再切换币种启动；下载内核不会停止当前任务。');
   if(state.config.workbenchMode==='dual'){toast('请返回双挖工作台，在对应 CPU / GPU 任务中选择币种');return}
   await chooseCoin(coin);showView('mining');
  });info.append(identity,select);body.append(info);
  const grid=node('div','library-grid');body.append(grid);
  for(const [index,k]of current.kernels.entries()){
   const card=node('article','panel library-kernel');card.dataset.kernel=k.id;
   const head=cardHeader(k.name||'KRig',k.version),badge=node('span','library-badge',index===0?'默认推荐':'可选内核');head.append(badge);
   const statusRow=node('div','library-status-row'),status=node('span','library-status'),bytes=node('span','library-bytes');statusRow.append(status,bytes);
   const progressSlot=node('div','library-progress'),progress=node('progress');progress.max=100;progress.setAttribute('aria-label','内核安装进度');progressSlot.append(progress);
   const source=node('p','library-source',k.bundled?'随附开源核心 · SHA256 校验':k.adapter==='bnt-seine'?'Seine 原版 GitHub · 内核费 2.5%（bntpool 1%）· 软件服务费 0.5% · SHA256 校验':'官方 GitHub 下载 · SHA256 双重校验');
   const button=node('button','primary library-install','下载并安装');
   const symbol=current.symbol;button.onclick=()=>action(async()=>{await api.libraryInstall(symbol,k.id);toast('内核安装并校验完成，尚未开始挖矿')},button);
   const error=node('p','library-error');error.hidden=true;error.setAttribute('role','status');
   card.append(head,statusRow,source,button,progressSlot,error);grid.append(card);rows.set(k.id,{card,status,bytes,progress,button,error});
  }
  if(coin==='BNT'){
   const section=node('div','library-external');section.append(node('h3','','官方全节点 · 独立运行'));
   const card=node('article','panel library-kernel library-node'),head=cardHeader('Blocknet Core','0.20.0');head.append(node('span','library-badge','官方全节点'));
   const description=node('p','library-source','全节点单挖 · 需要同步区块链；不能作为工作台矿池内核启动。');
   const actions=node('div','library-node-actions'),download=node('button','primary','下载 Windows 原版 ↗'),source=node('button','','发布页 / 校验值 ↗');
   download.onclick=()=>action(()=>api.open('bntOfficialDownload'),download);source.onclick=()=>action(()=>api.open('bntOfficialRelease'),source);actions.append(download,source);
   const details=node('details','library-checksum');details.append(node('summary','','SHA256'),node('code','','f9ca1ac5dd55ddb9af963c44df9152479f05d6c55be3fb2bbf69cfe7d9fa7435'));
   card.append(head,description,actions,details);section.append(card);body.append(section);
  }
 }
 function update(s){
  if(!s)return;const lib=s.kernelLibrary||[],current=lib.find(c=>c.symbol===coin);if(!current)return;
  const next=coin+':'+lib.map(c=>c.symbol+':'+c.kernels.map(k=>k.id).join(',')).join('|');
  if(key!==next){key=next;build(lib,current)}
  text(count,'已安装 '+current.kernels.filter(k=>k.installed).length+' / '+current.kernels.length);
  const installing=lib.some(c=>c.kernels.some(k=>k.installing));
  for(const k of current.kernels){
   const r=rows.get(k.id);if(!r)continue;const p=k.installation||{};
   const phase=k.installing?'working':p.stage==='error'?'error':k.installed?'ready':'idle';r.card.dataset.phase=phase;
   text(r.status,k.installing?(stages[p.stage]||'下载与校验中…'):p.stage==='error'?stages.error:k.installed?'已安装 · 可用内核':'尚未安装');
   text(r.bytes,k.installing&&p.received?num(p.received/1048576,1)+' MB'+(p.total?' / '+num(p.total/1048576,1)+' MB':''):'');
   r.progress.hidden=!k.installing;if(p.total)r.progress.value=Math.min(100,p.received/p.total*100);else r.progress.removeAttribute('value');
   r.error.hidden=p.stage!=='error';text(r.error,p.stage==='error'?p.error||'安装失败 · 可重试':'');
   r.button.disabled=installing;text(r.button,k.installing?'下载与校验中…':k.installed?'重新安装':k.bundled?'安装内核':'下载并安装');
  }
 }
 api.subscribe(update);if(state)update(state);
})();
