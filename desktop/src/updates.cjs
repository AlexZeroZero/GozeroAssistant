'use strict';
const crypto=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
const ENDPOINT='https://pro.gozero.trade/api/assistant/release';
function compare(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0}
function verify(envelope,key,lastSequence=0,now=Date.now()){
 if(!envelope||typeof envelope.payload!=='string'||envelope.payload.length>90000||typeof envelope.signature!=='string')throw Error('更新清单格式无效');
 const bytes=Buffer.from(envelope.payload,'base64');if(!crypto.verify(null,bytes,key,Buffer.from(envelope.signature,'base64')))throw Error('更新签名验证失败');const d=JSON.parse(bytes);
 if(d.schema!==1||!/^\d+\.\d+\.\d+$/.test(d.version)||!Number.isSafeInteger(d.sequence)||d.sequence<lastSequence||!Number.isFinite(d.expiresAt)||d.expiresAt<=now||d.publishedAt>now+60000||!Array.isArray(d.coins)||d.coins.length>100||!Array.isArray(d.notes)||d.notes.length>20)throw Error('更新已过期或版本回退');
 const u=new URL(d.url);if(u.origin!=='https://pro.gozero.trade'||u.username||u.password||!/^\/downloads\/gozer\/GozerAssistant-\d+\.\d+\.\d+-win-x64\.zip$/.test(u.pathname)||u.search||u.hash||!(/^[a-f0-9]{64}$/i.test(d.sha256))||!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>1024**3)throw Error('更新下载信息无效');return d;
}
class Updates{
 constructor(dir,request,version,changed){this.file=path.join(dir,'update-state.json');this.request=request;this.version=version;this.changed=changed;this.sequence=0;this.result=null;this.error=null;this.pending=null;this.at=null;this.key=null}
 async load(){this.key=await fs.readFile(path.join(__dirname,'update-key.pem'),'utf8');try{const d=JSON.parse(await fs.readFile(this.file,'utf8'));this.sequence=Number.isSafeInteger(d.sequence)?d.sequence:0}catch{}}
 async check(){if(this.pending)return this.pending;this.pending=(async()=>{try{const raw=JSON.parse((await this.request(ENDPOINT,{maxBytes:128000})).toString('utf8'));const d=verify(raw,this.key,this.sequence);this.result=d;this.sequence=d.sequence;this.error=null;await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file+'.tmp',JSON.stringify({sequence:d.sequence}));await fs.rename(this.file+'.tmp',this.file)}catch(e){this.error=e.message}finally{this.at=Date.now();this.pending=null;this.changed?.()}return this.snapshot()})();return this.pending}
 snapshot(){return{at:this.at,error:this.error,checking:!!this.pending,available:!!this.result&&compare(this.result.version,this.version)>0,release:this.result}}
 downloadUrl(){if(!this.result||this.result.expiresAt<Date.now()||this.error)throw Error('请先获取有效签名更新');return this.result.url}
}
module.exports={Updates,verify,compare,ENDPOINT};
