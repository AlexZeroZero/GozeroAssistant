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

Fourteen simulated protocol tests pass. After the original Windows validation,
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
monotonic IDs. A rejected CPU candidate stops the session. Jobs with repeated IDs
fail closed to avoid repeating nonce counters. `reconnectDelay()` provides a
bounded jittered delay; reconnect scheduling itself is not implemented.

Innovlab's 60-second handshake and 600-second silence policy is separate from
Suprnova's no-idle-drop documentation. The 4 MiB newline framing limit applies
to bytes, with strict UTF-8 decoding. Optional statistics are not proof of work.
The model intentionally has no production wallet and is not wired to the UI.

## Remaining acceptance gates

1. Extend the verified M3 result to representative base/Pro/Max/Ultra devices
   across supported generations before describing any family as verified.
2. Measure scalar/four-state PMULL and Metal against the pinned upstream CPU
   implementation. Tune only from measured results. Add bounded asynchronous
   dispatch, worker limits and adaptive batch sizing to keep cancellation timely.
3. Implement transport and worker integration, then verify TLS, accepted shares,
   pause/reconnect behavior and pool-side effective hashrate over a sustained run.
4. Port Gozero device discovery, unified-memory telemetry, process management,
   tray/mini-window and arm64 packaging. Keep unavailable telemetry explicit.
5. Build/sign/package the Mac app in a later authorized release step. This branch
   does not publish or replace the Windows GitHub release.
