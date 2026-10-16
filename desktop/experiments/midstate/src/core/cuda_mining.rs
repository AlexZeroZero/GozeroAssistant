//! Native CUDA fixed-input BLAKE3 backend. Same million-round consensus chain.
//! CUDA only proposes nonces; the shared CPU verifier checks every candidate.
use super::{extension::{create_extension, MiningResult}, gpu_mining::verify_gpu_candidates, types::EXTENSION_ITERATIONS};
use anyhow::{anyhow, ensure, Result};
use std::{ffi::{c_void,c_char,CString}, sync::{Arc,Mutex,atomic::{AtomicBool,AtomicU64,Ordering}}, time::{Instant,Duration}};
use libloading::Library;
use super::cuda_budget::Budget;
type Ptr=*mut c_void;
type Code=i32;
fn check(code:Code)->Result<()> {ensure!(code==0,"CUDA driver error {code}");Ok(())}
struct Driver {
    set:unsafe extern "system" fn(Ptr)->Code,
    destroy:unsafe extern "system" fn(Ptr)->Code,
    alloc:unsafe extern "system" fn(*mut u64,usize)->Code,
    upload:unsafe extern "system" fn(u64,*const c_void,usize)->Code,
    download:unsafe extern "system" fn(*mut c_void,u64,usize)->Code,
    launch:unsafe extern "system" fn(Ptr,u32,u32,u32,u32,u32,u32,u32,Ptr,*mut Ptr,*mut Ptr)->Code,
    sync:unsafe extern "system" fn()->Code,
    _library:Library,
}
struct Device {
    driver:Driver, context:Ptr, function:Ptr, state:u64,
}
// All CUDA operations are serialized by CudaMiner.device. Each entry binds the
// owned context to the calling thread; no pointers escape this module.
unsafe impl Send for Device {}
impl Drop for Device {
    fn drop(&mut self) {unsafe {if !self.context.is_null(){(self.driver.set)(self.context);(self.driver.destroy)(self.context);}}}
}
fn driver_path()->Result<std::path::PathBuf> {
    #[cfg(windows)] {
        #[link(name="kernel32")] extern "system" {fn GetSystemDirectoryW(buffer:*mut u16,len:u32)->u32;}
        let mut buf=[0u16;32768];let n=unsafe{GetSystemDirectoryW(buf.as_mut_ptr(),buf.len() as u32)} as usize;
        ensure!(n>0&&n<buf.len(),"Cannot locate Windows system directory");
        Ok(std::path::PathBuf::from(String::from_utf16(&buf[..n])?).join("nvcuda.dll"))
    }
    #[cfg(not(windows))] {Ok("libcuda.so.1".into())}
}
pub struct CudaMiner {
    device:Mutex<Device>,name:String,batch:u32,chunk:u32,block:u32,duty:f32,
    compute_ns:AtomicU64,transfer_ns:AtomicU64,verify_ns:AtomicU64,complete:AtomicU64,
    pacing_ns:AtomicU64,backpressure_ns:AtomicU64,sm_count:i32,resident_blocks:i32,
    tuning:Vec<serde_json::Value>,
    registers:i32,local_bytes:i32,unroll:u32,
}
impl CudaMiner {
    pub fn new(index:usize,duty:f32,batch:u32,chunk:u32,block:u32)->Result<Self> {
        Self::new_with_unroll(index,duty,batch,chunk,block,0)
    }
    pub fn new_with_unroll(index:usize,duty:f32,batch:u32,chunk:u32,block:u32,unroll:u32)->Result<Self> {
        ensure!(duty.is_finite()&&(0.1..=1.0).contains(&duty),"invalid CUDA duty");
        ensure!(batch==0||(64..=65536).contains(&batch),"CUDA batch must be 0 (auto) or 64..65536");
        ensure!(chunk<=32000,"CUDA dispatch must be 0 (auto) or 1..32000");
        ensure!([0,32,64,128,256].contains(&block),"invalid CUDA block size (0 = auto)");
        ensure!([0,1,2,4,8].contains(&unroll),"CUDA unroll must be 0 (auto), 1, 2, 4 or 8");
        let auto_block=block==0;let auto_chunk=chunk==0;
        let mut block=if auto_block{128}else{block};
        let mut chunk=if auto_chunk{4000}else{chunk};
        unsafe {
            let lib=Library::new(driver_path()?)?;
            macro_rules! load {($n:literal,$t:ty)=>{*lib.get::<$t>(concat!($n,"\0").as_bytes())?}}
            check(load!("cuInit",unsafe extern "system" fn(u32)->Code)(0))?;
            let mut dev=0;check(load!("cuDeviceGet",unsafe extern "system" fn(*mut i32,i32)->Code)(&mut dev,i32::try_from(index)?))?;
            let attr=load!("cuDeviceGetAttribute",unsafe extern "system" fn(*mut i32,i32,i32)->Code);
            let mut major=0;check(attr(&mut major,75,dev))?;ensure!(major>=8,"CUDA backend requires compute capability 8.0+ (RTX 30/40/50); use --backend gpu on older hardware");
            let mut sm_count=0;check(attr(&mut sm_count,16,dev))?;ensure!(sm_count>0,"invalid CUDA SM count");
            let mut name=[0i8;256];check(load!("cuDeviceGetName",unsafe extern "system" fn(*mut c_char,i32,i32)->Code)(name.as_mut_ptr(),256,dev))?;
            let name=std::ffi::CStr::from_ptr(name.as_ptr()).to_string_lossy().into_owned();
            let create=load!("cuCtxCreate_v2",unsafe extern "system" fn(*mut Ptr,u32,i32)->Code);
            let module_load=load!("cuModuleLoadData",unsafe extern "system" fn(*mut Ptr,*const c_void)->Code);
            let get_function=load!("cuModuleGetFunction",unsafe extern "system" fn(*mut Ptr,Ptr,*const c_char)->Code);
            let get_attr=load!("cuFuncGetAttribute",unsafe extern "system" fn(*mut i32,i32,Ptr)->Code);
            let occupancy=load!("cuOccupancyMaxActiveBlocksPerMultiprocessor",unsafe extern "system" fn(*mut i32,Ptr,i32,usize)->Code);
            let driver=Driver{set:load!("cuCtxSetCurrent",unsafe extern "system" fn(Ptr)->Code),
                destroy:load!("cuCtxDestroy_v2",unsafe extern "system" fn(Ptr)->Code),
                alloc:load!("cuMemAlloc_v2",unsafe extern "system" fn(*mut u64,usize)->Code),
                upload:load!("cuMemcpyHtoD_v2",unsafe extern "system" fn(u64,*const c_void,usize)->Code),
                download:load!("cuMemcpyDtoH_v2",unsafe extern "system" fn(*mut c_void,u64,usize)->Code),
                launch:load!("cuLaunchKernel",unsafe extern "system" fn(Ptr,u32,u32,u32,u32,u32,u32,u32,Ptr,*mut Ptr,*mut Ptr)->Code),
                sync:load!("cuCtxSynchronize",unsafe extern "system" fn()->Code),_library:lib};
            let mut d=Device{driver,context:std::ptr::null_mut(),function:std::ptr::null_mut(),state:0};
            // Blocking synchronization avoids consuming a CPU core while waiting.
            check(create(&mut d.context,4,dev))?;
            let mut module=std::ptr::null_mut();
            check(module_load(&mut module,include_bytes!("../../cuda/mds.ptx").as_ptr().cast()))?;
            let mut variants=Vec::new();
            for factor in [1,2,4,8] {let mut f=std::ptr::null_mut();check(get_function(&mut f,module,CString::new(format!("mds_step_u{factor}"))?.as_ptr()))?;variants.push((factor,f));}
            check((d.driver.alloc)(&mut d.state,65536*32))?;
            let mut tuning=Vec::new();
            let chosen_unroll=if unroll==0 {
                let n=if batch==0{(sm_count as u32*512).clamp(4096,65536)}else{batch};
                let mut times=[0.0;4];
                for pass in 0..2 {for j in 0..4 {let i=if pass==0{j}else{3-j};d.function=variants[i].1;times[i]+=Self::probe(&mut d,n,block,chunk,duty)?;}}
                let rates:Vec<_>=times.iter().map(|s|n as f64*chunk as f64*16.0/1_000_000.0/s).collect();
                let fastest=rates.iter().copied().fold(0.0,f64::max);
                let i=if rates[2]>=fastest*0.99 {2} else {(0..4).max_by(|&a,&b|rates[a].total_cmp(&rates[b])).unwrap()};
                for j in 0..4 {tuning.push(serde_json::json!({"stage":"kernel","unroll":variants[j].0,"batch":n,"probeComputeNps":rates[j],"preferred":i==j}));}
                variants[i].0
            }else{unroll};
            d.function=variants.iter().find(|(u,_)|*u==chosen_unroll).unwrap().1;
            if auto_block {
                let n=if batch==0{(sm_count as u32*512).clamp(4096,65536)}else{batch};
                let choices=[64,128,256];let mut times=[0.0;3];
                for pass in 0..2 {for j in 0..3 {let i=if pass==0{j}else{2-j};times[i]+=Self::probe(&mut d,n,choices[i],chunk,duty)?;}}
                let rates:Vec<_>=times.iter().map(|s|n as f64*chunk as f64*16.0/1_000_000.0/s).collect();
                let fastest=rates.iter().copied().fold(0.0,f64::max);
                let selected=if rates[1]>=fastest*0.97{1}else{(0..3).max_by(|&a,&b|rates[a].total_cmp(&rates[b])).unwrap()};
                block=choices[selected];
                for i in 0..3 {tuning.push(serde_json::json!({"stage":"block","block":choices[i],"probeComputeNps":rates[i],"preferred":i==selected}));}
            }
            let(mut registers,mut local_bytes)=(0,0);check(get_attr(&mut registers,4,d.function))?;check(get_attr(&mut local_bytes,3,d.function))?;
            let mut resident_blocks=0;
            check(occupancy(&mut resident_blocks,d.function,block as i32,0))?;
            let(batch,geometry)=if batch==0{Self::tune(&mut d,sm_count as u32,block,chunk,duty)?}else{(batch,Vec::new())};tuning.extend(geometry);
            if auto_chunk {
                let choices=[4000,8000,16000,32000];let mut times=[0.0;4];
                for pass in 0..2 {for j in 0..4 {let i=if pass==0{j}else{3-j};times[i]+=Self::probe(&mut d,batch,block,choices[i],duty)?;}}
                let rates:Vec<_>=times.iter().enumerate().map(|(i,s)|batch as f64*choices[i] as f64*16.0/1_000_000.0/s).collect();
                chunk=select_dispatch(&choices,&rates,&times);
                for i in 0..4 {tuning.push(serde_json::json!({"stage":"dispatch","iterations":choices[i],"probeComputeNps":rates[i],"meanDispatchMs":times[i]*1000.0/16.0,"preferred":chunk==choices[i]}));}
            }
            Ok(Self{device:Mutex::new(d),name,batch,chunk,block,duty,compute_ns:AtomicU64::new(0),transfer_ns:AtomicU64::new(0),verify_ns:AtomicU64::new(0),complete:AtomicU64::new(0),pacing_ns:AtomicU64::new(0),backpressure_ns:AtomicU64::new(0),sm_count,resident_blocks,tuning,registers,local_bytes,unroll:chosen_unroll})
        }
    }
    pub fn diagnostics(&self)->serde_json::Value {
        serde_json::json!({"backend":"cuda","device":self.name,"batchNonces":self.batch,
            "itersPerDispatch":self.chunk,"workgroupSize":self.block,"duty":self.duty,
            "chainUnroll":self.unroll,"smCount":self.sm_count,"residentBlocksPerSm":self.resident_blocks,
            "gridBlocks":self.batch.div_ceil(self.block),"tuning":self.tuning,
            "registersPerThread":self.registers,"localBytesPerThread":self.local_bytes,
            "computeSeconds":self.compute_ns.load(Ordering::Relaxed) as f64/1e9,
            "pacingSeconds":self.pacing_ns.load(Ordering::Relaxed) as f64/1e9,
            "verificationBackpressureSeconds":self.backpressure_ns.load(Ordering::Relaxed) as f64/1e9,
            "transferSeconds":self.transfer_ns.load(Ordering::Relaxed) as f64/1e9,
            "verificationSeconds":self.verify_ns.load(Ordering::Relaxed) as f64/1e9,
            "completedBatchNonces":self.complete.load(Ordering::Relaxed)})
    }
    // Short, local startup probes use the exact embedded kernel. They do not
    // create shares, count as mining work, modify clocks, or persist a result
    // from one GPU/driver onto another. Keep explicit batch overrides usable.
    fn tune(d:&mut Device,sm:u32,block:u32,chunk:u32,duty:f32)->Result<(u32,Vec<serde_json::Value>)> {
        let candidates=batch_candidates(sm,block);
        let mut seconds=vec![0.0;candidates.len()];
        for pass in 0..2 {
            for j in 0..candidates.len() {
                let index=if pass==0{j}else{candidates.len()-1-j};
                seconds[index]+=Self::probe(d,candidates[index],block,chunk,duty)?;
            }
        }
        let rates:Vec<_>=candidates.iter().zip(&seconds).map(|(&n,&s)|n as f64*chunk as f64*16.0/1_000_000.0/s).collect();
        let chosen=select_batch(&candidates,&rates);
        let rows=candidates.iter().zip(&rates).map(|(&n,&r)|serde_json::json!({"stage":"geometry","batch":n,"probeComputeNps":r,"selected":n==chosen})).collect();
        Ok((chosen,rows))
    }
    fn probe(d:&mut Device,mut n:u32,block:u32,mut chunk:u32,duty:f32)->Result<f64> {
        let initial=vec![0x93u8;n as usize*32];let mut ptr=d.state;
        unsafe{check((d.driver.upload)(d.state,initial.as_ptr().cast(),initial.len()))?;}
        let mut args=[(&mut ptr as *mut u64).cast(),(&mut n as *mut u32).cast(),(&mut chunk as *mut u32).cast()];
        let mut budget=Budget::new();let cancel=AtomicBool::new(false);let mut seconds=0.0;
        for iteration in 0..9 {
            let start=Instant::now();
            unsafe{check((d.driver.launch)(d.function,n.div_ceil(block),1,1,block,1,1,0,std::ptr::null_mut(),args.as_mut_ptr(),std::ptr::null_mut()))?;check((d.driver.sync)())?;}
            let elapsed=start.elapsed();if iteration>0{seconds+=elapsed.as_secs_f64();}
            budget.pace(elapsed,duty,&cancel);
        }
        Ok(seconds)
    }
    // The first 40-byte compression uses the upstream blake3 crate. GPU state
    // uses SoA for coalesced checkpoint transfers; all subsequent rounds stay
    // in scalar registers within a dispatch.
    fn hashes(&self,d:&mut Device,header:[u8;32],base:u64,n:u32,cancel:&AtomicBool,counter:&AtomicU64,throttle:bool)->Result<Option<Vec<[u8;32]>>> {
        let begin=Instant::now();let mut states=vec![0u32;n as usize*8];
        let mut input=[0u8;40];input[..32].copy_from_slice(&header);
        for i in 0..n {input[32..].copy_from_slice(&base.wrapping_add(i as u64).to_le_bytes());let hash=blake3::hash(&input);
            for w in 0..8 {states[w*n as usize+i as usize]=u32::from_le_bytes(hash.as_bytes()[w*4..w*4+4].try_into().unwrap());}}
        unsafe{check((d.driver.upload)(d.state,states.as_ptr().cast(),states.len()*4))?;}
        self.transfer_ns.fetch_add(begin.elapsed().as_nanos() as u64,Ordering::Relaxed);
        let mut done=0u64;let mut budget=Budget::new();
        while done<EXTENSION_ITERATIONS {
            if cancel.load(Ordering::Relaxed){return Ok(None)}
            let mut k=(EXTENSION_ITERATIONS-done).min(self.chunk as u64) as u32;let mut count=n;let mut ptr=d.state;
            let mut args=[(&mut ptr as *mut u64).cast(),(&mut count as *mut u32).cast(),(&mut k as *mut u32).cast()];
            let start=Instant::now();
            unsafe{check((d.driver.launch)(d.function,n.div_ceil(self.block),1,1,self.block,1,1,0,std::ptr::null_mut(),args.as_mut_ptr(),std::ptr::null_mut()))?;check((d.driver.sync)())?;}
            let elapsed=start.elapsed();self.compute_ns.fetch_add(elapsed.as_nanos() as u64,Ordering::Relaxed);
            if throttle {self.pacing_ns.fetch_add(budget.pace(elapsed,self.duty,cancel).as_nanos() as u64,Ordering::Relaxed);}
            counter.fetch_add(n as u64*(done+k as u64)/EXTENSION_ITERATIONS-n as u64*done/EXTENSION_ITERATIONS,Ordering::Relaxed);
            done+=k as u64;
        }
        let start=Instant::now();unsafe{check((d.driver.download)(states.as_mut_ptr().cast(),d.state,states.len()*4))?;}
        let mut hashes=vec![[0u8;32];n as usize];
        for i in 0..n as usize {for w in 0..8 {hashes[i][w*4..w*4+4].copy_from_slice(&states[w*n as usize+i].to_le_bytes());}}
        self.transfer_ns.fetch_add(start.elapsed().as_nanos() as u64,Ordering::Relaxed);Ok(Some(hashes))
    }
    pub fn self_test(&self)->Result<()> {
        ensure!(EXTENSION_ITERATIONS==1_000_000,"fast-mining is forbidden");
        let mut d=self.device.lock().map_err(|_|anyhow!("CUDA device poisoned"))?;unsafe{check((d.driver.set)(d.context))?;}
        for (header,base,n) in [([0;32],0,8),([0xa5;32],u64::MAX-3,8),([0x93;32],0xabcdef0012345678,33)] {
            let actual=self.hashes(&mut d,header,base,n,&AtomicBool::new(false),&AtomicU64::new(0),false)?.unwrap();
            for (i,hash) in actual.iter().enumerate(){ensure!(*hash==create_extension(header,base.wrapping_add(i as u64)).final_hash,"CUDA full chain mismatch at {base}+{i}");}
        }
        self.compute_ns.store(0,Ordering::Relaxed);self.transfer_ns.store(0,Ordering::Relaxed);
        Ok(())
    }
    pub fn mine_stream<F:FnMut(MiningResult)->bool+Send>(&self,header:[u8;32],target:[u8;32],pool:Option<[u8;32]>,cancel:Arc<AtomicBool>,counter:Arc<AtomicU64>,mut output:F)->Result<()> {
        let mut d=self.device.lock().map_err(|_|anyhow!("CUDA device poisoned"))?;unsafe{check((d.driver.set)(d.context))?;}
        let(tx,rx)=std::sync::mpsc::sync_channel::<Vec<u64>>(1);
        std::thread::scope(|scope|->Result<()> {
            let stop=cancel.clone();
            let verifier=scope.spawn(move|| {
                while let Ok(candidates)=rx.recv(){
                    if stop.load(Ordering::Relaxed){break}
                    for slice in candidates.chunks(32){
                        let start=Instant::now();let hits=verify_gpu_candidates(header,slice,target,pool,&stop);
                        self.verify_ns.fetch_add(start.elapsed().as_nanos() as u64,Ordering::Relaxed);
                        let Some(hits)=hits else{return};
                        for hit in hits{if stop.load(Ordering::Relaxed)||!output(hit){stop.store(true,Ordering::Relaxed);return;}}
                    }
                    if !stop.load(Ordering::Relaxed){self.complete.fetch_add(self.batch as u64,Ordering::Relaxed);}
                }
            });
            let result=(||->Result<()> {
                while !cancel.load(Ordering::Relaxed){
                    let base=rand::random::<u64>();
                    let Some(hashes)=self.hashes(&mut d,header,base,self.batch,&cancel,&counter,true)? else{break};
                    let mut candidates:Vec<_>=hashes.iter().enumerate().filter(|(_,hash)|**hash<target||pool.is_some_and(|p|**hash<p)).map(|(i,_)|base.wrapping_add(i as u64)).collect();
                    let waiting=Instant::now();
                    loop {if cancel.load(Ordering::Relaxed){return Ok(())}
                        match tx.try_send(candidates){Ok(())=>break,Err(std::sync::mpsc::TrySendError::Full(c))=>{candidates=c;std::thread::sleep(Duration::from_millis(2));},Err(_)=>return Ok(())}
                    }
                    self.backpressure_ns.fetch_add(waiting.elapsed().as_nanos() as u64,Ordering::Relaxed);
                }Ok(())
            })();
            cancel.store(true,Ordering::Relaxed);drop(tx);
            verifier.join().map_err(|_|anyhow!("CUDA verifier panicked"))?;result
        })
    }
}

