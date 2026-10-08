# Gozero Assistant · Beta 1.02 (1.0.24)

**English** | [简体中文](README.zh-CN.md)

A compact Windows GPU / CPU mining assistant with hardware monitoring, a mining workbench, earnings estimates, a rental marketplace, and a floating desktop monitor. **Now includes YSR (GPU) and ZCD (CPU)**, alongside PRL, QTC, and NOID.

[Download for Windows](https://github.com/AlexZeroZero/GozeroAssistant/releases/tag/v1.0.24-beta) · [User guide (Chinese)](desktop/QUICKSTART.txt) · [Build guide (Chinese)](desktop/README.md) · [Website](https://gozero.trade/)

## Download and upgrade

Download `GozerAssistant-1.0.24-win-x64.zip`, verify it against the accompanying SHA256 checksum, extract the entire archive into a new folder, and run `GozerAssistant.exe`. Before upgrading, exit the old version from its system tray menu. Existing wallet addresses, pool settings, and preferences remain stored locally. The app does not start mining automatically.

The display version remains **Beta 1.02**; the internal build version is **1.0.24**.

## Release highlights

- **ZCD / Zycord:** CPU pool mining with RandomX v2 (`rx/2`), mandatory validation of permanent `02` payout addresses, and support for a primary pool plus two backups.
- **YSR / YSKAR:** GPU SHA-256d mining through Gozero YSR CUDA, with network data and a pool workbench.
- **Corrected CPU thread budgets:** modes now use logical threads. On a 64-core / 128-thread CPU, 50% / 75% / 100% selects 64 / 96 / 128 threads. The 100% mode permits all threads and the full CPU quota. Manual thread settings are also supported.
- **XMRig downloads on demand:** XMRig is not included in the app package. Clicking “Download and install” retrieves the selected engine from the official XMRig or Gozero GitHub release, with progress reporting and SHA256 verification.
- **Restored ZCD logs and hashrate reporting:** the app reads XMRig's native log file and captures startup diagnostics separately, supplying the workbench's hashrate, chart, and mining logs.
- GPU / CPU coin filters and search, a rental list that adapts to window size, and Chinese, English, Japanese, and Russian interfaces.

| Coin | Hardware / algorithm | Engine and default connection |
| --- | --- | --- |
| ZCD | CPU / RandomX v2 | Gozero XMRig CPU (0% engine fee) or official XMRig (1% engine fee); `stratum+tcp://zcd.pool.gozero.trade:3333` |
| YSR | NVIDIA SM 8.0+ / SHA-256d | Gozero YSR CUDA 0.1.3; `https://ysr.pool.gozero.trade:8443` |
| NOID | Supported NVIDIA GPUs / Poseidon2b | Suprminer or Fl4shMiner; automatic primary / backup connection selection |
| PRL / QTC | GPUs supported by the upstream miner | KRig; selectable regional nodes and backup pools |

YSR requires a CUDA 13-compatible driver; AMD and CPU mining are not enabled for YSR in this release. TSC mining is not yet available on Windows. ZCD requires at least 4 GiB of available memory. Using every thread does not guarantee the highest hashrate: results depend on the CPU, cache, memory, and system scheduling.

<a id="新版界面截图"></a>

## Screenshots

These are **actual idle-state screenshots from version 1.0.24**, showing configuration and layout in the Chinese interface. They contain no simulated hashrates, invented earnings, or wallet balances, and do not demonstrate pool-accepted shares. The app also supports an English interface.

### ZCD · CPU workbench

![ZCD CPU workbench: logical thread budget, permanent 02 address, and on-demand engine installation](docs/screenshots/zcd-workbench-1.0.24.png)

### YSR · GPU workbench

![YSR GPU workbench: CUDA engine and Gozero pool](docs/screenshots/ysr-workbench-1.0.24.png)

### Hardware overview

![Gozero Assistant 1.0.24 hardware overview](docs/screenshots/hardware-overview-1.0.24.png)

## More features

- GPU, CPU, memory, motherboard, BIOS, and supported sensor readings. Unavailable values display as “—”.
- Five- or ten-minute average hashrates, recent sample charts, mining logs, and GPU temperature protection (90°C by default). CPU temperature and power monitoring are not integrated; CPU temperature protection is not provided.
- Earnings estimates, mining benchmarks, and address ledgers for supported pools. ZCD price, earnings, and pool settlement data are not yet integrated.
- A draggable floating monitor and system tray controls showing hashrate, performance mode, system load, and stopped status.
- Clore / Vast.ai GPU and CPU rental listings, quick filters for the 4090 / 5090 / 3090 / RTX PRO 6000, hardware details, and rental cost estimates. The app provides listings and links; it does not rent or pay automatically.

[Clore referral link](https://clore.ai/register?ref_id=ebgzlv4d) · [Vast.ai referral link](https://cloud.vast.ai/?ref_id=133254)

## Fees and validation scope

The assistant charges a **0.5% service fee** during both mining and mining benchmarks, accumulated through time sharing. This is not an exact deduction from the number of coins earned. Miner engine fees, pool fees, and electricity costs are separate.

137 automated tests passed, including 128-logical-thread configuration and a 100% CPU quota; interface tests passed in all four languages. The source-built CPU engine passed local offline logging and hashrate tests. The official XMRig binary was blocked from starting by the local system, so its live execution was not verified in this round. ZCD pool-accepted shares and settlement have not yet been validated. Compatibility across hardware and antivirus products, long-term stability, and earnings are not guaranteed.

## Source and building

```powershell
git clone https://github.com/AlexZeroZero/GozeroAssistant.git
cd GozeroAssistant
python desktop/scripts/package.py
```

Requires Windows x64, Python 3.11+, and the .NET Framework C# compiler. Tests require Node.js 22+. The build downloads and verifies a pinned Electron version; it does not start mining. See the [build guide (Chinese)](desktop/README.md).

Gozero-authored assistant code is licensed under [MIT](LICENSE). Upstream YSR code retains its MIT license; Quantus-derived code retains Apache-2.0. See [third-party notices](desktop/THIRD-PARTY.md).

Gozero XMRig CPU is based on XMRig and follows GPL-3.0-or-later; it is not an independently developed algorithm implementation. [Optional CPU engine downloads and complete corresponding source](https://github.com/AlexZeroZero/GozeroAssistant/releases/tag/xmrig-cpu-6.26.0-cpu.2). KRig, Suprminer, Fl4shMiner, and XMRig are downloaded only at the user's request; XMRig is not bundled with the assistant. Mining software may trigger antivirus detection; this project does not promise detection-free binaries.
