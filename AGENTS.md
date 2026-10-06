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

The original handoff describes an uncompiled draft; later checkpoints supersede
that status. There is now a verified experimental bounded Mac CLI miner, not a
production release or complete assistant. Preserve source licenses/provenance
and the exact NOID algorithm and pool lifecycle when integrating it into the app.
Public reference algorithms and protocol documentation are the implementation
basis. Do not bypass third-party miner protections or remove their fees.

Continue Mac development locally; publishing, signing and replacing released
Windows artifacts are not part of this branch-creation request.
