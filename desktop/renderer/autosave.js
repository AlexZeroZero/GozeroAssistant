(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GozerAutosave=api})(typeof globalThis==='object'?globalThis:this,()=>{
 'use strict';
 class Queue{
  constructor(write,changed=()=>{},delay=200){Object.assign(this,{write,changed,delay,pending:new Map(),busy:false,error:null,timer:null,running:null})}
  get dirty(){return this.busy||this.pending.size>0}
  set(key,value){this.pending.set(key,value);this.error=null;clearTimeout(this.timer);this.changed(this);this.timer=setTimeout(()=>this.flush().catch(()=>{}),this.delay)}
  flush(){clearTimeout(this.timer);if(this.running)return this.running.then(()=>this.pending.size?this.flush():undefined);if(!this.pending.size)return Promise.resolve();
   this.busy=true;this.error=null;
   this.running=(async()=>{try{while(this.pending.size){const batch=new Map(this.pending);this.pending.clear();try{await this.write(Object.fromEntries(batch))}catch(e){for(const[k,v]of batch)if(!this.pending.has(k))this.pending.set(k,v);throw e}}}catch(e){clearTimeout(this.timer);this.error=e;throw e}finally{this.busy=false;this.running=null;this.changed(this)}})();this.changed(this);return this.running;
  }
 }
 return{Queue};
});
