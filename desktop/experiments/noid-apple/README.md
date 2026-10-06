# Gozero Apple NOID experiment

This directory is a native core selftest checkpoint, not a usable pool miner or
the complete Mac assistant. Apple M-series base/Pro/Max/Ultra is the target.
Native CPU/PMULL and runtime-compiled Metal selftests now pass on one Apple M3
(Mac15,12, 16 GB, 10-core GPU, macOS 26.5.1). Other models remain unverified.
Existing Windows product files and released miner choices are not changed.

## What has been verified

On Windows x64, Clang 18 compiled the portable C++ arithmetic into a freestanding
DLL. Ten differential test groups pass against the independent bit-serial
Python implementation, whose eight reference tests also pass. Coverage includes
all six public PoW/mainnet fixtures, all 128×128 field-basis products, 4,132
random/dense products and squares, basis conversion, permutation, 48 randomized
cached hashes and 16 interleaved hashes, strict 256-bit little-endian target
comparison and 64-bit counter boundary handling.

Nineteen simulated protocol/transport tests pass. After the original Windows validation,
Apple Clang 21 and macOS SDK 26.5 compiled the native host and libraries on M3.
Both portable and PMULL libraries passed all ten differential groups on native
ARM64 Python. Metal runtime source compilation, all six public fixtures, batch
carry, overflow retries, CPU candidate rechecks and strict target checks passed.
[Original offline evidence](evidence/offline-2026-10-06.json) and
[M3 evidence](evidence/mac-m3-selftest-2026-10-06.json) record platform and source
identity. Short synthetic timing is not a sustained pool hashrate.

## Sources and reproducible parameters

