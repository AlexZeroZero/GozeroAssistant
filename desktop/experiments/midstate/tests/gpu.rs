use gozero_mds_core::core::gpu_mining::GpuMiner;

#[test]
#[ignore = "requires a hardware GPU; run explicitly with --ignored"]
fn full_chain_and_candidate_capacity() {
    let miner = GpuMiner::new_index(0).unwrap();
    miner.self_test().unwrap();
    miner.candidate_self_test().unwrap();
}

#[test]
#[ignore = "requires a hardware GPU; run explicitly with --ignored and --test-threads=1"]
fn pipeline_verifies_and_cancels_across_jobs() {
    use std::sync::{Arc, atomic::{AtomicBool, AtomicU64, Ordering}};
    use gozero_mds_core::core::extension::{create_extension, MiningResult};
    let miner = GpuMiner::new_index(0).unwrap();
    for header in [[0x37; 32], [0x93; 32]] {
        let cancel = Arc::new(AtomicBool::new(false));
        let count = Arc::new(AtomicU64::new(0));
        let mut received = 0;
        let stop = cancel.clone();
        let (done, wait) = std::sync::mpsc::channel::<()>();
        let timer = std::thread::spawn(move || {
            if wait.recv_timeout(std::time::Duration::from_secs(40)).is_err() { stop.store(true, Ordering::Relaxed); }
        });
        miner.mine_gpu_stream(header, [0; 32], Some([255; 32]), cancel.clone(), count, |hit| {
            let proof = match hit { MiningResult::Block(p) | MiningResult::Share(p) => p };
            assert_eq!(proof.final_hash, create_extension(header, proof.nonce).final_hash);
            received += 1;
            received < 3
        });
        let _ = done.send(());timer.join().unwrap();
        assert_eq!(received, 3);
        assert!(cancel.load(Ordering::Relaxed));
    }
}
