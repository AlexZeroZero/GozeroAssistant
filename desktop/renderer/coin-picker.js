'use strict';
(()=>{
 let kind='all',catalogKey='';
 const busy=s=>!s.ready||s.miner.status!=='idle'||s.serviceFee?.active||s.serviceFee?.switching||s.miner.installing;
 window.renderCoinPicker=s=>{
  if(!s)return;
  const key=JSON.stringify(s.coins.map(c=>[c.symbol,c.name,c.algorithm,c.hardware]));
  if(key!==catalogKey){catalogKey=key;$('#coin-tabs').replaceChildren(...s.coins.map(c=>{
   const b=node('button','coin-choice');b.dataset.coin=c.symbol;b.dataset.kind=c.hardware||'GPU';
   const head=node('span','coin-choice-head');head.append(node('b','',c.symbol),node('em','',c.hardware||'GPU'));
   b.append(head,node('small','',c.name));b.title=c.name+' · '+c.algorithm;return b;
  }));}
  const query=$('#coin-search').value.trim().toLowerCase();let count=0;
  for(const c of s.coins){const b=$('#coin-tabs').querySelector('[data-coin="'+c.symbol+'"]');b.hidden=(kind!=='all'&&(c.hardware||'GPU')!==kind)||!`${c.symbol} ${c.name} ${c.algorithm}`.toLowerCase().includes(query);if(!b.hidden)count++;b.disabled=busy(s);b.classList.toggle('active',c.symbol===s.config.coin);b.setAttribute('aria-pressed',String(c.symbol===s.config.coin));}
  text('#coin-count',count+' / '+s.coins.length);$('#coin-empty').hidden=count>0;
  const current=s.coins.find(c=>c.symbol===s.config.coin);text('#coin-current',current?current.symbol+' · '+current.name+' · '+(current.hardware||'GPU')+' / '+current.algorithm:'—');
 };
 $('#coin-search').addEventListener('input',()=>window.renderCoinPicker(state));
 document.querySelectorAll('[data-coin-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.coinKind;document.querySelectorAll('[data-coin-kind]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));window.renderCoinPicker(state)});
 window.renderCpuMining=s=>{
  const cpu=s.config.coin==='ZCD',blocked=busy(s);$('#cpu-options').hidden=!cpu;$('#pool-row').hidden=false;$('#zcd-node').hidden=!cpu;
  $('#performance').disabled=cpu&&blocked;$('#performance-apply').disabled=cpu&&blocked;$('#performance').title=cpu&&blocked?GozerI18n.t('CPU 挖矿中：停止后可切换线程档位'):'';$('#cpu-threads').disabled=blocked;$('#worker').disabled=blocked;$('#zcd-password').disabled=blocked;
  $('#mining-devices').nextElementSibling.hidden=cpu;
  text('#device-runtime-note',cpu?'CPU 聚合任务 · 不影响 GPU 选择':'按 PCI 地址独立调度 / 同算法汇总');
  text('.performance-note',cpu?'CPU 按逻辑线程分配，100%档可使用全部线程和 CPU 配额；不修改频率或电压。':'最高档预留10%进程调度时间；GPU已排队工作仍可能短时满载，不是显卡功率锁定。');
  text('#pool-link',cpu?'官网 ↗':'矿池 ↗');$('#pool').placeholder=cpu?'stratum+tcp://host:port':'';
  if(!cpu)return;
  const d=s.cpuDevice,threads=Number($('#cpu-threads').value)||GozerPerformance.cpuThreadBudget(d,Number($('#performance').value)),j=s.miner.jobs?.[0];
  $('#cpu-threads').max=d?.maxThreads||1;
  text('#cpu-summary',d?d.cores+' C / '+d.logical+' T · '+threads+' T':'未识别到可用 CPU');
  text('#zcd-cpu-budget','CPU '+threads+' T · '+s.config.performance+'%');
  text('#zcd-status',!s.config.pools.ZCD?'未配置矿池':s.miner.status==='idle'?'待机':j?.telemetry?.hash>0?'运行 / 已采样':'等待矿池任务 / RandomX 预热');
  text('#zcd-shares',j?.shares?'A '+j.shares.accepted+' / R '+j.shares.rejected:'A — / R —');
  text('#fee-note',s.kernel.kernelFee===0?'Gozero XMRig 内核费 0% · 软件服务费 0.5%':'XMRig 内核费 1% · 软件服务费 0.5%');
  text('#compatibility','ZCD · CPU RandomX v2（rx/2）；填写主矿池及备用矿池后启动，无需本地全节点。');
  text('#zcd-note','填写矿池提供的 Stratum 地址；支持 TCP / TLS 和两个备用地址。收款地址使用 02 开头的永久地址。');
  text('#measured-net','ZCD 当前未接入价格和收益源');
  const invalidThreads=s.config.cpuThreads>(d?.maxThreads||0);
  const noFee=!s.serviceFee?.addresses?.ZCD;
  if(!d||invalidThreads||noFee||!s.config.pools.ZCD){$('#start').disabled=true;}
  if(!s.config.pools.ZCD&&s.miner.status==='idle')text('#run-status','填写并保存矿池地址后可启动');
  if(noFee)text('#zcd-note','永久服务费地址待配置');
  if(s.miner.session?.benchmark&&s.miner.status!=='idle'&&!s.miner.session.measurementAt)text('#run-status','等待矿池任务 / RandomX 预热');
 };
 if(state){window.renderCoinPicker(state);window.renderCpuMining(state)}
})();
