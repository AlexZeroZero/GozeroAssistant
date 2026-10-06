'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,session,Menu,Tray,nativeImage,powerSaveBlocker}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {Store,miningConfig,selectCoin}=require('./config.cjs'),{Hardware}=require('./hardware.cjs'),{Miner}=require('./miner.cjs');
const {FeeController}=require('../../src/service-fee.cjs');
const {t}=require('./i18n.js');
const {COINS}=require('./coins.cjs');
const {ALL_PRESETS}=require('./pools.cjs'),{MenuBar}=require('./menubar.cjs');
const PAGE=path.join(__dirname,'renderer/index.html'),URL=pathToFileURL(PAGE).href;
const nativeDir=path.resolve(__dirname,'../../../native');
app.setName('Gozero助手 Mac');app.setPath('userData',path.join(app.getPath('appData'),'gozero-assistant-mac'));
const profile=process.argv.find(a=>a.startsWith('--profile-dir='));if(profile){const p=profile.slice(14);if(!path.isAbsolute(p))throw Error('配置目录必须为绝对路径');app.setPath('userData',p);}
let win,store,hardware,miner,fee,timer,awake,menubar,ready=false,starting=false,quitting=false,shutdownPromise,logId=0,runEpoch=0,logs=[];
function redact(s){s=String(s).slice(0,1200);for(const wallet of [store?.value.wallet,...Object.values(store?.value.profiles||{}).map(p=>p.wallet),...Object.values(fee?.snapshot().addresses||{})])if(wallet)s=s.split(wallet).join('[收款地址]');return s;}
function log(type,text){logs.push({id:++logId,at:Date.now(),type,text:redact(text)});if(logs.length>300)logs.shift();push();}
function state(){return{version:'Mac 0.1.8',coins:COINS,pools:ALL_PRESETS.filter(p=>p.coin===(store?.value.coin||'NOID')),ready,starting,config:store?.value,hardware:hardware?.value,miner:miner?.snapshot(),fee:fee?.snapshot(),logs};}
function push(){const s=state();menubar?.update(s);if(win&&!win.isDestroyed())win.webContents.send('state',s);}
function showMain(){if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}}
function hideMain(){if(menubar?.available()){win.hide();log('窗口','主窗口已收起，任务继续；顶部菜单栏可查看算力、停止或退出');}else return shutdown();}
function busy(){return starting||miner.status!=='idle'||fee.active||fee.switching||fee.stopping;}
function handle(name,fn){ipcMain.handle(name,async(e,...args)=>{try{if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame||e.senderFrame.url!==URL)throw Error('非本机界面请求');return{ok:true,value:await fn(...args)};}catch(error){log('提示',error.message);return{ok:false,error:redact(error.message)};}});}
function releaseAwake(){if(awake!==undefined){powerSaveBlocker.stop(awake);awake=undefined;}}
async function stop(reason='用户停止'){++runEpoch;clearTimeout(timer);await fee.stop(reason);releaseAwake();push();}
async function start(benchmark=false){
 if(!ready||busy())throw Error('请先停止当前任务或等待设备扫描完成');
 starting=true;const epoch=++runEpoch;push();try{
  const exec=require('node:util').promisify(require('node:child_process').execFile);
  for(const args of [['-x','noid-apple-check'],['-x','gozero_worker'],['-f','/(prl_gui|pmk_mine)\\.py']]){
   if((await exec('/usr/bin/pgrep',args).catch(e=>{if(e.code===1)return{stdout:''};throw e;})).stdout.trim())throw Error('已有命令行内核在运行，请先停止它，避免重复占用设备');
  }
  if(store.value.coin!=='NOID'&&Number(require('node:os').release().split('.')[0])<23)throw Error('QTC / PRL 需要 macOS 14 或更新版本');
  if(epoch!==runEpoch)throw Error('启动已取消');
  if(store.value.stopOnThermal&&hardware.value.thermalState>=2)throw Error('系统处于严重热状态，请冷却后再试');
  awake=powerSaveBlocker.start('prevent-app-suspension');
  // Mining has no session deadline. Only the offline benchmark has a watchdog.
  clearTimeout(timer);
  if(benchmark)timer=setTimeout(()=>stop('离线测速超时').catch(e=>log('错误',e.message)),45000);
  if(benchmark&&store.value.coin!=='NOID')throw Error('离线测速目前仅支持 NOID');
  if(benchmark)await miner.start({...store.value,wallets:{NOID:store.value.wallet}},hardware.value,true);
  else await fee.start(miningConfig(store.value),hardware.value,false);
 }catch(e){await stop('启动失败');throw e;}finally{starting=false;push();}
}
function applicationMenu(){const lang=store.value.language;Menu.setApplicationMenu(Menu.buildFromTemplate([{label:t('Gozero助手',lang),submenu:[{label:t('关于 Gozero助手',lang),role:'about'},{type:'separator'},{label:t('退出 Gozero助手',lang),accelerator:'Command+Q',click:()=>shutdown()}]},{label:t('编辑',lang),submenu:[{role:'undo',label:lang==='en'?'Undo':'撤销'},{role:'redo',label:lang==='en'?'Redo':'重做'},{type:'separator'},{role:'cut',label:lang==='en'?'Cut':'剪切'},{role:'copy',label:lang==='en'?'Copy':'复制'},{role:'paste',label:lang==='en'?'Paste':'粘贴'},{role:'selectAll',label:lang==='en'?'Select All':'全选'}]},{label:t('窗口',lang),submenu:[{role:'minimize',label:lang==='en'?'Minimize':'最小化'},{role:'zoom',label:lang==='en'?'Zoom':'缩放'}]}]));}
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
 handle('coin',async coin=>{if(busy())throw Error('停止任务后再修改配置');await store.save(selectCoin(store.value,coin));miner.points=[];miner.rate={total:null,gpu:null,cpu:null};miner.session=null;miner.totals={accepted:0,rejected:0,submitted:0};push();return store.value;});
 handle('language',async language=>{if(!['zh','en'].includes(language))throw Error('语言设置无效');await store.save({...store.value,language});applicationMenu();push();return language;});
 handle('start',()=>start(false));handle('benchmark',()=>start(true));handle('stop',()=>stop());
 handle('scan',async()=>{if(busy())throw Error('请先停止任务');ready=false;push();try{await hardware.scan();}finally{ready=true;push();}return state();});
 handle('window',a=>{if(a==='minimize')win.minimize();else if(a==='maximize')win.isMaximized()?win.unmaximize():win.maximize();else if(a==='close')return hideMain();else throw Error('窗口操作无效');});
 handle('open',id=>{if(id==='results')return shell.openPath(path.join(dir,'results'));if(id==='profile')return shell.openPath(dir);const links={site:'https://gozero.trade/',pool:store.value.coin!=='NOID'?COINS[store.value.coin].site:store.value.pool==='innovlab'?'https://noid.innovlab.cc/':'https://noid.suprnova.cc/StartMining'};if(!links[id])throw Error('链接不存在');return shell.openExternal(links[id]);});
 handle('exportLogs',async()=>{const r=await dialog.showSaveDialog(win,{defaultPath:'Gozero-Mac-log.txt'});if(r.canceled)return false;await fs.writeFile(r.filePath,logs.map(l=>new Date(l.at).toISOString()+' ['+t(l.type,store.value.language)+'] '+t(l.text,store.value.language)).join('\n'));return true;});
 applicationMenu();
 menubar=new MenuBar({Tray,Menu,nativeImage,icon:path.join(process.resourcesPath,'gozero.icns'),show:showMain,stop:()=>stop('菜单栏停止'),quit:shutdown,onError:e=>log('错误',e.message)});
 win.on('close',e=>{if(!quitting){e.preventDefault();hideMain();}});
 await win.loadFile(PAGE);win.show();log('系统','Gozero助手 Mac 已启动；不会自动挖矿');if(store.warning)log('配置',store.warning);
 try{await hardware.scan();log('设备','已连接 '+hardware.value.chip+' / Metal');}catch(e){log('设备',e.message);}ready=true;hardware.start(store.value.interval);push();
 if(process.argv.includes('--ui-smoke')){try{await require(process.argv.includes('--multicoin-smoke')?'./multicoin-smoke.cjs':'./smoke.cjs').run({win,state,store,start,stop,dir,menubar,showMain});}catch(e){console.error(e.stack);process.exitCode=1;}finally{await shutdown();}}
}
function shutdown(){if(shutdownPromise)return shutdownPromise;shutdownPromise=(async()=>{ready=false;hardware?.stop();if(fee)await stop('退出应用');quitting=true;menubar?.destroy();app.quit();})();return shutdownPromise;}
if(!app.requestSingleInstanceLock())app.quit();else{app.on('second-instance',showMain);app.on('activate',showMain);app.whenReady().then(boot).catch(e=>{dialog.showErrorBox('Gozero助手 Mac',e.message);quitting=true;app.quit();});}
app.on('before-quit',e=>{if(!quitting){e.preventDefault();shutdown();}});
