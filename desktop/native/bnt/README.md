# Gozero Blocknet CPU 0.2.1

Blocknet Argon2id worker for Windows x64, built from the unchanged official
consensus hash and PHC Argon2 SIMD implementations. Third-party licenses and
source provenance are included. Kernel fee: 0%; the Assistant's disclosed
software service fee is separate.

## Compute paths

- SSE2 compatibility; AVX2 reference, fixed-parameter specialization and prefetch.
- AVX2 `stream`: a retained 4 MiB index table for the data-independent half,
  inlined PHC compression, four-block L1 lookahead, and next-reference prefetch
  during the data-dependent column rounds. The 2 GiB consensus workspace and
  every hash parameter remain unchanged. Previous paths remain available.
- AVX-512F versions of all three paths, compiled in separate translation units.
- Runtime CPU **and OS vector-state** checks precede AVX-512 dispatch. Unsupported
  explicit AVX-512 requests fail cleanly. Untuned auto uses AVX2/SSE2.
- Unchanged consensus: Argon2id v0x13, 2,097,152 KiB, t=1, p=1, 32 bytes;
  uint64 little-endian nonce and a 92-byte header as salt.

The Assistant's untuned defaults retain the previous paths: `prefetch` for one
worker and `gozero` for multiple AVX2 workers. Stream can regress at higher
concurrency, so it is available through measured auto-tuning only, when the
installed core advertises it. Native CLI `auto` and older-core compatibility
retain their previous behavior. Auto-tune compares paths on the user's hardware. A kernel
update intentionally invalidates prior timing profiles; retune after upgrading.

## Memory and CPU placement

Reusable 2 GiB workspaces; optionally request large pages using only privileges
already granted to the current process. There is no elevation, service/driver
installation, global privilege change, or clock/voltage modification. Allocation
falls back to ordinary NUMA-preferred pages, then aligned allocation. Readiness
reports the actual page allocation and binding outcome.

Windows CPU-set topology covers processor groups beyond 64 logical processors.
The Assistant prefers distinct physical cores before SMT, prioritizes fast cores
on hybrid CPUs and distributes work over reported NUMA/cache domains. Each
worker binds before first-touch and requests memory on its current NUMA node.
Binding and NUMA preferences are not promises of exclusive CPU or memory access.

## Assistant auto-tuning

Stop all tasks, install this core and click **Auto-tune** in the BNT workbench
(single or CPU task in dual mode). This is an offline test, not pool mining.
It compares eligible SIMD paths, thread counts and placement/page strategies,
then rechecks baseline and candidate with alternating longer runs. Every trial
first verifies a full-size consensus test vector. Near-equal results prefer
fewer threads. Completion saves and applies the recommended thread count;
cancellation leaves existing settings unchanged. Results are local only.

Profiles are matched to hardware, memory configuration, core version, thread
count and performance budget. Memory is checked again before mining starts.
The run is bounded to 20 minutes and may be cancelled. Unknown/mismatched
profiles fall back to normal execution. Offline H/s is not pool-paid hashrate.

## Build / diagnostics

Use Rust x86_64-pc-windows-gnu and MinGW-w64 GCC. The tested versions are Rust
1.99.0 and GCC 16.2.0. Do not compile the entire executable with a native-only
CPU flag; runtime dispatch must remain usable on SSE2 machines.

    cargo build --release --locked
    cargo test --release --locked -- --test-threads=1
    GozeroBlocknetCore.exe --info
    GozeroBlocknetCore.exe verify
    GozeroBlocknetCore.exe worker auto auto
    GozeroBlocknetCore.exe worker avx2 off 0 0

Worker arguments: ENGINE, pages auto/off, optional Windows processor group and
logical processor index. JSON-lines public work protocol and EOF shutdown are
unchanged. The historical compare.py/bench command remains a conservatively
bounded reference tool; the Assistant tuner supports the current RAM budget.

## Verification limits

The development host is an Intel Core Ultra 9 275HX without AVX-512. Full 2 GiB
reference comparisons passed for its supported engines. AVX-512 compiled and
unsupported-CPU rejection was checked, but real AVX-512 execution/performance
requires a capable test host. The tuner excludes that path when unavailable and
checks a golden vector before timing it on supported hosts. Large-page and NUMA
benefits are machine-dependent; no speedup percentage is promised.

The accompanying report records measured results and limitations. The historical
SOLO adapter and testnet utilities remain development references, while the
Assistant handles production pool connectivity and the software fee scheduler.

## Stream scheduling provenance

The scheduling approach was informed by the public Seine v0.2.15
`pow-kernel/src/fixed_argon.rs` (BSD-3-Clause). The Gozero C implementation uses
the existing PHC compression primitives; it does not bundle or rename Seine.
The upstream notice is included in `vendor/seine/LICENSE` and the binary bundle's
`third-party-licenses/seine/LICENSE`. See `sources.json` for pinned references.
This path is compiled only for AVX2 and explicitly advertised by `--info`.
SSE2 fallback and the existing AVX-512 paths are retained unchanged. No new
AVX-512 speed claim is made by this release.
