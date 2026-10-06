'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {validWallet}=require('../../src/noid.cjs');
const {COINS}=require('./coins.cjs');
const GPU_ID='apple-metal';
const DEFAULT={coin:'NOID',profiles:{},wallet:'',worker:'GozeroMac',pool:'innovlab',host:'hk2.innovlab.cc',port:19601,transport:'tls',cpuThreads:0,seconds:0,language:'zh',theme:'dark',interval:2000,stopOnThermal:true};
function validate(input,profileOnly=false){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('配置格式无效');
 const c={...DEFAULT,...Object.fromEntries(Object.keys(DEFAULT).filter(k=>Object.hasOwn(input,k)).map(k=>[k,input[k]]))};
 if(!Object.hasOwn(COINS,c.coin))throw Error('币种不支持');
 if(typeof c.wallet!=='string'||c.wallet&&!(c.coin==='NOID'?validWallet(c.wallet):c.coin==='QTC'?/^qz[1-9A-HJ-NP-Za-km-z]{47}$/.test(c.wallet):/^prl1[ac-hj-np-z02-9]{59}$/.test(c.wallet)))throw Error('请输入对应币种的公开收款地址');
 if(typeof c.worker!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(c.worker))throw Error('矿机名限字母、数字、下划线和连字符');
 if(!(c.coin==='NOID'?['innovlab','suprnova']:['kryptex']).includes(c.pool))throw Error('矿池协议不支持');
 if(!['tls','tcp'].includes(c.transport)||c.pool!=='suprnova'&&c.transport!=='tls')throw Error('Innovlab 必须使用 TLS；TCP 兼容仅限 Suprnova');
 if(typeof c.host!=='string'||c.host.length>253||!/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(c.host))throw Error('矿池主机名无效，不要填写协议或路径');
 if(!Number.isInteger(c.port)||c.port<1||c.port>65535)throw Error('矿池端口无效');
 if(![0,2,4,8].includes(c.cpuThreads))throw Error('CPU 线程数无效');
 if(!COINS[c.coin].cpu)c.cpuThreads=0;
 if(![0,60,180,300,600].includes(c.seconds))throw Error('运行时长配置无效');
 // Migrate prior test profiles to continuous mining without changing other preferences.
 c.seconds=0;
 if(!['zh','en'].includes(c.language))throw Error('语言设置无效');
 if(!['dark','light'].includes(c.theme)||![1000,2000,5000].includes(c.interval)||typeof c.stopOnThermal!=='boolean')throw Error('偏好设置无效');
 const profiles={};
 if(!profileOnly){for(const coin of Object.keys(COINS)){if(input.profiles?.[coin])profiles[coin]=profile(validate({...DEFAULT,...input.profiles[coin],coin},true));}profiles[c.coin]=profile(c);}
 c.profiles=profiles;return c;
}
const PROFILE_KEYS=['wallet','worker','pool','host','port','transport','cpuThreads'];
function profile(c){return Object.fromEntries(PROFILE_KEYS.map(k=>[k,c[k]]));}
function selectCoin(input,coin){
 const c=validate(input);if(!Object.hasOwn(COINS,coin))throw Error('币种不支持');
 const preset=COINS[coin];return validate({...c,...(c.profiles[coin]||{...profile(DEFAULT),pool:preset.pool,host:preset.host,port:preset.port}),coin});
}
function miningConfig(c){c=validate(c);if(!c.wallet)throw Error('请先填写自己的收款地址');return {...c,selected:[GPU_ID],temperature:95,wallets:{[c.coin]:c.wallet},pools:{[c.coin]:(c.transport==='tcp'?'stratum+tcp://':'stratum+ssl://')+c.host+':'+c.port}};}
class Store{
 constructor(dir){this.file=path.join(dir,'settings.json');this.value={...DEFAULT};this.queue=Promise.resolve();this.warning=null;}
 async load(){try{this.value=validate(JSON.parse(await fs.readFile(this.file,'utf8')))}catch(e){if(e.code!=='ENOENT')this.warning='配置无法读取，已使用默认值；原文件保留。'}return this.value;}
 async save(value){const c=validate(value);this.queue=this.queue.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file+'.tmp',JSON.stringify(c,null,2),{mode:0o600});await fs.rename(this.file+'.tmp',this.file);this.value=c;return c;});return this.queue;}
}
module.exports={DEFAULT,GPU_ID,validate,miningConfig,selectCoin,Store};
