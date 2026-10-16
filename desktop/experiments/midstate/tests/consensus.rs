use gozero_mds_core::core::{extension::create_extension, simd_mining, types::EXTENSION_ITERATIONS};
use gozero_mds_core::core::{extension::MiningResult, gpu_mining::verify_gpu_candidates};
use std::sync::atomic::{AtomicBool, Ordering};
use gozero_mds_core::core::gpu_mining::verify_gpu_candidates_with_threads;

fn describe(result: MiningResult) -> (bool, u64, [u8; 32]) {
    match result { MiningResult::Block(x)=>(true,x.nonce,x.final_hash), MiningResult::Share(x)=>(false,x.nonce,x.final_hash) }
}

#[test]
fn gpu_candidate_verification_matches_scalar_with_tails_and_rejected_candidates() {
    let midstate = [0x73;32];
    let lanes = simd_mining::detected_level().lanes();
    let nonces: Vec<u64> = (0..lanes*8+3).map(|i| u64::MAX-i as u64).collect();
    let scalar: Vec<_> = nonces.iter().map(|n| create_extension(midstate,*n)).collect();
    let target = scalar[lanes].final_hash; // equality must not pass the strict target check
    let never = AtomicBool::new(false);
    for length in [0,1,2,lanes-1,lanes,lanes+1,lanes*4+1,nonces.len()] {
        for pool in [None,Some([255;32])] {
            let expected: Vec<_> = scalar[..length].iter().filter_map(|x| {
                if x.final_hash<target {Some((true,x.nonce,x.final_hash))}
                else if pool.is_some_and(|p|x.final_hash<p) {Some((false,x.nonce,x.final_hash))} else {None}
            }).collect();
            for threads in [1,2,4] {
                let actual=verify_gpu_candidates_with_threads(midstate,&nonces[..length],target,pool,&never,threads).unwrap();
                assert_eq!(actual.into_iter().map(describe).collect::<Vec<_>>(),expected);
            }
        }
    }
    never.store(true,Ordering::Relaxed);
    assert!(verify_gpu_candidates(midstate,&nonces,target,Some([255;32]),&never).is_none());
    for threads in [1,2,4] {
        assert!(verify_gpu_candidates_with_threads(midstate,&nonces,target,None,&never,threads).is_none());
    }
}

// Exercise the optimized SIMD path against the canonical scalar implementation
// with the production chain length (never the fast-mining test feature).
#[test]
fn full_chain_simd_matches_scalar_for_boundaries_and_distinct_inputs() {
    assert_eq!(EXTENSION_ITERATIONS, 1_000_000);
    let lanes = simd_mining::detected_level().lanes();
    let edge = [0, 1, u32::MAX as u64, 1u64 << 32, (1u64 << 32) + 1,
                0x0123456789abcdef, u64::MAX - 1, u64::MAX];
    for midstate in [[0u8; 32], [0xffu8; 32], std::array::from_fn(|i| (i * 7 + 3) as u8)] {
        let nonces: Vec<u64> = (0..lanes).map(|i| edge[i % edge.len()]).collect();
        let actual = simd_mining::mine_batch(midstate, &nonces);
        assert_eq!(actual.len(), lanes);
        for ((nonce, hash), expected_nonce) in actual.iter().zip(nonces) {
            assert_eq!(*nonce, expected_nonce);
            assert_eq!(*hash, create_extension(midstate, expected_nonce).final_hash,
                       "full-chain mismatch at nonce {expected_nonce}");
        }
    }
}
