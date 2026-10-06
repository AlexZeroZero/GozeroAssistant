'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,session,Menu,powerSaveBlocker}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {Store,miningConfig}=require('./config.cjs'),{Hardware}=require('./hardware.cjs'),{Miner}=require('./miner.cjs');
const {FeeController}=require('../../src/service-fee.cjs');
const PAGE=path.join(__dirname,'renderer/index.html'),URL=pathToFileURL(PAGE).href;
const nativeDir=path.resolve(__dirname,'../../../native');
app.setName('Gozero助手 Mac');app.setPath('userData',path.join(app.getPath('appData'),'gozero-assistant-mac'));
const profile=process.argv.find(a=>a.startsWith('--profile-dir='));if(profile){const p=profile.slice(14);if(!path.isAbsolute(p))throw Error('配置目录必须为绝对路径');app.setPath('userData',p);}
let win,store,hardware,miner,fee,timer,awake,ready=false,starting=false,quitting=false,shutdownPromise,logId=0,runEpoch=0,logs=[];
function redact(s){s=String(s).slice(0,1200);const wallet=store?.value.wallet;return wallet?s.split(wallet).join('[收款地址]'):s;}
function log(type,text){logs.push({id:++logId,at:Date.now(),type,text:redact(text)});if(logs.length>300)logs.shift();push();}
function state(){return{version:'Mac 0.1.3',ready,starting,config:store?.value,hardware:hardware?.value,miner:miner?.snapshot(),fee:fee?.snapshot(),logs};}
function push(){if(win&&!win.isDestroyed())win.webContents.send('state',state());}
function busy(){return starting||miner.status!=='idle'||fee.active||fee.switching||fee.stopping;}
function handle(name,fn){ipcMain.handle(name,async(e,...args)=>{try{if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame||e.senderFrame.url!==URL)throw Error('非本机界面请求');return{ok:true,value:await fn(...args)};}catch(error){log('提示',error.message);return{ok:false,error:redact(error.message)};}});}
function releaseAwake(){if(awake!==undefined){powerSaveBlocker.stop(awake);awake=undefined;}}
async function stop(reason='用户停止'){++runEpoch;clearTimeout(timer);await fee.stop(reason);releaseAwake();push();}
async function start(benchmark=false){
 if(!ready||busy())throw Error('请先停止当前任务或等待设备扫描完成');
 starting=true;const epoch=++runEpoch;push();try{
  if((await require('node:util').promisify(require('node:child_process').execFile)('/usr/bin/pgrep',['-x','noid-apple-check']).catch(e=>{if(e.code===1)return{stdout:''};throw e;})).stdout.trim())throw Error('已有命令行内核在运行，请先停止它，避免重复占用设备');
  if(epoch!==runEpoch)throw Error('启动已取消');
  if(store.value.stopOnThermal&&hardware.value.thermalState>=2)throw Error('系统处于严重热状态，请冷却后再试');
  awake=powerSaveBlocker.start('prevent-app-suspension');
  const duration=benchmark?45:store.value.seconds;miner.bound=Date.now()+duration*1000;
  timer=setTimeout(()=>stop('本次运行时限已到').catch(e=>log('错误',e.message)),duration*1000);
  if(benchmark)await miner.start({...store.value,wallets:{NOID:store.value.wallet}},hardware.value,true);
  else await fee.start(miningConfig(store.value),hardware.value,false);
 }catch(e){await stop('启动失败');throw e;}finally{starting=false;push();}
}
async function boot(){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('此版本需要 Apple Silicon Mac');
 const dir=app.getPath('userData');store=new Store(dir);await store.load();
 miner=new Miner(dir,nativeDir,log);fee=new FeeController(miner,dir,log,push);await fee.load();
 miner.on('update',()=>{if(miner.status==='idle'&&!fee.switching){clearTimeout(timer);releaseAwake();}push();});
 hardware=new Hardware(nativeDir,h=>{if(store.value.stopOnThermal&&h.thermalState>=2&&busy())stop('系统报告严重热状态，已停止任务').catch(e=>log('错误',e.message));push();});
 win=new BrowserWindow({width:920,height:740,minWidth:780,minHeight:620,frame:false,show:false,backgroundColor:'#0c0d12',title:'Gozero助手 Mac',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,url)=>{if(url!==URL)e.preventDefault();});win.webContents.on('will-attach-webview',e=>e.preventDefault());
 session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));session.defaultSession.setPermissionCheckHandler(()=>false);
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(d,cb)=>cb({cancel:d.webContentsId===win.webContents.id}));
 handle('bootstrap',()=>state());handle('save',async c=>{if(busy())throw Error('停止任务后再修改配置');await store.save(c);hardware.start(store.value.interval);push();return store.value;});
 handle('start',()=>start(false));handle('benchmark',()=>start(true));handle('stop',()=>stop());
 handle('scan',async()=>{if(busy())throw Error('请先停止任务');ready=false;push();try{await hardware.scan();}finally{ready=true;push();}return state();});
 handle('window',a=>{if(a==='minimize')win.minimize();else if(a==='maximize')win.isMaximized()?win.unmaximize():win.maximize();else if(a==='close')return shutdown();else throw Error('窗口操作无效');});
 handle('open',id=>{if(id==='results')return shell.openPath(path.join(dir,'results'));if(id==='profile')return shell.openPath(dir);const links={site:'https://gozero.trade/',pool:store.value.pool==='innovlab'?'https://noid.innovlab.cc/':'https://noid.suprnova.cc/StartMining'};if(!links[id])throw Error('链接不存在');return shell.openExternal(links[id]);});
 handle('exportLogs',async()=>{const r=await dialog.showSaveDialog(win,{defaultPath:'Gozero-Mac-log.txt'});if(r.canceled)return false;await fs.writeFile(r.filePath,logs.map(l=>new Date(l.at).toISOString()+' ['+l.type+'] '+l.text).join('\n'));return true;});
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Gozero助手',submenu:[{label:'关于 Gozero助手',role:'about'},{type:'separator'},{label:'退出 Gozero助手',accelerator:'Command+Q',click:()=>shutdown()}]},{label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'窗口',submenu:[{role:'minimize'},{role:'zoom'}]}]));
 win.on('close',e=>{if(!quitting){e.preventDefault();shutdown();}});
 await win.loadFile(PAGE);win.show();log('系统','Gozero助手 Mac 已启动；不会自动挖矿');if(store.warning)log('配置',store.warning);
 try{await hardware.scan();log('设备','已连接 '+hardware.value.chip+' / Metal');}catch(e){log('设备',e.message);}ready=true;hardware.start(store.value.interval);push();
 if(process.argv.includes('--ui-smoke')){try{await require('./smoke.cjs').run({win,state,store,start,stop,dir});}catch(e){console.error(e.stack);process.exitCode=1;}finally{await shutdown();}}
}
function shutdown(){if(shutdownPromise)return shutdownPromise;shutdownPromise=(async()=>{ready=false;hardware?.stop();if(fee)await stop('退出应用');quitting=true;app.quit();})();return shutdownPromise;}
if(!app.requestSingleInstanceLock())app.quit();else{app.on('second-instance',()=>{win?.restore();win?.show();win?.focus();});app.whenReady().then(boot).catch(e=>{dialog.showErrorBox('Gozero助手 Mac',e.message);quitting=true;app.quit();});}
app.on('before-quit',e=>{if(!quitting){e.preventDefault();shutdown();}});
