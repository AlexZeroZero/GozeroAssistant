use anyhow::{ensure, Context, Result};
use gozero_mds_core::core::{types::*, extension::MiningResult};
use serde_json::{json, Value};
use std::{collections::{HashSet, HashMap}, sync::{Arc, atomic::{AtomicBool, Ordering}}, time::{Duration, Instant}};
use tokio::{io::{AsyncBufRead, AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader}, net::TcpStream};
use crate::{Engine, Counters, emit};

pub fn parse_job(msg: &Value) -> Result<(u64, [u8;32], [u8;32], [u8;32], Batch)> {
 let p=msg["params"].as_array().context("notify parameters missing")?;
 ensure!(p.len()>=4,"notify requires an explicit share target");
 let id=p[0].as_u64().context("invalid job ID")?;
 let mut header=[0;32];hex::decode_to_slice(p[1].as_str().context("invalid header")?, &mut header)?;
 let batch:Batch=serde_json::from_value(p[2].clone())?;
 ensure!(!batch.coinbase.is_empty(),"missing coinbase");
 ensure!(compute_header_hash(&batch.header())==header,"template header hash mismatch");
 let mut share=[0;32];hex::decode_to_slice(p[3].as_str().context("invalid share target")?,&mut share)?;
 ensure!(batch.target!=[0;32] && share!=[0;32],"zero target");
 ensure!(share>=batch.target,"share target harder than network target");
 Ok((id,header,batch.target,share,batch))
}

pub fn verify_proof(p:&Value,b:&Batch,address:[u8;32])->Result<()> {
 ensure!(p.get("error").is_none(),"pool audit reports an error");
 let score=p["score"].as_u64().context("audit score missing")?;
 let mut idx=p["index"].as_u64().context("audit index missing")?;
 let siblings=p["proof"].as_array().context("audit proof missing")?;
 ensure!(siblings.len()<=64,"audit proof too deep");
 let mut data=address.to_vec();data.extend_from_slice(&score.to_le_bytes());let mut current=hash(&data);
 for sib in siblings {let mut h=[0;32];hex::decode_to_slice(sib.as_str().context("invalid proof node")?,&mut h)?;
  current=if idx%2==1{hash_concat(&h,&current)}else{hash_concat(&current,&h)};idx/=2;
 }
 ensure!(idx==0,"audit index outside tree");
 ensure!(b.coinbase.first().context("coinbase missing")?.salt==current,"audit root mismatch");
 if score>0 {ensure!(b.coinbase.iter().any(|c|c.address==address),"credited miner omitted from coinbase")}
 Ok(())
}

struct Work {cancel:Arc<AtomicBool>,thread:Option<std::thread::JoinHandle<()>>}
impl Drop for Work {fn drop(&mut self){self.cancel.store(true,Ordering::Relaxed);if let Some(t)=self.thread.take(){let _=t.join();}}}

const MAX_PENDING:usize=32;
const ACK_TIMEOUT:Duration=Duration::from_secs(15);
// Shared across reconnects: a busy server must not receive a fresh burst just
// because it closed the previous connection. Only explicitly accepted ACKs
// recover the window. Rejected/unconfirmed shares are never called accepted.
pub struct SubmitFlow {next:Instant,spacing_ms:u64,window:usize,successes:u32,busy_events:u64}
impl SubmitFlow {
 pub fn new()->Self{Self{next:Instant::now(),spacing_ms:40,window:4,successes:0,busy_events:0}}
 fn ready(&self,now:Instant,pending:usize)->bool{now>=self.next && pending<self.window.min(MAX_PENDING)}
 fn sent(&mut self,now:Instant){self.next=now+Duration::from_millis(self.spacing_ms);}
 fn busy(&mut self,now:Instant){
  self.spacing_ms=(self.spacing_ms*2).clamp(250,2000);self.window=1;self.successes=0;self.busy_events+=1;
  self.next=now+Duration::from_millis((self.spacing_ms*8).clamp(2000,8000));
 }
 fn accepted(&mut self){
  self.successes+=1;
  if self.successes>=8 {self.spacing_ms=(self.spacing_ms*4/5).max(40);self.window=(self.window+1).min(4);self.successes=0;}
 }
 fn diagnostics(&self,now:Instant)->Value{json!({"window":self.window,"spacingMs":self.spacing_ms,"cooldownSeconds":self.next.saturating_duration_since(now).as_secs_f64(),"busyEvents":self.busy_events})}
}
fn verifier_busy(error:&Value)->bool {error.as_str().is_some_and(|s|s.eq_ignore_ascii_case("Verifier busy, retry"))}
#[derive(Clone,Copy)]struct PendingShare {job:u64,sent:Instant}
fn oldest_pending(pending:&HashMap<u64,PendingShare>)->Duration {
 pending.values().map(|p|p.sent.elapsed()).max().unwrap_or_default()
}
fn acknowledgements_stalled(pending:&HashMap<u64,PendingShare>,last_progress:Instant)->bool {
 !pending.is_empty() && last_progress.elapsed()>=ACK_TIMEOUT
}
fn current_job_expired(request_job:u64,current_job:Option<u64>,error:&Value)->bool {
 current_job==Some(request_job) && error.as_str().is_some_and(|s|s.eq_ignore_ascii_case("Stale job"))
}
async fn write_frame<W:AsyncWrite+Unpin>(writer:&mut W,msg:&Value)->Result<()> {
 tokio::time::timeout(Duration::from_secs(3),writer.write_all(format!("{}\n",msg).as_bytes())).await.context("pool write timeout")??;
 Ok(())
}

