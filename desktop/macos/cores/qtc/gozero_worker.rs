// Gozero Apple Silicon research bridge; uses the Apache-2.0 Quantus engine.
// Install as crates/engine-gpu/examples/gozero_worker.rs in the pinned source.
// Protocol: request-id header-hex difficulty-decimal start-nonce-hex count
// Responses are JSON lines. All GPU candidates are verified again on the CPU.
use engine_cpu::{AtomicBoolCancelCheck, EngineStatus, MinerEngine, Range};
use engine_gpu::GpuEngine;
use primitive_types::U512;
use std::io::{self, BufRead, Write};
use std::sync::atomic::AtomicBool;
use std::time::Instant;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();
    let engine = GpuEngine::try_new(1_048_576, 0, true)?;
    println!("{{\"ready\":true,\"backend\":\"wgpu-metal\",\"max_batch\":1048576}}");
    io::stdout().flush()?;
    let cancel = AtomicBool::new(false);
    for line in io::stdin().lock().lines() {
        let line = line?;
        let fields: Vec<_> = line.split_whitespace().collect();
        if fields.len() != 5 { return Err("expected five request fields".into()); }
        let id: u64 = fields[0].parse()?;
        let mut header = [0u8; 32];
        hex::decode_to_slice(fields[1], &mut header)?;
        let difficulty = U512::from_dec_str(fields[2])?;
        if difficulty.is_zero() { return Err("zero difficulty".into()); }
        if fields[3].len() != 128 { return Err("nonce must be 64 bytes".into()); }
        let start = U512::from_big_endian(&hex::decode(fields[3])?);
        let count: u64 = fields[4].parse()?;
        if count == 0 || count > 1_048_576 { return Err("count outside 1..1048576".into()); }
        let end = start.checked_add(U512::from(count - 1)).ok_or("nonce overflow")?;
        let ctx = engine.prepare_context(header, difficulty);
        let began = Instant::now();
        let status = engine.search_range(&ctx, Range { start, end }, &AtomicBoolCancelCheck(&cancel));
        let elapsed = began.elapsed().as_secs_f64();
        match status {
            EngineStatus::Found { candidate, hash_count, .. } => {
                let hash = pow_core::hash_from_nonce(&ctx, candidate.nonce);
                if hash != candidate.hash || hash >= ctx.target || candidate.nonce < start || candidate.nonce > end {
                    return Err("GPU candidate failed CPU verification".into());
                }
                println!("{{\"id\":{id},\"hashes\":{hash_count},\"seconds\":{elapsed},\"nonce\":\"{}\",\"hash\":\"{}\"}}",
                    hex::encode(candidate.nonce.to_big_endian()), hex::encode(hash.to_big_endian()));
            }
            EngineStatus::Exhausted { hash_count } => {
                println!("{{\"id\":{id},\"hashes\":{hash_count},\"seconds\":{elapsed}}}");
            }
            other => return Err(format!("engine failed: {other:?}").into()),
        }
        io::stdout().flush()?;
    }
    Ok(())
}
