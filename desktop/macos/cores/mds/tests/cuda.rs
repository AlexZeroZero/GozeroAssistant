use gozero_mds_core::core::{cuda_mining::CudaMiner,extension::{create_extension,MiningResult}};
use std::sync::{Arc,atomic::{AtomicBool,AtomicU64,Ordering}};

#[test]
#[ignore="requires NVIDIA compute capability 8.0+ and recent CUDA driver"]
fn cuda_auto_batch_selftest_does_not_count_probe_work() {
    let miner=CudaMiner::new(0,0.5,0,0,0).unwrap();
    miner.self_test().unwrap();
    let d=miner.diagnostics();
    assert!(d["smCount"].as_u64().unwrap()>0);
    assert!(d["tuning"].as_array().unwrap().len()>=2);
    assert_eq!(d["tuning"].as_array().unwrap().iter().filter(|r|r["selected"]==true).count(),1);
    assert!(d["tuning"].as_array().unwrap().iter().any(|r|r["stage"]=="dispatch"));
    assert!(d["tuning"].as_array().unwrap().iter().any(|r|r["stage"]=="block"));
    assert_eq!(d["computeSeconds"],0.0);
    assert_eq!(d["completedBatchNonces"],0);
    assert_eq!(d["pacingSeconds"],0.0);
}

#[test]
#[ignore="requires NVIDIA compute capability 8.0+ and recent CUDA driver"]
fn cuda_unroll_remainder_matches_full_cpu_chain() {
    // 3999 is not a multiple of the four-way unroll. Also exercise a partial
    // workgroup and the final dispatch remainder of the million-round chain.
    for unroll in [1,2,4,8] {
        let miner=CudaMiner::new_with_unroll(0,0.6,65,3999,64,unroll).unwrap();
        miner.self_test().unwrap();
    }
}

#[test]
#[ignore="requires NVIDIA compute capability 8.0+ and recent CUDA driver"]
fn cuda_consensus_stream_and_cancel() {
    let miner=CudaMiner::new(0,0.6,64,2000,128).unwrap();
    miner.self_test().unwrap();
    for header in [[0x42;32],[0xb7;32]] {
        let stop=Arc::new(AtomicBool::new(false));let counter=Arc::new(AtomicU64::new(0));
        let mut hits=Vec::new();
        let timer_stop=stop.clone();let(tx,rx)=std::sync::mpsc::channel();
        let timer=std::thread::spawn(move||if rx.recv_timeout(std::time::Duration::from_secs(30)).is_err(){timer_stop.store(true,Ordering::Relaxed)});
        miner.mine_stream(header,[0;32],Some([255;32]),stop.clone(),counter.clone(),|hit| {
            let proof=match hit {MiningResult::Share(p)=>p,MiningResult::Block(_)=>panic!("zero block target cannot pass")};
            assert_eq!(proof.final_hash,create_extension(header,proof.nonce).final_hash);
            assert!(!hits.contains(&proof.nonce));hits.push(proof.nonce);hits.len()<3
        }).unwrap();
        let _=tx.send(());timer.join().unwrap();assert_eq!(hits.len(),3);assert!(stop.load(Ordering::Relaxed));assert!(counter.load(Ordering::Relaxed)>=64);
    }
    let stop=Arc::new(AtomicBool::new(true));let count=Arc::new(AtomicU64::new(0));
    miner.mine_stream([0;32],[255;32],None,stop,count.clone(),|_|panic!("cancelled job emitted a share")).unwrap();
    assert_eq!(count.load(Ordering::Relaxed),0);
}

#[test]
#[ignore="requires NVIDIA GPU"]
fn cuda_extended_dispatch_partial_groups_match_cpu() {
    for block in [64,256] {
        let miner=CudaMiner::new_with_unroll(0,0.6,65,32000,block,4).unwrap();
        miner.self_test().unwrap();
    }
}

#[test]
#[ignore="requires NVIDIA GPU"]
fn cuda_audit_conserves_completed_and_cancelled_work() {
    let miner=CudaMiner::new_with_unroll(0,0.9,10496,4000,128,4).unwrap();
    miner.self_test().unwrap();
    assert_eq!(miner.diagnostics()["gpuCompletedNonces"],0);
    let stop=Arc::new(AtomicBool::new(false));let count=Arc::new(AtomicU64::new(0));
    let c=stop.clone();let timer=std::thread::spawn(move||{
        std::thread::sleep(std::time::Duration::from_millis(2100));c.store(true,Ordering::Relaxed);
    });
    miner.mine_stream([0x42;32],[0;32],None,stop,count.clone(),|_|panic!("zero target hit")).unwrap();
    timer.join().unwrap();let d=miner.diagnostics();
    let complete=d["gpuCompletedNonces"].as_u64().unwrap();
    let partial=d["cancelledWorkEquivalentNonces"].as_u64().unwrap();
    assert!(complete>0);assert!(partial<10496);
    assert_eq!(count.load(Ordering::Relaxed),complete+partial);
    assert!(d["completedBatchNonces"].as_u64().unwrap()<=complete);
}
