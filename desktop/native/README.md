# Gozer QTC CUDA compute engine

This is an experimental, self-compiled GPU PoW computation engine, **not yet a complete pool miner**. The desktop app continues to use KRig for PRL/QTC pool work.

- Upstream: Quantus-Network/quantus-miner, commit c7838cbc86f7d74477da1771139f377a8e438072; Apache-2.0, license included.
- Gozer changes: high-256-bit target rejection before the final squeeze, complete 512-bit equality handling, bounded batches, persistent GPU buffers, selectable block size and host idle budget.
- NVIDIA Turing+ and CUDA13-capable driver. No NVIDIA runtime redistributed: PTX loads through the installed CUDA driver. NVRTC is only a build dependency.
- `GozerQtcCore.exe --self-test --pci 01:00.0`: 5 official hash vectors, equality/below-target checks, bounded hit count, 16 checks total.
- `GozerQtcCore.exe --benchmark 3 --budget 50 --pci 01:00.0`: short offline run with an interleaved full-hash/reference comparison. Does not contact a network or wallet.
- Native benchmark and real mining datasets are kept separate. The observed ~1.39x short kernel comparison is not a KRig comparison, long-run throughput result, pool accepted-share rate or profit promise.

Build PTX with `python desktop/scripts/build-qtc.py` after preparing the official NVRTC runtime matching the SHA256 in provenance.json. Build host with the system C# compiler (also done by package.py). Source and license remain in packaged native/.

Before enabling this engine for mining: implement and validate current QTC pool transport/authentication, job/target and nonce ownership, stale-work cancellation, duplicate-share prevention, CPU-side candidate verification and accepted-share accounting. PRL and TSC require separate licensed implementations; they are not covered by this QTC engine.