// Keep verified shares under bounded backpressure instead of abandoning the
// worker when the pool processes a burst slowly. Cancellation must remain
// possible while the async receiver is busy replacing the current job.
fn queue_share(tx:&tokio::sync::mpsc::Sender<(u64,u64)>,mut share:(u64,u64),cancel:&AtomicBool)->bool {
 loop {
  if cancel.load(Ordering::Relaxed){return false}
  match tx.try_send(share) {
   Ok(())=>return true,
   Err(tokio::sync::mpsc::error::TrySendError::Full(value))=>{share=value;std::thread::sleep(Duration::from_millis(2));},
   Err(tokio::sync::mpsc::error::TrySendError::Closed(_))=>return false,
  }
 }
}

async fn read_frame<R:AsyncBufRead+Unpin>(reader:&mut R,buffer:&mut Vec<u8>)->Result<usize>{
 loop {
  let chunk=reader.fill_buf().await?;ensure!(!chunk.is_empty(),"pool disconnected");
  let end=chunk.iter().position(|b|*b==b'\n');let n=end.map_or(chunk.len(),|i|i+1);
  ensure!(buffer.len()+n<=4*1024*1024,"pool message too large");
  buffer.extend_from_slice(&chunk[..n]);reader.consume(n);
  if end.is_some(){return Ok(buffer.len())}
 }
}

pub async fn session(pool:&str,address:&str,worker:&str,audit:Option<&str>,engine:Arc<Engine>,stats:Arc<Counters>,stop:Arc<AtomicBool>) -> Result<()> {
 let url=reqwest::Url::parse(pool)?;
 ensure!(url.scheme()=="stratum+tcp" && url.username().is_empty() && url.password().is_none() && url.query().is_none() && url.fragment().is_none() && ["","/"].contains(&url.path()),"MDS currently requires stratum+tcp://host:port");
 let host=url.host_str().context("missing pool host")?;let port=url.port().context("missing pool port")?;
 parse_address_flexible(address).map_err(anyhow::Error::msg)?;
 emit(json!({"type":"status","message":format!("Connecting {}:{}",host,port)}));
 let stream=tokio::time::timeout(Duration::from_secs(10),TcpStream::connect((host,port))).await??;
 emit(json!({"type":"status","message":"TCP connected"}));
 stream.set_nodelay(true)?;
 run_stream(stream,address,worker,audit,engine,stats,stop).await
}

