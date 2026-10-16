Gozero MDS Apple Silicon port / Mac GUI 0.1.13

Midstate full 1,000,000-round BLAKE3 PoW. wgpu WGSL runs through
Apple Metal; ARM64 NEON verifies every GPU candidate on the CPU.
No CUDA runtime is needed. This is not a memory-hard mining algorithm.
The fast-mining feature is forbidden by a compile-time error.

Pool: stratum+tcp://mds.gozero.trade:13333 (unencrypted TCP).
Use a reusable MSS payout address generated with generate-mss.
Never use a one-time WOTS address. Address syntax/checksum cannot determine
MSS ownership/type. GUI confirmation is required and is cleared on edits.

N/s reports executed million-round-chain equivalents, including fractional
progress on unfinished or cancelled batches. It is not pool effective rate.
Submitted requests, accepted and rejected ACKs are distinct. Unconfirmed
requests are never counted as accepted. All shares are CPU-verified.

GUI mining is continuous until Stop, Quit, parent exit or thermal protection.
The bundled configuration bounds dispatch length and batch size; duty is 90%.
Standalone core has no temperature monitor; GUI reads macOS thermal state.
No embedded core fee; Assistant retains the original 0.5% service ledger.

Source: https://github.com/ciphernom/midstate
Upstream commit and GPL-3.0 license: PROVENANCE.json, LICENSE, NOTICE.txt.
Based on Windows Gozero MDS 0.1.12-rc.2; exact input hashes are recorded in
WINDOWS-SOURCE.json. Mac changes add GUI-parent cleanup and submission events.
Build on Apple Silicon: cargo build --release --locked
Full consensus checks: cargo test --release --test consensus
GPU checks: WGPU_BACKEND=metal cargo test --release --test gpu -- --ignored --test-threads=1
Selftest: WGPU_BACKEND=metal ./target/release/GozeroMdsCore --backend gpu --self-test
Only Apple M3 is being tested; do not infer all-model or long-term performance.

M3 validation, 2026-10-16:
- ARM64 NEON/scalar full-chain comparisons: passed (2 consensus tests).
- Metal full-chain/candidate capacity/job cancellation: passed (2 GPU tests).
- Pool protocol: 11 tests passed. GUI adapters: 45 tests on Windows and Mac.
- Real GUI session: 97.345 seconds, 1 submitted / 1 accepted / 0 rejected.
  Final sample 349.951 N/s. This is a short local sample, not a sustained-rate
  guarantee. Default pool share target required ~262,144 nonces on average.
- Bilingual minimum-window QA, menu-bar continuation, Stop and active Quit passed.
