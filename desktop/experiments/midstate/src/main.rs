use anyhow::{ensure, Result};
use clap::Parser;
use gozero_mds_core::core::{extension::{self, MiningResult}, gpu_mining::{self,GpuMiner}, cuda_mining::CudaMiner, simd_mining, types::*};
use serde_json::{json,Value};
use std::{io::Write,sync::{Arc,atomic::{AtomicBool,AtomicU64,Ordering}},time::{Duration,Instant}};
mod protocol;
const DEFAULT_POOL: &str = "stratum+tcp://mds.gozero.trade:13333";

#[derive(Parser)]
#[command(version,about="Gozero MDS Core - Midstate GPLv3 source build; no embedded developer fee")]
struct Args {
 #[arg(long)] list_devices:bool,
 #[arg(long)] self_test:bool,
 #[arg(long,default_value="gpu",value_parser=["gpu","cuda","cpu"])] backend:String,
 /// CUDA-only tuning; full million-round consensus and CPU verification stay enabled.
 /// 0 benchmarks bounded batch sizes on this GPU at startup; explicit overrides remain available.
 #[arg(long,default_value_t=0)] cuda_batch:u32,
 /// 0 selects bounded launch duration on the actual GPU; manual 1..32000.
 #[arg(long,default_value_t=0)] cuda_dispatch:u32,
 /// 0 measures 64/128/256-thread layouts; explicit 32/64/128/256 supported.
 #[arg(long,default_value_t=0)] cuda_block:u32,
 /// 0 measures chain-unroll 1/2/4/8 on this GPU; no consensus changes.
 #[arg(long,default_value_t=0)] cuda_unroll:u32,
 #[arg(long,default_value_t=0)] gpu_index:usize,
 #[arg(long,default_value_t=1)] threads:usize,
 #[arg(long)] benchmark:Option<u64>,
 /// Offline benchmark including real CPU candidate verification; e.g. 6 = one share per 64 nonces on average. No pool submission.
 #[arg(long,requires="benchmark")] benchmark_share_bits:Option<u32>,
 /// Mining pool; defaults to stratum+tcp://mds.gozero.trade:13333 when a payout address is supplied.
 #[arg(long)] pool_url:Option<String>,
 #[arg(long)] payout_address:Option<String>,
 #[arg(long,default_value="Gozero")] worker:String,
 #[arg(long)] audit_url:Option<String>,
 #[arg(long)] mss_confirmed:bool,
 #[arg(long)] check_address:Option<String>,
 #[arg(long,default_value_t=0.9)] duty:f32,
 #[arg(long)] duration:Option<u64>,
}
pub fn emit(v:Value){let mut out=std::io::stdout().lock();let _=writeln!(out,"MDS {}",v);let _=out.flush();}
pub struct Counters{work:Arc<AtomicU64>,accepted:AtomicU64,rejected:AtomicU64,flow:std::sync::Mutex<protocol::SubmitFlow>}
impl Counters{fn new()->Self{Self{work:Arc::new(AtomicU64::new(0)),accepted:AtomicU64::new(0),rejected:AtomicU64::new(0),flow:std::sync::Mutex::new(protocol::SubmitFlow::new())}}}
pub enum Engine{Gpu(GpuMiner),Cuda(CudaMiner),Cpu(usize)}
impl Engine{
 fn mine_stream<F:FnMut(MiningResult)->bool+Send>(&self,h:[u8;32],target:[u8;32],pool:Option<[u8;32]>,cancel:Arc<AtomicBool>,counter:Arc<AtomicU64>,mut output:F)->Result<()>{
  match self {
   Self::Gpu(g)=>g.mine_gpu_stream(h,target,pool,cancel,counter,output),
   Self::Cuda(g)=>g.mine_stream(h,target,pool,cancel,counter,output)?,
   Self::Cpu(_)=>while !cancel.load(Ordering::Relaxed){
    if let Some(hit)=self.mine(h,target,pool,cancel.clone(),counter.clone()){if !output(hit){break}}else{break}
   }
  }Ok(())
 }
 fn mine(&self,h:[u8;32],target:[u8;32],pool:Option<[u8;32]>,cancel:Arc<AtomicBool>,counter:Arc<AtomicU64>)->Option<MiningResult>{
  match self{Self::Gpu(g)=>g.mine_gpu(h,target,pool,cancel,counter),Self::Cpu(t)=>extension::mine_extension(h,target,pool,*t,cancel,counter),Self::Cuda(_)=>unreachable!("CUDA uses the streaming interface")}
 }
}
fn self_test_cpu()->Result<()> {
 let lanes=simd_mining::detected_level().lanes();
 let nonces:Vec<u64>=(0..lanes).map(|n|u64::MAX-n as u64).collect();
 let h=[0xA5;32];let result=simd_mining::mine_batch(h,&nonces);
 for ((n,actual),expected_nonce) in result.iter().zip(&nonces){ensure!(n==expected_nonce&&*actual==extension::create_extension(h,*n).final_hash,"SIMD consensus mismatch")}
 ensure!(EXTENSION_ITERATIONS==1_000_000,"test-only fast-mining feature is forbidden");
 emit(json!({"type":"selftest","backend":"cpu","lanes":lanes,"iterations":EXTENSION_ITERATIONS,"passed":true}));Ok(())
}
fn initialize(a:&Args)->Result<Arc<Engine>>{
 self_test_cpu()?;
 if a.backend=="cpu"{return Ok(Arc::new(Engine::Cpu(a.threads)))}
 if a.backend=="cuda"{
  let g=CudaMiner::new_with_unroll(a.gpu_index,a.duty,a.cuda_batch,a.cuda_dispatch,a.cuda_block,a.cuda_unroll)?;g.self_test()?;
  emit(json!({"type":"selftest","backend":"cuda","gpuSettings":g.diagnostics(),"passed":true}));
  return Ok(Arc::new(Engine::Cuda(g)))
 }
 let g=GpuMiner::new_index(a.gpu_index)?;g.self_test()?;gpu_mining::set_gpu_duty(a.duty);
 emit(json!({"type":"selftest","backend":"gpu","device":g.adapter_name(),"gpuSettings":g.diagnostics(),"passed":true}));
 Ok(Arc::new(Engine::Gpu(g)))
}
fn rate_report(stats:&Counters,last:&mut(u64,Instant)){
 let now=Instant::now();let count=stats.work.load(Ordering::Relaxed);let seconds=now.duration_since(last.1).as_secs_f64();
 emit(json!({"type":"telemetry","hash":(count-last.0) as f64/seconds,"unit":"N/s","workNonces":count,"accepted":stats.accepted.load(Ordering::Relaxed),"rejected":stats.rejected.load(Ordering::Relaxed),"basis":"executed chain-work equivalents; not pool-estimated hashrate"}));*last=(count,now);
}
async fn run()->Result<()> {
 let mut a=Args::parse();
 // A default pool does not turn device discovery or an offline benchmark into
 // live mining. The operator must still supply and confirm their MSS wallet.
 if a.pool_url.is_none() && a.payout_address.is_some() && a.benchmark.is_none()
     && !a.self_test && !a.list_devices && a.check_address.is_none() {
  a.pool_url=Some(DEFAULT_POOL.to_string());
 }
 ensure!(a.threads>0&&a.threads<=1024,"threads must be 1..1024");
 ensure!(a.duty.is_finite()&&a.duty>=0.1&&a.duty<=1.0,"duty must be 0.1..1.0");
 if let Some(address)=&a.check_address {let bytes=parse_address_flexible(address).map_err(anyhow::Error::msg)?;emit(json!({"type":"address","valid":true,"canonical":encode_address_with_checksum(&bytes),"mssType":"not inferable from address hash"}));return Ok(())}
 if a.list_devices{emit(json!({"type":"devices","gpus":GpuMiner::list_devices()?,"logicalThreads":std::thread::available_parallelism()?.get()}));return Ok(())}
 ensure!(a.self_test||a.benchmark.is_some()||a.pool_url.is_some(),"choose --self-test, --benchmark SECONDS, or --pool-url");
 if a.pool_url.is_some(){ensure!(a.mss_confirmed,"confirm your payout address was generated by wallet generate-mss with --mss-confirmed");parse_address_flexible(a.payout_address.as_deref().unwrap_or("")).map_err(anyhow::Error::msg)?;ensure!(a.worker.len()<=32&&!a.worker.is_empty()&&a.worker.bytes().all(|c|c.is_ascii_alphanumeric()||b"_.-".contains(&c)),"invalid worker name");}
 if let Some(n)=a.benchmark {ensure!((5..=300).contains(&n),"benchmark duration must be 5..300 seconds")}
 if let Some(n)=a.benchmark_share_bits {ensure!((1..=24).contains(&n),"benchmark share bits must be 1..24")}
 let engine=initialize(&a)?;
 if a.self_test{return Ok(())}
 let stop=Arc::new(AtomicBool::new(false));let c=stop.clone();ctrlc::set_handler(move||c.store(true,Ordering::Relaxed))?;
 let stats=Arc::new(Counters::new());let start=Instant::now();let mut last=(0,start);
 if let Some(seconds)=a.benchmark {
  let e=engine.clone();let s=stop.clone();let counter=stats.work.clone();
  let pool_target=a.benchmark_share_bits.map(|bits|{let mut t=[255u8;32];for bit in 0..bits{t[(bit/8) as usize]&=!(1<<(7-bit%8));}t});
  let verified=Arc::new(AtomicU64::new(0));let returned=verified.clone();
  let worker=std::thread::spawn(move||{
   e.mine_stream([0x42;32],[0;32],pool_target,s,counter,|_|{returned.fetch_add(1,Ordering::Relaxed);true})
  });
  let mut next=Instant::now()+Duration::from_secs(5);
  while !stop.load(Ordering::Relaxed)&&start.elapsed()<Duration::from_secs(seconds){tokio::time::sleep(Duration::from_millis(100)).await;if Instant::now()>=next{rate_report(&stats,&mut last);next+=Duration::from_secs(5)}}
  stop.store(true,Ordering::Relaxed);worker.join().map_err(|_|anyhow::anyhow!("benchmark worker failed"))??;
  let elapsed=start.elapsed().as_secs_f64();emit(json!({"type":"benchmark","backend":a.backend,"threads":a.threads,"duty":if a.backend!="cpu"{a.duty}else{1.0},"seconds":elapsed,"noncesPerSecond":stats.work.load(Ordering::Relaxed) as f64/elapsed,"workNonces":stats.work.load(Ordering::Relaxed),"unit":"N/s","networkUsed":false,"iterations":EXTENSION_ITERATIONS,"mode":if pool_target.is_some(){"compute-and-cpu-share-verification"}else{"compute-only"},"shareTargetBits":a.benchmark_share_bits,"locallyVerifiedShares":verified.load(Ordering::Relaxed),"localSharesPerSecond":verified.load(Ordering::Relaxed) as f64/elapsed,"gpuDiagnostics":match engine.as_ref(){Engine::Gpu(g)=>g.diagnostics(),Engine::Cuda(g)=>g.diagnostics(),_=>Value::Null}}));return Ok(())
 }
 let report_stop=stop.clone();let report_stats=stats.clone();let duration=a.duration;
 let report_engine=engine.clone();
 let reporter=tokio::spawn(async move {
  let mut last=(0,Instant::now());let mut diagnostic=Instant::now();
  while !report_stop.load(Ordering::Relaxed) {
   tokio::time::sleep(Duration::from_secs(1)).await;
   if duration.is_some_and(|n|start.elapsed()>=Duration::from_secs(n)){report_stop.store(true,Ordering::Relaxed)}
   if last.1.elapsed()>=Duration::from_secs(5){rate_report(&report_stats,&mut last)}
   if diagnostic.elapsed()>=Duration::from_secs(30) {
    if let Engine::Cuda(g)=report_engine.as_ref(){emit(json!({"type":"cuda-diagnostics","gpuSettings":g.diagnostics()}));}
    diagnostic=Instant::now();
   }
  }
 });
 let mut retry_seconds=1u64;
 while !stop.load(Ordering::Relaxed){
  let previous_work=stats.work.load(Ordering::Relaxed);
  if let Err(err)=protocol::session(a.pool_url.as_deref().unwrap(),a.payout_address.as_deref().unwrap(),&a.worker,a.audit_url.as_deref(),engine.clone(),stats.clone(),stop.clone()).await{emit(json!({"type":"error","message":err.to_string()}));}
  if stats.work.load(Ordering::Relaxed)>previous_work {retry_seconds=1;}
  if !stop.load(Ordering::Relaxed){emit(json!({"type":"status","message":format!("Reconnecting in {retry_seconds}s")}));}
  for _ in 0..retry_seconds*10 {if stop.load(Ordering::Relaxed){break}tokio::time::sleep(Duration::from_millis(100)).await;}
  retry_seconds=(retry_seconds*2).min(15);
 }
 reporter.await?;Ok(())
}
#[tokio::main]async fn main(){tracing_subscriber::fmt().with_ansi(false).with_writer(std::io::stderr).with_env_filter("warn").init();if let Err(e)=run().await{emit(json!({"type":"fatal","message":e.to_string()}));std::process::exit(1)}}