See [NOTICE](NOTICE), [Apache license](LICENSE-Apache-2.0.txt) and
[Mac provenance](provenance.json). Parameters follow
[proof-native/parano1d at d1a7e8b](https://github.com/proof-native/parano1d/tree/d1a7e8b0816b29029e2066bf9a974253bb4a07c8),
including `noid_poseidon2b/src/batch_aarch64.rs` for the four-state CPU schedule.
Public protocol material comes from [Innovlab](https://noid.innovlab.cc/) and
[Suprnova](https://noid.suprnova.cc/stratum/stratum-protocol.md).
No proprietary miner binaries or fee-removal techniques were used.

`generate.py` verifies the pinned input hashes and creates `constants.h`,
`fixtures.h` and `fixtures.json`. `--check` detects generated-file drift.
Git attributes force LF in these experimental directories. The handoff's
`5352e81d...` vector hash was the CRLF Windows working copy; canonical LF is
`1c118575...`, identical to the freshly fetched public fixture. JSON values
are unchanged. The source fixture's mislabeled second `square(a)` entry remains
intact; tests explicitly establish that its supplied value is `square(b)`.
The older `../noid/provenance.json` describes historical Windows work, not Mac
capabilities.

## Reproduce on Windows (offline)

From this repository root, using an existing Clang/LLD installation:

```powershell
python desktop/experiments/noid-apple/validate_windows.py --clang 'C:/path/to/clang++.exe'
```

The linker `ld.lld.exe` must be beside Clang. This runs all offline tests and
the ARM64 object/assembly checks, then saves `artifacts/offline-evidence.json`.
It does not download tools or connect to a pool. To intentionally regenerate
derived files after reviewing a parameter update:

```powershell
python desktop/experiments/noid-apple/generate.py
```

## Run on an actual Apple Silicon Mac

Use native arm64 Python 3 and Xcode/Command Line Tools with Clang and a macOS
SDK. The default build uses offline Metal tooling when present, otherwise the
official Metal runtime source compiler. From the repository root:

```sh
python3 desktop/experiments/noid-apple/build_mac.py
python3 desktop/experiments/noid-apple/build_mac.py --benchmark --count 32
```

This checks generated files, builds portable/PMULL libraries and the host, runs
the independent Python differential suite, compiles Metal, and executes
CPU/Metal selftests. PMULL calls require a successful runtime
`hw.optional.arm.FEAT_PMULL` query; an absent capability report uses portable
CPU code. Metal requires an Apple-family GPU. Unknown or missing capabilities
do not become compatibility claims. Failure returns a nonzero exit status.

To explicitly skip GPU execution:

```sh
python3 desktop/experiments/noid-apple/build_mac.py --cpu-only
```

Select `--metal-mode runtime` to use `newLibraryWithSource` even if offline
tools exist, or `--metal-mode offline` to require the offline compiler. Runtime
mode emits a self-contained `noid-runtime.metal` and records that mode in the
report; it does not claim a metallib was built.

After CPU and Metal pass, `python3 desktop/macos/package_native.py` creates a
native core test ZIP. It requires matching verified source/artifact hashes.
That ZIP needs neither Python nor Xcode to execute; it contains the native
host, the selected Metal artifact and a `.command` test launcher. It cannot
connect to a pool and is not a complete Gozero `.app`.

Reports and binaries stay in ignored `artifacts/macos-arm64/`. Preserve
`portable-tests.json`, `pmull-tests.json` when present, and `selftest.json` with
the exact source revision. Selftest failure prevents the benchmark. The native
host checks all six fixtures, scalar/four-state agreement, GPU counter carry,
strict target equality, empty target, CPU candidate rechecks and overflow retries.
Synthetic benchmark JSON reports model, chip, OS, compiler, GPU name, capability,
count, one CPU worker, wall time and GPU time where available. Temperature and
power are null. Benchmark runs are short development samples, not sustained
pool hashrate or energy efficiency measurements.

## Protocol model and integration boundary

`pool_session.cjs` is an offline-tested state model, with no socket transport or
mining process. Notify may arrive before authorization and is held behind the
authorization gate. Every new job cancels older work; `mining.pause` aborts all
tickets and only a fresh notify resumes assignment. Expiry and disconnect
invalidate work. Candidate overflow splits the already reserved nonce range;
it does not advance to new counters and lose matches. Submitted candidates
require synchronous CPU hash verification at the job's strict target.

A future transport must call `tick()` periodically, connect using verified TLS
(mandatory for Innovlab), forward `ticket.signal` cancellation to workers, and
call `disconnect()` on transport faults. It must call `canSend(request)` directly
before `socket.write`, without an await between them, so pause/expiry after GPU
completion cannot leak a stale queued submit. Request replies are correlated by
monotonic IDs. A rejected CPU candidate stops the session. Identical replayed
job IDs retain reserved nonce counters even across pause and expiry. Reusing an
ID with different work fails closed. This replay case was observed on Innovlab
and is covered by a regression test.

Innovlab's 60-second handshake and 600-second silence policy is separate from
Suprnova's no-idle-drop documentation. The 4 MiB newline framing limit applies
to bytes, with strict UTF-8 decoding. Optional statistics are not proof of work.
The model intentionally has no production wallet and is not wired to the UI.

## Bounded live acceptance test

On 2026-10-06, the M3 completed a 180-second TLS session with Innovlab HK2:
17 submitted shares were accepted, none rejected or left unacknowledged. The
controller handled seven pauses and eight job notifications. Local useful-work
average was 1.054 MH/s; the short sample is not a long-term pool-side rate or
profitability measurement. The worker was confirmed stopped afterward.
[Live evidence](evidence/mac-m3-innovlab-2026-10-06.json) retains replies and
source/binary hashes. An earlier test stopped safely on a replayed job ID;
the identical-replay counter fix preceded the successful complete run.

`pool_runner.cjs` now supplies verified TLS, bounded reconnects and a single
in-flight native batch. It requires an explicit local JSON configuration and
stops after 1–600 seconds. The native host's `--worker-seconds` mode has its own
hard lifetime (1–900 seconds), exits on parent EOF, and accepts at most 65,536
nonces per request. CPU/Metal selftests precede its ready event. GPU candidates
are recomputed on CPU in the native process; only those CPU digests pass into
the session's strict target, namespace, generation and pre-send checks.

```sh
node desktop/experiments/noid-apple/pool_runner.cjs LOCAL_CONFIG.json REPORT.json
```

Configuration example (replace the address and binary paths; keep real wallet
configuration outside Git):

```json
{
  "pool": "innovlab",
  "host": "hk2.innovlab.cc",
  "port": 19601,
  "wallet": "REPLACE_WITH_YOUR_PUBLIC_NOID_ADDRESS",
  "worker": "gozero-mac-test",
  "seconds": 180,
  "batch": 65536,
  "command": ["/path/to/noid-apple-check", "--worker-seconds", "240", "--metal-source", "/path/to/noid-runtime.metal"]
}
```

The command is an argument array, not evaluated shell code. For Windows control
of a Mac, it may instead contain the authorized SSH client invocation with a
verified known-host file and dedicated key. In that topology Node/TLS runs on
Windows, while GPU search and CPU rechecks run on the Mac. This is not a
standalone Mac application. No seed or private wallet key is required. The
test runner does not modify production fee logic or the Windows miner.

Run `node --test .../test_pool_session.cjs .../test_pool_runner.cjs` for protocol
tests. On Mac, `test_worker.py --executable PATH --metal-source PATH` checks real
CPU-verified worker output, overflow rejection, EOF and independent lifetime.
The native process only computes assigned batches; no orphan background mining
continues after EOF or expiry. The macOS graphical assistant remains pending.

## Reproducible Metal tuning

On the M3, three alternating 15-second samples per implementation measured
median wall rates of 1.241916 MH/s baseline and 1.597495 MH/s optimized:
**28.63% improvement**. Individual optimized samples were 1.597244–1.597781
MH/s. These are same-device synthetic search results. The measurements and
correctness reports are retained in
[optimization evidence](evidence/mac-m3-optimization-2026-10-06.json).

The subsequent 180-second Innovlab TLS run measured a local average of
1.281108 MH/s with **20 submitted / 20 accepted / 0 rejected / 0 pending**.
This includes Windows-to-Mac SSH scheduling and pool pauses; it is separate
from the controlled A/B measurement. See
[optimized live evidence](evidence/mac-m3-optimized-innovlab-2026-10-06.json).

The optimized Metal path splits 32-bit carryless multiplication into three
16-bit products. Three interleaved bit planes use ordinary 32-bit integer
multiplication without `mulhi`; a plane has at most six summed terms, below
the eight needed for a carry to corrupt the next retained bit. Full and partial
round loops are specialized separately. PMULL and the original portable CPU
implementation remain independent verification paths. Define
`GZ_METAL_BASELINE=1` in the Metal source to select the original arithmetic
and round schedule for comparison on the same host executable.

`build_mac.py` additionally tests the new arithmetic in a portable native
library against the independent Python reference. Metal startup checks all
16,384 field basis pairs, 4,096 random products, 16 dense/zero products,
192 digests across random headers, the published fixtures, counter carry,
candidate overflow retry and strict target comparison. These checks also
precede worker readiness. CPU verification of mining candidates is retained.

On the Mac, after a normal runtime-source build:

```sh
python3 benchmark_mac.py --seconds 15 --rounds 3 --report artifacts/ab.json
```

This alternates baseline/optimized order, validates 4,096 complete digests
per sample, warms up eight batches, then measures candidate-only search with
65,536 nonces per dispatch. GPU and wall time, actual hashes, checked candidates,
hardware, source/binary hashes and all samples are retained. The reported
speedup compares medians on the same device; it is an offline synthetic
measurement, not pool-side hashrate. Each sample is limited to 1–60 seconds
and the harness to 2–10 rounds. `--threadgroup` is an explicit tuning override;
the default remains Metal's reported SIMD width, with runtime validation.

The native test ZIP includes `Run-Performance-Test.command`: a preheated
30-second search benchmark with no pool connection. Read
`metalSearch.hashesPerSecondWall / 1000000` for MH/s. The existing 32-candidate
quick check is dominated by dispatch overhead and must not be called sustained
mining speed. A group-chat claim of 30–50 MH/s on other M-series devices has
no supplied benchmark or share evidence and remains unverified.

## AES-tower research and Mac-local miner

The next controlled comparison measured **1.597504 MH/s** for the previous
flat-field kernel and **1.757637 MH/s** for the hybrid kernel (+10.02%, medians
of three alternating 15-second samples on this M3). This is a kernel-to-kernel
comparison; moving the controller to the Mac is a separate scheduling change.
[Research and A/B evidence](evidence/mac-m3-hybrid-research-2026-10-06.json)
retains every sample, generated shader hashes and rejected experiments.

The pinned upstream tower starts with AES GF(2^8), polynomial `0x11b`, and
quadratic extensions `Y^2 = Y + tau`. The extension constant is `0x20` in
GF(256) and occupies the highest byte at subsequent levels. Sources:
[Block8](https://github.com/proof-native/parano1d/blob/d1a7e8b0816b29029e2066bf9a974253bb4a07c8/noid_core/src/tower/block8.rs),
[Block16](https://github.com/proof-native/parano1d/blob/d1a7e8b0816b29029e2066bf9a974253bb4a07c8/noid_core/src/tower/block16.rs),
[Block128](https://github.com/proof-native/parano1d/blob/d1a7e8b0816b29029e2066bf9a974253bb4a07c8/noid_core/src/tower/block128.rs).

One cached-header hash still needs three permutations, each with eight full
rounds and 58 partial rounds: 270 x^7 S-boxes, hence 540 GF(2^128) products
and 540 squarings per nonce. The current arithmetic expands each general
product into 243 ordinary integer products. That is 131,220 integer products
per nonce before counting transforms and other instructions. Unified memory
does not remove these operations. The job is only 164 bytes per batch and
only matching candidates return to CPU; input/output transfer is already small.

The partial MDS diagonal adjustments are `0x21`, `0x2001`, `0x201`, `0x801`
in tower coordinates. They lie in GF(2^16), so each acts independently on
eight 16-bit coordinates. The generator proves this on all 128 input basis
vectors against the independent flat reference, then emits shift/XOR masks.
The hybrid kernel keeps the 58 middle rounds in this representation and
converts only the nonlinear lane for each S-box. It retains the previous
arithmetic and full-round implementation. MDS/basis vector lookups per nonce
fall from 27,456 to 17,088 (37.76% fewer); these are logical table accesses,
not measured DRAM traffic or a promise of an equal hashrate increase.

The research also screened 32-way bit slicing, 16-way bit slicing, a 24 KiB
threadgroup-state layout, full tower arithmetic using GF(256) log/exp or full
tables, and carryless 4/8-bit lookup products. All completed variants passed
full-hash comparisons but were slower (roughly 0.26–0.87 MH/s). One fully
inlined bit-slice variant exceeded a 180-second compile limit. Register pressure,
compiler decisions and internal memory traffic remain profiling hypotheses;
no hardware-counter measurement establishes their individual contribution.
The slow variants are not part of the default miner.

Research generators retain the exact screened shaders from base commit
`692df24`. From a Git checkout, run:

```sh
python3 research/generate_candidates.py
```

This only generates files under `artifacts/research-tower` and checks 1,000
independent tower/flat field pairs; it does not connect to a pool. Current
`benchmark_mac.py --baseline flat --report artifacts/hybrid-v-flat.json`
compares the hybrid kernel to the previous optimized implementation.
`--baseline original` selects the older four-plane implementation.

`Gozero-NOID-Mac-Miner-arm64.zip` bundles the native worker, verified shader,
the existing TLS/session controller and official Node 24.21.0 ARM64 runtime.
All computation, CPU candidate verification, TLS and scheduling run on the Mac;
Windows/SSH is no longer in the per-batch control loop. Requires Apple Silicon
and macOS 13.5+ (the Node binary's deployment minimum). The public runtime
download and checksum are pinned in `desktop/macos/node-runtime.json`.

Double-click `Run-Mining-Test.command` and enter a public NOID address to run
180 seconds, or use `./node miner_cli.cjs --wallet YOUR_ADDRESS --seconds 600`.
The CLI rejects a missing address, non-native execution, durations outside
1–600 seconds and modified native/shader artifacts. Startup selftests and CPU
candidate rechecks remain mandatory. Ctrl+C, EOF and the independent native
deadline bound process lifetime. The package includes offline selftest and
30-second performance launchers. No operator wallet is included in defaults.
This is an experimental standalone command-line miner; Gozero GUI, production
fee integration and long-duration validation remain pending.

The extracted package's mining launcher completed a 180.004754-second M3 run:
295,763,968 useful hashes, local average **1.643090 MH/s**, **32 submitted /
32 accepted / 0 rejected / 0 pending**, seven pauses, ten jobs and no reconnects.
Active ten-second intervals were about 1.756 MH/s. The separate packaged
30-second offline launcher measured 1.757167 MH/s. Both launchers exited
normally and SSH process inspection confirmed no worker remained.
[Native miner evidence](evidence/mac-m3-native-miner-2026-10-06.json) binds
the run to the ZIP, controller sources, executable, shader and Node runtime.
These are finite validation runs, not long-term pool-side rates.

## Remaining acceptance gates

1. Extend the verified M3 result to representative base/Pro/Max/Ultra devices
   across supported generations before describing any family as verified.
2. Measure scalar/four-state PMULL and Metal against the pinned upstream CPU
   implementation. Tune only from measured results. Add bounded asynchronous
   dispatch, worker limits and adaptive batch sizing to keep cancellation timely.
3. Extend bounded Mac-local transport/worker testing to longer sessions,
   reconnect faults, other pools and pool-side effective hashrate; integrate
   production fee behavior and the assistant UI before a production release.
4. Port Gozero device discovery, unified-memory telemetry, process management,
   tray/mini-window and arm64 packaging. Keep unavailable telemetry explicit.
5. Build/sign/package the Mac app in a later authorized release step. This branch
   does not publish or replace the Windows GitHub release.
