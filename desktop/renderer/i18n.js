(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./translations.js'):root.GozerTranslations);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.GozerI18n=api;
})(typeof globalThis==='object'?globalThis:this,function(catalog){
 'use strict';
 const languages=['zh-CN','en','ja','ru'];
 let locale='zh-CN';
 const han=/[\u3400-\u9fff]/;
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const matcher=new RegExp(Object.keys(catalog).sort((a,b)=>b.length-a.length).map(escape).join('|'),'g');
 function normalize(value){return languages.includes(value)?value:'zh-CN'}
 function t(value,language=locale){
  const text=String(value??'—'),lang=normalize(language);
  if(lang==='zh-CN'||!han.test(text))return text;
  const index=languages.indexOf(lang)-1;
  return catalog[text]?.[index]??text.replace(matcher,key=>catalog[key][index]);
 }
 // Bind the source, not the previous translation. Weak maps do not retain removed rows.
 // Numeric ticks use setText directly; the observer only handles changed subtrees/tooltips.
 const texts=new WeakMap(),attributes=new WeakMap();
 const attrs=['title','placeholder','aria-label'];
 const skipped=node=>node.parentElement?.closest('script,style,[data-i18n-skip]');
 function translateText(node){
  if(skipped(node))return;
  const current=node.data,previous=texts.get(node);
  const source=previous&&previous.last===current?previous.source:current;
  if(!han.test(source)){texts.delete(node);return}
  const result=t(source);texts.set(node,{source,last:result});
  if(current!==result)node.data=result;
 }
 function translateAttributes(el){
  if(el.closest('[data-i18n-skip]'))return;
  const map=attributes.get(el)||{};
  for(const name of attrs){
   const current=el.getAttribute(name);if(current===null){delete map[name];continue}
   const old=map[name],source=old&&old.last===current?old.source:current;
   if(!han.test(source)){delete map[name];continue}
   const result=t(source);map[name]={source,last:result};
   if(current!==result)el.setAttribute(name,result);
  }
  attributes.set(el,map);
 }
 function translateTree(root){
  if(root.nodeType===3){translateText(root);return}
  if(root.nodeType!==1&&root.nodeType!==9)return;
  if(root.nodeType===1){if(root.matches('script,style,[data-i18n-skip]'))return;translateAttributes(root)}
  for(const child of root.childNodes)translateTree(child);
 }
 function setText(el,value){
  if(!el)return;
  const source=String(value??'—'),result=el.closest?.('[data-i18n-skip]')?source:t(source);
  if(el.textContent!==result)el.textContent=result;
  if(el.firstChild?.nodeType===3&&han.test(source))texts.set(el.firstChild,{source,last:result});
  else if(el.firstChild)texts.delete(el.firstChild);
 }
 function setLocale(value){
  const next=normalize(value),changed=next!==locale;locale=next;
  if(typeof document!=='undefined'){
   if(document.documentElement.lang!==locale)document.documentElement.lang=locale;
   if(changed)try{localStorage.setItem('gozer-language',locale)}catch{}
   if(changed){translateTree(document.documentElement);document.dispatchEvent(new CustomEvent('gozer-language',{detail:locale}))}
  }
  return locale;
 }
 if(typeof document!=='undefined'){
  try{locale=normalize(localStorage.getItem('gozer-language'))}catch{}
  document.documentElement.lang=locale;
  const start=()=>{
   translateTree(document.documentElement);
   new MutationObserver(records=>{
    const roots=new Set();
    for(const r of records){
     if(r.type==='attributes')translateAttributes(r.target);
     else if(r.type==='characterData')translateText(r.target);
     else for(const node of r.addedNodes)roots.add(node);
    }
    for(const node of roots)if(node.isConnected)translateTree(node);
   }).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attrs});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 }
 return{languages,normalize,t,setText,setLocale,get locale(){return locale}};
});
