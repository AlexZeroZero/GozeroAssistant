'use strict';
(()=>{
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)GozerI18n.setText(n,text);return n};
 window.createPoolTransport=({input,coin,kernel,locked,save})=>{
  const row=el('div');row.className='pool-transport-row';const label=el('label','主矿池协议'),select=el('select');select.setAttribute('aria-label','主矿池协议');select.className='pool-transport-select';label.append(select);const note=el('small');row.append(label,note);
  const update=()=>{const c=coin(),adapter=kernel()?.adapter,items=c==='YSR'?[['https','HTTPS 接口']]:[['tcp','TCP（非加密）'],...(adapter==='bnt-seine'?[]:[['ssl','TLS / SSL（加密）']])],key=JSON.stringify(items);
   if(select.dataset.key!==key){select.dataset.key=key;select.replaceChildren(...items.map(([value,text])=>{const o=el('option',text);o.value=value;return o}))}
   select.value=GozerPoolTransport.mode(input.value);select.disabled=locked()||c==='YSR';
   GozerI18n.setText(note,c==='YSR'?'YSR 使用 HTTPS 接口，无 Stratum TCP':adapter==='bnt-seine'?'Seine 仅支持 TCP':'已知节点自动匹配端口；自定义端口请核对');
  };
  select.onchange=()=>{try{const result=GozerPoolTransport.convert(input.value,coin(),select.value,kernel()?.adapter);input.value=result.url;save(result.url);update()}catch(e){window.toast?.(e.message);update()}};
  input.addEventListener('input',update);input.addEventListener('change',update);
  return{row,select,update};
 };
 const control=createPoolTransport({input:$('#pool'),coin:()=>state?.config.coin,kernel:()=>state?.kernel,locked:()=>$('#pool').disabled,save:url=>window.setMiningTransport(url)});
 control.row.id='pool-transport-row';$('#pool-row').after(control.row);api.subscribe(()=>control.update());if(state)control.update();
})();
