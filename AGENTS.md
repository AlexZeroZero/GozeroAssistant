# Gozero助手 — macOS / Apple Silicon development branch

Work only in this checkout: `D:/网格化指数系统/gozero-macos`.
Branch: `codex/macos-apple-silicon`.
Read `MAC_HANDOFF.txt` before changing anything.

This is the user's separate Mac project. The original Windows chat, release and
checkout remain separate. Do not edit the parent workspace's desktop files or
the `.local/github-publish/GozeroAssistant` main checkout from this task.

Target all Apple M-series families, including base/Pro/Max/Ultra, with runtime
capability checks. This is a target, not a claim of verified compatibility.
The user has authorized LAN SSH access to an Apple M3 Mac (16 GB, 10-core GPU).
Dedicated project-local SSH authentication is now verified. Remote work is
restricted to the Gozero-Mac-Test session directory unless necessary tool setup
is authorized. Keep private keys and host connection data under ignored .local/.
Native arm64 builds and CPU/PMULL plus runtime-compiled Metal selftests now pass
on this one Mac. A 180-second Innovlab TLS test also returned 17 accepted shares,
zero rejections, using a Windows Node controller and the Mac worker over SSH.
Do not generalize to the entire M-series family or claim a complete Mac app.
No long-term pool-side hashrate or power efficiency has been measured.
Metal tuning now measures +28.63% in alternating M3 A/B tests (1.242 -> 1.597
MH/s). Optimized live test: 180 seconds, 20 accepted/0 rejected, 1.281 MH/s
local average including SSH scheduling. See the optimization evidence and the
latest MAC_HANDOFF.txt checkpoint. Group-chat 30–50 MH/s claims are unverified.
Latest hybrid tower work: 1.758 MH/s synthetic median (+10.02% over the prior
optimized kernel). A standalone bounded Mac miner ZIP now runs TLS/controller
and GPU locally: 180-second test, 32 accepted/0 rejected, 1.643 MH/s including
pauses. See mac-m3-hybrid-research and mac-m3-native-miner evidence. macOS 13.5+
for the bundled Node runtime; no GUI/production fee integration yet.
CPU-idle follow-up: GPU-only device utilization was already 99%. Optional
PMULL CPU+GPU search now exists, with disjoint adaptive ranges and CPU/GPU
rate reporting. Final warm nine-sample comparison: four CPU threads +2.17%
median, eight -2.18%, with substantial decline over time. This does NOT prove
a stable gain. A 180-second cooperative package test accepted 24/24 shares,
zero rejects, ~1.562 MH/s local average. Preserve GPU-only CLI default.
The user subsequently requested desktop cleanup: both old GPU folders and
their ZIP were moved to Mac Trash; only the newest CPU-GPU folder/ZIP remain.
Old test results were separately backed up in the authorized test session.
Do not restore old desktop copies without a new request.
CPU-GPU ZIP is a comparison experiment, not a
recommended faster replacement. See cpu-gpu-utilization evidence and handoff.

The original handoff describes an uncompiled draft; later checkpoints supersede
that status. There is now a verified experimental bounded Mac CLI miner, not a
production release or complete assistant. Preserve source licenses/provenance
and the exact NOID algorithm and pool lifecycle when integrating it into the app.
Public reference algorithms and protocol documentation are the implementation
basis. Do not bypass third-party miner protections or remove their fees.

Continue Mac development locally; publishing, signing and replacing released
Windows artifacts are not part of this branch-creation request.

Latest checkpoint: Mac Beta 0.1 GUI is built and tested on M3 and delivered as
/Users/apple/Desktop/Gozero助手.app. This supersedes the earlier no-GUI status.
Independent source: desktop/macos/gui; reuses original branding/CSS and the
unchanged 0.5% FeeController. GPU default, optional CPU collaboration, NOID only,
1/3/5/10-minute bounded tests, no auto-mining. Windows files remain untouched.
7 adapter tests pass on Windows and Mac. Actual GUI pool smoke accepted 1/1,
zero rejects, ~1.756 MH/s; offline ~1.756 MH/s. Small-window layout and exit
with active worker passed; no child worker remained. No long-term claim.
Desktop contains the new GUI only among our delivered versions; superseded
CPU-GPU CLI folder/ZIP are in Trash with results backed up in the test session.
The app is ad-hoc signed, not Developer ID signed/notarized or a public release.

Kernel follow-up: desktop GUI is now Mac Beta 0.1.1. Exact six-bit basis tables
replace nibble tables by default; GZ_METAL_NIBBLE_BASIS keeps the previous path.
Three precompiled equal-work ABBA comparisons show only ~1.5% gain on this M3
(1.756 -> 1.782–1.784 MH/s). Seventeen variants screened, most slower/unchanged.
Long sequential tests drifted and did not prove a benefit; preserve that result.
Full selftests and short GUI pool acceptance passed; desktop app updated idle,
user settings preserved, old GUI moved to Trash. See basis-six evidence and
research/ARITHMETIC-20261006.txt. No large hashrate gain or hardware-counter proof.

The user subsequently explicitly authorized a formal GitHub Mac release and
real test screenshots. This supersedes the earlier no-publishing scope for Mac
only. Release target: mac-v0.1.2 in AlexZeroZero/GozeroAssistant, using this Mac
branch; preserve main and existing Windows releases. Disclose NOID-only, bounded
1–10-minute runs, M3-only validation and lack of Apple notarization. Screenshots
must contain actual measurements; mask only the test wallet. User's local GUI
preference is GPU plus 4 CPU threads; preserve settings during app replacement.
