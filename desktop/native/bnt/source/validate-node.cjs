'use strict';
// Validate a real solved block against the unmodified official Windows node.
// Testnet only, fresh data directory, refuses to work when external peers exist.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomBytes}=require('node:crypto');
const {NodeClient,validateAddress}=require('./node-protocol.cjs');
const {ComputeWorker}=require('./node-miner.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(node,core,directory){
 const root=path.resolve(directory);fs.mkdirSync(root,{recursive:true});
 const runDir=fs.mkdtempSync(path.join(root,'local-consensus-')),data=path.join(runDir,'data');fs.mkdirSync(data);
 const net=require('node:net'),server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 const log=fs.openSync(path.join(runDir,'node.log'),'w');
 const child=spawn(path.resolve(node),['--testnet','--seed','--full-sync','--daemon','--no-version-check','--nocolor','--data',data,'--wallet',path.join(runDir,'test-wallet.dat'),'--api','127.0.0.1:'+port,'--listen','/ip4/127.0.0.1/tcp/0'],{cwd:runDir,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,APPDATA:path.join(runDir,'appdata'),XDG_CONFIG_HOME:path.join(runDir,'config')}});
 const closed=new Promise(resolve=>child.once('close',resolve));let worker,report={mode:'isolated local testnet consensus validation',mainnet:false,node:path.basename(node),started:new Date().toISOString()};
 const deadline=Date.now()+180000;const timer=setTimeout(()=>{child.kill();worker?.child.kill()},180000);
 try{
  let api,status;
  while(Date.now()<deadline){
   if(child.exitCode!==null)throw Error('Official node exited before API startup');
   try{api=new NodeClient({endpoint:'http://127.0.0.1:'+port,token:fs.readFileSync(path.join(data,'api.cookie'),'utf8')});status=await api.request('/api/status');break}catch{await sleep(1000)}
  }
  if(!status)throw Error('Official testnet API startup timeout');
  if(status.peers!==0||status.chain_height>0)throw Error('Refusing validation on a connected or previously populated chain');
  const wallet=await api.request('/api/wallet/create',JSON.stringify({password:randomBytes(32).toString('hex')}));
  validateAddress(wallet.address,'blocknet_testnet');
  const task=await api.getTemplate(wallet.address);
  if(task.height!=='1')throw Error('Expected an isolated genesis successor');
  worker=new ComputeWorker(path.resolve(core),'prefetch');await worker.ready;
  for(let nonce=0n;nonce<100n&&Date.now()<deadline;nonce++){
   const result=await worker.hash({id:task.id,header:task.header,target:task.target,nonce:nonce.toString()});
   if(BigInt('0x'+result.hash)>BigInt('0x'+task.target))continue;
   status=await api.request('/api/status');if(status.peers!==0)throw Error('A peer connected; aborting isolated submission');
   const accepted=await api.submit(task.id,nonce.toString());
   if(accepted.accepted!==true)throw Error('Official node did not accept result');
   report={...report,passed:true,header:task.header,target:task.target,nonce:nonce.toString(),powHash:result.hash,accepted,hashes:Number(nonce+1n)};
   console.log(JSON.stringify(report));break;
  }
  if(!report.passed)throw Error('No valid solution before bounded test ended');
 }catch(e){report.error=e.message;console.error(e.message);process.exitCode=1}
 finally{clearTimeout(timer);await worker?.stop();child.kill();await closed;fs.closeSync(log);report.stopped=true;fs.writeFileSync(path.join(root,'local-consensus-result.json'),JSON.stringify(report,null,2)+'\n')}
}
if(require.main===module){if(process.argv.length!==5){console.error('Usage: node validate-node.cjs OFFICIAL_NODE_EXE CORE_EXE OUTPUT_DIRECTORY');process.exitCode=1}else run(...process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1})}
