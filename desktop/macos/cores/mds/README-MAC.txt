Gozero MDS Apple Silicon port / Mac GUI 0.1.17

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

Previous 0.1.13 M3 validation, 2026-10-16:
- ARM64 NEON/scalar full-chain comparisons: passed (2 consensus tests).
- Metal full-chain/candidate capacity/job cancellation: passed (2 GPU tests).
- Pool protocol: 11 tests passed. GUI adapters: 45 tests on Windows and Mac.
- Real GUI session: 97.345 seconds, 1 submitted / 1 accepted / 0 rejected.
  Final sample 349.951 N/s. This is a short local sample, not a sustained-rate
  guarantee. Default pool share target required ~262,144 nonces on average.
- Bilingual minimum-window QA, menu-bar continuation, Stop and active Quit passed.

0.1.14 scheduling update:
- Auto batch profile uses 2560 nonces only on the base Apple M3 / Metal.
  Other adapters retain 2048; explicit nonzero batch settings take precedence.
- Bounded 2000-round dispatches, 64 threads per group and 90% GUI duty remain.
- Metal completion checks sleep 500 microseconds between polls, without busy
  spinning. CPU verification and the million-round algorithm are unchanged.
- Hardware checks additionally compare full hashes at the actual batch geometry,
  including a partial final workgroup and nonce low-word carry.
- Controlled performance evidence is recorded separately; short startup peaks
  from large dispatches must not be presented as sustained hashrate.

0.1.15 scheduling update:
- Auto dispatch size is 2500 rounds on the base Apple M3 / Metal; other
  adapter names retain 2000. Explicit nonzero overrides are honored.
- Completion checks sleep 100 microseconds on base M3 and retain 500 on
  other Metal adapters. Checks still wait for confirmed GPU completion.
- Full million-round BLAKE3, CPU verification, 90% GUI duty, thermal
  protection, job cancellation and the service-fee ledger remain unchanged.
- Performance evidence is recorded separately; only one 10-core M3 measured.

0.1.16 Apple Silicon CPU/GPU cooperation:
- Optional Metal + NEON search shares one pool connection and one job token.
  Choose GPU + CPU x2/x4/x8 in the GUI; GPU-only remains the portable default.
  CPU and GPU nonce domains are disjoint. Every CPU batch executes the full
  million rounds; GPU candidates retain full CPU verification.
- GPU, CPU and total rates are reported separately. Stop, new jobs and Quit
  join all producers and the GPU verifier; pending output stays bounded.
- Original 0.1.15 GPU dispatch geometry/duty and fee arithmetic are retained.
  Grouped GPU submissions were rejected after a sustained-throughput collapse.
- CPU assistance increases CPU load and may compete for the chip power budget.
  Performance must be measured on the actual Mac; eight threads are not
  automatically faster than two or four. Only one M3 has been tested.
Hybrid check: WGPU_BACKEND=metal cargo test --release --test hybrid -- --ignored --test-threads=1
Hybrid CLI: GozeroMdsCore --backend hybrid --threads 4 --benchmark 120 --duty 0.9
- ARM NEON rotations use byte-table permutation for rotate-right 8 and
  shift-insert for rotate-right 7/12. The seven compression rounds are explicit
  so the compiler can fold fixed message indices and zero words. Both four-
  and eight-lane paths retain the full chain and scalar consensus comparisons.

0.1.17: macOS hybrid mining gives the GPU host submission thread
user-initiated scheduling priority. CPU workers retain the system default;
the million-round NEON/GPU algorithms, 90% GPU duty and fees are unchanged.
Performance varies with the Mac and thermal conditions. Wider NEON and quad
GPU research kernels are not included in this build.