fn batch_candidates(sm:u32,block:u32)->Vec<u32> {
    let mut v=vec![16384];
    for threads in [256,512,768,1024] {v.push((sm.saturating_mul(threads).clamp(4096,65536)/block)*block);}
    v.sort_unstable();v.dedup();v
}
fn select_batch(candidates:&[u32],rates:&[f64])->u32 {
    let fastest=rates.iter().copied().fold(0.0,f64::max);
    // Prefer less stale-work latency when throughput differs by <=3%.
    candidates.iter().zip(rates).filter(|(_,r)|**r>=fastest*0.97).map(|(&n,_)|n).min().unwrap_or(16384)
}
fn select_dispatch(choices:&[u32],rates:&[f64],seconds:&[f64])->u32 {
    // Keep each measured launch near <=40ms for new-job/stop responsiveness.
    // A larger launch is useful only beyond measurement noise; prefer the
    // shortest within 3% of the best eligible rate. Baseline always available.
    let eligible:Vec<_>=(0..choices.len()).filter(|&i|choices[i]==4000||seconds[i]/16.0<=0.040).collect();
    let fastest=eligible.iter().map(|&i|rates[i]).fold(0.0,f64::max);
    eligible.into_iter().filter(|&i|rates[i]>=fastest*0.97).map(|i|choices[i]).min().unwrap_or(4000)
}
#[cfg(test)] mod tuning_tests {
    use super::*;
    #[test] fn scales_to_large_gpu_but_caps_batch_latency() {
        assert!(batch_candidates(82,128).contains(&41984));
        assert!(batch_candidates(128,128).contains(&65536));
        for sm in [1,26,82,128,10000] {for block in [32,64,128,256] {
            assert!(batch_candidates(sm,block).iter().all(|n|*n>=4096&&*n<=65536&&*n%block==0));
        }}
    }
    #[test] fn prefers_small_batch_only_within_three_percent() {
        assert_eq!(select_batch(&[16384,32768,65536],&[98.0,100.0,99.0]),16384);
        assert_eq!(select_batch(&[16384,32768,65536],&[80.0,99.0,100.0]),32768);
    }
    #[test] fn dispatch_rejects_slow_launches_and_small_unproven_gains() {
        assert_eq!(select_dispatch(&[4000,8000,16000,32000],&[100.0,102.0,105.0,110.0],&[0.10,0.20,0.40,0.80]),8000);
        assert_eq!(select_dispatch(&[4000,8000],&[100.0,102.0],&[0.1,0.2]),4000);
        assert_eq!(select_dispatch(&[4000,8000],&[100.0,150.0],&[0.8,1.0]),4000);
    }
}
