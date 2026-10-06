//! Coverage of the enlarged dispatch, partial workgroups and nonce carries.
use engine_cpu::{AtomicBoolCancelCheck, EngineStatus, MinerEngine, Range};
use engine_gpu::GpuEngine;
use primitive_types::U512;
use std::sync::atomic::AtomicBool;

fn main() {
    let flag = AtomicBool::new(false);
    let cancel = AtomicBoolCancelCheck(&flag);
    let engine = GpuEngine::try_new(1_048_576, 0, true).expect("Metal required");
    let mut ctx = engine.prepare_context([42; 32], U512::one());
    ctx.target = U512::zero();
    for count in [1u64, 255, 257, 1_048_575, 1_048_576] {
        for end in [(U512::one() << 256) + U512::from(127), U512::MAX] {
            let start = end - U512::from(count - 1);
            match engine.search_range(&ctx, Range { start, end }, &cancel) {
                EngineStatus::Exhausted { hash_count } => assert_eq!(hash_count, count),
                other => panic!("unexpected result: {other:?}"),
            }
        }
    }
    for end in [(U512::one() << 256) + U512::from(127), U512::MAX] {
        let start = end - U512::from(1024);
        let (hash, nonce) = (0..1025u64).map(|offset| {
            let nonce = start + U512::from(offset);
            (pow_core::hash_from_nonce(&ctx, nonce), nonce)
        }).min().unwrap();
        ctx.target = hash + U512::one();
        match engine.search_range(&ctx, Range { start, end }, &cancel) {
            EngineStatus::Found { candidate, .. } => {
                assert_eq!(candidate.nonce, nonce);
                assert_eq!(candidate.hash, hash);
            },
            other => panic!("minimum hash missing: {other:?}"),
        }
    }
    println!("LARGE COVERAGE OK: 10 exhausted ranges and 2 CPU minima, including U512::MAX");
}
