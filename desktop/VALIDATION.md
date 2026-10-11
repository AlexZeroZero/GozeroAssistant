# 1.0.42 validation / 验证范围 — 2026-10-11

- 193 automated tests passed, including known protocol/port pairs, custom and IPv6 endpoint preservation, strict hostname matching and unsupported-protocol rejection.
- Real Electron smoke passed: PRL/QTC TCP and TLS round trips, ZCD saved URL changes, BNT TCP / Seine TCP-only selector, YSR HTTPS-only control, dual NOID manual protocol and automatic compatibility controls, four languages and light theme. UI screenshots inspected.
- Verified official Kryptex connection-table ports through read-only pages https://pool.kryptex.com/prl and https://pool.kryptex.com/qtc on 2026-10-11. Custom endpoint TLS availability is not inferred from protocol selection.
- No mining or live pool login was started. No mining kernel, hashrate or fee behavior changed. Backup endpoints retain their own protocol; explicit NOID protocol selection uses native mode until the user selects auto compatibility again.

# 1.0.41 validation / 验证范围 — 2026-10-09

- 190 automated tests passed: default/disabled pool identity, independent dual settings, XMRig supported metadata, loopback BNT login payload, exact GPU/CPU log filtering, and previous regressions.
- Real Electron UI smoke passed: persisted reporting toggles, independent CPU/GPU configuration, main/workbench log filters, four languages, light theme and 1.1 zoom on both windows. Main content is approximately 872×654; floating content approximately 317×240 (Windows DPI rounding may differ by a few pixels). Screenshots inspected for clipping.
- YSR host 0.1.4 compiled and metadata-only CLI checked with reporting enabled/disabled. CUDA PTX unchanged: SHA256 80d5d7c7e831cf241826dfdf644d31dc4c0985fbde06a39161844cb3e2f796d7.
- No mining started. Local protocol tests confirm outgoing metadata, not remote pool display or share acceptance. Third-party miners carry device data through supported worker/agent fields; dedicated model columns depend on pool support. No antivirus configuration changed.

# 1.0.40 validation / 验证范围 — 2026-10-09

- 185 automated tests passed, including queued latest-value saves, failure recovery and independent dual tasks.
- Real Electron UI checks passed: single GPU/CPU and dual automatic performance saves, logical CPU thread budgets, independent saving while a wallet draft is incomplete, invalid-address recovery, advanced settings access, four languages and light theme. No mining was started.

## Previous release validation

# 1.0.38 validation / 验证范围 — 2026-10-08

- 182 automated tests passed locally. Coverage includes exact decimal amounts, null vs zero, confirmed vs reserved payments, per-section polling, 429 backoff, stale responses, wallet changes, pagination, legacy pool adapters and mining regressions.
- Real read-only Electron requests to Gozero Pool for YSR, ZCD and BNT: mining, wallet and payments all succeeded. Dynamic settlement rules were loaded for ZCD/BNT. YSR payment pagination, single/dual account views and dark/light UI checks passed. No mining was started in this API verification.
- Interface screenshots show pool-side estimates and existing address ledger data; they do not demonstrate local live hashrate, new earnings, or a new payment.
- BNT 0.2.1 retains old default paths; `stream` is only an auto-tuning candidate. Previous local sustained 4-thread tests measured +2.87% vs 0.2.0 and -4.03% vs Seine; an 8-thread short test regressed, so gains are not universal. The final custom binary passed full-size vectors, a 4-accepted/0-rejected pool run and Assistant start/sample/stop checks. AVX-512 speed and the user's 3995WX were not benchmarked here.
- Seine 0.2.15 download/install hashes and selection passed; its in-Assistant launch was denied by Windows (error 5), with a Tencent security prompt confirmed by the user. End-to-end Seine mining in the Assistant remains unverified on this host. No antivirus settings or upstream fees were modified.
- Software service fee remains 0.5% time sharing; engine and pool fees are separate. CPU temperature/power monitoring and long-run payout correctness were not verified in this round.
- 此版接通三币种公开地址查询。YSR 链上余额和本池已索引奖励分开；ZCD/BNT 可用、未成熟、预留、已付分开；BNT 待成熟保留 PPLNS 可变预估说明。接口未知值不补零，失败不清空有效余额。

- Portable Windows package verified: all 304 manifest hashes and ZIP SHA256 passed; main window, floating monitor and clean exit passed without mining. Public source checkout retest: 181 passed, 1 optional archive test skipped, 0 failed after rebuilding generated helpers.

- 1.0.42 portable package: all 312 manifest hashes and ZIP SHA256 verified; main window, floating monitor and clean exit passed without mining.
- Public-source checkout verification on 2026-10-11: 192 passed, 1 optional pinned KRig archive check skipped, 0 failed.
