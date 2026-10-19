# towerminer

A free, open-source CPU miner for **Jetsam (JTM)**, for the TowerWalk proof of
work (Jetsam v1.4 and later). It speaks the same protocol as `jetsam-miner`
(`jetsam_getBlockTemplate` / `jetsam_submitBlock` over JSON-RPC, Bearer key),
so it mines against **your own Jetsam node** or against a **compatible pool**.

What it does differently from the miner built into the node:

- persistent worker threads pinned to CPUs, each owning its scratchpads in
  huge pages (2 MiB transparent huge pages on Linux, large pages on Windows);
- several nonces walked in lockstep per thread, and a profile (threads per
  core, pads per thread, prefetch) chosen from the CPU family, the L2 size and
  the SMT layout — or measured on your machine with `--tune`;
- every solution is recomputed by the reference implementation before it is
  submitted, a sentinel hash is re-checked every 4096 hashes, and a golden
  self-test runs at start-up. A miner that diverges from the reference stops.

Version 0.3.1. License: Apache-2.0 (see `LICENSE`). The Jetsam sources it
builds on are vendored unmodified in `vendor/` (Apache-2.0).

## Requirements

- An x86-64 CPU with SSE4.1 and PCLMULQDQ: practically every CPU since 2011
  (Intel Westmere / Sandy Bridge, AMD Bulldozer and later). Wider units
  (AVX2, VPCLMULQDQ, AVX-512) are used when present.
- **Linux**: glibc 2.34 or newer — Ubuntu 22.04 and 24.04, Debian 12, Fedora
  35+, and so on.
- **Windows**: Windows 10 or 11, 64-bit.
- A few MiB of memory per worker thread.

Check a machine before mining:

    towerminer --check-hardware

## Download and verify

Each release ships:

- `towerminer-0.3.1-linux-x86_64.tar.gz` (binary, README, LICENSE)
- `towerminer-0.3.1-windows-x86_64.zip` (`towerminer.exe`, README, LICENSE)
- `SHA256SUMS`

Verify before you run:

    sha256sum -c SHA256SUMS --ignore-missing        # Linux
    certutil -hashfile towerminer-0.3.1-windows-x86_64.zip SHA256   # Windows

## Solo mining with your own node

This is the way to mine that keeps Jetsam decentralized: your node follows
and validates the chain, builds and proves each block, and towerminer only
searches the nonce.

1. Run a synchronized Jetsam node (v1.4 or later) in external-mining mode,
   with a long random token of your choice:

       jetsam --mode extminer --mining-key '<long-random-token>'

   The node's JSON-RPC listens on `127.0.0.1:9701` by default. By default the
   node pays its own wallet's active address (or `--miner-address j1...`).
   To let the miner choose the payout address, add `--allow-custom-coinbase`
   on the node and `--coinbase j1...` on towerminer.

2. Start towerminer next to it:

       towerminer --rpc http://127.0.0.1:9701 --key '<long-random-token>'

   The key can also come from the environment, which keeps it out of the
   process list:

       export TOWERMINER_KEY='<long-random-token>'      # Linux
       set TOWERMINER_KEY=<long-random-token>           # Windows (cmd)
       towerminer --rpc http://127.0.0.1:9701

