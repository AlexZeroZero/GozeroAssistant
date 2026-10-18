'use strict';
(()=>{
 window.createJtmGuide=()=>{
  const guide=node('details','jtm-guide');guide.hidden=true;
  guide.append(node('summary','','JTM 调参指南 · 线程更多不一定更快'));
  const body=node('div','jtm-guide-body');guide.append(body);
  for(const [title,copy]of [
   ['算法与硬件','TowerWalk 每条计算链使用 512 KiB 工作区，并反复进行前后依赖的随机读写与计算。关键是缓存容量与命中率、访问延迟、核心计算能力；不能只看核心数、内存容量或内存频率。'],
   ['为什么加线程会变慢','同一物理核心的 SMT 线程共享缓存和执行资源；线程增加还可能带来缓存争用、内存带宽压力、功耗或温度限制下的降频。多 CCD / NUMA 的布局也会影响结果。大页可减少地址转换开销，但不保证开满线程更快。'],
   ['怎样搭配','先测试约一半物理核心数、物理核心数，再测试更多逻辑线程。按核心数填线程不等于已绑定每个物理核心；不能用总 L3 容量除以 512 KiB 直接确定最佳线程数。'],
   ['怎样比较','先停止 JTM，将性能预算设为 100%，再手动填写线程数；改动档位会重新分配线程。单挖可用 30 秒离线测试初筛，随后每档预热约 1 分钟、稳定测量 3–5 分钟并重复对比，保持后台负载和散热条件一致。'],
   ['怎样选最佳','比较稳定平均 H/s、功耗与温度，不看瞬时峰值；算力接近时优先较少线程。连接矿池后再检查接受与拒绝份额；GPU＋CPU 双挖需在 GPU 同时运行时复测。推荐的是测试方法，尚未自动测出本机最佳配置。']
  ]){const section=node('div','jtm-guide-section');section.append(node('b','',title),node('p','',copy));body.append(section)}
  const candidates=node('p','jtm-guide-candidates');candidates.append(node('span','','本机建议对比线程数：'),node('strong'));body.prepend(candidates);
  return{node:guide,update(coin,cpu){guide.hidden=coin!=='JTM';const cores=Number(cpu?.cores),logical=Number(cpu?.logical);const values=Number.isInteger(cores)&&cores>0&&Number.isInteger(logical)&&logical>=cores?[...new Set([Math.max(1,Math.round(cores/2)),cores,Math.min(logical,Math.round(cores*1.5)),logical])]:[];GozerI18n.setText(candidates.lastChild,values.length?values.join(' / ')+' T':'未识别到可用 CPU')}};
 };
 const guide=window.createJtmGuide();guide.node.id='jtm-guide';$('#cpu-options').after(guide.node);
 const row=node('div','config-row');row.id='jtm-key-row';row.hidden=true;
 const label=node('label','','JTM Token'),input=node('input');input.id='jtm-key';input.type='password';input.autocomplete='off';input.placeholder='可选 · 由矿池提供';label.htmlFor=input.id;row.append(label,input);$('#cpu-options').after(row);
 const test=node('button','','离线算力测试 · 30秒');test.id='jtm-bench';test.hidden=true;row.after(test);
 test.onclick=()=>action(async()=>{await window.flushMiningSettings?.();await api.jtmBench()},test);
 function update(s){if(!s?.config)return;const yes=s.config.coin==='JTM',busy=!s.ready||s.miner.status!=='idle'||s.serviceFee?.active||s.miner.installing;
  guide.update(s.config.coin,s.cpuDevice);
  const automatic=/^https:\/\/jtm\.pool\.gozero\.trade\/rpc\/?$/.test(s.config.pools.JTM||'');
  row.hidden=!yes||automatic;test.hidden=!yes;input.disabled=busy;test.disabled=busy||!s.kernel.installed;
  $('#zcd-password').hidden=yes;document.querySelector('label[for="zcd-password"]').hidden=yes;
  if(yes){$('#wallet').placeholder='j1…';$('#performance').disabled=busy;$('#cpu-threads').disabled=busy;}
  if(document.activeElement!==input)input.value=s.config.jtmKey||'';
 }
 window.renderJtm=()=>update(state);api.subscribe(update);if(state)update(state);
})();