async fn run_stream<S:AsyncRead+AsyncWrite+Unpin>(stream:S,address:&str,worker:&str,audit:Option<&str>,engine:Arc<Engine>,stats:Arc<Counters>,stop:Arc<AtomicBool>)->Result<()> {
 let payout=parse_address_flexible(address).map_err(anyhow::Error::msg)?;
 let (read,mut write)=tokio::io::split(stream);let mut reader=BufReader::new(read);
 write_frame(&mut write,&json!({"id":1,"method":"mining.authorize","params":[address,worker]})).await?;
 emit(json!({"type":"status","message":"Pool authorization sent"}));
 let client=reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(8)).redirect(reqwest::redirect::Policy::none()).build()?;
 if let Some(a)=audit {let a=reqwest::Url::parse(a)?;ensure!(["http","https"].contains(&a.scheme())&&a.username().is_empty()&&a.password().is_none(),"invalid audit URL")}
 else {emit(json!({"type":"status","message":"Template hashes verified; reward Merkle audit unavailable without --audit-url"}));}
 let (tx,mut rx)=tokio::sync::mpsc::channel::<(u64,u64)>(128);
 let mut work:Option<Work>=None;let mut current:Option<(u64,[u8;32],[u8;32],[u8;32])>=None;let mut authorized=false;
 let mut next_id=2u64;let mut pending=HashMap::<u64,PendingShare>::new();let mut submitted=HashSet::new();
 let mut tick=tokio::time::interval(Duration::from_millis(100));
 let mut last_rx=Instant::now();let mut buffer=Vec::new();let mut last_diagnostic=Instant::now();let mut last_ack_progress=Instant::now();let mut stale_since:Option<Instant>=None;
 loop {
  tokio::select! {
   _=tick.tick()=>{
    if stop.load(Ordering::Relaxed){break}
    ensure!(last_rx.elapsed()<Duration::from_secs(if authorized{120}else{15}),"pool response timeout");
    if last_diagnostic.elapsed()>=Duration::from_secs(5){
     emit(json!({"type":"pipeline","pending":pending.len(),"queued":rx.len(),"oldestAckSeconds":oldest_pending(&pending).as_secs_f64(),"ackIdleSeconds":if pending.is_empty(){0.0}else{last_ack_progress.elapsed().as_secs_f64()},"lastReceiveSeconds":last_rx.elapsed().as_secs_f64(),"job":current.map(|v|v.0),"submission":stats.flow.lock().unwrap().diagnostics(Instant::now())}));
     last_diagnostic=Instant::now();
    }
    ensure!(!acknowledgements_stalled(&pending,last_ack_progress),"share acknowledgement stalled for 15 seconds; {} unconfirmed requests (not counted as rejected)",pending.len());
    ensure!(!stale_since.is_some_and(|s|s.elapsed()>=Duration::from_secs(5)),"current job expired; no replacement job for 5 seconds");
   }
   result=read_frame(&mut reader,&mut buffer)=>{
    let n=result?;ensure!(n>0,"pool disconnected");ensure!(buffer.len()<=4*1024*1024 && buffer.last()==Some(&b'\n'),"oversized or incomplete pool message");
    let msg:Value=serde_json::from_slice(&buffer)?;buffer.clear();last_rx=std::time::Instant::now();
    if msg["id"].as_u64()==Some(1) {ensure!(msg["result"]==true && msg["error"].is_null(),"pool authorization rejected");authorized=true;emit(json!({"type":"status","message":"Pool authorized"}));}
    else if msg["method"]=="mining.notify" {
     ensure!(authorized,"job received before authorization");
     let (id,header,target,share,batch)=parse_job(&msg)?;
     if current==Some((id,header,target,share)){continue}
     drop(work.take());
     // The previous producer has joined. Its buffered shares are obsolete.
     while rx.try_recv().is_ok() {}
     if let Some(a)=audit {
      let mut u=reqwest::Url::parse(a)?;u.set_path("/api/proof");u.set_query(None);u.query_pairs_mut().append_pair("address",address);
      let res=client.get(u).send().await?.error_for_status()?;
      ensure!(res.content_length().unwrap_or(0)<=65536,"audit response too large");
      let mut res=res;let mut bytes=Vec::new();while let Some(chunk)=res.chunk().await?{ensure!(bytes.len()+chunk.len()<=65536,"audit response too large");bytes.extend_from_slice(&chunk)}
      verify_proof(&serde_json::from_slice::<Value>(&bytes)?,&batch,payout)?;
     }
     current=Some((id,header,target,share));submitted.clear();stale_since=None;
     emit(json!({"type":"job","job":id,"audit":if audit.is_some(){"merkle"}else{"template-only"}}));
     let cancel=Arc::new(AtomicBool::new(false));let c=cancel.clone();let e=engine.clone();let counter=stats.work.clone();let channel=tx.clone();
     let engine_stop=stop.clone();
     let thread=std::thread::spawn(move||{
      if let Err(err)=e.mine_stream(header,target,Some(share),c.clone(),counter,|hit| {
        let nonce=match hit {MiningResult::Block(x)|MiningResult::Share(x)=>x.nonce};
        queue_share(&channel,(id,nonce),&c)
      }){emit(json!({"type":"error","message":format!("Mining backend stopped: {err}")}));engine_stop.store(true,Ordering::Relaxed);}
     });work=Some(Work{cancel,thread:Some(thread)});
    }else if let Some(id)=msg["id"].as_u64(){
     if let Some(request)=pending.remove(&id){
      last_ack_progress=Instant::now();
      let accepted=msg["result"]==true && msg["error"].is_null();
      if accepted{stats.accepted.fetch_add(1,Ordering::Relaxed);}else{stats.rejected.fetch_add(1,Ordering::Relaxed);}
      {let mut flow=stats.flow.lock().unwrap();if accepted{flow.accepted();}else if verifier_busy(&msg["error"]){flow.busy(Instant::now());}}
      if !accepted && verifier_busy(&msg["error"]) {emit(json!({"type":"status","message":"Pool verifier busy: cooling down submissions; limit retained across reconnects"}));}
      emit(json!({"type":"share","accepted":accepted,"error":msg["error"],"job":request.job,"ackSeconds":request.sent.elapsed().as_secs_f64()}));
      if !accepted && stale_since.is_none() && current_job_expired(request.job,current.map(|v|v.0),&msg["error"]) {
       drop(work.take());while rx.try_recv().is_ok() {}
       stale_since=Some(Instant::now());
       emit(json!({"type":"status","message":"Current job expired: paused obsolete work, waiting for replacement","job":request.job}));
      }
     }
    }
   }
   Some((job,nonce))=rx.recv(), if stats.flow.lock().unwrap().ready(Instant::now(),pending.len())=>{
    if current.map(|v|v.0)!=Some(job)||!submitted.insert((job,nonce)){continue}
    ensure!(submitted.len()<=65536,"too many shares in one job");
    let id=next_id;next_id+=1;if pending.is_empty(){last_ack_progress=Instant::now();}pending.insert(id,PendingShare{job,sent:Instant::now()});
    write_frame(&mut write,&json!({"id":id,"method":"mining.submit","params":[address,job,nonce]})).await?;
    stats.flow.lock().unwrap().sent(Instant::now());
   }
  }
 }
 drop(work);Ok(())
}