The node proves every block before it hands out work, and that proof runs on
the same CPUs: see [Leave your node room](#leave-your-node-room-the-logbook-proof).

To mine from the other machines of your network with this one node, run the
LAN relay on the node's machine: see [Several machines, one
node](#several-machines-one-node-the-lan-relay). Do not open the node's own
RPC port to the network: it also serves the wallet.

Blocks found are logged (`SOLVED h=... hash=...`) and the node reports them
with `jetsam-cli mining` / `jetsam-cli balance`.

## Leave your node room: the logbook proof

A Jetsam node that builds a block proves the whole history of the chain in
it. This work, the logbook prover, runs on the CPU, and a miner on the same
cores slows it down. Measured, the node's preparation of a block took 31 s
with the node alone, 83 to 149 s next to a miner at normal priority on every
core, and 35 to 38 s next to a miner at low priority, with no measurable loss
of hash rate.

towerminer therefore runs at low priority by default: nice 19 on Linux, the
below-normal priority class on Windows. The node gets the CPU first whenever
it needs it. The start-up log shows `priority: low (nice 19)`,
`priority: below normal` or `priority: normal`.

When the other cores of the machine mine at normal priority, reserve cores for
the node. Measured on an AMD EPYC 7742 (Zen 2), the preparation stayed
within its budget with 8 cores (16 threads) kept free for small blocks and
16 cores (32 threads) for large ones. On a 64-core, 128-thread CPU:

    towerminer --threads 96                  # 32 threads (16 cores) left to the node
    towerminer --exclude-cpus 0-15,64-79     # the same, as a list, when CPU n and n+64 share a core

Check which logical CPUs share a core with `lscpu -e` before writing a list.

On a machine that only mines, with no node on it, `--priority normal` leaves
the priority unchanged.

## Several machines, one node: the LAN relay

A Jetsam node that builds a block proves the whole history of the chain in it
(the logbook proof; the node is the *logbook prover*). One node is enough for
a whole home network: the other machines only search the hash (TowerWalk),
at their full rate, and need no node, no chain and no disk.

    machine with the node:  jetsam --mode extminer  +  towerminer --serve (the relay)
    other machines:         towerminer --rpc http://<relay address> --key <LAN key>

The relay runs on the node's machine and is the node's only miner. It keeps
the node's template and hands it to every machine with a nonce region of its
own, so no two machines search the same nonces; it passes each solution to
the node once, and answers "stale" to a second solution on a template already
won. When the node says its single mining slot is still active (it keeps
taking solutions for a while after it stops handing the template out), the
relay keeps the machines on the template it holds rather than leave them
idle. Every block is paid to the node's wallet.

What it lets through, and nothing else:

- **Your local network only.** The relay listens only on a private
  (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), link-local or loopback
  address, and refuses connections from any other address.
- **Its own key.** Mining machines present the *LAN key* (at least 16
  characters). It is not the node's mining key: that key stays on the node's
  machine and the relay never sends it to anyone.
- **Mining only.** `jetsam_getBlockTemplate` and `jetsam_submitBlock`, what
  towerminer calls. No wallet, chain or administration method passes.

`--allow-public` lifts the address rules. It is off by default and risky:
the relay speaks plain HTTP, so on a public address the LAN key travels in
clear, and anyone who reads it can mine on your node.

### Recipe 1 — solo: node and miner on one machine

Linux:

    jetsam --mode extminer --mining-key '<node key>'
    TOWERMINER_KEY='<node key>' towerminer --rpc http://127.0.0.1:9701

Windows (cmd):

    jetsam.exe --mode extminer --mining-key <node key>
    set TOWERMINER_KEY=<node key>
    towerminer.exe --rpc http://127.0.0.1:9701

### Recipe 2 — the node for your network: node + relay

Find the machine's address on your network (`hostname -I` on Linux, the
"IPv4 Address" line of `ipconfig` on Windows); below, `192.168.0.10`. Choose
a LAN key, for example with `openssl rand -hex 16` (Linux) or
`powershell -Command "[guid]::NewGuid().ToString('N')"` (Windows).

Linux:

    jetsam --mode extminer --mining-key '<node key>'
    TOWERMINER_KEY='<node key>' TOWERMINER_LAN_KEY='<LAN key>' \
        towerminer --serve 192.168.0.10:9702 --rpc http://127.0.0.1:9701

Windows (cmd):

    jetsam.exe --mode extminer --mining-key <node key>
    set TOWERMINER_KEY=<node key>
    set TOWERMINER_LAN_KEY=<LAN key>
    towerminer.exe --serve 192.168.0.10:9702 --rpc http://127.0.0.1:9701

(`--key` and `--lan-key` work too; the environment keeps the keys out of
the process list.) The relay itself hashes nothing and runs at normal
priority. To mine on this machine as well, start a miner through the relay,
like any other machine (recipe 3), in another terminal:

    TOWERMINER_KEY='<LAN key>' towerminer --rpc http://192.168.0.10:9702 --worker-name node-pc

It runs at low priority, as always, so the node's logbook proof keeps the CPU
first.

### Recipe 3 — the mining machines

Linux:

    TOWERMINER_KEY='<LAN key>' towerminer --rpc http://192.168.0.10:9702 --worker-name attic

Windows (cmd):

    set TOWERMINER_KEY=<LAN key>
    towerminer.exe --rpc http://192.168.0.10:9702 --worker-name attic

`--worker-name` is optional; it names the machine in the relay's list (else
its address). On a machine that runs nothing else, `--priority normal` is
fine too.

### Firewall

The mining machines connect to the relay's port (9702 above) on the node's
machine. On **Windows**, the first `--serve` makes Windows ask whether
towerminer may accept connections: allow it on **private networks** only.
On **Linux**, if a firewall runs on the node's machine, open that TCP port
to your local network yourself (and to it only); towerminer never changes a
firewall. Never forward this port from your router to the Internet.

### What the relay shows

