# Third-party components and sources

- Electron 44.5.1: https://github.com/electron/electron/releases/tag/v44.5.1. MIT; Chromium and bundled components retain their accompanying `LICENSE` and `LICENSES.chromium.html` files. Official runtime archive SHA256 is pinned by the build script and confirmed against upstream SHASUMS256.txt. The development application EXE is resource-modified and unsigned.
- Windows CIM, PnP, process counters, and NVIDIA `nvidia-smi` and NVML: local installed operating-system and driver interfaces. No driver DLLs are redistributed.
- KRig 1.5.4: https://miner.download/en/krig/description/ and https://github.com/kryptex-miners-org/kryptex-miners/releases/tag/krig-1-5-4. Proprietary upstream miner; not bundled in this application. Explicit in-app installation downloads the upstream ZIP. Archive and executable hashes pin this reviewed version; these are integrity checks, not a claim of publisher code signing. `--help` and `--list-devices` were inspected without mining. Users should review upstream terms. Fee information is displayed in the workbench.
- PRL pool configuration: https://pool.kryptex.com/prl. QTC pool configuration: https://pool.kryptex.com/qtc. No example payout addresses from downloaded BAT files are copied or executed.
- TSC research: https://tsc-miner.tiger-pool.com/ and https://github.com/king-2386/tsc-miner. Only Linux artifacts were identified. No TSC runtime or model is bundled or automatically downloaded.
- Reference income: https://pro.gozero.trade/api/hardware/state, preserving upstream Kryptex / Gozero / Tiger Pool source, timestamp, algorithm and stale flags. Hardware names remain local. Public catalog downloads are cached, not polled on every sensor refresh.

- Network metrics and same-algorithm income: https://gozero.trade/api/overview?coin=PRL and https://gozero.trade/api/income-data?coin=PRL (also QTC, TSC). Full-node and upstream timestamps/stale flags preserved. Chain difficulty is displayed; no unverified universal difficulty-to-income conversion is used.
- Observed asset catalog and market prices: https://pro.gozero.trade/api/state. Public sources only; new catalog membership is not described as confirmed project launch.
- The Gozer 0.5% software fee is independent of third-party miner and pool fees. Addresses are disclosed in the app; QUICKSTART explains the fee and where to view them. No miner binaries or payout BAT scripts are bundled.

Research and implementation date: 2026-10-02 (Asia/Shanghai).

- Gozer QTC experimental compute kernel derives from https://github.com/Quantus-Network/quantus-miner at c7838cbc86f7d74477da1771139f377a8e438072 (Apache-2.0). License, source and modification notices are included in native/. Gozer's C# host and added CUDA entries are compiled locally. Official NVIDIA NVRTC 13.0.88 is a build-only compiler dependency, verified against the NVIDIA redistributable manifest; no NVRTC binaries ship.
- KRig supplies release binaries and redistribution permission, but no miner source was available for self-compilation. The examined open-pearl-miner license requires retaining its 2% developer fee; it was not repackaged or used. TSC Racer source/Windows support was not obtained.

Gozero-authored application code is licensed under MIT (see LICENSE). Quantus-derived files in native/ retain Apache-2.0 and the included provenance/modification notices; the MIT grant does not replace third-party licenses or license the proprietary KRig miner.
