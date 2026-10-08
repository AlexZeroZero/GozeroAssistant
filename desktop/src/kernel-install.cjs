'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const EXTRACTOR=path.join(__dirname,'../vendor/ExtractKernel.exe');
const ERRORS={INVALID_ARGUMENTS:'解压参数无效',UNSAFE_PATH:'安装路径或压缩包路径不安全',INVALID_ARCHIVE:'压缩包内容无效或不完整',MISSING_KERNEL:'压缩包中缺少内核文件',HASH_MISMATCH:'内核文件 SHA256 不匹配，未替换现有内核',ACCESS_DENIED:'无法写入内核目录，请检查该目录的写入权限',IO_ERROR:'无法写入内核文件，请检查文件占用与磁盘空间',EXTRACT_FAILED:'内核解压失败，请重试'};
function extractionError(e){
 if(e.code==='ENOENT')return Error('解压组件缺失，请重新解压完整的 Gozero助手安装包');
 if(e.code==='EACCES'||e.code==='EPERM')return Error('系统阻止启动解压组件，请检查文件访问权限');
 if(e.killed)return Error('内核解压超时，请检查磁盘状态后重试');
 try{const result=JSON.parse(String(e.stdout).trim());if(Object.hasOwn(ERRORS,result.code))return Error(ERRORS[result.code])}catch{}
 return Error('内核解压组件运行失败，请重新解压完整安装包后重试');
}
async function extract(zip,dir,expectedHash,metadata){try{const bundle=metadata?.files;const {stdout}=await promisify(execFile)(bundle?path.join(__dirname,'../vendor/ExtractBundle.exe'):EXTRACTOR,bundle?[zip,dir,JSON.stringify({root:metadata.archiveRoot,files:bundle})]:[zip,dir,expectedHash],{windowsHide:true,timeout:60000,maxBuffer:65536,encoding:'utf8'});if(JSON.parse(stdout.trim()).ok!==true)throw Error('Invalid result')}catch(e){throw extractionError(e)}}
async function installKernel({dir,exe,metadata,request,update,log,extractArchive=extract}){
 const zip=path.join(dir,'download.zip');let received=0,total=null,lastBucket=-1,lastLog=0;
 const stage=(name,message,error=null)=>{update({stage:name,received,total,error,version:metadata.version});log('安装',message)};
 try{
  await fs.mkdir(dir,{recursive:true});stage('connecting',metadata.bundled?'校验随附内核文件':'连接 '+(metadata.name||'KRig')+' '+metadata.version+' 下载源');
  if(metadata.bundled){
   if(!['ysr','bnt'].includes(metadata.bundleDirectory)||!metadata.files)throw Error('内置内核元数据无效');
   stage('verifying','校验内置开源内核 '+metadata.name);const source=path.join(__dirname,'../native',metadata.bundleDirectory);
   const files=[];for(const [name,expected] of Object.entries(metadata.files)){if(path.basename(name)!==name)throw Error('无效内核文件名');const body=await fs.readFile(path.join(source,name));if(hash(body)!==expected)throw Error('内置内核文件校验失败：'+name);files.push([name,body])}
   stage('extracting','安装内置开源内核');for(const [name,body] of files){const tmp=path.join(dir,name+'.tmp');await fs.writeFile(tmp,body);await fs.rename(tmp,path.join(dir,name))}
   stage('ready','可用内核：'+metadata.name+' '+metadata.version+'；尚未启动挖矿');return true;
  }
  let body;for(let attempt=0;attempt<3;attempt++){
  received=0;total=null;lastBucket=-1;
  if(attempt)stage('connecting','重试 '+(attempt+1)+'/3 · '+(attempt===1?'直连官方 GitHub 下载源':'连接官方内核下载源'));
  try{body=await request(metadata.url,{direct:attempt===1,maxBytes:256*1024*1024,timeout:300000,connectTimeout:15000,stallTimeout:25000,onProgress:p=>{
   received=p.received;total=p.total;update({stage:'downloading',received,total,error:null,version:metadata.version});
   const bucket=total?Math.floor(received/total*10):0;
   if(bucket!==lastBucket||Date.now()-lastLog>=5000){lastBucket=bucket;lastLog=Date.now();log('安装','下载 '+(received/1048576).toFixed(1)+' MB'+(total?' / '+(total/1048576).toFixed(1)+' MB · '+Math.min(100,Math.floor(received/total*100))+'%':''))}
  }});break}catch(e){if(attempt===2)throw Error('下载失败（已重试系统网络和直连）：'+e.message);log('安装','下载连接失败，将切换线路重试：'+e.message)}
  }
  received=body.length;stage('verifying','下载完成，校验压缩包 SHA256');
  if(hash(body)!==metadata.sha256)throw Error('内核下载 SHA256 不匹配，未安装');
  await fs.writeFile(zip,body);stage('extracting','完整性通过，正在使用内置组件解压内核');await extractArchive(zip,dir,metadata.exeSha256,metadata);
  stage('checking','解压完成，校验可执行内核 SHA256');
  if(hash(await fs.readFile(exe))!==metadata.exeSha256)throw Error('内核文件校验失败');
  if(metadata.files)for(const [name,expected] of Object.entries(metadata.files))if(hash(await fs.readFile(path.join(dir,name)))!==expected)throw Error('内核依赖文件校验失败：'+name);
  stage('ready','可用内核：'+(metadata.name||'KRig')+' '+metadata.version+'；尚未启动挖矿');return true;
 }catch(e){stage('error','安装失败：'+e.message,e.message);throw e}
 finally{await fs.unlink(zip).catch(()=>{})}
}
module.exports={installKernel,extract,extractionError};