Every 30 s (`--report-secs`) its log sums up the state, the height, the
workers, their total rate and the blocks, then one line per machine: name,
address, CPU, rate, when it was last seen, blocks found / accepted /
refused. Each solution is logged with its verdict (`BLOCK ACCEPTED h=...
from attic (192.168.0.21)`). With `--status-json`, stdout carries:

    {"type":"relay","ts":1790763206,"version":"0.3.1","listen":"192.168.0.10:9702","upstream":"http://127.0.0.1:9701","state":"serving","message":"","height":25310,"workers":2,"hps":31000,"found":3,"accepted":2,"refused":1,"unknown":0,"uptime_s":3605}
    {"type":"workers","ts":1790763206,"workers":[{"id":"192.168.0.21/attic","name":"attic","ip":"192.168.0.21","cpu":"Ryzen 9 5950X - 32t (2/core, 1 pads)","version":"towerminer/0.3.1","hps":16890,"last_seen":1790763205,"jobs":1234,"found":2,"accepted":2,"refused":0,"unknown":0,"region":2861541377}]}
    {"type":"block","ts":1790763300,"height":25311,"result":"accepted","hash":"<block hash, hex>","worker":"attic (192.168.0.21)","ip":"192.168.0.21","message":""}

- `relay` every 5 s: `state` is `serving` (a live template), `waiting`
  (no template yet, the node is synchronizing, or a block was just found) or
  `error` (the node does not answer, or refuses the relay's key), with
  `message` saying why; `workers` counts the machines seen in the last
  2 minutes and `hps` adds up the rates they report.
- `workers` every 5 s: every machine seen in the last hour; `name` is null
  without `--worker-name`, `hps` is the rate the machine reports,
  `last_seen` the time of its last request.
- `block` for every solution: `accepted`, `refused` (stale, or refused by
  the node) or `unknown` (the node did not answer).

A solution found while the node still proves its template waits for the end
of that proof, then for the seal: the relay retries for up to 110 s. A miner
waits 120 s for its answer (towerminer 0.3.0: 45 s). When the node takes
longer, the miner counts the block `unknown` while the relay still gets the
verdict and counts it.

## Mining with a pool

Any pool that serves the `jetsam-miner` protocol works:

    towerminer --rpc http://<pool-host>:<port> --key <your-pool-key>

The pool assigns each miner its own nonce region; two towerminer processes
behind the same key never search the same nonces.

### What the miner sends

By default the miner sends no name for you or your machine. With every
request it adds these HTTP headers:

- `X-Jetsam-Version` (`towerminer/0.3.1`) and `X-Jetsam-PoW` (`walk`): the
  node or pool knows which work this miner can compute.
- `X-Jetsam-Hashrate`: the measured hash rate, once known.
- `X-Jetsam-CPU`: the CPU model, the number of worker threads and the
  profile, for example `Ryzen 9 5950X - 32t (2/core, 1 pads)`, with ` 4K!`
  when huge pages are missing and ` eff` under `--policy efficiency`. A pool
  uses it to show each worker's hardware and to spot a slow setup (4 KiB
  pages).

The machine's host name is never sent. To have a pool list your machines
separately, name each one:

    towerminer --rpc http://<pool-host>:<port> --key <your-pool-key> --worker-name rig-1

`--worker-name` is sent in `X-Jetsam-Host` (printable ASCII, 32 characters
at most; other characters are dropped). Without it there is no
`X-Jetsam-Host` header at all. The Jetsam node itself does not read it.

## Choosing the CPUs

- `--threads N` — use N logical CPUs, whole cores first (both SMT siblings of
  a core, then the next core). The profile applies inside them: on a CPU whose
  profile runs one thread per core, `--threads 8` on 4 cores runs 4 workers.
- `--cpus 0-7,16-23` / `--exclude-cpus 0,1` — an explicit CPU list.
- `--threads-per-core 1|2`, `--pads 1..4`, `--prefetch 0|1` — override the
  profile.
