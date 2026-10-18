Gozero JTM CPU 0.3.1-gozero.3 — Windows x64 preview

Based on TowerMiner 0.3.1, Apache-2.0, by the Jetsam developers.
TowerMiner source: https://github.com/jetsam-chain/towerminer
Commit: 81d16ca17a8c349737dee682031523fc14fbf340
TowerMiner's vendored consensus source: ea67571f3fcf8938cf039bdfc6afb2898b533fbd
Current Jetsam node reviewed: 01aef34d0c1c7b02535f4d749da10b5b9d395350

Gozero changes:
- Distinct program/version identity; no claim of official endorsement.
- Optional --no-report-hardware suppresses CPU model and worker headers.
- Empty TOWERMINER_KEY is not sent as an empty Bearer token.
- Local loopback RPC bypasses system proxies; remote pools retain normal proxy policy.
- Assistant integration: explicit install/start, logical-thread budget, JSON status,
  optional pool token in inherited environment, and offline 30-second benchmark.
- No change to the consensus hash, walk lane order, scratchpad size or nonce layout.

Build:
Install Rust stable and the matching x86_64-pc-windows-gnu MinGW linker.
Run cargo build --release --locked; output is target/release/towerminer.exe.
Rename it to GozeroJtmCore.exe. build.py records this workspace's toolchain paths.
Cargo.lock pins registry dependencies. Source and dependency license notices are
included; Cargo downloads the locked crates when building on a new computer.
Run cargo test --release --locked, then GozeroJtmCore.exe --gate and
GozeroJtmCore.exe --check-nonces 20 --threads 4 --no-tune-file.

Requirements:
64-bit x86 CPU with SSE4.1 and PCLMULQDQ. Runtime dispatch uses supported SIMD.
512 KiB scratchpad per nonce chain, 1–4 chains per worker plus program overhead.
Large pages are optional and use existing rights only. This build never grants
administrator rights or modifies antivirus settings. Windows public build has
no CPU thermal sensor guard; Assistant does not fabricate CPU temperatures.

Offline test, no pool or wallet needed:
GozeroJtmCore.exe --bench-walk 30 --idle-secs 0 --threads 4 --threads-per-core 2 --no-tune-file

Online mining (only after a compatible pool/node is available):
GozeroJtmCore.exe --rpc https://YOUR-POOL/rpc --coinbase YOUR-j1-ADDRESS --threads 4 --status-json
Set TOWERMINER_KEY in the process environment if the pool requires a token.
Uses jetsam_getBlockTemplate / jetsam_submitBlock HTTP(S) JSON-RPC, not Stratum.
The endpoint must support custom payout addresses. Public read-only RPC cannot mine.
Ctrl+C stops the standalone worker. The Assistant stops its owned child process.

Fees and validation:
Standalone core fee: 0%. Assistant online mining has a separately disclosed 0.5%
time-sharing fee. Offline benchmarking creates no payouts and does not contact a pool.
Pool accounting, payouts and the service-address switch require live validation
after the user's pool is ready. No live pool acceptance or earnings claim is made.

Performance (experimental optimization release):
The generic fast path recomputes byte offsets from accumulators. On BMI2 CPUs,
two contiguous pads can use an assembly chunk with register-held state, RORX
address generation and precomputed round*C. Other layouts use the generic path.
Round counts, scratchpad sizes, lane ordering and mandatory folds are preserved.
No AVX2-gather, reduced-round or pad-spacing experiment is shipped.
On the local Intel Core Ultra 9 275HX (normal 4 KiB pages), 24-worker comparisons
against the preceding round-2 candidate ranged from -0.13% to +2.42%.
One same-session group was +6.70% versus the core shipped in Assistant 1.0.54.
Power/temperature/frequency were not locked. This does NOT establish a stable
whole-machine speedup, nor predict other CPUs. Keep 1.0.54 for comparison.
See VALIDATION.txt and source.zip validation evidence for scope and limitations.

Gozero pool extension (0.3.1-gozero.3):
- HTTPS RPC: https://jtm.pool.gozero.trade/rpc
- Authorization: Bearer ADDRESS.WORKER in TOWERMINER_KEY (Assistant derives it).
- Omit --coinbase for this pool; it allocates rewards in its own ledger.
- Supports accepted-share objects as well as standard block-hash replies.
- Share acknowledgements keep the current work active. Explicit no-work replies
  pause old work; valid refresh resumes the same nonce cursor without duplication.
- Tests/relay.rs bypasses proxies for its loopback fixtures only.
- TowerWalk computation remains byte-identical to the .2 source implementation.
