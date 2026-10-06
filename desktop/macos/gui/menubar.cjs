'use strict';
const {t}=require('./i18n.js');
const {presetFor}=require('./pools.cjs');
const {formatRate}=require('./coins.cjs');
function model(s){
 const rate=n=>Number.isFinite(n)?formatRate(n,s.config?.coin,2):'等待采样';
 const m=s.miner||{},busy=s.starting||m.status&&m.status!=='idle'||s.fee?.active||s.fee?.switching;
 let title='Gozero 待机';
 if(s.starting||m.status==='starting')title='Gozero 启动中';
 else if(m.status==='stopping')title='Gozero 停止中';
 else if(s.fee?.switching)title='Gozero 切换中';
 else if(m.status==='running')title=m.session?.benchmark?'Gozero 测速中':({'power-paused':'电池供电，暂停计算',paused:'等待矿池',reconnecting:'重连中',waiting:'等待计算'}[m.workState]||rate(m.rate?.total));
 const summary=busy&&m.status==='running'&&!m.session?.benchmark&&m.workState==='mining'
  ?'GPU '+rate(m.rate?.gpu)+(s.config?.coin&&s.config.coin!=='NOID'?'':' · CPU '+rate(m.rate?.cpu)):title;
 const language=s.config?.language||'zh';return {title:t(title,language),summary:t(summary,language),language,busy:!!busy,pool:s.config?(presetFor(s.config)?.label||s.config.host+':'+s.config.port):'读取配置',shares:'接受 '+(m.totals?.accepted||0)+' / 拒绝 '+(m.totals?.rejected||0)};
}
class MenuBar{
 constructor({Tray,Menu,nativeImage,icon,show,stop,quit,onError}){
  this.Menu=Menu;this.actions={show,stop,quit,onError};
  this.tray=new Tray(nativeImage.createFromPath(icon).resize({width:18,height:18}));
  this.tray.on('double-click',show);
 }
 update(state){
  if(this.tray.isDestroyed())return;
  const m=model(state),tr=s=>t(s,m.language),key=JSON.stringify(m);if(key===this.key)return;this.key=key;
  this.tray.setTitle(m.title);this.tray.setToolTip(tr('Gozero助手')+' · '+m.summary+'\n'+tr(m.pool)+'\n'+tr(m.shares));
  const call=fn=>()=>Promise.resolve().then(fn).catch(this.actions.onError);
  this.menu=this.Menu.buildFromTemplate([
   {label:tr('打开主窗口'),click:this.actions.show},{type:'separator'},
   {label:m.summary,enabled:false},{label:tr(m.shares),enabled:false},{label:tr(m.pool),enabled:false},
   {type:'separator'},{label:tr('停止挖矿 / 测速'),enabled:m.busy,click:call(this.actions.stop)},
   {label:tr('退出助手（停止内核）'),click:call(this.actions.quit)},
  ]);this.tray.setContextMenu(this.menu);
 }
 available(){return !this.tray.isDestroyed();}
 destroy(){this.tray.destroy();}
}
module.exports={MenuBar,model};
