use gozero_mds_core::core::{gpu_mining::GpuMiner, hybrid_mining::HybridMiner,
    extension::{create_extension, MiningResult}};
use std::sync::{Arc, atomic::{AtomicBool, AtomicU64, Ordering}};
use std::time::{Duration,Instant};

#[test]
#[ignore = "requires actual Metal GPU; full production round count"]
fn both_domains_verify_switch_jobs_and_stop_without_orphans() {
    let miner=HybridMiner::new(GpuMiner::new_index(0).unwrap(),2);
    for header in [[0x37;32],[0x93;32]] {
        let cancel=Arc::new(AtomicBool::new(false));let count=Arc::new(AtomicU64::new(0));
        let start=Instant::now();let stop=cancel.clone();
        let (done,wait)=std::sync::mpsc::channel::<()>();
        let timer=std::thread::spawn(move || {if wait.recv_timeout(Duration::from_secs(60)).is_err(){stop.store(true,Ordering::Relaxed);}});
        let mut gpu=0;let mut cpu=0;let mut seen=std::collections::HashSet::new();
        let mut pool=[255;32];pool[0]=31; // 1/8: exercise both full pipelines.
        miner.mine_stream(header,[0;32],Some(pool),cancel.clone(),count.clone(),|hit| {
            let proof=match hit{MiningResult::Share(x)=>x,MiningResult::Block(_)=>panic!("zero target cannot win")};
            assert!(seen.insert(proof.nonce),"duplicate proof");
            assert!(proof.final_hash<pool);
            assert_eq!(proof.final_hash,create_extension(header,proof.nonce).final_hash);
            if proof.nonce>>63==1{cpu+=1}else{gpu+=1};
            gpu<2||cpu<2
        });
        let _=done.send(());timer.join().unwrap();
        assert!(gpu>=2&&cpu>=2,"GPU {gpu}, CPU {cpu}");
        assert!(start.elapsed()<Duration::from_secs(60));
        assert!(cancel.load(Ordering::Relaxed));
        let before=(count.load(Ordering::Relaxed),miner.cpu_work.load(Ordering::Relaxed));
        std::thread::sleep(Duration::from_millis(250));
        assert_eq!(before,(count.load(Ordering::Relaxed),miner.cpu_work.load(Ordering::Relaxed)));
    }
    let start=Instant::now();
    miner.mine_stream([0;32],[0;32],None,Arc::new(AtomicBool::new(true)),Arc::new(AtomicU64::new(0)),|_|panic!("pre-cancelled job emitted"));
    assert!(start.elapsed()<Duration::from_secs(1));
    let stop=Arc::new(AtomicBool::new(false));let signal=stop.clone();
    let count=Arc::new(AtomicU64::new(0));
    let timer=std::thread::spawn(move || {std::thread::sleep(Duration::from_millis(500));signal.store(true,Ordering::Relaxed);});
    let start=Instant::now();
    miner.mine_stream([0x55;32],[0;32],None,stop,count.clone(),|_|panic!("zero target cannot win"));
    timer.join().unwrap();assert!(start.elapsed()<Duration::from_secs(3));
    let snapshot=(count.load(Ordering::Relaxed),miner.cpu_work.load(Ordering::Relaxed));
    std::thread::sleep(Duration::from_millis(200));
    assert_eq!(snapshot,(count.load(Ordering::Relaxed),miner.cpu_work.load(Ordering::Relaxed)));
}
