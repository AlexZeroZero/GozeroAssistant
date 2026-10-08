'use strict';
(()=>{
 const api=window.gozer,rows=[];let latest;
 const labels={checking:'正在检测大页权限',disabled:'大页未授权',pending:'需注销重登或重启电脑',available:'大页可分配', 'allocation-failed':'已授权，当前大页分配失败',error:'大页状态读取失败'};
 const put=(n,s)=>GozerI18n.setText(n,s);
 function row(parent,kind){if(!parent)return;const root=document.createElement('div');root.className='large-pages-row';root.dataset.location=kind;
  const button=document.createElement('button'),refresh=document.createElement('button'),note=document.createElement('span');button.className='large-pages-enable';refresh.className='large-pages-refresh';put(button,'开启大页内存');put(refresh,'检测');root.append(button,refresh,note);if(kind==='settings')parent.querySelector('.panel-head').after(root);else if(kind==='dual')parent.querySelector('.dual-performance').after(root);else parent.append(root);rows.push({root,button,refresh,note,kind});
  button.onclick=async()=>{button.disabled=true;try{await api.largePagesEnable()}catch(e){window.toast?.(e.message)}finally{update(await api.bootstrap())}};
  refresh.onclick=async()=>{refresh.disabled=true;try{await api.largePagesStatus()}catch(e){window.toast?.(e.message)}finally{update(await api.bootstrap())}};
 }
 const single=document.createElement('div');document.querySelector('.mining-config').before(single);row(single,'single');
 row(document.querySelector('.dual-card.cpu'),'dual');row(document.querySelector('#settings .panel'),'settings');
 function update(s){if(!s?.config)return;latest=s;const p=s.largePages||{phase:'checking'},blocked=!s.ready||p.busy||s.bntTuning?.running||s.miner?.status!=='idle'||s.serviceFee?.active||Object.values(s.dual?.tasks||{}).some(v=>v.busy);const session=s.config.workbenchMode==='dual'?s.dual?.tasks?.cpu?.miner?.session:s.miner?.session;
  for(const r of rows){r.root.dataset.phase=p.phase;r.root.hidden=r.kind==='single'?(s.config.workbenchMode==='dual'||!['BNT','ZCD'].includes(s.config.coin)):r.kind==='dual'?s.config.workbenchMode!=='dual':false;
   r.button.disabled=blocked||p.phase==='pending'||p.preferred&&p.tokenAvailable;r.refresh.disabled=p.busy||!s.ready;
   put(r.button,p.phase==='pending'?'大页待生效':p.preferred&&p.tokenAvailable?'大页已开启':'开启大页内存');
   let text=labels[p.phase]||labels.error;if(session?.coin==='BNT'&&session.bntOptimization&&((s.config.workbenchMode==='dual'?s.dual.tasks.cpu.miner.status:s.miner.status)==='running'))text+=' · '+GozerI18n.t('实际大页线程')+' '+session.bntOptimization.largePageWorkers+'/'+session.cpuThreads;
   put(r.note,text);r.note.title=p.error||GozerI18n.t('权限可用不代表全部内存分配成功；BNT 以实际大页线程数为准，ZCD 以内核日志为准。');
  }
 }
 api.subscribe(update);api.bootstrap().then(update);document.addEventListener('gozer-language',()=>latest&&update(latest));
})();
