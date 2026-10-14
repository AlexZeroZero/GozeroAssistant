Gozero BNT CPU — Apple Silicon port, 2026-10-14

Ported from the Windows Gozero Blocknet 0.2.1 source bundled with the Assistant.
Uses PHC Argon2 C compiled natively for ARM64 and retains a per-thread 2 GiB
workspace. x86 AVX/SSE paths, Windows affinity and large-page APIs are not used.
This is CPU mining; there is no BNT Metal backend in this version.

Unchanged Blocknet consensus: Argon2id v0x13, memory 2097152 KiB, one pass,
one lane, 32-byte digest; 8-byte little-endian nonce as password and the exact
92-byte pool header as salt. Target comparison is big-endian and inclusive.
Public PoW buffers reuse the existing Windows no-wipe setting; never use this
modified PHC package for passwords or other private KDF inputs.

Build on Apple Silicon with Xcode Command Line Tools and Rust:
  MACOSX_DEPLOYMENT_TARGET=13.5 cargo build --release --locked
  cargo test --release --locked
  target/release/gozero-blocknet-core verify
  target/release/gozero-blocknet-core --info
  target/release/gozero-blocknet-core worker native off

verify compares four full-memory vectors against the unchanged official Rust
PoW source, including nonce 0, 1, 0x0102030405060708, UINT64_MAX and unrelated
scratch overwrites. GUI workers also verify a known full-memory vector before
mining. No reduced-memory hash is used for mining.

Memory policy (Mac 0.1.12): Auto mode (threads=0) grows toward available memory
and logical CPU capacity, up to 8 workers. Manual values 1..8 are upper limits.
Existing saved manual settings remain unchanged unless Auto is selected.
Use macOS free + inactive pages and kernel memory pressure, keeping 512 MiB to
1 GiB headroom (physical RAM / 32). Each worker still needs the full consensus
2 GiB plus 128 MiB overhead; there is no reduced-memory proof.
Poll every 5 seconds. Start one worker, then require three consecutive normal
samples with additional capacity before adding each further worker. Existing
workers continue hashing during new-worker full-memory selftests. The native
budget is additional capacity, never a target total of already-running workers.
Warning pressure retires extra workers; critical pressure releases all scratch
and waits without disconnecting the pool. Recovery requires normal pressure,
capacity, stable samples and a 30-second cooldown following pressure/allocation
failures. Initial insufficient memory waits and retries instead of exiting.
Three failed memory queries pause workers; later healthy samples allow recovery.
Stop/Quit cancels pending startup and prevents any automatic resumption.
No purge, swap setting, privilege change or other app termination is used.
Compressed memory and swap are not counted as available workspace. Unknown
pressure does not permit growth. The estimate is a snapshot, not a reservation.
The goal is sustained useful hashing, not guaranteed 100% CPU or maximum speed;
memory bandwidth and temperature can limit scaling with additional workers.
0.1.12 changes the controller, not the native hashing binary or consensus.
Offline controller regression tests pass; new Mac pool/performance testing is
pending because the development M3 was offline when this update was prepared.

The Gozero BNT pool protocol/address validation is reused from Windows.
Default endpoint is explicit unencrypted TCP bnt.pool.gozero.trade:14444;
custom TLS endpoints verify certificates. Uint64 nonces remain lossless.
Only current jobs are submitted; confirmations alone increment accepted shares.
Stop, Quit, thermal protection, parent-exit cleanup and continuous mining remain.
Gozero kernel fee 0%; existing Assistant time-based service fee remains 0.5%.
No new third-party miner binary or fee-removal patch is included.

Only one base Apple M3 has been tested. Short-run throughput and accepted
shares do not establish multi-day stability, pool settlement rate or earnings.
See gui/evidence/mac-bnt-0.1.10.json for the measured result.
See sources.json, LICENSE and vendor licenses for source provenance.