#[cfg(test)] mod tests {
 use super::*;
 #[test]fn busy_flow_persists_and_recovers_only_on_real_accepts(){
  let now=Instant::now();let stats=Counters::new();
  {let mut f=stats.flow.lock().unwrap();assert!(f.ready(now+Duration::from_millis(1),0));assert!(!f.ready(now,4));f.busy(now);}
  {let mut f=stats.flow.lock().unwrap();assert!(!f.ready(now+Duration::from_secs(1),0));assert!(f.ready(now+Duration::from_secs(2),0));assert!(!f.ready(now+Duration::from_secs(2),1));
   for _ in 0..8{f.accepted();}assert_eq!(f.window,2);assert_eq!(f.spacing_ms,200);
   f.sent(now+Duration::from_secs(3));assert!(!f.ready(now+Duration::from_millis(3199),0));assert!(f.ready(now+Duration::from_millis(3200),0));
   for _ in 0..1000{f.busy(now);}assert_eq!(f.spacing_ms,2000);assert_eq!(f.window,1);assert!(f.ready(now+Duration::from_secs(8),0));
  }
  assert!(verifier_busy(&json!("Verifier busy, retry")));assert!(!verifier_busy(&json!("Stale job")));
  assert_eq!(stats.accepted.load(Ordering::Relaxed),0);
 }
 #[test]fn slow_receiver_preserves_all_queued_shares(){
  let (tx,mut rx)=tokio::sync::mpsc::channel(2);
  let cancel=Arc::new(AtomicBool::new(false));let c=cancel.clone();
  let worker=std::thread::spawn(move||{for n in 0..80{assert!(queue_share(&tx,(7,n),&c));}});
  for n in 0..80{std::thread::sleep(Duration::from_millis(3));assert_eq!(rx.blocking_recv(),Some((7,n)));}
  worker.join().unwrap();
 }
 #[test]fn full_queue_can_be_cancelled_without_dropping_receiver(){
  let (tx,_rx)=tokio::sync::mpsc::channel(1);tx.try_send((7,0)).unwrap();
  let cancel=Arc::new(AtomicBool::new(false));let c=cancel.clone();
  let (done,wait)=std::sync::mpsc::channel();
  let worker=std::thread::spawn(move||{done.send(queue_share(&tx,(7,1),&c)).unwrap();});
  std::thread::sleep(Duration::from_millis(10));cancel.store(true,Ordering::Relaxed);
  assert!(!wait.recv_timeout(Duration::from_secs(1)).unwrap());worker.join().unwrap();
 }
 fn fixture()->Batch{Batch{prev_midstate:[1;32],transactions:vec![],extension:Extension{nonce:0,final_hash:[0;32]},coinbase:vec![CoinbaseOutput{address:[2;32],value:1,salt:[3;32]}],timestamp:123,target:[1;32],state_root:[4;32],prev_header_hash:[5;32]}}
 #[test]fn header_and_targets(){let b=fixture();let mut m=json!({"params":[1,hex::encode(compute_header_hash(&b.header())),b,hex::encode([255;32])]});assert!(parse_job(&m).is_ok());m["params"][2]["timestamp"]=json!(124);assert!(parse_job(&m).is_err());assert!(parse_job(&json!({"params":[]})).is_err());}
 #[test]fn proof_binding(){let mut b=fixture();let address=[2;32];let mut data=address.to_vec();data.extend_from_slice(&1u64.to_le_bytes());b.coinbase[0].salt=hash(&data);let p=json!({"score":1,"index":0,"proof":[]});assert!(verify_proof(&p,&b,address).is_ok());assert!(verify_proof(&p,&b,[3;32]).is_err());}
 #[test]fn pending_age_keeps_old_job_accounting(){
  let mut pending=HashMap::new();
  pending.insert(2,PendingShare{job:7,sent:Instant::now()-ACK_TIMEOUT-Duration::from_secs(1)});
  pending.insert(3,PendingShare{job:8,sent:Instant::now()});
  assert!(oldest_pending(&pending)>=ACK_TIMEOUT);
  // Sequential pool verification can delay a tail request while acknowledgements
  // are still progressing. That must not trigger a reconnect.
  assert!(!acknowledgements_stalled(&pending,Instant::now()));
  assert!(acknowledgements_stalled(&pending,Instant::now()-ACK_TIMEOUT-Duration::from_secs(1)));
  assert_eq!(pending.remove(&2).unwrap().job,7);
  assert!(oldest_pending(&pending)<ACK_TIMEOUT);
  assert_eq!(pending.remove(&3).unwrap().job,8);
  assert!(!acknowledgements_stalled(&pending,Instant::now()-ACK_TIMEOUT-Duration::from_secs(1)));
 }
 #[test]fn only_explicit_stale_for_current_job_pauses_work(){
  assert!(current_job_expired(7,Some(7),&json!("Stale job")));
  assert!(!current_job_expired(7,Some(8),&json!("Stale job")));
  assert!(!current_job_expired(7,Some(7),&json!("Low difficulty")));
  assert!(!current_job_expired(7,None,&json!("Stale job")));
 }
 #[tokio::test]async fn stalled_writer_has_bounded_wait(){
  let (mut client,_server)=tokio::io::duplex(1);
  let result=tokio::time::timeout(Duration::from_secs(4),write_frame(&mut client,&json!({"method":"mining.submit"}))).await.unwrap();
  assert!(result.unwrap_err().to_string().contains("pool write timeout"));
 }
 #[tokio::test(flavor="multi_thread",worker_threads=2)]async fn new_job_proceeds_with_old_ack_outstanding(){test_job_change(false).await;}
 #[tokio::test(flavor="multi_thread",worker_threads=2)]async fn expired_job_resumes_on_replacement(){test_job_change(true).await;}
 async fn test_job_change(expire_first:bool){
  let (server_io,client_io)=tokio::io::duplex(65536);
  let stats=Arc::new(Counters::new());let stop=Arc::new(AtomicBool::new(false));let finish=stop.clone();
  let server=tokio::spawn(async move{
   let (read,mut write)=tokio::io::split(server_io);let mut read=BufReader::new(read);let mut line=String::new();
   read.read_line(&mut line).await.unwrap();
   write_frame(&mut write,&json!({"id":1,"result":true,"error":null})).await.unwrap();
   let b=fixture();
   write_frame(&mut write,&json!({"method":"mining.notify","params":[7,hex::encode(compute_header_hash(&b.header())),b,hex::encode([255;32])]})).await.unwrap();
   line.clear();read.read_line(&mut line).await.unwrap();let old:Value=serde_json::from_str(&line).unwrap();
   assert_eq!(old["params"][1],7);
   if expire_first {
    write_frame(&mut write,&json!({"id":old["id"],"result":false,"error":"Stale job"})).await.unwrap();
    tokio::time::sleep(Duration::from_millis(300)).await;
   }
   let mut b=fixture();b.timestamp+=1;let header=compute_header_hash(&b.header());
   write_frame(&mut write,&json!({"method":"mining.notify","params":[8,hex::encode(header),b,hex::encode([255;32])]})).await.unwrap();
   // No acknowledgement for the previous job until the new job produces work.
   loop {
    line.clear();read.read_line(&mut line).await.unwrap();let new:Value=serde_json::from_str(&line).unwrap();
    if new["params"][1]!=8 {continue}
    let nonce=new["params"][2].as_u64().unwrap();
    assert!(gozero_mds_core::core::extension::create_extension(header,nonce).final_hash<[255;32]);
    if !expire_first {write_frame(&mut write,&json!({"id":old["id"],"result":false,"error":"Stale job"})).await.unwrap();}
    write_frame(&mut write,&json!({"id":new["id"],"result":true,"error":null})).await.unwrap();break
   }
   tokio::time::sleep(Duration::from_millis(300)).await;finish.store(true,Ordering::Relaxed);
  });
  let address=encode_address_with_checksum(&[2;32]);
  let _=tokio::time::timeout(Duration::from_secs(20),run_stream(client_io,&address,"SwitchTest",None,Arc::new(Engine::Cpu(1)),stats.clone(),stop.clone())).await.unwrap();
  server.await.unwrap();assert_eq!(stats.accepted.load(Ordering::Relaxed),1);assert_eq!(stats.rejected.load(Ordering::Relaxed),1);
 }
 #[tokio::test(flavor="multi_thread",worker_threads=2)]async fn simulated_pool_accepts_recomputed_share(){
  let (server_io,client_io)=tokio::io::duplex(65536);
  let stats=Arc::new(Counters::new());let stop=Arc::new(AtomicBool::new(false));
  let server=tokio::spawn(async move{
   let (read,mut write)=tokio::io::split(server_io);let mut read=BufReader::new(read);let mut line=String::new();read.read_line(&mut line).await.unwrap();
   let auth:Value=serde_json::from_str(&line).unwrap();assert_eq!(auth["method"],"mining.authorize");assert_eq!(auth["params"][1],"TestRig");
   write.write_all(b"{\"id\":1,\"result\":true,\"error\":null}\n").await.unwrap();
   let batch=fixture();let header=compute_header_hash(&batch.header());
   let job=json!({"method":"mining.notify","params":[7,hex::encode(header),batch,hex::encode([255;32])]});
   write.write_all(format!("{}\n",job).as_bytes()).await.unwrap();line.clear();
   tokio::time::timeout(Duration::from_secs(20),read.read_line(&mut line)).await.unwrap().unwrap();
   let submit:Value=serde_json::from_str(&line).unwrap();assert_eq!(submit["method"],"mining.submit");assert_eq!(submit["params"][1],7);
   let nonce=submit["params"][2].as_u64().unwrap();let proof=gozero_mds_core::core::extension::create_extension(header,nonce);
   assert!(proof.final_hash<[255;32]);
   write.write_all(format!("{}\n",json!({"id":submit["id"],"result":true,"error":null})).as_bytes()).await.unwrap();
   tokio::time::sleep(Duration::from_millis(500)).await;
  });
  let address=encode_address_with_checksum(&[2;32]);
  let client=run_stream(client_io,&address,"TestRig",None,Arc::new(Engine::Cpu(1)),stats.clone(),stop.clone());
  let _=tokio::time::timeout(Duration::from_secs(25),client).await.unwrap();stop.store(true,Ordering::Relaxed);server.await.unwrap();assert_eq!(stats.accepted.load(Ordering::Relaxed),1);
 }
}
