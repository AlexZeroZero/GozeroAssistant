use gozero_blocknet_core::{Engine,Worker,hex,unhex,meets_target,HEADER_BYTES};
use serde::Deserialize;
use serde_json::json;
use std::{io::{self,BufRead,Write},sync::{Arc,Barrier},time::Instant};

fn emit(value: serde_json::Value) { println!("{value}"); io::stdout().flush().ok(); }
fn sample_header(seed:u64)->[u8;HEADER_BYTES] {
    let mut out=[0u8;HEADER_BYTES];
    let mut x=seed;
    for b in &mut out { x=x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407); *b=(x>>32) as u8; }
    out
}
fn verify() -> Result<(),String> {
    gozero_blocknet_core::ensure_memory_budget(1)?;
    // Full consensus-sized hashes, including nonce endian/overflow boundaries.
    for (seed,nonce) in [(1,0),(2,1),(3,0x0102030405060708),(4,u64::MAX)] {
        let header=sample_header(seed);
        let expected=Worker::new(Engine::Official)?.hash(&header,nonce)?;
        for engine in [Engine::Stream,Engine::Reuse,Engine::Sse2,Engine::Avx2,Engine::Gozero,Engine::Prefetch,Engine::Avx512,Engine::Gozero512,Engine::Prefetch512] {
            if !engine.supported(){emit(json!({"event":"skipped","engine":format!("{engine:?}"),"reason":"CPU/OS lacks AVX-512F"}));continue;}
            let mut w=Worker::new(engine)?;
            if w.hash(&header,nonce)?!=expected {return Err(format!("hash mismatch: {engine:?}, nonce {nonce}"));}
            // Overwrite memory with an unrelated job then reuse it for the
            // original job, detecting reads of stale scratch memory.
            w.hash(&sample_header(seed+100),nonce.wrapping_add(7))?;
            if w.hash(&header,nonce)?!=expected {return Err(format!("reuse mismatch: {engine:?}"));}
            emit(json!({"event":"verified","engine":format!("{engine:?}"),"nonce":nonce.to_string(),"header":hex(&header),"hash":hex(&expected),"memoryKiB":2097152}));
        }
    }
    emit(json!({"event":"verification_passed","vectors":4,"engineComparisons":if Engine::Avx512.supported(){36}else{24},"fullSize":true}));
    Ok(())
}
fn bench(engine:Engine,threads:usize,count:usize)->Result<(),String> {
    if threads==0 || threads>8 || count<2 || count>100 {return Err("bench: threads 1..8, hashes per thread 2..100".into());}
    gozero_blocknet_core::ensure_memory_budget(threads)?;
    let barrier=Arc::new(Barrier::new(threads));
    let mut handles=vec![];
    // Guard in launcher additionally checks free physical memory before launch.
    for id in 0..threads {
        let barrier=barrier.clone();
        handles.push(std::thread::spawn(move || -> Result<serde_json::Value,String> {
            let init=Instant::now();
            let worker=Worker::new(engine);
            // Do not strand peers at the barrier if allocation failed.
            let mut warm=None;
            let mut worker=worker.map(|mut w|{let r=w.hash(&sample_header(id as u64+50),0);warm=Some(r);w});
            let init_ms=init.elapsed().as_secs_f64()*1000.;
            barrier.wait();
            let w=worker.as_mut().map_err(|e|e.clone())?;
            warm.unwrap()?;
            let started=Instant::now();
            let mut durations=vec![];let mut hashes=vec![];
            for n in 0..count {
                let t=Instant::now();
                hashes.push(hex(&w.hash(&sample_header(0x1234+id as u64),n as u64)?));
                durations.push(t.elapsed().as_secs_f64());
            }
            let elapsed=started.elapsed().as_secs_f64();
            Ok(json!({"worker":id,"setupWarmupMs":init_ms,"seconds":elapsed,"hashes":hashes,"hashSeconds":durations}))
        }));
    }
    let mut rows=vec![];
    for h in handles {rows.push(h.join().map_err(|_|"worker panicked")??);}
    let seconds=rows.iter().map(|r|r["seconds"].as_f64().unwrap()).fold(0.,f64::max);
    emit(json!({"event":"benchmark","requestedEngine":format!("{engine:?}"),"engine":format!("{:?}",engine.resolved()),"threads":threads,"hashes":count*threads,"seconds":seconds,"hashrate":(count*threads) as f64/seconds,"memoryKiBPerWorker":2097152,"warmupExcluded":true,"workers":rows}));
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Job { id:String, header:String, nonce:String, target:Option<String> }
fn worker(engine:Engine,pages:bool,binding:Option<(u16,u8)>)->Result<(),String> {
    let placement=gozero_blocknet_core::platform::configure(pages,binding);
    gozero_blocknet_core::ensure_memory_budget(1)?;
    let mut w=Worker::new(engine)?;
    emit(json!({"event":"ready","engine":format!("{:?}",engine.resolved()),"memoryKiB":2097152,"version":env!("CARGO_PKG_VERSION"),"placement":placement,"memory":gozero_blocknet_core::platform::memory_info()}));
    let input=io::stdin();let mut input=input.lock();
    loop {
        // Bounded input lines, no wallets or API tokens in the compute process.
        let mut data=Vec::new();
        let n=std::io::Read::take(&mut input,4097).read_until(b'\n',&mut data).map_err(|e|e.to_string())?;
        if n==0 {return Ok(());}
        if n>4096 {return Err("job exceeds 4096 bytes".into());}
        let result=(||->Result<serde_json::Value,String> {
            let job:Job=serde_json::from_slice(&data).map_err(|e|e.to_string())?;
            if job.id.len()>128{return Err("job id too long".into());}
            let header=unhex::<HEADER_BYTES>(&job.header)?;
            let nonce=job.nonce.parse::<u64>().map_err(|_|"nonce must be a decimal uint64 string")?;
            let target=job.target.as_deref().map(unhex::<32>).transpose()?;
            let t=Instant::now();let h=w.hash(&header,nonce)?;
            Ok(json!({"event":"hash","id":job.id,"nonce":job.nonce,"hash":hex(&h),"seconds":t.elapsed().as_secs_f64(),"meetsTarget":target.map(|v|meets_target(&h,&v))}))
        })();
        match result {Ok(v)=>emit(v),Err(e)=>emit(json!({"event":"error","message":e}))}
    }
}
fn run()->Result<(),String> {
    let args:Vec<_>=std::env::args().skip(1).collect();
    let arg=|n|args.get(n).map(String::as_str).unwrap_or("");
    match arg(0) {
        "--info"=>{emit(gozero_blocknet_core::platform::info());Ok(())},
        "--version"=>{emit(json!({"name":"Gozero Blocknet experimental CPU core","version":env!("CARGO_PKG_VERSION"),"avx2":std::is_x86_feature_detected!("avx2"),"miningProtocol":"external JSON-lines work only"}));Ok(())},
        "verify"=>verify(),
        "bench"=>bench(Engine::parse(arg(1))?,arg(2).parse().map_err(|_|"missing thread count")?,arg(3).parse().map_err(|_|"missing hashes per worker")?),
        "worker"=>{
            let pages=match arg(2){""|"auto"=>true,"off"=>false,_=>return Err("pages must be auto/off".into())};
            let binding=if arg(3).is_empty()&&arg(4).is_empty(){None}else{Some((arg(3).parse::<u16>().map_err(|_|"invalid processor group")?,arg(4).parse::<u8>().map_err(|_|"invalid logical processor")?))};
            worker(Engine::parse(arg(1))?,pages,binding)
        },
        _=>Err("Commands: --version | verify | bench ENGINE THREADS HASHES | worker ENGINE. No network or mining starts by default.".into())
    }
}
fn main(){if let Err(e)=run(){eprintln!("{}",json!({"event":"fatal","message":e}));std::process::exit(1);}}
