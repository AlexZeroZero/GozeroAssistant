'use strict';
(()=>{
 const root=document.getElementById('rentals'),api=window.gozer,t=window.GozerRentalText;
 const $=s=>root.querySelector(s),all=s=>root.querySelectorAll(s),el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n};
 const defaults={kind:'gpu',provider:'all',model:'RTX 4090',q:'',country:'',sort:'perGpu',rental:'on_demand',page:1,limit:6,minVram:'',minRam:'',minCount:'',minThreads:'',maxPrice:'',brand:''};
 let form={...defaults},data=null,selected=null,selectedKey=null,active=false,busy=false,requestID=0,timer,debounce,lastGoodKey='',first=true,resizeTimer;
 const number=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
 const money=v=>typeof v==='number'&&Number.isFinite(v)?'$'+(Math.round((v+1e-9)*100)/100).toFixed(2):'—';
 const labelProvider=id=>id==='clore'?'Clore':'Vast.ai';
 const tr=(node,key,args)=>node.textContent=t(key,args);
 const region=c=>{try{return new Intl.DisplayNames([GozerI18n.locale],{type:'region'}).of(c)||c}catch{return c||'—'}};
 function options(select,choices,value){select.replaceChildren(...choices.map(([key,label])=>{const option=el('option','',label);option.value=key;return option}));select.value=String(value)}
 function labels(){
  all('[data-rt]').forEach(n=>tr(n,n.dataset.rt));all('[data-rtitle]').forEach(n=>n.title=t(n.dataset.rtitle));
  $('#rental-search').placeholder=t('search');$('#rental-search').setAttribute('aria-label',t('search'));
  options($('#rental-sort'),(form.kind==='gpu'?['perGpu','price','priceDesc','vram','count','newest']:['price','priceDesc','cores','threads','ram','newest']).map(k=>[k,t(k==='perGpu'?'unit':k)]),form.sort);
  options($('#rental-type'),['on_demand','spot'].map(k=>[k,t(k)]),form.rental);
  for(const [id,values]of [['vram',[8,16,24,32,48,96]],['ram',[16,32,64,128,256,512]],['count',[1,2,4,8]],['threads',[8,16,32,64,128,256]]]){const key={vram:'minVram',ram:'minRam',count:'minCount',threads:'minThreads'}[id];options($('#rental-'+id),[['',t('any')],...values.map(n=>[n,String(n)])],form[key])}
  options($('#rental-brand'),['','AMD','Intel','ARM','Other'].map(v=>[v,v||t('brand')]),form.brand);
  updateRegions();$('#rental-list-title').textContent=t(form.kind==='gpu'?'gpuTitle':'cpuTitle');
  all('[data-rkind]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.rkind===form.kind));all('[data-rprovider]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.rprovider===form.provider));
  all('[data-rmodel]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.rmodel===(form.model||form.q==='RTX PRO 6000'&&'pro'||'')));
  all('[data-rgpu]').forEach(n=>n.hidden=form.kind!=='gpu');all('[data-rcpu]').forEach(n=>n.hidden=form.kind!=='cpu');
  $('#rental-dialog-close').setAttribute('aria-label',t('close'));
 }
 function updateRegions(){const countries=[...new Set([...(data?.countries||[]),form.country].filter(Boolean))];options($('#rental-region'),[['',t('region')],...countries.map(c=>[c,region(c)])],form.country)}
 function summary(){const s=data?.summary||{};$('#rental-summary').replaceChildren(...[['offers',s.machines],['available',s.available],['models',s.models],[form.kind==='gpu'?'lowestGpu':'lowestCpu',money(s.lowest)]].map(([k,v])=>{const n=el('div');n.append(el('span','',t(k)),el('b','',typeof v==='string'?v:number(v)));return n}))}
 function card(x){const b=el('button','rental-card');b.type='button';b.dataset.key=x.key;b.setAttribute('aria-pressed',String(selected?.key===x.key));b.title=x.model+' · '+t('detail');
  const head=el('span','rental-card-head'),model=el('strong','rental-model',x.model||t('missing'));head.append(model,el('strong','rental-price',money(x.price)));if(form.kind==='gpu')model.append(el('small','',` ×${number(x.count)}`));
  const specs=el('span','rental-specs'),resource=form.kind==='gpu'?`${number(x.vram)} GB / GPU · ${number(x.ram)} GB RAM`:x.cores!==null?`${number(x.cores)}C / ${number(x.threads)}T · ${number(x.ram)} GB`:`${number(x.vcpus)} vCPU · ${number(x.ram)} GB`;
  specs.append(el('span','',resource),el('span','rental-unit',form.kind==='gpu'?money(x.count>0&&x.price!==null?x.price/x.count:null)+' '+t('perGpu'):t(x.provider==='clore'?'machineDay':'instanceDay')));
  const foot=el('span','rental-card-foot');foot.append(el('span','',labelProvider(x.provider)+' #'+x.id),el('span','rental-country',region(x.country)),el('span',x.reliability!==null&&x.reliability<.95?'rental-warning':'rental-good',`${t('reliability')} ${x.reliability===null?'—':number(x.reliability*100)+'%'} ↗`));
  b.append(head,specs,foot);b.onclick=()=>openDetail(x);return b;
 }
 function renderCards(){
  const list=$('#rental-list'),rows=data?.items||[];
  if(!data){if(busy){list.replaceChildren(...Array.from({length:form.limit},()=>{const n=el('div','rental-skeleton');n.append(el('i'),el('i'),el('i'));return n}))}else list.replaceChildren(el('div','rental-empty',t('error')));return}
  if(!rows.length){list.replaceChildren(el('div','rental-empty',t(data.loading?'loading':'empty')));return}
  // Refresh updates the existing cards in place. Filter changes alone reset their ordering.
  const existing=new Map([...list.children].map(n=>[n.dataset.key,n]));
  const next=[];for(const x of rows){const fresh=card(x),old=existing.get(x.key);if(old){if(old.innerHTML!==fresh.innerHTML)old.replaceChildren(...fresh.childNodes);old.title=fresh.title;old.setAttribute('aria-pressed',fresh.getAttribute('aria-pressed'));old.onclick=fresh.onclick;next.push(old)}else next.push(fresh)}
  next.forEach((n,i)=>{if(list.children[i]!==n)list.insertBefore(n,list.children[i]||null)});while(list.children.length>next.length)list.lastChild.remove();
 }
 function render(){labels();summary();renderCards();$('#rental-result-count').textContent=t('matches',{n:number(data?.total),limit:form.limit});$('#rental-page').textContent=`${data?.page||form.page} / ${data?.pages||'—'}`;
  $('#rental-prev').disabled=busy||!data||data.page<=1;$('#rental-next').disabled=busy||!data||data.page>=data.pages;$('#rental-refresh').disabled=busy;$('#rental-status').classList.toggle('rental-warning',!!data?.stale);
  $('#rental-status').textContent=busy?t('loading'):data?.stale?t('stale'):data?`${t('updated')} ${new Date(data.at).toLocaleTimeString(GozerI18n.locale,{hour12:false})}`:t('error');root.classList.toggle('rental-busy',busy);
 }
 const key=()=>JSON.stringify(form);
 async function refresh(){
  if(!api?.rentals||!active||document.hidden)return;
  const id=++requestID,newKey=key(),previous=data,beforeKey=lastGoodKey;busy=true;if(newKey!==lastGoodKey)data=null;render();
  try{const next=await api.rentals({...form});if(id!==requestID)return;
   if(newKey===beforeKey&&previous){const order=new Map(previous.items.map((x,i)=>[x.key,i]));next.items.sort((a,b)=>(order.get(a.key)??100)-(order.get(b.key)??100))}
   data=next;lastGoodKey=newKey;if(data.page>data.pages){form.page=data.pages;busy=false;return refresh()}updateRegions();
  }catch{if(id!==requestID)return;data=newKey===beforeKey&&previous?{...previous,stale:true}:null}
  finally{if(id===requestID){busy=false;render();clearTimeout(timer);if(active&&!document.hidden)timer=setTimeout(refresh,newKey!==key()?0:data?.loading?5000:60000)}}
 }
 function change(){clearTimeout(debounce);clearTimeout(timer);++requestID;busy=false;form.page=1;closeDetail();data=null;lastGoodKey='';refresh()}
 function openDetail(x){selected=x;selectedKey=x.key;$('#rental-detail').hidden=false;$('#rental-detail').style.left='';$('#rental-detail').style.top='';renderDetail();renderCards();$('#rental-dialog-close').focus()}
 function closeDetail(){if(!selected)return;selected=null;$('#rental-detail').hidden=true;renderCards();root.querySelector(`[data-key="${selectedKey}"]`)?.focus({preventScroll:true})}
 function renderDetail(){if(!selected)return;const x=selected,gpu=form.kind==='gpu',clore=x.provider==='clore';$('#rental-detail-title').textContent=x.model+(gpu?` ×${number(x.count)}`:'');$('#rental-detail-source').textContent=`${labelProvider(x.provider)} #${x.id} · ${t('referral')}`;
  $('#rental-detail-price').textContent=money(x.price);$('#rental-detail-unit').textContent=t(clore?'machineDay':'instanceDay');$('#rental-detail-status').textContent=t(x.available?'availableAt':'unavailable')+' · '+t('maxHours',{n:number(x.maxHours)});
  const facts=[['CPU',x.cpu||t('missing')],[gpu?t('quantity'):t('cpuCores'),gpu?`${number(x.count)} GPU · ${number(x.vram)} GB / GPU`:x.cores!==null?`${number(x.cores)} / ${number(x.threads)}`:`${number(x.vcpus)} vCPU`],[t('memory'),number(x.ram)+' GB'],[t('storage'),(x.disk||t('missing'))+(x.diskCapacity!==null?' · '+number(x.diskCapacity)+' GB':'')],[t('network'),`${region(x.country)} · ${number(x.down)} / ${number(x.up)}`],['CUDA / PCIe',`${x.cuda||'—'} / ${x.pcie||'—'}`],[t('reliability'),x.reliability===null?'—':number(x.reliability*100)+'%']];
  if(!clore)facts.push([t('diskRate'),number(x.storage)],[t('trafficRate'),number(x.download)+' / '+number(x.upload)]);
  $('#rental-facts').replaceChildren(...facts.map(([k,v])=>{const d=el('div');d.append(el('span','',k),el('b','',v));return d}));
  const duration=$('#rental-duration'),old=duration.value,choices=[1,24,168,720].filter(h=>x.maxHours===null||h<=x.maxHours);if(!choices.length&&x.maxHours>0)choices.push(x.maxHours);options(duration,choices.map(h=>[h,h<24?number(h)+' '+t('hour'):number(h/24)+' '+t('day')]),choices.includes(Number(old))?old:choices.includes(24)?24:choices[0]);
  tr($('#rental-duration-label'),'duration');$('#rental-visit').textContent=t('visit',{provider:labelProvider(x.provider)});$('#rental-visit').onclick=()=>openLink(x.provider);cost();
 }
 function cost(){if(!selected)return;const x=selected,h=Number($('#rental-duration').value),base=x.price!==null&&h>0?x.price*h/24:null,fee=x.provider==='clore'&&base!==null?base*.05:0;$('#rental-cost').textContent=money(base===null?null:base+fee);$('#rental-cost-note').textContent=(x.provider==='clore'?`${t('rent')} ${money(base)} + 5% ${t('baseFee')} ${money(fee)}. ${t('cloreNote')}`:t('vastNote'))+(form.rental==='spot'?' '+t('spotNote'):'');}
 async function openLink(id){try{await api?.rentalOpen(id)}catch{window.toast?.(t('error'))}}
 all('[data-rkind]').forEach(b=>b.onclick=()=>{form={...defaults,limit:form.limit,kind:b.dataset.rkind,model:b.dataset.rkind==='gpu'?'RTX 4090':'',sort:b.dataset.rkind==='gpu'?'perGpu':'price'};sync();change()});
 all('[data-rprovider]').forEach(b=>b.onclick=()=>{form.provider=b.dataset.rprovider;change()});
 all('[data-rmodel]').forEach(b=>b.onclick=()=>{form.model=b.dataset.rmodel==='pro'?'':b.dataset.rmodel;form.q=b.dataset.rmodel==='pro'?'RTX PRO 6000':'';$('#rental-search').value=form.q;change()});
 $('#rental-search').oninput=e=>{form.q=e.target.value.slice(0,80);form.model='';++requestID;busy=false;clearTimeout(debounce);debounce=setTimeout(change,350)};
 for(const [id,k]of [['region','country'],['sort','sort'],['type','rental'],['vram','minVram'],['ram','minRam'],['count','minCount'],['threads','minThreads'],['max','maxPrice'],['brand','brand']])$('#rental-'+id).onchange=e=>{form[k]=['minVram','minRam','minCount','minThreads','maxPrice'].includes(k)&&e.target.value!==''?Number(e.target.value):e.target.value;change()};
 $('#rental-more').onclick=()=>{const open=$('#rental-advanced').hidden;$('#rental-advanced').hidden=!open;$('#rental-more').setAttribute('aria-expanded',String(open))};
 $('#rental-reset').onclick=()=>{const kind=form.kind;form={...defaults,limit:form.limit,kind,model:'',sort:kind==='gpu'?'perGpu':'price'};sync();change()};
 $('#rental-prev').onclick=()=>{form.page--;closeDetail();refresh()};$('#rental-next').onclick=()=>{form.page++;closeDetail();refresh()};$('#rental-refresh').onclick=refresh;
 all('[data-rlink]').forEach(b=>b.onclick=()=>openLink(b.dataset.rlink));$('#rental-site').onclick=()=>openLink(form.kind);
 $('#rental-dialog-close').onclick=closeDetail;$('#rental-duration').onchange=cost;
 root.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail()});
 const dialog=$('#rental-detail'),handle=$('#rental-drag');let drag=null;
 handle.onpointerdown=e=>{if(e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,left:dialog.offsetLeft,top:dialog.offsetTop};handle.setPointerCapture(e.pointerId)};
 handle.onpointermove=e=>{if(!drag)return;dialog.style.left=Math.max(0,Math.min(innerWidth-dialog.offsetWidth,drag.left+e.clientX-drag.x))+'px';dialog.style.top=Math.max(62,Math.min(innerHeight-dialog.offsetHeight-20,drag.top+e.clientY-drag.y))+'px'};handle.onpointerup=handle.onpointercancel=()=>drag=null;
 function fitList(){
  if(!active)return false;
  const list=$('#rental-list'),width=list.clientWidth,height=list.clientHeight;
  if(!width||!height)return false;
  const columns=Math.max(1,Math.min(8,Math.floor((width+4)/304)));
  const rows=Math.max(1,Math.min(Math.floor(96/columns),Math.floor((height+4)/78)));
  list.style.setProperty('--rental-columns',columns);list.style.setProperty('--rental-rows',rows);
  const limit=columns*rows;
  if(limit===form.limit)return false;
  form.page=Math.floor((form.page-1)*form.limit/limit)+1;form.limit=limit;
  return true;
 }
 const resizeObserver=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(fitList()&&!busy)refresh()},250)});
 resizeObserver.observe($('#rental-list'));
 function sync(){$('#rental-search').value=form.q;$('#rental-max').value=form.maxPrice;labels()}
 document.addEventListener('gozer-view',e=>{active=e.detail==='rentals';if(active){fitList();if(first){first=false;refresh()}else refresh()}else{clearTimeout(timer);clearTimeout(debounce);closeDetail()}});
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden&&active)refresh()});
 document.addEventListener('gozer-language',()=>{render();renderDetail()});
 sync();render();
})();
