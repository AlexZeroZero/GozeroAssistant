# Changelog

## 0.3.1 — 2026-09-30

- **LAN relay, `--serve IP:PORT`**: one Jetsam node for a whole home
  network. The relay runs on the node's machine, is the node's only miner,
  and serves the node's template to every towerminer of the network, each
  with a nonce region of its own; a solution reaches the node once per
  template, a second one on a template already won is answered "stale".
  It waits and retries like a pool: the node's "template still being
  prepared" and "waiting for network synchronization" are retried while the
  template lives, and "already active" keeps the template the relay holds
  (served on, a few seconds at a time and 240 s at most, while the node's
  slot still takes solutions after the life it announced: the machines
  mined through that window instead of idling). A solution the node was
  still waiting on when a new block arrived is reported "stale".
- **LAN only**: the relay refuses to listen on an address that is not
  private (RFC 1918), link-local or loopback, and refuses clients outside
  them. `--allow-public` lifts both rules (off by default; risky, plain
  HTTP).
- **Its own key**: miners present the LAN key (`--lan-key` or
  `TOWERMINER_LAN_KEY`, at least 16 characters, never the node's key). The
  node's key stays on the node's machine: never sent to a miner, never
  printed.
- **Mining methods only**: `jetsam_getBlockTemplate` and
  `jetsam_submitBlock` pass; any other method is refused without reaching
  the node, and so is a miner's own payout address (blocks pay the node's
  wallet).
- **Submission timeout 120 s** (was 45 s): through a relay, a solution
  found while the node still proves its template waits for that proof; one
  was answered accepted after 49 s on the testnet, when the miner had
  already given up and counted it `unknown`.
- **Per-machine figures**: address, `--worker-name`, CPU, reported rate,
  last request, blocks found / accepted / refused, in the log every
  `--report-secs` and in `--status-json` (`relay` and `workers` events every
  5 s, `block` for every solution).

## 0.3.0 — 2026-09-30 — first public release

- **Public release**, Apache-2.0, for Linux (x86-64, glibc 2.34+) and
  Windows 10/11 (x86-64).
- **No thermal guard in the default build**: no temperature sensor is needed
  and the miner never stops on heat by itself. The previous behaviour (guard
  on by default, sensor required, stop at 81 C, duty-cycle regulator) is the
  optional Linux build `--features fleet`.
- **Windows port**: scratchpads in large pages through `VirtualAlloc`
  (`MEM_LARGE_PAGES`, after enabling "Lock pages in memory"), normal pages
  otherwise with one clear warning; worker threads pinned with
  `SetThreadGroupAffinity` (processor groups, more than 64 CPUs); topology
  and cache sizes from `GetLogicalProcessorInformationEx`; foreign load for
  `--tune` from `GetSystemTimes`; `--tune` results under
  `%APPDATA%\towerminer`; HTTP over rustls (no OpenSSL anywhere).
- **CPU quota**: a Linux cgroup CPU limit (`cpu.max`, or v1
  `cfs_quota_us / cfs_period_us`, over the process's cgroup and its
  ancestors) caps the worker threads at `ceil(quota / period)`, spread one per
  core, and is printed at start-up. On rented machines 112 threads had been
  started for a quota of 13.4 CPUs.
- **Intel table** (family 6, previously "unknown CPU", 2 threads/core x
  1 pad), from `--tune` runs on 13 Intel machines: one thread per core
  (no SMT, or a quota that leaves no more workers than cores) -> 1 x 2 pads
  x prefetch (+51 % on a Core Ultra 9 285K, +8 % on a Xeon Gold 6430, the
  measured best of every quota-limited machine); SMT with L2 < 2 MiB ->
  2 x 1 pad, unchanged (best on i7-8700K and i7-11700F); SMT with
  L2 >= 2 MiB -> 2 x 2 pads x prefetch. AMD rows unchanged. The
  measurements are documented next to the table in `src/main.rs`.
- **`--threads N`** now means N logical CPUs, whole cores first; the profile
  applies inside them (it used to cap the worker count).
- **No machine name sent by default**: the machine's host name is no longer
  sent to the node or pool. **`--worker-name <NAME>`** sends a name of
  your choice in `X-Jetsam-Host` (printable ASCII, 32 characters at most),
  for per-machine statistics on a pool; without it there is no
  `X-Jetsam-Host` header. `X-Jetsam-CPU` (CPU model, worker threads and
  profile) is still sent: pools show it per worker and use it to spot a slow
  setup. The thermal-guard build (`--features fleet`) still sends the host
  name when no `--worker-name` is given.
- **Low priority by default, `--priority low|normal`**: nice 19 on Linux
  (set before any thread starts; a refusal is not fatal, a lower priority is
  never raised), below-normal priority class on Windows. A Jetsam node on the
  same machine prepares every block's logbook proof on the CPU: measured
  31 s alone, 83-149 s next to a miner at normal priority on every core,
  35-38 s next to a miner at low priority, with no measurable loss of hash
  rate. `--priority normal` leaves the priority unchanged (a machine that
  only mines). The start-up log shows the priority; the thermal-guard build
  behaves the same.
- **Graphical interface**: Jetsam Desktop, which embeds towerminer. The
  former `gui/` Windows window is no longer shipped.
- **`--status-json`**: one JSON event per line on stdout (`profile`,
  `status` every 5 s, `block`, `error`), for front ends.
- **Clean stop** on Ctrl-C / SIGTERM / console close: exit 0 with totals.
- Transport errors now carry their cause ("connection refused", ...).
- `--version` shows `+fleet` for the thermal-guard build and `+mutant` for
  the gate's negative builds.

## 0.2.2 — 2026-09-30

- Submission: every solution on its own thread (at most 4 in flight), 45 s
  timeout (the node may hold a submit ~30 s while it finishes its proof), one
  attempt only; no answer = `unknown` (neither accepted nor refused).
- Template poll: 30 s timeout; exponential backoff only when the pool does
  not answer.
- Table: Zen 4/5 (L2 >= 1 MiB) 2 threads/core x 1 pad (+10 % on a
  7950X3D); Zen 2 2 x 1 x prefetch (+7 % on 2x EPYC 7742).
- The pipelined walk has a prefetch variant (gated).
- `--tune` measures the foreign CPU load before and during each candidate
  and stores nothing when it exceeds 5 % without `--tune-force`.

## 0.2 — 2026-09-28

- Fast kernel: at 1 pad, byte-offset addressing + one-add fill + pipelined
  fill anchors + 8-seed sponge batch; at >= 2 pads, grouped fold. Every lever
  gated end to end before it was timed (+4.8 % over 0.1 on a Ryzen 9 5950X,
  +37 % over the node's built-in search).
- Two policies, `--policy hashrate` and `--policy efficiency`; `--tune`
  measures both on the machine.
- Huge pages verified per worker, `--require-huge`.
- `--bench-walk`, `--check-nonces`, `--check-hardware`, release gate.

## 0.1 — 2026-09-26

- First TowerWalk engine: persistent pinned workers, several nonces walked in
  lockstep per thread, pads in 2 MiB pages, profile from the CPU family and
  L2 size, every solution re-checked by the reference walk.
