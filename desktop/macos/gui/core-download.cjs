'use strict';
// URLs and hashes come from the catalog sealed into the signed app, never IPC.
const fs=require('node:fs/promises'),{createReadStream}=require('node:fs');
const path=require('node:path'),crypto=require('node:crypto');
const exec=require('node:util').promisify(require('node:child_process').execFile);
const digest=async file=>{const h=crypto.createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');};
function inside(root,name){
 if(typeof name!=='string'||!name||name.includes('\\')||path.posix.isAbsolute(name)||name.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('内核路径无效');
 const p=path.resolve(root,name);if(!p.startsWith(path.resolve(root)+path.sep))throw Error('内核路径无效');return p;
}
async function verify(root,metadata,signal){
 signal?.throwIfAborted();
 if((await fs.lstat(root)).isSymbolicLink())throw Error('内核路径无效');
 const manifestPath=path.join(root,'PAYLOAD.json');
 if((await fs.lstat(manifestPath)).isSymbolicLink()||await digest(manifestPath)!==metadata.manifestSha256)throw Error('内核完整性校验失败');
 const m=JSON.parse(await fs.readFile(manifestPath,'utf8')),base=await fs.realpath(root);
 for(const [name,entry] of Object.entries(m.files)){
  signal?.throwIfAborted();const file=inside(root,name),s=await fs.lstat(file);
  if(!(await fs.realpath(file)).startsWith(base+path.sep))throw Error('内核路径无效');
  if(entry.type==='link'){
   if(!s.isSymbolicLink()||await fs.readlink(file)!==entry.target)throw Error('内核完整性校验失败');
  }else if(entry.type!=='file'||!s.isFile()||s.size!==entry.bytes||(process.platform==='darwin'&&(s.mode&0o777)!==entry.mode)||await digest(file)!==entry.sha256)throw Error('内核完整性校验失败');
 }
 // Reject injected modules or executables, including files outside the manifest.
 async function walk(dir,prefix=''){
  for(const e of await fs.readdir(dir,{withFileTypes:true})){
   const name=prefix+e.name;if(!prefix&&name==='PAYLOAD.json')continue;
   if(e.isDirectory())await walk(path.join(dir,e.name),name+'/');
   else if(!Object.hasOwn(m.files,name))throw Error('内核包含未知文件');
  }
 }
 await walk(root);signal?.throwIfAborted();return true;
}
async function download(metadata,file,signal,progress,request=fetch){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('内核下载超时，请重试')),15*60*1000);
 const combined=AbortSignal.any([signal,controller.signal]);let handle;
 try{
  const response=await request(metadata.url,{signal:combined});
  if(!response.ok)throw Error('内核下载失败，请检查网络后重试');
  const length=Number(response.headers.get('content-length'));
  if(length&&length!==metadata.bytes)throw Error('内核下载大小不符');
  const h=crypto.createHash('sha256');let received=0,last=0;handle=await fs.open(file,'wx',0o600);
  for await(const chunk of response.body){
   combined.throwIfAborted();received+=chunk.length;if(received>metadata.bytes)throw Error('内核下载大小不符');h.update(chunk);await handle.writeFile(chunk);
   if(Date.now()-last>=250){last=Date.now();progress(received,metadata.bytes);}
  }
  if(received!==metadata.bytes||h.digest('hex')!==metadata.sha256)throw Error('内核下载校验失败，请重试');progress(received,metadata.bytes);
 }finally{clearTimeout(timer);await handle?.close();}
}
function proxyFallback(primary,secondary=fetch){
 return async(url,options)=>{
  try{return await primary(url,options);}catch(e){
   if(options.signal.aborted||!/ERR_(PROXY_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED|NO_SUPPORTED_PROXIES)/.test(e.message))throw e;
   // An unreachable configured proxy must not prevent fetching pinned public
   // assets. Both paths retain HTTPS certificate verification; no OS edits.
   return secondary(url,options);
  }
 };
}
class CoreDownloads{
 constructor(dir,catalog,update=()=>{},deps={}){
  this.root=path.join(dir,'kernels');this.catalog=catalog;this.update=update;this.deps=deps;this.value={stage:'idle',coin:null,received:0,total:0,error:null};this.available={};this.pending=null;
 }
 snapshot(){return{...this.value,available:{...this.available}};}
 set(value){this.value={...this.value,...value};this.update();}
 ids(coin){const ids=Object.hasOwn(this.catalog.coins,coin)&&this.catalog.coins[coin];if(!Array.isArray(ids))throw Error('内核配置无效');return ids;}
 folder(id){const m=this.catalog.packages[id];if(!/^[a-z]+$/.test(id)||!m||!/^[a-f0-9]{64}$/.test(m.sha256))throw Error('内核配置无效');return path.join(this.root,id+'-'+m.sha256.slice(0,20));}
 async scan(){for(const coin of Object.keys(this.catalog.coins))this.available[coin]=(await Promise.all(this.ids(coin).map(id=>fs.access(path.join(this.folder(id),'PAYLOAD.json')).then(()=>true,()=>false)))).every(Boolean);this.update();}
 async cancel(){this.controller?.abort(Error('内核下载已取消'));await this.pending?.catch(()=>{});}
 async ensure(coin){
  if(this.pending)throw Error('已有内核下载任务');this.controller=new AbortController();const signal=this.controller.signal;
  this.pending=this.install(coin,signal);try{return await this.pending;}finally{this.pending=null;this.controller=null;}
 }
 async install(coin,signal){
  this.set({coin,stage:'checking',received:0,total:0,error:null});
  try{
   await fs.mkdir(this.root,{recursive:true,mode:0o700});
   for(const id of this.ids(coin)){
    signal.throwIfAborted();const m=this.catalog.packages[id],dest=this.folder(id);
    this.set({stage:'checking',package:id,received:0,total:m.bytes});
    try{await (this.deps.verify||verify)(dest,m,signal);continue;}catch(e){signal.throwIfAborted();}
    this.available[coin]=false;
    const temp=await fs.mkdtemp(path.join(this.root,'.install-')),archive=path.join(temp,'payload.tar.gz'),unpack=path.join(temp,'unpack');
    try{
     this.set({stage:'downloading'});
     await (this.deps.download||download)(m,archive,signal,(received,total)=>this.set({received,total}),this.deps.request);
     signal.throwIfAborted();this.set({stage:'extracting'});await fs.mkdir(unpack);
     // Only an app-pinned SHA256 archive reaches the system extractor.
     await (this.deps.extract||((a,d,s)=>exec('/usr/bin/tar',['-xzpf',a,'--no-same-owner','-C',d],{signal:s,timeout:180000,maxBuffer:65536})))(archive,unpack,signal);
     await (this.deps.verify||verify)(unpack,m,signal);signal.throwIfAborted();
     // Keep the prior cache until its replacement is fully verified.
     const old=dest+'.old-'+crypto.randomBytes(6).toString('hex');let moved=false;
     try{await fs.rename(dest,old);moved=true;}catch(e){if(e.code!=='ENOENT')throw e;}
     try{await fs.rename(unpack,dest);}catch(e){if(moved)await fs.rename(old,dest);throw e;}
     if(moved)await fs.rm(old,{recursive:true,force:true});
    }finally{await fs.rm(temp,{recursive:true,force:true});}
   }
   signal.throwIfAborted();this.available[coin]=true;this.set({stage:'ready'});return this.locations(coin);
  }catch(e){this.set({stage:signal.aborted?'cancelled':'error',error:signal.aborted?'内核下载已取消':e.message});throw signal.aborted?signal.reason:e;}
 }
 locations(coin){
  this.ids(coin);const nativeDir=path.join(this.folder(coin.toLowerCase()),'native');
  return{nativeDir,node:this.ids(coin).includes('node')?path.join(this.folder('node'),'native/node'):undefined,python:this.ids(coin).includes('python')?path.join(this.folder('python'),'native/cores/python/bin/python3'):undefined};
 }
 async resolve(coin){for(const id of this.ids(coin))await verify(this.folder(id),this.catalog.packages[id]);return this.locations(coin);}
}
module.exports={CoreDownloads,verify,download,inside,proxyFallback};
