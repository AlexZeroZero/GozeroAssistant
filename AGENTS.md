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

Latest user explicitly requested pool choices and continued mining with the
main window closed using a floating window or top menu bar. Mac 0.1.4 now uses
a native menu bar with real rate/state, Show, Stop and Quit controls. Closing
hides the main window; explicit Quit/Cmd+Q stops all children. This supersedes
earlier close-means-stop requirements. Hidden tasks retain their original
1–10-minute bound. TLS remains default; explicit Suprnova TCP compatibility
was added after all four TLS endpoints timed out on M3. See latest handoff.

Latest publication request: replace the previous GitHub Mac release with the
bilingual build and upload the two supplied JPEGs. User explicitly requires
release body, links and README unchanged. Preserve the compatibility release
URL/tag and ZIP filename; disclose actual version/new hash in CURRENT-VERSION.
Keep an actual version source tag (mac-v0.1.5), validate all assets before old
release deletion, and preserve Windows/main. This is explicit replacement
permission; no additional approval is needed.


Latest user request supersedes every prior GUI session-bound requirement:
Mac 0.1.6 is continuous mining, with no 10-minute limit. GUI profiles migrate
legacy duration values to zero; the pool controller and native worker interpret
zero as continuous. Offline benchmarks and the research CLI remain bounded.
Keep Stop, Quit, thermal protection, EOF cleanup and the original fee ledger.
M3 same-session hidden run passed 660.453 seconds, 33 accepted / 0 rejected;
this verifies removal of the time limit, not multi-day stability. Desktop is
0.1.6, settings preserved, old 0.1.5 in Trash. Publication retains the original
release/download URL and user JPG section; only duration-related body/README
wording changes. Current package metadata is in CURRENT-VERSION and SHA256SUMS.


Latest checkpoint: desktop GUI 0.1.8 includes measured QTC and PRL optimizations.
See the latest MAC_HANDOFF.txt and cores/optimization/RESULTS.txt. QTC uses exact
round restructuring plus adaptive bounded dispatch; base Apple M3 PRL uses a
validated BK32/PF0 profile. Other PRL GPUs retain upstream geometry. Preserve
CPU verification, G3 identity/gates, original fee ledger and continuous mining.
One M3 tested; negative/background-load samples retained. External QTC/PRL pool
acceptance still unverified. Desktop 0.1.7 moved to Trash, settings preserved;
GitHub/main/Windows and retained README unchanged by this optimization task.

Latest checkpoint: Mac 0.1.9 adds exact half-input/FP32-accumulator PRL on base
Apple M3, with 94-case G3, Rust proof and local mock validation. See handoff
and RESULTS.txt: paired full-pipeline gains ~5% / ~14.6% at tested sizes,
absolute rates still decline. QTC unchanged in this pass, but now one real
Kryptex accepted share observed. PRL external acceptance remains unverified.
Preserve all original fee, admission, proof and continuous-mining behavior.

Latest checkpoint: Mac0.1.10 adds a native ARM64 CPU BNT port and GUI integration.
See handoff and gui/evidence/mac-bnt-0.1.10.json. Full2GiB consensus tests pass;
real M3 CLI2/2 and GUI1/1 shares accepted, no rejects. Single-thread local median
~1.20H/s; no Metal BNT backend or peak-performance claim. Desktop app/DMG updated,
old0.1.9 backed up in session, existing user settings/fee ledger unchanged.
Default1thread with native memory guards. Preserve original0.5% fee; Windows
and GitHub public0.1.9 untouched. New0.1.10 has not been published to GitHub.

Latest checkpoint: Mac0.1.11 fixes BNT over-strict startup memory checks. Requested
threads automatically clamp; pressure monitoring reduces workers or stops at
critical pressure. See handoff/evidence. Actual M3 GUI8requested->2active, one
accepted/zero rejects in22s, ~2.20H/s short sample. Desktop app/DMG updated idle,
settings/address/fees preserved; GitHub remains0.1.9. No automatic increase or
restart after pressure recovery; full2GiB consensus scratch remains required.

Latest source checkpoint:0.1.12 BNT adaptive controller is PREPARED, NOT DEPLOYED.
M3 SSH unavailable; user away.40 Windows tests pass; source updater bundle ready.
Auto mode grows/restores workers, critical pressure waits then recovers; explicit
Stop never resumes. Native hashing remains verified0.1.11, full2GiB per worker.
See latest handoff/evidence. Desktop remains last-verified0.1.11, GitHub0.1.9;
do not claim0.1.12 Mac performance, installer validation or deployment yet.

Latest checkpoint supersedes prepared-only status: Mac0.1.12 is now M3-tested
and deployed to Desktop with verified DMG, BNT Auto0 configured, opened idle.
Warning-pressure startup fixed to permit one budgeted worker.41 tests pass on
Windows/Mac;150s GUI accepted2/rejected0. Another run grew1->4 then reduced to1;
peak3.60H/s is short-lived, not sustained. Real worker release/recovery tested
with injected controller pressure only. See latest handoff/evidence. GitHub
remains0.1.9; Windows and fee arithmetic unchanged.

Latest checkpoint: Mac0.1.13 adds MDS / Midstate Metal and ARM64 NEON verification,
with full million-round consensus.45 GUI tests,11 protocol,2 consensus and2 GPU
checks pass. Real M3 GUI97s accepted1/rejected0; last350N/s, full sample mean174N/s
includes initial44s job wait. See handoff/evidence; no sustained/all-M claim.
Desktop app/DMG deployed idle, supplied MDS address configured; existing profiles,
fee ledger and all prior native payloads preserved. Original0.5% fee unchanged.
MSS reusable addresses only; never one-time WOTS. No CUDA requirement on Mac.
MDS not published to GitHub in this task. Prior public0.1.12 asset switch had
already happened before MDS work; old public0.1.9 statements are superseded.

Latest checkpoint: Mac0.1.14 MDS scheduling optimization is M3-tested/deployed.
Production ABBA4x90s:359.286->476.088N/s (+32.51%), same90%duty; complete batches
5.707->5.380s. BaseApple M3 auto2560, other adapter names2048; explicit overrides
win. Metal completion polling sleeps500us; fullmillion-round shader and CPU
verification unchanged. Only this10-coreM3 measured (8-coreM3 shares its name).
45GUI tests each host,11protocol,2profile,2consensus,2GPU tests pass.262.2sGUI
last487.486N/s, submitted0/accepted0/rejected0; do not claim new pool acceptance.
DesktopApp/DMG0.1.14 opened idle; settings/fee bytes and19397 other native files
preserved, previous0.1.13 backed up. See latest handoff and MDS-RESULTS.txt.
Research large-dispatch800N/s peaks collapsed to275 and were rejected. No
experimental shader/QoS/activity/pacing overrides ship. No GitHub publication.
