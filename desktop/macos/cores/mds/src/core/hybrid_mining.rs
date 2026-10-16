//! One pool job, one cancellation token, and disjoint CPU/GPU nonce domains.
//! GPU candidates retain the existing full CPU verification path. CPU search
//! executes the same million-round NEON implementation checked at startup.
use super::{extension::MiningResult, gpu_mining::GpuMiner, simd_mining, types::Extension};
use std::sync::{Arc, atomic::{AtomicBool, AtomicU64, Ordering}, mpsc};
use std::time::Duration;

pub struct HybridMiner {
    pub gpu: GpuMiner,
    pub threads: usize,
    pub cpu_work: Arc<AtomicU64>,
}

// Reserve the upper half for CPU work. Align to eight so a SIMD batch cannot
// straddle the domain boundary. Every CPU worker shares one allocation cursor.
fn cpu_nonces(cursor: &AtomicU64, lanes: usize) -> [u64; 8] {
    let base = (cursor.fetch_add(8, Ordering::Relaxed) & 0x7fff_ffff_ffff_fff8)
        | 0x8000_0000_0000_0000;
    std::array::from_fn(|i| if i < lanes { base + i as u64 } else { 0 })
}

fn send_hit(tx: &mpsc::SyncSender<MiningResult>, mut hit: MiningResult, cancel: &AtomicBool) -> bool {
    loop {
        if cancel.load(Ordering::Relaxed) { return false; }
        match tx.try_send(hit) {
            Ok(()) => return true,
            Err(mpsc::TrySendError::Full(value)) => {
                hit = value;
                std::thread::sleep(Duration::from_millis(1));
            }
            Err(mpsc::TrySendError::Disconnected(_)) => return false,
        }
    }
}

// A failed producer must also stop its siblings and unblock the consumer.
struct CancelOnDrop(Arc<AtomicBool>);
impl Drop for CancelOnDrop {
    fn drop(&mut self) { self.0.store(true, Ordering::Relaxed); }
}


// CPU hashing workers can occupy every core. Keep the GPU's short submission
// and completion-poll work responsive under that load. This changes host
// scheduling only; GPU duty, nonce ranges and consensus work are unchanged.
fn prioritize_gpu_submission() {
    #[cfg(target_os = "macos")]
    {
        extern "C" { fn pthread_set_qos_class_self_np(class: u32, relative_priority: i32) -> i32; }
        const QOS_CLASS_USER_INITIATED: u32 = 0x19;
        // A scheduling hint is optional: failure must not stop mining.
        let result = unsafe { pthread_set_qos_class_self_np(QOS_CLASS_USER_INITIATED, 0) };
        if result != 0 { tracing::debug!(result, "GPU submission QoS unavailable; keeping system scheduling"); }
    }
}

impl HybridMiner {
    pub fn new(gpu: GpuMiner, threads: usize) -> Self {
        assert!((1..=8).contains(&threads));
        Self { gpu, threads, cpu_work: Arc::new(AtomicU64::new(0)) }
    }

    pub fn mine_stream<F: FnMut(MiningResult) -> bool + Send>(
        &self, header: [u8;32], target: [u8;32], pool: Option<[u8;32]>,
        cancel: Arc<AtomicBool>, gpu_counter: Arc<AtomicU64>, mut output: F,
    ) {
        if cancel.load(Ordering::Relaxed) { return; }
        let (tx, rx) = mpsc::sync_channel(8);
        let cursor = AtomicU64::new(rand::random::<u64>() & 0x7fff_ffff_ffff_fff8);
        std::thread::scope(|scope| {
            let _stop_on_unwind = CancelOnDrop(cancel.clone());
            let gpu_stop = cancel.clone();
            let gpu_tx = tx.clone();
            scope.spawn(move || {
                let _stop = CancelOnDrop(gpu_stop.clone());
                prioritize_gpu_submission();
                self.gpu.mine_gpu_stream_partitioned(header, target, pool, gpu_stop.clone(), gpu_counter,
                    |hit| send_hit(&gpu_tx, hit, &gpu_stop));
            });
            for _ in 0..self.threads {
                let stop = cancel.clone();
                let tx = tx.clone();
                let cursor = &cursor;
                scope.spawn(move || {
                    let _stop = CancelOnDrop(stop.clone());
                    let lanes = simd_mining::detected_level().lanes();
                    while !stop.load(Ordering::Relaxed) {
                        let nonces = cpu_nonces(cursor, lanes);
                        let results = simd_mining::mine_batch(header, &nonces[..lanes]);
                        self.cpu_work.fetch_add(lanes as u64, Ordering::Relaxed);
                        for (nonce, final_hash) in results {
                            if stop.load(Ordering::Relaxed) { return; }
                            let extension = Extension { nonce, final_hash };
                            let hit = if final_hash < target { Some(MiningResult::Block(extension)) }
                                else if pool.is_some_and(|p| final_hash < p) { Some(MiningResult::Share(extension)) }
                                else { None };
                            if let Some(hit) = hit { if !send_hit(&tx, hit, &stop) { return; } }
                        }
                    }
                });
            }
            drop(tx);
            while !cancel.load(Ordering::Relaxed) {
                match rx.recv_timeout(Duration::from_millis(20)) {
                    Ok(hit) => {
                        if cancel.load(Ordering::Relaxed) || !output(hit) { break; }
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => (),
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
            cancel.store(true, Ordering::Relaxed);
            // scope joins GPU, verifier and all CPU workers before a new job.
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nonce_domains_are_disjoint_including_wrap() {
        for start in [0, 8, u64::MAX - 7] {
            let cursor = AtomicU64::new(start);
            let a = cpu_nonces(&cursor, 8);
            let b = cpu_nonces(&cursor, 8);
            assert!(a.iter().chain(&b).all(|n| n >> 63 == 1));
            assert!(a.iter().all(|n| !b.contains(n)));
            assert!(a.windows(2).all(|w| w[1] == w[0]+1));
        }
    }
    #[test]
    fn full_output_queue_is_cancellable() {
        let (tx, _rx) = mpsc::sync_channel(0);
        let stop = Arc::new(AtomicBool::new(false));
        let signal = stop.clone();
        let timer = std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(30)); signal.store(true, Ordering::Relaxed); });
        assert!(!send_hit(&tx, MiningResult::Share(Extension { nonce:0, final_hash:[0;32] }), &stop));
        timer.join().unwrap();
    }
}