- `--priority low|normal` — low (default) lets a node on the same machine
  prove its blocks first; see [Leave your node room](#leave-your-node-room-the-logbook-proof).
- A CPU quota (Linux cgroups: containers, systemd `CPUQuota=`, rented
  machines) is detected: the miner never runs more worker threads than
  `ceil(quota / period)` and says so at start-up.

## Tuning

The built-in table covers AMD Zen 2 to Zen 5 and Intel family 6 (Sandy Bridge
to Arrow Lake), from measurements (see [BENCHMARKS.md](BENCHMARKS.md)). Your machine can do better: measure it
once, on an otherwise idle machine:

    towerminer --tune 10

This tries every candidate profile twice (about 5 minutes), keeps the fastest,
and stores it (`~/.config/towerminer/tune.json` on Linux,
`%APPDATA%\towerminer\tune.json` on Windows). Later runs load it
automatically; `--no-tune-file` ignores it. If other programs keep the CPUs
busy during the measurement, nothing is stored (`--tune-force` stores it
anyway). `--policy efficiency` loads the profile with the most hashes per
joule: from the table on AMD Zen 3, from `--tune` where power could be
measured (Linux, RAPL readable).

## Huge pages (worth about 20-25 %)

**Linux** — transparent huge pages must not be disabled. Ubuntu and Debian
default to `madvise`, which is all the miner needs:

    cat /sys/kernel/mm/transparent_hugepage/enabled      # [madvise] or [always]
    echo madvise | sudo tee /sys/kernel/mm/transparent_hugepage/enabled

With THP set to `never` the miner refuses to start (exit 4) unless you pass
`--no-huge`. The start-up line `huge pages: N/N workers in 2M pages` confirms
it works.

**Windows** — large pages need the "Lock pages in memory" right:

1. Run `secpol.msc` (Windows Pro / Enterprise / Education).
2. Local Policies → User Rights Assignment → **Lock pages in memory**.
3. Add your user account, OK.
4. Sign out and back in (or reboot).

Without it the miner runs in normal pages, about 20-25 % slower, and says so
once at start-up. `towerminer --check-hardware` shows the `largepage` state.

## Checking the miner

    towerminer --check-hardware          # CPU backend, caches, huge pages, quota
    towerminer --gate                    # bit-exact gate: 256 golden vectors + 1000 random seeds, every kernel shape
    towerminer --check-nonces 20         # mine a dummy target 20 s; every solution recomputed from its nonce
    towerminer --bench-walk 20           # hash rate of the chosen profile

`--gate` must print `GATE PASS`, `--check-nonces` must report `bad=0 dup=0
outside_region=0`.

## Output for front ends (`--status-json`)

With `--status-json`, stdout carries one JSON object per line (flushed at
every line); the human log stays on stderr:

    {"type":"profile","version":"0.3.1","backend":"avx2+vpclmul","cpu":"Ryzen 9 5950X","threads":16,"tpc":1,"pads":1,"prefetch":false,"kernel":"fast(simple+fill1,pipe)","pages":"2M"}
    {"type":"status","ts":1790763206,"hps":16890.2,"height":25310,"found":3,"accepted":3,"refused":0,"unknown":0,"uptime_s":3605,"state":"mining","message":""}
    {"type":"block","ts":1790763300,"height":25311,"result":"accepted","hash":"<block hash, hex>"}
    {"type":"error","message":"..."}

- `profile` once at start; `pages` is `2M`/`4K` (Linux) or `large`/`normal`
  (Windows).
- `status` every 5 s; `hps` over the last 10 s; `height` is null before the
  first template; `state` is `mining`, `waiting` (no work yet, or the last
  block was ours) or `error` (node or pool unreachable, bad key), with
  `message` saying why.
- `block` for every submitted solution: `accepted`, `refused` or `unknown`
  (no answer: the block may still have been accepted); `hash` when accepted.
- `error` before any exit with a non-zero code.

Ctrl-C (or SIGTERM, or closing the console) stops the miner cleanly: the
solutions already submitted get a few seconds for their answer, the totals
are printed, exit code 0.

## Exit codes

| code | meaning |
|---:|---|
| 0 | clean stop |
| 1 | fatal error (no usable CPU, memory mapping failed, malformed template, ...) |
| 2 | start-up self-test failed, or invalid arguments (`--serve`: an address outside the local network, a missing or too short LAN key, or one equal to the node key) |
| 3 | the kernel diverged from the reference walk (nothing was submitted) |
| 4 | huge pages required (`--require-huge`) and absent, or THP disabled |

## Temperature

This build has **no thermal guard**: it does not read any temperature sensor
and never stops on its own because of heat. Your CPU still throttles itself
when it runs too hot; watch your temperatures, especially on laptops and
small cases, and use `--threads` to mine on fewer CPUs.

The source also has an optional thermal-guard build (Linux only, `cargo build
--release --features fleet`): it refuses to start without a CPU temperature
sensor (exit 5, `--no-thermal-guard` to override), regulates the duty cycle to
a target temperature and stops at 81 C (exit 82). See `--help` of that build.

## Building from source

A recent stable Rust toolchain (the release is built with Rust 1.96).

Linux:

    cargo build --release
    ./target/release/towerminer --gate

Windows executable, cross-compiled from Linux (MinGW-w64):

    sudo apt install gcc-mingw-w64-x86-64
    rustup target add x86_64-pc-windows-gnu
    cargo build --release --target x86_64-pc-windows-gnu

The release artifacts are built by `scripts/build.sh` (Docker, Ubuntu 22.04
for the glibc floor), which also runs the release gate: vendored sources
checked against `VENDOR.sha256`, unit tests, `--gate`, `--check-nonces`.

The vendored Jetsam sources (`vendor/`, `git archive` of jetsam commit
`ea67571`, see `vendor/SOURCE_COMMIT`) are never modified: `VENDOR.sha256`
lists every file.
