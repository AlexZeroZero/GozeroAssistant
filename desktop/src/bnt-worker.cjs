'use strict';
const{spawn}=require('node:child_process'),{createInterface}=require('node:readline');
class ComputeWorker{
 constructor(exe,engine,{pages='auto',binding=null}={}){
  if(!['auto','off'].includes(pages)||binding&&(!Number.isInteger(binding.group)||binding.group<0||binding.group>65535||!Number.isInteger(binding.logical)||binding.logical<0||binding.logical>=64))throw Error('Invalid BNT worker placement');
  const args=['worker',engine,pages,...(binding?[String(binding.group),String(binding.logical)]:[])];
  this.child=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});this.pending=null;this.closed=false;
  this.ready=new Promise((resolve,reject)=>{this.readyResolve=resolve;this.readyReject=reject});
  this.timer=setTimeout(()=>this.fail(Error('Core startup timeout')),30000);
  this.exited=new Promise(resolve=>this.child.once('close',resolve));
  this.child.on('error',e=>this.fail(e));this.child.on('exit',()=>{this.closed=true;this.fail(Error('Core exited'+(this.stderr?': '+this.stderr:'')))});
  this.child.stdin.on('error',e=>this.fail(e));
  this.stderr='';this.child.stderr.on('data',chunk=>{this.stderr=(this.stderr+chunk.toString('utf8')).slice(-1000)}); // Diagnostics reported through bounded JSON errors; no secrets.
  const lines=createInterface({input:this.child.stdout});
  lines.on('line',line=>{
   let msg;try{msg=JSON.parse(line)}catch{return this.fail(Error('Invalid core output'))}
   if(msg.event==='ready'){clearTimeout(this.timer);this.readyResolve(msg)}
   else if(this.pending){const p=this.pending;this.pending=null;clearTimeout(this.jobTimer);msg.event==='hash'&&msg.id===p.id?p.resolve(msg):p.reject(Error(msg.message||'Core job failed'))}
  });
 }
 fail(e){clearTimeout(this.timer);clearTimeout(this.jobTimer);this.readyReject(e);if(this.pending){this.pending.reject(e);this.pending=null}}
 async hash(job){await this.ready;if(this.closed||this.pending)throw Error('Core unavailable/busy');return new Promise((resolve,reject)=>{this.pending={resolve,reject,id:job.id};this.jobTimer=setTimeout(()=>{this.fail(Error('Hash computation timeout'));this.child.kill()},60000);this.child.stdin.write(JSON.stringify(job)+'\n')})}
 async stop(){this.fail(Error('Stopped'));this.child.stdin.end();if(!this.closed)this.child.kill();await this.exited}
}
module.exports={ComputeWorker};
