Gozero JTM macOS core integration / 0.1.20

Based on official towerminer 0.3.1 revision81d16ca17a8c349737dee682031523fc14fbf340.
Original Apache-2.0 license and vendored consensus sources retained.
Local changes: Darwin native page allocation/CPU capability glue, ARM prefetch,
PACKED_LANES correctness, pool literal accepted acknowledgement, exact quad
reads with sequential collision fallback, optional GUI-parent exit guard and
final status counters on shutdown. No mixed QoS scheduler or reduced rounds.

Build on arm64 macOS with Rust1.93.0:
MACOSX_DEPLOYMENT_TARGET=11.0 RUSTFLAGS="-C target-cpu=apple-m1" cargo +1.93.0 build --release --locked -p towerminer --bin towerminer
Use target/release/towerminer as GozeroJtmCore. Ad-hoc sign before hashing.
These portable build instructions supersede historical BUILD-M3.txt.

Validate using the same environment variables:
cargo +1.93.0 test --release --locked -p towerminer -- --test-threads=1
./target/release/towerminer --gate --gate-random 64

GUI: JTM JSON-RPC HTTP/HTTPS, automatic CPU count or explicit cap,2pads,prefetch0,
continuous mining, public0.5% service time scheduling, status/accepted/refused/
unknown counters, explicit Stop/Quit and parent-loss cleanup. No Metal backend.
JTM is bundled into the small GUI; other cores retain pinned downloads.
The complete Electron application requires macOS13.5+, QTC/PRL macOS14+.
Only the available M3 has been tested, not all M generations or older OS releases.

Gozero pool: https://pool.gozero.trade/JTM (web page). Mining RPC:
https://jtm.pool.gozero.trade/rpc; Bearer ADDRESS.WORKER; no custom coinbase.
Gozero accepted-share objects preserve current work; stale/no-work pauses it
until a valid template refresh. DongQN literal acknowledgements remain supported.
Protocol adaptation based on Windows Gozero core0.3.1-gozero.3.
Worker nonce cursors continue across difficulty/template changes to avoid
re-searching and submitting duplicate shares after a pool difficulty update.
