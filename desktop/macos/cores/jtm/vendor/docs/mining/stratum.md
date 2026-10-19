# Jetsam Stratum Mining Protocol — `JetsamStratum/1.0.0`

**Status:** Draft 1 — 2026-09-06
**Audience:** developers writing a GPU (or CPU) miner, or a pool, for the Jetsam (JTM) network, without access to any Jetsam mining software.
**Normative words:** MUST, MUST NOT, SHOULD, MAY are used in the RFC 2119 sense.

This document is self-contained. It defines (1) the proof-of-work function *TowerHash* down to the bit, with test vectors, and (2) a Stratum-style pool protocol carrying it. Nothing here requires reading Jetsam node source code.

---

## 0. Quick orientation

| Question | Answer |
|---|---|
| What does a miner search? | A 128-bit nonce. Everything else in the block is fixed by the pool's node before the job is sent. |
| What is hashed? | Sixteen 128-bit field elements (256 bytes). The nonce is **field 0**. Eight permutations of a Poseidon2b sponge over GF(2^128). |
| What is the success test? | `digest < target`, both read as **little-endian** 256-bit integers, strict inequality. |
| Is there a midstate / precomputation? | No. The nonce sits in the *first* absorbed pair, so every attempt runs all eight permutations. This is deliberate. |
| Is there an extranonce? | Yes: a 4-byte prefix assigned by the pool that occupies the top 4 bytes of the 16-byte nonce. The miner owns the remaining 96 bits. |
| Can the miner change the timestamp, coinbase or any header field? | No. There is nothing to roll. Only the nonce. |
| What does the miner submit? | `[worker, job_id, nonce_hex]` — the full 16-byte nonce, little-endian, 32 lowercase hex chars. |
| How do I know my hash is right? | Appendix B vectors, then the published 12 000-vector `golden.txt`. A miner MUST pass them before mining; a wrong hash finds nothing and reports nothing. |

---

## 1. Conventions

- **Byte strings** are written in lowercase hex without a `0x` prefix. `hex(b)` lists byte 0 first.
- **Integers** written as `0x…` are numbers, most significant digit first (ordinary notation).
- A **u128** value `v` is serialized as `v.to_le_bytes()`: 16 bytes, byte 0 = least significant. Deserialization is the inverse. This is the *wire encoding of a field element*.
- A **u256** value is serialized the same way over 32 bytes. Digests and targets are u256 values in that encoding: **byte 31 is the most significant byte**. This is the single most common implementation error; §3.5 spells it out.
- `⊕` is bitwise XOR. `a || b` is concatenation.
- JSON-RPC messages are UTF-8, one message per line, terminated by `\n`.

---

## 2. Protocol overview

```
 ┌──────────┐  getBlockTemplate / submitBlock  ┌────────────┐  Stratum (this spec)  ┌────────────┐
 │ Jetsam   │ <──────────────────────────────> │    Pool    │ <───────────────────> │   Miner    │
 │ node     │   (node RPC, not in this spec)   │            │      TCP, JSON lines  │  (GPU/CPU) │
 └──────────┘                                  └────────────┘                       └────────────┘
   owns block body, proof,                      owns jobs, extranonces,               owns nonce search
   coinbase address, timestamp                  share validation, payout               only
```

Roles:

- The **node** builds a complete, proved block candidate and exposes only its PoW input (the 16 fields with the nonce lane zeroed) and the block target. It accepts back a nonce, nothing else.
- The **pool** turns one node template into one *job*, hands the job to every connected miner with a distinct extranonce prefix and a *share target* easier than the block target, verifies each returned nonce itself by recomputing TowerHash, credits work, and forwards any nonce that meets the *block* target to the node.
- The **miner** receives jobs, iterates nonces inside its assigned prefix, submits every nonce whose digest is below the share target, and keeps searching until told otherwise.

A miner never sees transactions, the coinbase, proofs or the block body. It cannot alter them. The only thing a miner contributes is the nonce.

---

## 3. The proof of work: TowerHash

TowerHash is a fixed-length Poseidon2b sponge over the binary field GF(2^128), with state width 4, rate 2, capacity 2, an `x^7` S-box, 8 full and 58 partial rounds, absorbing exactly 16 field elements (8 rate blocks) and squeezing 32 bytes with no padding.

### 3.1 The field GF(2^128)

Consensus arithmetic is defined in the **flat basis**: the polynomial basis of

```
GF(2^128) = GF(2)[x] / (x^128 + x^7 + x^2 + x + 1)
```

An element is a 128-bit integer whose **bit i is the coefficient of x^i** (bit 0 = constant term). Note this is the *natural* bit order, not the bit-reflected order used by AES-GCM hardware conventions.

- **Addition** is XOR.
- **Multiplication** `gf_mul(a, b)`: the 255-degree carry-less product of `a` and `b`, reduced modulo the polynomial. Reduction: while the product has degree ≥ 128, replace `x^128` by `x^7 + x^2 + x + 1` (constant `0x87`). A two-step fold suffices: `hi = p >> 128; lo = p & (2^128−1); t = clmul(hi, 0x87); lo ^= t & (2^128−1); lo ^= clmul(t >> 128, 0x87)`.
- **Squaring** is `gf_mul(a, a)`; in characteristic 2 it is GF(2)-linear (bit spreading then reduction), which implementations may exploit.
- The **S-box** is `x^7 = x · x^2 · x^4` (two squarings, two multiplications).

Vectors: Appendix B.1.

**The tower basis.** Field elements *on the wire* (the 16 inputs, the digest, the round constants as published canonically) are expressed in a second, isomorphic basis called the *tower basis*: Jetsam's Fan–Paar tower GF(2) ⊂ GF(2^2) ⊂ … ⊂ GF(2^128), where each level GF(2^{2k}) = GF(2^k)[y]/(y^2 + y + τ_k) with τ_1 = 1, τ_2 = 0x2, τ_4 = 0x8, τ_8 = 0x20, τ_16 = 0x2000, τ_32 = 0x20000000, τ_64 = 0x2000000000000000 (each τ is the embedding of the previous one shifted into the high half; the GF(2^8) level uses the AES polynomial). **You do not need to implement tower arithmetic.** The two bases are related by a fixed invertible 128×128 GF(2) matrix, given in Appendix A.3:

```
T2F(v) = XOR over every set bit i of v of T2F_ROWS[i]      (tower → flat)
F2T(v) = XOR over every set bit i of v of F2T_ROWS[i]      (flat → tower)
F2T(T2F(v)) == v
```

Both maps are GF(2)-linear, so `T2F(a ⊕ b) = T2F(a) ⊕ T2F(b)`. Consequence: **every XOR in the sponge can be done in either basis**; only multiplications need the flat basis. The canonical definition below keeps the whole state in the flat basis and converts only the 16 inputs on the way in and the 2 output lanes on the way out.

Vectors: Appendix B.2. A quick self-check: `T2F(1) == 1`, `T2F(2) == 0x3d5bd35c94646a247573da4a5f7710ed`.

### 3.2 The Poseidon2b permutation

Parameters:

| | |
|---|---|
| state width `t` | 4 lanes of GF(2^128) |
| S-box | `x^7` |
| full rounds `R_F` | 8 (4 at the start, 4 at the end) |
| partial rounds `R_P` | 58 |
| total rounds | 66, indexed `r = 0 … 65`; full iff `r < 4 or r >= 62` |
| round constants `RC[lane][r]` | Appendix A.4 (tower basis) / A.5 (flat basis) |
| MDS matrices | Appendix A.2 |

All arithmetic below is in the **flat basis**; every constant is converted once with `T2F` (Appendix A.5 and A.2 list the converted values so you can check your `T2F`).

```
permute_flat(s[0..4]):
    s = MDS_FULL · s                                    # initial linear layer
    for r in 0 .. 66:
        if r < 4 or r >= 62:                            # full round
            for i in 0 .. 4:
                s[i] = sbox7(s[i] ⊕ RC_FLAT[i][r])
            s = MDS_FULL · s
        else:                                           # partial round
            s[0] = sbox7(s[0] ⊕ RC_FLAT[0][r])
            s = MDS_PARTIAL · s
    return s

(M · s)[i] = XOR over j of gf_mul(s[j], M_FLAT[i][j])     # 4×4 matrix-vector product
```

`MDS_FULL` (tower basis) is `[[5,7,1,3],[4,6,1,1],[1,3,5,7],[1,1,4,6]]` and `MDS_PARTIAL` is `[[0x20,1,1,1],[1,0x2000,1,1],[1,1,0x200,1],[1,1,1,0x800]]`. The entry `1` is the multiplicative identity in both bases (`T2F(1) = 1`); every other entry must be converted with `T2F` before multiplying in the flat basis. Vectors for the whole permutation: Appendix B.3.

The consensus permutation on tower-basis lanes is `F2T ∘ permute_flat ∘ T2F` applied lane-wise; Appendix B.3 gives both forms.

### 3.3 The sponge

Capacity IV (domain separation): the 8 ASCII bytes of the tag `E_POWHDR` read as a **big-endian** u64 `L = 0x455f504f57484452`. In the tower basis:

```
IV_HI = L << 64 = 0x455f504f574844520000000000000000
IV_LO = L       = 0x0000000000000000455f504f57484452
```

(Flat-basis images in Appendix A.1.) The initial state is `[0, 0, IV_HI, IV_LO]`: lanes 0–1 are the rate, lanes 2–3 the capacity.

```
towerhash(f[0..16]):                 # f[i] : u128, tower basis, from the wire bytes
    s = [0, 0, T2F(IV_HI), T2F(IV_LO)]
    for k in 0 .. 8:
        s[0] ^= T2F(f[2k])
        s[1] ^= T2F(f[2k + 1])
        s = permute_flat(s)
    return le_bytes16(F2T(s[0])) || le_bytes16(F2T(s[1]))     # 32 bytes
```

There is **no padding block**: exactly eight rate blocks are absorbed and the rate lanes are read right after the eighth permutation. Do not add a finalization permutation.

### 3.4 The sixteen fields and the nonce lane

The PoW input is a 256-byte string `pow_fields` = 16 consecutive 16-byte little-endian field elements. Their meaning (for understanding only — a miner treats fields 1…15 as opaque):

| index | content | encoding |
|---:|---|---|
| **0** | **nonce** | **u128 LE — the only field the miner changes** |
| 1, 2 | previous block id | bytes 0–15 and 16–31 of the 32-byte id, each as u128 LE |
| 3, 4 | state root | same split |
| 5, 6 | transaction root | same split |
| 7 | timestamp | u64 zero-extended |
| 8 | height | u64 zero-extended |
| 9, 10 | miner (coinbase) address | 32 bytes split as above |
| 11, 12 | difficulty target (the *block* target) | 32-byte LE integer split as above |
| 13 | log_slots | u32 zero-extended |
| 14 | active_slot_count | u64 zero-extended |
| 15 | alloc_counter | u64 zero-extended |

Rules:

- The nonce is **field 0**. Because the sponge absorbs fields in pairs `(0,1), (2,3), …`, the nonce enters the very first permutation; no state can be precomputed across nonces.
- A pool sends `pow_fields_hex` with field 0 **zeroed**. The miner writes its nonce into bytes 0…15 and leaves bytes 16…255 untouched.
- The block target in fields 11–12 equals the `block_target_hex` sent with the job. A miner MAY assert this.
- Nothing else may be altered. In particular there is no timestamp ("ntime") rolling: the timestamp is bound into a proof the node has already produced.

A worked mainnet example (block 2880, real header → fields → digest below its target) is in Appendix B.5.

### 3.5 The target comparison — read this twice

The digest `d` (32 bytes) and the target `t` (32 bytes) are compared as unsigned 256-bit **little-endian** integers:

```
le256_lt(d, t):
    for i in 31 down to 0:
        if d[i] < t[i]: return true
        if d[i] > t[i]: return false
    return false                       # equal → NOT valid
```

A nonce is valid for target `t` iff `le256_lt(digest, t)`. Equality fails.

Traps:

1. In the hex string of a target such as `d5fbc8a9eb09ee1a9b0c80b3552dcf1a47cf48a1912b2ec8cee8290b00000000` the zeros are at the **end**. That is a *hard* target (2^219.5), not an easy one. "Leading zero bits" are counted from byte 31 downwards.
2. Do not reverse the digest bytes to "make it big-endian" and then compare against the *un*reversed target. Either reverse both or neither.
3. A share target is often a power of two: `2^(256−b)` has byte `(256−b)/8` set — for `b = 10`, the target is `…0040` at bytes 30–31 (`00…004000` in hex). See Appendix B.6.

Implementation note for GPUs: compare the top 64-bit limb first (bytes 24–31); only on equality look at the next limb. Almost every candidate is rejected on the top limb.

### 3.6 Difficulty, target and work

Consensus itself never uses a "difficulty" number, only targets. For pool purposes this specification defines, for a target `T` (as an integer, `1 ≤ T ≤ 2^256 − 1`):

```
difficulty(T) = ceil(2^256 / T) = floor((2^256 − 1) / T) + 1      (expected number of hashes per solution)
target(D)     = ceil(2^256 / D) = floor((2^256 − 1) / D) + 1      for an integer D ≥ 2 ;  target(1) = 2^256 − 1
```

These are exact integers; `difficulty(target(D)) == D` for every power of two, and both sides of the protocol compute identical targets from the same `D`. `difficulty(T)` is also exactly the chainwork consensus assigns to a block mined at target `T`.

Useful identities: a target with `b` leading zero bits, `T = 2^(256−b)`, has difficulty `2^b`. Expected time to a share at hashrate `H` and share difficulty `D` is `D / H` seconds. As of block 2880 (2026-09-06) the block target had 36 leading zero bits, i.e. difficulty ≈ 2^36.5 ≈ 9.8·10^10; the network converges to one block per 90 s.

### 3.7 Test vectors

**Inline** (Appendix B): field arithmetic (B.1), basis conversion (B.2), the bare permutation in both bases (B.3), full TowerHash on structured inputs (B.4), a real mainnet block from its published header to a digest under its target (B.5), and a share example at a reduced target (B.6).

**Bulk**: the file `jetsam-towerhash-golden-v1.txt` — 12 000 vectors, 9 120 043 bytes, SHA-256
`0af716f1f364400f9ef570acb341f5f0bbc024312be8798819fe1ee339190465`.
It is published next to this document. Format, one vector per line:

```
# <free-text header line>  n=12000
V <f0> <f1> … <f15> <z> <z> <z> <z> <z> <digest>
```

- `f0 … f15`: the sixteen field values as **32 hex digits of the u128 value** (most significant digit first — this is the *number*, not the LE wire bytes; convert with `int(f, 16)` then `to_le_bytes()`).
- the five `z` groups are 32 zeros each, reserved, to be skipped;
- `digest`: the 32 output bytes in order, 64 hex digits.

The inputs are pseudorandom from a fixed seed (splitmix64 seeded with `0x454C494445205057`, each field = `(next() << 64) | next()`, fields in order, 12 000 vectors), so anyone can check that the inputs were not chosen; the outputs come from the consensus implementation. Vector line 1 and line 2 of that file are reproduced inline as V-G0 and V-G1 (Appendix B.4), so you can start before downloading the file.

A miner MUST run a self-test over these vectors at start-up and refuse to mine on any mismatch. There is no other signal: a miner with a subtly wrong permutation never finds a share, and every network message it receives looks normal.

### 3.8 Cost model (what the search loop pays)

Per attempt: 8 permutations. Per permutation: one initial MDS, 8 full rounds (4 S-boxes + MDS each), 58 partial rounds (1 S-box + MDS each). One S-box costs 2 squarings + 2 multiplications. `MDS_FULL` has 10 non-identity entries, `MDS_PARTIAL` has 4. So per permutation roughly 600 general GF(2^128) multiplications plus about 130 squarings, and per attempt about 5 000 multiplications. There is no memory hardness and no data-dependent branching: the workload is pure carry-less arithmetic on 128-bit words. Only field 0 changes between attempts; fields 1…15, the IV and all constants are fixed per job.

### 3.9 Reference implementation (Python 3, no dependencies)

The code below, together with the arrays in Appendix A (which are valid Python), reproduces every vector in this document and all 12 000 bulk vectors. It is written for clarity, not speed (about 0.3 s per hash on a laptop).

```python
# --- paste Appendix A arrays (T2F, F2T, RC, MDS_FULL, MDS_PARTIAL) above this line ---
MASK = (1 << 128) - 1
TAG_POWHDR = b"E_POWHDR"

def clmul(a, b):                      # carry-less product, no reduction
    r = 0
    while b:
        lsb = b & -b
        r ^= a * lsb                  # a * 2^k has no carries: single-bit multiplier
        b ^= lsb
    return r

def gf_reduce(p):                     # mod x^128 + x^7 + x^2 + x + 1
    hi, lo = p >> 128, p & MASK
    t = clmul(hi, 0x87)
    lo ^= t & MASK
    lo ^= clmul(t >> 128, 0x87)       # second fold, degree < 14
    return lo

def gf_mul(a, b):
    return gf_reduce(clmul(a, b))

def apply_rows(rows, v):
    r, i = 0, 0
    while v:
        if v & 1:
            r ^= rows[i]
        v >>= 1; i += 1
    return r

def t2f(v): return apply_rows(T2F, v)
def f2t(v): return apply_rows(F2T, v)

_D = {}
def _consts():
    if not _D:
        _D["rc"]  = [[t2f(c) for c in row] for row in RC]
        _D["mf"]  = [[t2f(c) for c in row] for row in MDS_FULL]
        _D["mp"]  = [[t2f(c) for c in row] for row in MDS_PARTIAL]
        L = int.from_bytes(TAG_POWHDR, "big")
        _D["iv"]  = (t2f((L << 64) & MASK), t2f(L))
    return _D

def sbox7(x):
    x2 = gf_mul(x, x); x4 = gf_mul(x2, x2)
    return gf_mul(gf_mul(x, x2), x4)

def mds(s, m):
    return [gf_mul(s[0], m[i][0]) ^ gf_mul(s[1], m[i][1]) ^
            gf_mul(s[2], m[i][2]) ^ gf_mul(s[3], m[i][3]) for i in range(4)]

def permute_flat(s):
    c = _consts()
    s = mds(s, c["mf"])
    for r in range(66):
        if r < 4 or r >= 62:
            s = mds([sbox7(s[i] ^ c["rc"][i][r]) for i in range(4)], c["mf"])
        else:
            s[0] = sbox7(s[0] ^ c["rc"][0][r])
            s = mds(s, c["mp"])
    return s

def towerhash(pow_fields: bytes) -> bytes:      # 256 bytes in, 32 bytes out
    assert len(pow_fields) == 256
    f = [int.from_bytes(pow_fields[16*i:16*i+16], "little") for i in range(16)]
    iv = _consts()["iv"]
    s = [0, 0, iv[0], iv[1]]
    for k in range(8):
        s[0] ^= t2f(f[2*k]); s[1] ^= t2f(f[2*k+1])
        s = permute_flat(s)
    return f2t(s[0]).to_bytes(16, "little") + f2t(s[1]).to_bytes(16, "little")

def le256_lt(d: bytes, t: bytes) -> bool:
    return int.from_bytes(d, "little") < int.from_bytes(t, "little")

def with_nonce(pow_fields: bytes, nonce: int) -> bytes:
    return nonce.to_bytes(16, "little") + pow_fields[16:]
```

---

## 4. Transport

- TCP. The pool address and port are pool-defined (conventionally `stratum+tcp://host:3333`). Pools MAY also offer TLS (`stratum+ssl://`); the framing is identical.
- **Framing:** JSON-RPC 1.0/2.0-style objects, one per line, `\n` terminated, UTF-8, no length prefix. A line MUST NOT exceed 16 KiB. (A `mining.notify` is about 700 bytes.)
- **Request:** `{"id": <int>, "method": "<name>", "params": [ ... ]}`. **Response:** `{"id": <int>, "result": <value>, "error": null}` or `{"id": <int>, "result": null, "error": [<code>, "<message>", null]}`. **Notification** (server → client, no reply): `{"id": null, "method": "<name>", "params": [ ... ]}`.
- `id` values are chosen by the requester and MUST be unique per direction while outstanding. Responses MAY arrive out of order.
- Unknown methods are answered with error 20. Unknown notifications are ignored.
- **Liveness:** the pool sends at least one message every 60 s (a fresh job or a re-send of the current one with `clean_jobs = false`). A client that hears nothing for 180 s SHOULD reconnect. There is no application-level ping.
- One TCP connection = one session = one extranonce. A rig with several GPUs MAY use one connection and split its nonce space internally (§6), or one connection per GPU.

---

## 5. Messages

Method names and shapes follow Stratum v1 as used by header-hash coins (Ethash, KawPow, Kaspa). A miner author who has implemented one of those will recognise every message. The **contents** are Jetsam-specific and defined here.

### 5.1 `mining.subscribe` (client → server)

```json
{"id": 1, "method": "mining.subscribe", "params": ["ExampleMiner/2.1.0", "JetsamStratum/1.0.0"]}
```

- `params[0]`: user agent, free text ≤ 64 chars.
- `params[1]`: protocol name; MUST be `"JetsamStratum/1.0.0"`. A pool that does not support it replies error 20 and closes.

Response:

```json
{"id": 1, "result": [[["mining.set_target", "s1"], ["mining.notify", "s1"]], "07000000", 12], "error": null}
```

- `result[0]`: subscription list, informational.
- `result[1]`: **`extranonce1`** — exactly 8 lowercase hex chars (4 bytes). See §6.
- `result[2]`: `extranonce2_size` = **12** — the number of nonce bytes the miner controls. Constant in this version.

### 5.2 `mining.authorize` (client → server)

```json
{"id": 2, "method": "mining.authorize", "params": ["j1whllqtluex7c9k5n8f9l83jupuhgvwwe5fqnspyxnf4hles9382syv4y3h.rig1", "x"]}
```

- `params[0]`: `<payout_address>.<worker_name>`. The payout address is a Jetsam bech32m address (`j1…`, 60 characters, case-insensitive; the pool validates the checksum). `worker_name` is `[A-Za-z0-9_-]{1,32}`; it is optional, default `"default"`. Everything after the first `.` is the worker name.
- `params[1]`: password. Free text; pools SHOULD accept `"x"`. Pools MAY parse the option `d=<D>` as an initial share-difficulty request (an integer, see §5.4).

Response: `{"id": 2, "result": true, "error": null}` or error 24 with a message explaining why (bad checksum, wrong network prefix, banned).

A session MUST subscribe before it authorizes and MUST authorize before it submits. Jobs MAY be sent before authorization completes.

### 5.3 `mining.set_target` (server → client, notification) — **authoritative share target**

```json
{"id": null, "method": "mining.set_target", "params": ["0000000000000000000000000000000000000000000000000000000000004000"]}
```

- `params[0]`: the **share target** as 64 lowercase hex chars = 32 bytes, **little-endian** (byte 31 last). A nonce is a valid share iff `le256_lt(digest, share_target)`. The example is `2^246` (byte 30 = `0x40`), i.e. difficulty 1024 — the target used in Appendix B.6 and §9.
- Applies to every job sent *after* it (and to re-sends of the current job). The pool MUST send it before the first `mining.notify`. The pool MAY change it at any time (vardiff); the miner MUST apply it to the next job at the latest, and SHOULD apply it immediately to the current job.
- The share target is always ≥ the block target (share difficulty ≤ block difficulty), so every block solution is also a share.

### 5.4 `mining.set_difficulty` (server → client, notification) — optional companion

```json
{"id": null, "method": "mining.set_difficulty", "params": [400000000]}
```

- `params[0]`: an integer `D`, `1 ≤ D ≤ 2^53`. Equivalent to `mining.set_target` with `target(D)` from §3.6. When a pool sends both, they MUST describe the same target and `mining.set_target` is the one to trust. A miner that only implements `mining.set_difficulty` MUST derive the target with the exact integer formula of §3.6 — never with floating point.
- Example: `D = 400000000` ⇒ `target(D) = 473b8f06c797161658d7d3d4d3c3a76bb3d220dccfef1c461871c7bc0a000000` (LE hex, from the integer formula) and `difficulty(target(D)) = 400000000` again. The `mining.set_target` example of §5.3, `2^246`, is `target(1024)`. A pool using `set_difficulty` sends `D` values and computes `target(D)`; a pool using `set_target` may send any target, including ones that are `target(D)` for no integer `D`. Both are legal.

### 5.5 `mining.notify` (server → client, notification) — a job

```json
{"id": null, "method": "mining.notify", "params": [
  "5c2a9e01",
  "000000000000000000000000000000005b1bfebf6fe549af5180ee5b3f982d946debcea870d4285d988d98e1c2a39d900d708cb589da9bcc57b00efdaa73c2d3bf249aa6168e2099b7b0a70665b2a12e538d6371211bb0d8e8ca12825649f6901eaa78205af2c0b9b204088638ec32fbdac59d6a000000000000000000000000400b00000000000000000000000000001906a3a7ae5d491491e3034efc0152bf79e08e3f4361cc3e492006568da7ba19d5fbc8a9eb09ee1a9b0c80b3552dcf1a47cf48a1912b2ec8cee8290b0000000018000000000000000000000000000000060b00000000000000000000000000005d0b0000000000000000000000000000",
  "d5fbc8a9eb09ee1a9b0c80b3552dcf1a47cf48a1912b2ec8cee8290b00000000",
  true,
  2880
]}
```

| index | name | type | meaning |
|---:|---|---|---|
| 0 | `job_id` | string ≤ 32 chars | opaque, unique per pool per job; echoed in `mining.submit` |
| 1 | `pow_fields_hex` | 512 hex chars | the 16 fields of §3.4, **field 0 zeroed** |
| 2 | `block_target_hex` | 64 hex chars, LE | the network target for this block; a digest below it is a block |
| 3 | `clean_jobs` | bool | `true`: discard all previous jobs now, they can no longer produce anything (the chain tip moved or the template was replaced). `false`: the previous job may still be finished; shares on it are accepted for a grace period (§7) |
| 4 | `height` | integer | height of the block being mined (informational; equals field 8) |

The example above is the real header of mainnet block 2880 with its nonce lane zeroed; the nonce `153d56430000000002a091947bd4c50b` solves it (Appendix B.5).

Jobs change roughly every 90 s (each new chain tip) and additionally when the pool's node refreshes its template on the same parent (new timestamp — a different `pow_fields_hex`, same height, `clean_jobs` usually `false`). A miner MUST switch to a `clean_jobs = true` job within one second; work on stale jobs is wasted.

### 5.6 `mining.submit` (client → server)

```json
{"id": 7, "method": "mining.submit", "params": ["j1whll…4y3h.rig1", "5c2a9e01", "153d56430000000002a091947bd4c50b"]}
```

| index | name | meaning |
|---:|---|---|
| 0 | `worker` | the string used in `mining.authorize` |
| 1 | `job_id` | from `mining.notify` |
| 2 | `nonce_hex` | **the full 16-byte nonce, little-endian, exactly 32 lowercase hex chars** — the bytes that were written into field 0. The last 8 hex chars MUST equal the session's `extranonce1` (§6) |

Response: `{"id": 7, "result": true, "error": null}` when the share is accepted (digest below the current share target for that job, nonce inside the assigned prefix, not a duplicate, job known). Otherwise `result: false` with an error from §8.

`true` means *the share was credited*. It says nothing about whether the digest also met the block target; the pool handles that itself (§7.4). A pool MAY tell the miner with `client.show_message`.

The miner MUST NOT wait for the response before continuing to hash, and MUST NOT stop searching a job after finding a share: a job yields many shares.

### 5.7 `mining.suggest_difficulty` (client → server, optional)

```json
{"id": 3, "method": "mining.suggest_difficulty", "params": [200000000]}
```

Requests an initial share difficulty `D` (integer, §3.6). The pool MAY honour it, clamp it, or ignore it; it answers `true`. Vardiff continues to apply afterwards.

### 5.8 `mining.extranonce.subscribe` (client → server, optional) and `mining.set_extranonce` (server → client)

A client that sends `mining.extranonce.subscribe` (params `[]`, response `true`) accepts that the pool may later send

```json
{"id": null, "method": "mining.set_extranonce", "params": ["0a000000", 12]}
```

after which every *new* job MUST be mined with the new `extranonce1`. Pools use this when they re-shard nonce space (e.g. after a fail-over). Clients that did not subscribe never receive it.

### 5.9 `client.reconnect` and `client.show_message` (server → client, optional)

```json
{"id": null, "method": "client.reconnect", "params": ["stratum2.example.org", 3333, 5]}
{"id": null, "method": "client.show_message", "params": ["Block 2639 found by rig1 — 50.0125 JTM"]}
```

`client.reconnect`: host, port, seconds to wait. `client.show_message`: free text for the operator's log.

### 5.10 Message summary

| direction | method | when |
|---|---|---|
| C→S | `mining.subscribe` | first message |
| C→S | `mining.authorize` | second message |
| C→S | `mining.suggest_difficulty` | optional, any time |
| C→S | `mining.extranonce.subscribe` | optional, after subscribe |
| S→C | `mining.set_target` | before the first job; on every change |
| S→C | `mining.set_difficulty` | optional companion of the above |
| S→C | `mining.notify` | each new job; re-sent as keepalive |
| C→S | `mining.submit` | each share |
| S→C | `mining.set_extranonce` | rare |
| S→C | `client.reconnect`, `client.show_message` | rare |

---

## 6. Nonce ownership: the extranonce prefix

The nonce is 16 bytes on the wire, little-endian; as an integer `n`, byte `k` of the wire form is bits `8k … 8k+7`.

```
wire bytes:   [ 0 1 2 3 4 5 6 7 8 9 10 11 | 12 13 14 15 ]
              |<----- miner's 12 bytes ----->|<-extranonce1->|
u128 bits:      0 … 95 (miner)                 96 … 127 (pool)
```

- `extranonce1` (from `mining.subscribe`, or a later `mining.set_extranonce`) is 4 bytes = 8 hex chars. It MUST appear verbatim as the **last 8 characters of `nonce_hex`**, i.e. wire bytes 12–15. Equivalently `n >> 96 == int.from_le_bytes(extranonce1)`. Example: `extranonce1 = "07000000"` → every nonce is `………………07000000`, and `n >> 96 == 7`.
- The miner owns wire bytes 0–11 (96 bits, `2^96 ≈ 7.9·10^28` values). At any conceivable hashrate this space cannot be exhausted inside a job's lifetime, so **no coordination with the pool is ever needed** beyond the prefix. Two sessions never overlap because their prefixes differ.
- How the miner partitions its 96 bits between devices, kernel launches and threads is its own business. Any injective assignment works; a common one is `n = (extranonce1 << 96) | (device_index << 88) | counter`. A restart SHOULD start from a fresh random point inside its space so two processes on one machine that received the same prefix (a pool that keys prefixes on the client IP) do not repeat each other's work.
- Shares whose prefix does not match are rejected with error 27 and are not counted — the pool cannot distinguish them from another session's work.

---

## 7. Share rules

### 7.1 Which nonces to submit

Submit every nonce whose digest satisfies `le256_lt(digest, share_target)` for the job it was computed on, where `share_target` is the most recent `mining.set_target` (or `target(D)` of `mining.set_difficulty`) received **before that job's `mining.notify`**, or a later one if the miner has already applied it — the pool accepts against the target that was in force when the job was issued *and* any lower target it has sent since. Never submit against the block target only: block-level hits are a strict subset of shares.

### 7.2 Job lifetime and staleness

- After `mining.notify` with `clean_jobs = true`, all earlier jobs are dead. Shares on them are rejected with 21. A miner SHOULD abort in-flight kernels within one second.
- After `mining.notify` with `clean_jobs = false`, the previous job remains valid for shares for a pool-defined grace period of **at least 5 seconds**, then 21.
- A pool SHOULD keep issuing the same job (re-sending it) rather than a new one when nothing changed; a miner receiving a job with a `job_id` it already has simply keeps going.
- Templates have a server-side lifetime of about two minutes even when the chain does not move; expect a `clean_jobs = false` job with the same height and a different `pow_fields_hex` about once a minute in slow periods.

### 7.3 Duplicates, validation, limits

- A `(job_id, nonce_hex)` pair is accepted once. A second submission is error 22, whether from the same session or another.
- The pool recomputes TowerHash for every submitted nonce. Every rejection code below implies the pool did the check; a miner that receives 23 (`low difficulty`) has either a wrong hash, a wrong target or a stale target — treat a burst of 23 as a bug in the miner.
- Rate limits are pool policy; a reasonable default is 20 submits per second sustained per session, and disconnection when more than 25 % of the last 100 submissions were invalid (codes 22, 23, 26, 27). Honest miners under vardiff produce about one share every 5–15 s.

### 7.4 Block-level solutions

When a share's digest is also below `block_target_hex`, the pool submits the nonce to its node at once. The miner's share is credited like any other (`result: true`); whether the block is finally accepted by the network is the pool's concern (a competing block may win the race — the share still counts). Pools SHOULD announce found blocks with `client.show_message` and on their dashboard.

---

## 8. Error codes

Errors are `[code, message, null]` in the `error` field of a response. Codes follow Stratum v1 conventions where one exists.

| code | message | meaning / miner action |
|---:|---|---|
| 20 | `unknown / other` | unsupported protocol or method, malformed params. Fix the client. |
| 21 | `job not found` | `job_id` unknown, expired, or invalidated by `clean_jobs`. Normal at tip changes; drop the job. |
| 22 | `duplicate share` | same `(job_id, nonce)` already accepted. Check your nonce partitioning. |
| 23 | `low difficulty share` | digest not below the share target in force. Wrong hash, wrong target or stale target. |
| 24 | `unauthorized worker` | authorize first / bad address / banned. |
| 25 | `not subscribed` | subscribe first. |
| 26 | `invalid nonce` | `nonce_hex` is not exactly 32 lowercase hex chars. |
| 27 | `nonce outside assigned prefix` | last 8 hex chars ≠ `extranonce1`. |
| 28 | `rate limited` | too many submissions; slow down, the pool may disconnect. |

A pool MAY append detail after the message (e.g. `"job not found (clean_jobs at 12:04:31Z)"`); the numeric code is the contract.

---

## 9. Session example

```
C: {"id":1,"method":"mining.subscribe","params":["ExampleMiner/2.1.0","JetsamStratum/1.0.0"]}
S: {"id":1,"result":[[["mining.set_target","s1"],["mining.notify","s1"]],"07000000",12],"error":null}
C: {"id":2,"method":"mining.authorize","params":["j1whllqtluex7c9k5n8f9l83jupuhgvwwe5fqnspyxnf4hles9382syv4y3h.rig1","x"]}
S: {"id":2,"result":true,"error":null}
S: {"id":null,"method":"mining.set_target","params":["0000000000000000000000000000000000000000000000000000000000004000"]}
S: {"id":null,"method":"mining.notify","params":["5c2a9e01","00000000000000000000000000000000 5b1bfebf…(fields 1–15)…5d0b0000000000000000000000000000","d5fbc8a9…0b00000000",true,2880]}
   (miner hashes nonces 1b0300…07000000 … inside prefix 07000000)
C: {"id":7,"method":"mining.submit","params":["j1whll…4y3h.rig1","5c2a9e01","1b030000000000000000000007000000"]}
S: {"id":7,"result":true,"error":null}
   (≈90 s later the chain tip moves)
S: {"id":null,"method":"mining.set_target","params":["0000000000000000000000000000000000000000000000000000000000000100"]}
S: {"id":null,"method":"mining.notify","params":["5c2a9e02","0000…(new fields)…",… ,true,2639]}
C: {"id":8,"method":"mining.submit","params":["j1whll…4y3h.rig1","5c2a9e01","9f1a0000000000000000000007000000"]}
S: {"id":8,"result":false,"error":[21,"job not found",null]}
```

The share at `id 7` is exactly Appendix B.6: with `extranonce1 = 07000000` and the miner's 12 bytes starting at zero, nonce `0x0000000700000000000000000000031b` is the first one whose digest falls below `2^246`.

---

## 10. Writing a GPU miner — what you need to know

This section lists what matters for a correct and efficient miner. It does not prescribe an implementation.

1. **Per job, the constants are: fields 1…15, the IV, the 264 round constants, the two MDS matrices (all in the flat basis).** They fit in a few kilobytes. Per attempt, the only variable is field 0. Everything a thread needs is `(pow_fields[16:], share_target, block_target, nonce)`.

2. **No midstate.** Fields 0 and 1 are absorbed together into the first permutation, so the first permutation already depends on the nonce. Do not look for a shortcut; there is none by construction. Every attempt = 8 permutations = 528 rounds.

3. **The whole cost is GF(2^128) multiplication.** NVIDIA and AMD GPUs have no 64×64 carry-less multiply as a primitive at the CUDA/HIP language level, so the multiplication is emulated. Known approaches include schoolbook or Karatsuba decompositions over 32-bit words using bitwise operations, bit-slicing across threads, and small lookup tables; squaring is linear and cheaper. Which one wins depends on the architecture — measure. Multiplication by a *constant* (MDS entries, in either basis) admits specialisation. This is the entire performance story; the sponge structure around it is trivial.

4. **Basis conversions are cheap and rare.** Sixteen `T2F` on job arrival (fifteen constant per job, one per attempt for the nonce) and two `F2T` per attempt on the output. A linear map on 128 bits is 32 nibble-table lookups or 128 conditional XORs. Or: convert the nonce lane too on the host side — no, the nonce changes per attempt; but since `T2F` is linear, `T2F(nonce_base + i)` for a sequential counter can be updated incrementally; whether that beats a table is again a measurement.

5. **Batching.** Hash one nonce per thread, many launches; each launch covers a contiguous block of nonces `[base, base + N)` inside the session prefix. Keep a launch short enough (≤ ~1 s) that a `clean_jobs = true` job is honoured within a second.

6. **Target test on-device, submit from the host.** Compare against the *share* target in the kernel (top-limb-first, §3.5), write hits to a small result buffer, and let the host verify each hit once more on the CPU before submitting. A false positive costs a rejected share and reputation; a CPU re-check costs microseconds.

7. **Self-test gate.** Before opening the socket, run the Appendix B vectors and the bulk file through the *same* kernel path you mine with (not a separate "reference" path), and refuse to start on any mismatch. Also assert on every job that field 0 of `pow_fields_hex` is zero and that fields 11–12 equal `block_target_hex`.

8. **Hashrate and share rate.** With share difficulty `D` and hashrate `H`, expect a share every `D / H` seconds. Pools tune `D` so this is 5–15 s. Report your own hashrate to the operator from counted attempts, not from shares. Pools compute your hashrate from accepted share work — declared figures are not used.

9. **Latency budget.** A block is found network-wide about every 90 s. A job that reaches the miner 2 s late costs ~2 % of its work. Parse `mining.notify` off the hot path, and never block the network reader on the GPU.

10. **What you cannot do:** change the timestamp, the coinbase, the transaction set or any field but 0; get the block body; reuse a job across pools; submit a nonce outside your prefix. The protocol has no knob for any of these, which is intentional.

11. **Trust model.** You trust the pool to pay you; the protocol gives you no way to verify the coinbase inside a job (the block body is never sent). What you *can* verify: that the job's fields 11–12 equal the announced block target (the pool is not making you mine at an absurd difficulty), that `height` advances, and that found blocks appear on chain with a coinbase you recognise as the pool's.

---

## 11. Versioning

`JetsamStratum/1.0.0`. Any change to the hash, the field schedule, the nonce lane or the wire encodings is a new major version and, on the consensus side, a hard fork. Additive messages and optional params may be introduced in minor versions; clients MUST ignore unknown trailing params in `mining.notify`.

---

# Appendix A — Constants

All values are u128 written as `0x` + 32 hex digits. Arrays are valid Python literals so they can be pasted above the reference implementation of §3.9.

### A.1 Capacity IV for the PoW domain (`E_POWHDR`)

| | tower basis (u128, hex) | flat basis (u128, hex) |
|---|---|---|
| `IV_HI` (state[2]) | `455f504f574844520000000000000000` | `493c47bcf794e88f2ddcc2d80057aca2` |
| `IV_LO` (state[3]) | `0000000000000000455f504f57484452` | `e7f94e2a65c5ecd28277765bc95b9451` |

### A.2 MDS matrices

Tower basis (as specified):

```python
MDS_FULL    = [[0x5, 0x7, 0x1, 0x3], [0x4, 0x6, 0x1, 0x1], [0x1, 0x3, 0x5, 0x7], [0x1, 0x1, 0x4, 0x6]]
MDS_PARTIAL = [[0x20, 0x1, 0x1, 0x1], [0x1, 0x2000, 0x1, 0x1], [0x1, 0x1, 0x200, 0x1], [0x1, 0x1, 0x1, 0x800]]
```

Flat basis (`T2F` applied to every entry; `1` maps to `1`):

```
MDS_FULL_FLAT = [
  [0xa72ec17764d7ced55e2f716f4ede412e, 0x9a75122bf0b3a4f12b5cab2511a951c3, 0x00000000000000000000000000000001, 0x3d5bd35c94646a247573da4a5f7710ec],
  [0xa72ec17764d7ced55e2f716f4ede412f, 0x9a75122bf0b3a4f12b5cab2511a951c2, 0x00000000000000000000000000000001, 0x00000000000000000000000000000001],
  [0x00000000000000000000000000000001, 0x3d5bd35c94646a247573da4a5f7710ec, 0xa72ec17764d7ced55e2f716f4ede412e, 0x9a75122bf0b3a4f12b5cab2511a951c3],
  [0x00000000000000000000000000000001, 0x00000000000000000000000000000001, 0xa72ec17764d7ced55e2f716f4ede412f, 0x9a75122bf0b3a4f12b5cab2511a951c2],
]
MDS_PARTIAL_FLAT = [
  [0x486fb01f93aa169afd8ee716e990cf14, 0x00000000000000000000000000000001, 0x00000000000000000000000000000001, 0x00000000000000000000000000000001],
  [0x00000000000000000000000000000001, 0x86b6a57216f083193e1b361e8a1a5bbf, 0x00000000000000000000000000000001, 0x00000000000000000000000000000001],
  [0x00000000000000000000000000000001, 0x00000000000000000000000000000001, 0xb2ef6c31981e31582924ed9040490830, 0x00000000000000000000000000000001],
  [0x00000000000000000000000000000001, 0x00000000000000000000000000000001, 0x00000000000000000000000000000001, 0xff829109128b0bd884cb11891ab51a3c],
]
```

### A.3 Basis conversion matrices (128 rows each)

Row `i` is the image of the basis vector `1 << i`. `T2F` maps tower → flat, `F2T` maps flat → tower; they are mutual inverses.

```python
T2F = [
  0x00000000000000000000000000000001, 0x3d5bd35c94646a247573da4a5f7710ed,
  0xa72ec17764d7ced55e2f716f4ede412f, 0x553e92e8bc0ae9a795ed1f57f3632d4d,
  0xc7bd33d0a58cf5b4740d6c968b842acb, 0x486fb01f93aa169afd8ee716e990cf14,
  0xbee4e4dc44629cf627b537f28935c282, 0x549810e11a88dea5252b49277b1b82b4,
  0x6198d3a7b756c056bd3d5a025c8d370a, 0xb2ef6c31981e31582924ed9040490830,
  0x09ee93d00b6b040353ebf5c8e0d4401d, 0xff829109128b0bd884cb11891ab51a3c,
  0x25ce422cd636209fd58e3eee6bcdb7d7, 0x86b6a57216f083193e1b361e8a1a5bbf,
  0x38e5c77d01ea3f466707ab5ea8ff4171, 0x2de7ef9721e4b0550d4fe61188fb1bd3,
  0x5c4feb37d9ad179b297b823812957b8c, 0x8e36a06b2ac838db09f04ada993caa84,
  0xc6082bd8edaaae4873fb728376565fff, 0x9b92a729351ab577a2b0de27d713817a,
  0xb7106c3879c5c033015afe43a7bbb48f, 0xe638c5d1336cc967dd424e375f37904f,
  0xef30fbf0630e9d04f9efc7d242801381, 0x0548ecca55b43556101c39dffff23087,
  0xa3dc4d913d605620dae083b969cba697, 0x60c413bae203bcfee863fce3d62d7a46,
  0xe3f02a180f232bd7f9e6c41f2ad92bb1, 0x4983d83fd28ea811148387423931f5c8,
  0x449a77f55b99ac57dcb2131788da3392, 0x611ba189d789d45401af9d0333b3f9e7,
  0xb67819253374dc0ae0ec21b8ad160234, 0xf23ff08f2566732b188cdc592a0eb8f7,
  0x0c9ac57d3e240265a401dc6270f59c10, 0x3493b22a21cc4c396552505d8c638d9b,
  0x757fa4336d785da4447251e433ed42fb, 0x6d2979d4d4a745250ea377dabd44cfb2,
  0x55583ad2a44322ab8ca02871898d1f81, 0x86373be6909783ffc8bb21b3dda24f12,
  0x0c3f3f28407ec57a4a53af471e53285c, 0x972c409ddb7f2db55ee11ac6a242e45c,
  0x96f938744906740774c33c247ccf85d8, 0x4cae10232a3558fa26fbc92fab97488b,
  0x8bb0008776ffc7e44db0cc1a2df288b9, 0x1d0703e4ee2237c7ab53e5b75d921bd7,
  0xff012dbc34f0271cce6d0c1b0d125e3a, 0x9aea02703d99a98cb9e1b3a368dce85b,
  0xb39755229db1f4de29498e7a13e7cdc2, 0xc31176b1b646603fc50a528e49742a0e,
  0xead0dc2950f39b1eb2c2edb9407de10d, 0xea3f3fe33d1d2b7d3cf38b78900dab86,
  0x051bd919a56eb92348316675811dc923, 0xba5ae9f94b493aa478e08aa4f415cb18,
  0x141e17265a74f46bb369c916cbaf8a25, 0x6c99c4af650a8451a195d75a7769413b,
  0x342484168e3692419b8ea7e8fdcc8f8d, 0xaa7a29ea7ae49742f8aa7027b065617d,
  0xd345f319cf8d0c5711c92a1a19cf232c, 0xbf7956da104bb930529470fbcfa3f60e,
  0xaf3c8a62ae50f00d8dd54ec40c51d402, 0x9f40c849b5f5405f91589271eefd831e,
  0x82131c9fe93d42fe3eac43b40fe78613, 0xee5d797779ee1b27b76d3ed1cee66add,
  0xb7438c8a8d29a42710da3eeb0dcaa4f4, 0x0884f37a7a1f9068c7b8dbfb652cfb52,
  0x9b027a35e430ddaa521ef0fd91f39162, 0xb619b3c28e9fd05efbcd5ead6935a75c,
  0x0cad054f32f966043874b2e8163127c7, 0x8ec4fff59680eaae0077f3dd83fbd947,
  0x50d8597763331f8dcea34c16608a96a7, 0x6d03608d9f2a6e86dd0d62d96a32751d,
  0x49110668fefb446975dea1bb5742ad75, 0xde3c54e5dc0bf89137cf5d286ba5868a,
  0x61121e79a40f65000fb426800e5b4f0b, 0x0996944c65744223a5ef06f1eda08fd6,
  0xda3cbe76b9f383e1cde547094cf05431, 0xa3a2b75fb155f13733c11156ff19d609,
  0xfb4449056e5c6fb2d9a33f42f0a893ad, 0x0128f41399db28643d0743873dc1264a,
  0xff09c9c044dd9342be235156d0bf9197, 0xcbb652c3d0896219d921f2c49b28d8e7,
  0x61102a46cc01cdf697b666aa7d3d8d45, 0x717c5e9d4a0731b69d1e33a8f128eedd,
  0xd3498c6de1db846fb5b84c3d08a26402, 0x1d074123e95f221742bb042dd2decd90,
  0x49dd214c370bbb55e8a3a82b147053be, 0x18af31dbbab9458eb16b27c0fd1c309f,
  0x61e2d820490e7be32289961803263c34, 0x107fa373d60153306bcebc6f2ea6aac5,
  0x3df814508cd896e7813397e8a778f8cd, 0x4021c8146d9e0d33e353d0c73604d58e,
  0xee2c21eb408160983c5ccee03d280f85, 0xe77f3ff735b6b82a28ab2ed8e3fc8320,
  0x8eee1c68d1cbc4b55eefff30ae3f6028, 0xfabf471e3d132661b55c0f419db06696,
  0x69a006d6b32d6e23d48dde5999c10f7d, 0x389f96875b52a0cdaf55c6a03819c6f1,
  0xd349d8dacbf6f4a04625d7953d3190bd, 0xbe8502448366699e39f5117acfd01714,
  0xa3839a34242c75f7ffc21bd9c630459b, 0xb3c2ef7bbf449f8af05d8a9a760e9407,
  0x694d27a4f1ba1074a7c2e5445f874b2d, 0x0855c18884723bdcb6dff2cf4849ec19,
  0x58d911a330ce147d06afb9ccb802b7db, 0xde87764a4427a4aff5db695eda550c2a,
  0xbfa47075ed035846f2016301eb7e4009, 0xd7335e553652ccbc3f0ff542099a9636,
  0x00ede815347e14cec1440aa1c612391b, 0x96e7e4d4efb40213aa73764edddd4ff6,
  0x399c2dd474a47a3f36d286b7e1d3b32b, 0xcaaeb9876b882f04dc62c5f814d4f79c,
  0x5c7127c96b5c4300fe9954f7999e2f5a, 0xfe1178bc295c981e59278e0135930986,
  0xe3a9112535f5f53b6a9acc3e49877fd2, 0x3d6051a6cf2bb75e59ff8f7991cf6bad,
  0x30d97c016d51144b717181ec5f826ba3, 0xe3b2c049622bdaa3e7e81e99b46920ee,
  0x547744dda2f0145457aacf948f0aca14, 0x822e4b280fbbaf701b00d1cf2675dacf,
  0x013dae85beaa0a8bb735a39898b93504, 0xaeed75387d73a822299a17f008c4cd8c,
  0x2d4278deab8e9cdeb21b66e82f85dea7, 0x05745efd4f8b0dc873484e5f3c83ed61,
  0x456a83da121c2fc61b55c9bd216a36cd, 0x6ccd4a5d0819113889547d0e69bac59b,
  0xbec7bd6ab8e7169c06c93f34451b5abe, 0xb9e80fcc7ca8fe72faafc4143960829a,
  0xbbfefb3dd63f00f3f8407e5f20d87c6a, 0x91b376701a386e5aee6fdbd0738b4c99,
]
```

```python
F2T = [
  0x00000000000000000000000000000001, 0xe9453afbbb5efa683426e20fcdbc3b96,
  0x1c17484568577f0b04c63c03208aeb8a, 0x04adf5cfe6486e00ca9f6f0b3f58b122,
  0x4bad34793b579f5c90920a4453c26f86, 0xfc24da72abcee7f5f01fbedeb26a8df9,
  0x1091dcf0350c7dc7c2e119ec5af1fc07, 0x472c8b0c136435be967e8ef8074dced9,
  0xee63773a41b8bbd26fcb07ebd4630981, 0x02fc50cfe61e714bbe42ae0de5fd0d8d,
  0x168a685e2f21945aa9736c6bb7c2895c, 0x0dbec3dae32169816645d4935276b15d,
  0x1bcdfffc8342ca4dc8bfedc18a3078d9, 0x1e81239207e6ef6e793f115bf0d1ddc0,
  0xbe1603d9dcb9eef74e5b36e05726ffaf, 0xe1b26ab22e51d6585535ccbca9496a06,
  0x09f9e05a29dd55fa844808cc9a48d50c, 0x021aaba3a74e307cc2ded8391e34e8e9,
  0x04966d3e1afc209d7f157b26e887a38a, 0xaf7446de9259fba17a5602c30e34c669,
  0x0f25b0fd6d577f77f9d1882fb0bc5ba0, 0x1d459f2a48cefb1c3cd4e7a6ec5dfa4b,
  0x5177981cdf5b750cc65ad9ea7ca055a4, 0x51f9fbcea7da4578c92da6c12526013e,
  0x5e5568bae10fd0bea4055c77b9a844c3, 0xe421662a1e1eec508af632be1f0e02a4,
  0x4fb8a006db40f3160af93b49a86074d9, 0x45ae448d6e7f1d9eb69a344d34af8f84,
  0xb9c51ce3b12188ad65e7759b1f401559, 0xabbb0931ab3235c58087e2dbc96ad33f,
  0x5c9cf000628598d60736ed8ccf038e67, 0xb600769f47150f0b5cfaad9450463bed,
  0x41ff7793986a07fac4a9907ae8a743c2, 0x09285f4c18937b3185fabe5973520296,
  0x04df8dc9851d9e1c3e7a14efcbfb2f95, 0xf84536296d274eacfca1c8ec05ff86f2,
  0x10a307e4b186622325d30a95cecef780, 0xb707ef2d98cf44184ddac671e2eb5fe3,
  0xa36bd753c6ba59d052163d58f1bed352, 0xbb51e68d389f63b3fe34ed01757689b0,
  0x553399b0b5fc844caf168701fe5943e2, 0x149dde950e34d85250b4a4567313dbce,
  0x4a3936263f0c100aa4c65c24c9f26072, 0x4104e328f53e6a7de372c31b4ad5ad83,
  0xb1183d7d5bd62290a0a89715d0f4c888, 0x4d660de92cacf0dd908421c7e6d1808d,
  0xb1d657600dafa9208939ab4849c39960, 0x03a20e7aba728cd09b64d73cf2f674f4,
  0xe43e9984cf41aa0882197d2781f8b96f, 0xbad1c62b0bff422854213e279a1c233d,
  0x4d0e6bd946302e439aac65df948a1cfe, 0xffd379747924682586a493942c8bd1df,
  0xfe5f1194837be346fdb10eba477ab638, 0x5295b8af5c0ddbed902930dfa570304d,
  0xba080add877d62a18cd4628ef7af6b4c, 0x1e25371b9377b58089920b6a510400d3,
  0xac7c0e8e02a2200be87117633cbdd070, 0xf366765716b499d4b7321e9df5959b66,
  0xb339b133a83acbbe7e547facbe195298, 0x1475d3694c484e493e02607bf9356c65,
  0xe0cef1d5986e8d2d605e21f64226e065, 0xa558f89882728f0ad97427c3f9a5f8e4,
  0xf912accaae2365e62b05093b2bf33d56, 0xe131db01ea71d934b2eb168465351fa8,
  0xaa8f05ca85112b1e8297c34477ceeb64, 0x0dc63231f0469178d0d4de381700cb51,
  0x41d4d8767a16e1d2bf0a593c25f52b86, 0xad26c0aee1dd7aedd2b22cef38dd64e7,
  0x10491ee2eca4e054f64c3d01df6061f8, 0xfaaf99c9d558bdd129634f9bc0b49d13,
  0x067a7a8aa629a19a5713b939774af76e, 0x1c447ad4acaa6cf468c10599af589e85,
  0x1bbe72b8a35a9c3f87a1f1858fe5aa7a, 0x08d64d109f41fd0101dc11cce5fa73a6,
  0xf827b63c8f571568d3cf4c1ee4ecd03e, 0x5bb2d722803b61c1b08d89d05152ee9b,
  0xf3cb7ef7f453aef94c19b7fce8aa0805, 0x450d1ab8d3157a5bb23d60c579d34dc9,
  0xa86d9af6cb03acbd901235280394a449, 0xe97768fce8cdf250bfa8bb1d0878b3e4,
  0xa1951a61df54b357cfcf4ae3ebc3ccfd, 0xb76dfde0d95a8d217f54a72f0eddffaf,
  0x0babb93003d8bec9bb5efd043338801f, 0x00db4962025555aab1dabf8c6eda931d,
  0xefd282331287775f9cb76d437afa2af4, 0x005a68ffc8bb123839157cede80abb56,
  0xaa8cf4dfecd7c6e8756dd13b5c8f5aca, 0x021af06bb686259ccb7fd58ec495d475,
  0xecdf1c0a39e0e69edd223ac63f94d3cd, 0x464b5cd033da15250a59b81eb662376d,
  0xfaa1c4106cecddd1e1ef0970d9739a93, 0xb8ca7cb682820f3876fa81b790ed93c1,
  0xecba8b8b7f03d6c49ad4f151c9260931, 0x1d60dcb980bbf80cf229556b3903eaef,
  0x05525a3168b2928eb6704455f531f9ce, 0xe799e7eb44a895f570225704932e2b1a,
  0x4d407b2df1588fdb990fba30221753a7, 0x5a9bb03388d916788319c89624300d82,
  0xa9d77c570bd47c6c66e124345a17db90, 0x0a9ec560bb73e81d57e752162bbe4f3c,
  0xfa265c428c9da6f28e2fc970136e0b28, 0xa5743cf56a237597ce580031f065e75e,
  0x137972c4434747054820151b571875b0, 0x5c8cdc9126773bb5d414b37e60366586,
  0x129391be83f7a47bb70290df3750e40f, 0xaeda7d495fc263f9b03de9fc7e321746,
  0xb4e1e37de895f7eebdb5b5394b075ef8, 0xe2b5f04d33cf20822382a35dcc7edc4e,
  0xa9bcd291a1cf815f152fecdcbcccc914, 0x5aa7ba1307657374613559d3f5f81fa7,
  0x4f5e74a697aee5d693c4698eebae59b5, 0x155632caedb80d6b686706af56fc4b90,
  0xa68b8340c09a94a676d7d9a0790e3456, 0xa12400cbbd51083dc4fca4a59fefba1d,
  0x436bbf27feb7ddeff06b53646f98b6b9, 0xf9c43925d9ee85198e028ccfa403b668,
  0xe832f276830d436561fdd088096c633b, 0x1bb6e92daca9c758540c1f17d6a3c2f9,
  0x0bb665e8a1f6f65dcb9c4864cb7ebf64, 0xa58c2b939b7520a6fb1195e3a64b9e09,
  0x5d30484d6e9d13e9534ba48d6aa27e29, 0x8948e62e9301d8fc28508f145c89bcb0,
  0xe70f02d3ff944a7f3fc77b1ef5e28fe3, 0xb0a4e40faf35483b62a6ac2a434b53f5,
  0x07ff946d827c42ea27368426556c796f, 0x1e487747cb1f2330293d260d4ef9e331,
  0x5c037a6cfa8c994eeda5fb46a4b26d21, 0x26f2a0c6d87933fbc981c086e67c361d,
]
```

### A.4 Round constants `RC[lane][round]` — tower basis (canonical)

4 lanes × 66 rounds. Derived from the public seed described in §4.6; every entry is distinct and exceeds `0xFFFF`.

```python
RC = [
  [ # lane 0
    0xdd633f6e06a5c0817b27d2af33102762, 0xd18a77658c72389d7ede67313c9f7055,
    0x997a6e96bd7d0dcab0d9b6f928800732, 0x3da809279196c238bc0ea8a98abbc5e8,
    0xee8cddb0be000bf6f60d0f8c4b6c8824, 0xb5b5142ba19e7199c862ffd941e2ba99,
    0x6217831dd51bd16647b901a579ae5372, 0x78235b2ac5b19c23964ff0a063b93f80,
    0xe068ff9fe9823afd9b4a5f525b601946, 0x2ee621f16a6c10ca5a39d7d3b916ddeb,
    0x97297548473040d2488291e97a30bfcf, 0x73d08c988d8473753fa67e3f0c942e1d,
    0x3c58b0852ae898f3e95dad44a2761e94, 0xbcc9b81809744d356b39f47e70177302,
    0x3989b857220c15b872082322c3c6a57e, 0x5507a7fcd38c3f2efbf4177cfa10f969,
    0x6a65f74212348f5fb01c9504240ab376, 0x632f003cd077fdb9c2503a2747f44377,
    0x2d274a1c69a5461bb20c137021b1c27b, 0x0f877eebba36fba915d8882f80e6c3db,
    0xc2098299f65e49bdfc088775969afe43, 0x09c8a4dcb33ca2cae26cb1d3b898c079,
    0x98ffd7810c01b67ea604399e1b1fb0c2, 0x78590812ec6d5aa77213392c2e7ad97c,
    0xeb6ca360c831cc00fd3bde81a01d7b79, 0x986caf0abf5ab8a885d3dceb89aa212b,
    0x287ba1672f701cea1676a324d2fc81c7, 0x8f4c26277f0c39f09140a667b17b5f5d,
    0x618142ad4cb4633f37eba97814672fdc, 0x9609ca2933115fc2174492e47a235409,
    0x784704873875fd8cd590eabd3df40f42, 0xaaabc2057d42edda2a9a41d964621d9f,
    0x97bf40460e895725f9dec709b081815f, 0xd108782b8859ced4fdc7da22137a4aa9,
    0x0b91016d9effdaf58911fa1de525d78d, 0x58cb6663ddacd9e2cb4240fcd977b932,
    0x1b9087c1d7ccea7706d4adb77496033e, 0x215a86d98a49f2e81962acfa4998756b,
    0x3bc2d02c1a186dd915cda7c20e1eb6b1, 0x460df41f9d93ccba761fd9a6a2433f08,
    0x621cd5c147a1add876c7f95bfb65aca8, 0xd141e0dbfb7b3b9eea22d63beb553cf7,
    0x7aa701c3e5042d0a0bb6c3ff0615bc34, 0xd731d18868d1f76827a553c52a39fc5b,
    0x4401014d4879e4d01061b9e9c3a79c50, 0x985398219fabe1f533aa6e5348ebf9a1,
    0xfabd8e9eaac1ebef614ad3dcb001aa0d, 0xf5205275b41a75e340c272f0c7981334,
    0xdaeea95c0cc7e485596bfabf4dd7fa5a, 0x3cfa9e0eef0c63d6ecb67c1b1d8dde38,
    0xbf8cdfda030fa3827efa9263dbc5185a, 0xa7631f8aff18bffbaa06b6fd79a07978,
    0x1de2e873fe1827f6808b01bc2d589838, 0xde80a17682dc489c2687b0415954b4c2,
    0x5e6e43a5f1086359ac92110075ccb453, 0xd61980d4a4b3780f66c2003d53d17fc3,
    0xaff80dce55f27db192abc9b5f84909b9, 0x1db0f6747d8a04a87d0687d94f84df40,
    0xfa56eed1d8b1368ddf24564e167a8dd5, 0x10e59cabda38e348dcadf7bed69e52cf,
    0x512baf73001a99c97969fc258dd58272, 0x08acc22f3edd60d90aeccf5723c84521,
    0xbe332a45164cceb7418e8c3b05c72a5b, 0x6a2919e1dafd2022c6e2418bce11ca4d,
    0xf10a29fcdc5bc05e3dc3730b5f759709, 0x3f8637d9957335e6158230cb9fe46c00,
  ],
  [ # lane 1
    0x1d0d63d6129df263c4b6a485569a4f2b, 0x5d2356c77f2f878f6a7e2715957abdb0,
    0x08d4619b3f4fdb9e7bb63b8b2c9063fc, 0x9f7e73286d12716d36d59b420ade4e60,
    0x9a68f277965b0880957ce83d83ac5711, 0x2e586a754b342369183e0a043f9275a4,
    0x01381163278c5059c833463309bde37a, 0x0dcf364eea4f91badb9152d9f0abbfe5,
    0x20b6a50f3079b4710304c4ea89fe08b5, 0xf8bb25c43a6f52ad459b8cea23313be2,
    0x09a329b41923c783cf2d907c8ccbc5ec, 0xfa67e42f683b1322aa743c240f9a28f2,
    0xb64ef6c1c961a1544aee031856fa856a, 0xd1ef370e82b51c986da3060ab97de4c4,
    0x84741bd2fa8fe0cde717a53614adf127, 0xa216220f58ea5f5656920ba504275f3e,
    0x9167a8f141ff9575c4add9a99006e00b, 0x19fcba2feaf3a8ac5613e54af4afa18b,
    0xf40168aedd7515e4c35de0c335b518ca, 0x95762bfee4fbe8cdc94313814007eb48,
    0x786dbea0aee0f5439c8391e24fdef054, 0x0e1fdf4e339e34d39074eaf1feacd42e,
    0xb2ec2c0cb5211a6c34a4ca42e36730c9, 0x227ae2795b8995ce5d39d1b014d87477,
    0x4457476158b221b536d33f5b9bcc4a3f, 0x1c4e1e02c3e4998ecccdcd0a5e51f337,
    0xd4c3e5aa0bcdd8782ec73cd37fd9a878, 0xe83bf60c4be09cd7b058b0a5030b3113,
    0x420c01d4df7f019126d45bfd445c52a8, 0x4bbbbb5fd2b0998a611804d9c475bce1,
    0xfb7c5af02d6ae73fd5898a3e1cc00294, 0x62a46decd02e94a2df275ba3a1949a10,
    0xa4bab1de8c576712d4f594040b10c361, 0xa483b7e308d396d32bd0daf00932e532,
    0x98b4e508b8b13a550693401bfd11eb84, 0x573704d688558393eb1fb06e4bf6a574,
    0xf875ecf8c57cde24d1867d11094f89ca, 0x4ef5caebb6dcffd82a613a5aa1a02837,
    0xed679e5d82339df49ab7f411996dc68c, 0xbf6ae00db5ca85fb97048e1c4a221b77,
    0x04e05fc3edb9d6b1def601c4b0f42b16, 0xc4bd9ac4ff96924c3e9912cecd92ad4e,
    0x247e2f78f0c03d0c890c503976c15cc4, 0x8c05d025511479fd3d8ed077096f90f0,
    0xc761d2de41f2cb5f41e2e4b626f09adc, 0xac756b8a87b90b8482c303459e92ed7c,
    0xfcd808cf36a403dd2ac611c5d305cd2a, 0x4d406d0cb19364498637b556e0798e3d,
    0x4107f92725c0f3eb17713cac57a1820d, 0xad2250eaad5213848ae09164e896e91a,
    0x23b109d4af6efe5a4faf0d10d37f6a7b, 0xb7441e6329a733be442757658a1cd4cb,
    0x7bcdcacba88ca97286ec3ee0474ef729, 0xe0f9edd66a325ba61037520f76878e4d,
    0x36c1cfc047181be6f180262c4890de16, 0xdff27741e3330946a29168c7a94e153c,
    0xad5cd55e64c24c56c51310440f46f343, 0x5935f2eb3094101af559a70d3f28992f,
    0xf45ab3df32418f73848b09f1a773ecfe, 0x7e83bf11ce5891b2a251bad5fb87a23d,
    0x5c12bbd89c38d09fa02c1508ee44190d, 0x782dade21e7959d801f4d7488d1e51ed,
    0x4f71ab4cc0baec0b67eeb504b5167ad3, 0x11e938ad3b6807646ec3b5350d5e8d37,
    0x79a1c38a289242a8f0c1f98780966be3, 0x2a52f1eb1565faf68b63feca9671e2df,
  ],
  [ # lane 2
    0xf5f3937f7893728894f69b439bb97e47, 0x20ad737e276b5c4ff565d18427ec8a8c,
    0xb27d7735f8a7c5241bf101f9692c7296, 0x8ad3e04d6ec95bfb5b3e207a3a75ce26,
    0xb01ccc4c46d525a4b791c702b85ca160, 0xa58f5f390878ae0b8bea2e0737e25c76,
    0xb977a28baf50c227f73fe8ab401d8a28, 0x4dd0b088d7414f746bb3244e058bd3e8,
    0x1ca44138cb625d9b16ebbcbffc57a31b, 0x5b1bb112a988eb1469fe9b916c2600ef,
    0xf07fe66b73e49aba27ea77cc97115c36, 0xc7ba631c7760c5ba11b602b9df56e735,
    0xceff1f8dc056947a863a36ff1a7dd4df, 0xf85c01c1b08336559dc12fb288bd571f,
    0x7d70db9d92c969b74658f5d119717175, 0x834adb94af4d18021e79bb4269d70b8a,
    0xd8c01dc7f58ad25d1bcd2e89eea3e2b0, 0x8eb3e8be313b2a51a6f25c4d090813af,
    0x383de326701d12ff4afe5ad011c21721, 0xd5c9e25ef6902bdce354a425c2f190e5,
    0x0d2ddcf5073d75a36c182f9e4b5bc077, 0x6dbe7203612207c4802697cb5caadccc,
    0xe0e35dc72a00c815c69022887f39fa9b, 0xec0d4d00c24b10c6da46f3a413edc2d0,
    0x2e8b8cd37b590ade02328d03c74108fd, 0x9fe3be419d622f40741eb5e7afe85b1b,
    0x6b5c741935a2f1e891ee7489eec32267, 0xc543334d6117e12d3507376b552abe5c,
    0x365338b8fc3c8a922297803919b956ed, 0xf481109c84d5367fe3fc5049b360595a,
    0x64f84008251279a252cdd43e7b528c22, 0x90e8979a15d1a7118d2cb469d3705fcf,
    0x2aca96769c54a5b16520c7351587daba, 0x84d18eea5afee09a6acda613f9e48cb2,
    0x050cca03e9a821cdb8d1a6f518222146, 0xb69c7deb76fef6d8be12ec3fedccdded,
    0xfa61984f7d3360a62197ec825c74a932, 0xb428df4f1be0053b98f9dec8f6e9ff42,
    0xe27e4230c9c3e7dbd3f4cf8cebb280b8, 0x0c981da8e2fc2e48f5d83c2f1ffa5f04,
    0x1e96aa86f51004537e21ab65e16c5cbc, 0x2f0249f953d8499f045a07d23a418345,
    0x7940e03d5e101106ea59044d61b1760a, 0x9e258a46481b0561c7cf5ece46c8015a,
    0x4421317f34b44137a3877444a3f2168a, 0x8bcb37f5aed303b4470a006b60b04760,
    0x9e63e3a8589c05b3eec74f4ebd5928f5, 0xf314d091c3a64a6678a485095a7d7e4b,
    0x9d7c540c4eb34eb7f125f2b43fd3918d, 0x1b29d1818b5523c0c60dfb3e10655893,
    0x437c3c1637525c84edc249fde588c506, 0x877bc0632c2fa29653b4332d990311fc,
    0xa1f7cce8e2b69fae7d919233b0fb5abd, 0x0fe1856d70704af5b48b6d2aac9efd41,
    0xac3236d30e8ea2f472637c2b135b07f5, 0x78002a1d9e7c1e76ce853ef039e18344,
    0xb8b6d3f0bc090cf31a6e0868c68014b4, 0xc261fce621f394afb5e649e92acc27d8,
    0xf51cd21b6313f58ae2d9457081f313e6, 0x810d999bcf1d5114065905e42c7fc2fb,
    0xfffb2cca36c6a78a8aee9759661b009f, 0x8820b3beaca00967974ccc4f4429d75d,
    0xb09cace3ce1966962b6ec29a24c42524, 0xd8d77eb12912bed91628f71439ec66b8,
    0xbba6ab6bd4cae21e14c260fbb4df002b, 0xf6a13143475b6a3dc57efce3583156c8,
  ],
  [ # lane 3
    0xe122668c9c2c7bb8e4018b5c4711335f, 0x50373667849ce5d4b22247e79b2748e5,
    0x5982a4c83b956cd4383ebccd0ac4a84e, 0xf5a04ef535c80104350205905f0a2fec,
    0x46c46043423009f113dea4b987049997, 0xa7e3c342f4662efc26aa16cfa4c1bfa0,
    0x520aebe71106638c6a7640f91269427e, 0xce52ece128e1ceca628f8cbf2a67cee4,
    0x196e1fe7c1da2ad7fe249d786fa17d65, 0xa99e0fbcbc9d8d31b7774bb9a6507c83,
    0x4b27146542b6e072343c28ed0e18f380, 0x90e3bfd0d91156f2a3facfcabfe15793,
    0xd360d9a76426a718c813d7724c09481e, 0x667294d8fac4e5bb71cc5f4d680a98b2,
    0xc2fd28f9c85a88c9d30887f54f09534d, 0xf0db651a4ff92d467e6562bd22c93578,
    0xbc50d03132aa73f1136d72a2f388f7f9, 0xf8472fefff225f569f09f15c6103e476,
    0x3dd3ad1e601eb83c35e1b14a17f569d1, 0xaa248f97e722388115d6261dda24a3c0,
    0x7d8cea24d06c3e4366703c3538866bcd, 0xef673bc2a136ba2a78540dbaed6a45bb,
    0x0330b6a43a113b17a8fc4d4032eeddae, 0xc8ef198d62cdbf2a807d80af93d893f3,
    0xe326d058cca4aa26a1ef4dae039a610f, 0x1651bd9a676a77d4369930fc27ba69c8,
    0x6b679acde232e4235234ac91220dff28, 0x131918b847ff6924aa444e4e8efd4bab,
    0x3ad310f56622d666d62c04342b3cc5a5, 0x2edec79aa53a53d562141b46b99b2058,
    0x34e5cb9101446b2b5c499762f7d46abe, 0x52513e22dba808efbb3bf47a94a88f81,
    0xc0f29e45315271c45796faf732efc43c, 0x65e5552f40f61fb208287137f2de45b5,
    0xe6197aa1dd4a706defb96091af828a29, 0x67d02f3792a56a458861b9af6acf362c,
    0x73a80fe745b392c3d89660e121e712e4, 0x41a879ac1addfaf71d3b26c53790194e,
    0x6f844109900b207dca4617a2d7043979, 0xd0cb1cad47706002e8b4d35f40e8dcc8,
    0x13905117321464b0d3cbbfe943b2eb98, 0x3d5d31d5d5b349214924daa0ba21ba30,
    0xb384cb1abae18e331f3b53a8a49f7d97, 0x511e6eb04095b91d383743139c51a8f2,
    0xa6ec01ff36466378b24ad7a03f16fdb9, 0xce698232d87dfab15cb5b9b53e3cebc8,
    0xfbc1cbfcce458d5dfd4185cfba042eea, 0x9108463790bb81d14ac79900ca47cecc,
    0x26bfd320e892875406e5778829379745, 0x1f623849a583a1e7362988bd9009f18c,
    0xc9c126e940223f2cd111bae28a01a99d, 0x26446912691a6dfe437bfe6a9d26e1e9,
    0x74a4c62b19e82a089d6d918d808bf579, 0x9921b8b9793e933109500004d54e74eb,
    0xe7cf2900b28e43c5e29b1f39bb93a4d8, 0xf9df17307a9e1265a179ebbb42242f66,
    0x20274a8176c96df4816780c0ef70e3df, 0x4820279fb04ff14e1617f93aead3bba9,
    0x65b92e904cfff0c12fffbb08e5ddee37, 0xb1cf02f0f40139dad4786c00c1a048d6,
    0x9b4de5e819f0345a80ad8c0c38d1b945, 0x74399521e8dec010cf78fedd0cacdef0,
    0x759bd308ba3b2f781207f6a7699f2d16, 0x1e11c605797dfaf3d9889678cd3a2405,
    0xac9f2be9042607db49f27e9877f17355, 0x824c314328aef398060428811fb5d4b0,
  ],
]
```

### A.5 Round constants — flat basis (`RC_FLAT[lane][round] = T2F(RC[lane][round])`)

Provided so an implementation can check its `T2F` on 264 known values.

```
RC_FLAT = [
  [ # lane 0
    0x2e5002faa4d4f2cccdab1fd241a3b305, 0x4b13747c10c96c3d08c1171e6facccf2,
    0xf95b566ab799979cbf830ae20e5865ad, 0xa4fca8539f45683f9c61a3e191020682,
    0x117707a19715f83c5cbdfde44dc45934, 0xaa0c5b159e28a4f852e1a47e374cfe4a,
    0x7a4220f884f611c11bb147fd9a8a79b7, 0xf9e5d5e1e14143008b0fa5f498c79504,
    0xfb51d0ef713059c96c6859e82f55548a, 0x994866a0f864f1fc795d44f4cd050322,
    0xc5d31e976fe400c5277835d9a0f663af, 0x8df28ea3cda961d0dea5ab1a5d19636a,
    0x1e36ff43b4a43018b9189adec1746026, 0x8f1a9c223964807bd4436c4cb7c2fc13,
    0xe1a450a380362c7da4f3ebf5e4d30daa, 0x386cbed9885692d60ba1f3d5ff952628,
    0x3e0cbb0a9a20d78ed80b8ea2e2743841, 0xac7108ad9fbef8e587d81842c4dd231e,
    0x338d3fd005a136614c00d74a3739443c, 0xc756ec0059ac50caf71ba5565ea063a6,
    0x84dd98268ca88d5d05f00f576161c465, 0x0d9da22a6e1ff4c3b92dd1d42c3120f5,
    0x5f3acf31733fd9ec62c7ecefeda68da5, 0xe143d5c2243bfc96c24f2030a2d03eca,
    0x8aaac4d7955f35d88af5383b9660b9c7, 0x81d1f4a0e1f59f928eaea17e165cbd59,
    0x2ffee1ee7e4d2821ef82d8304a834f1b, 0xa8846aab2fcae54a0dfcd799682b22c5,
    0x4b1cbf5c15a2c1fd965a58260192fdfd, 0x56f0716528d45b109d626dd7aa1e1dc6,
    0x57a8e3f2560c392c8435646e8f52c724, 0x493ed9209cf5010391da6faed793c5f8,
    0x33679a1ad7adcb85c8ea5dc4adb21333, 0x664dc4ce0328959ac14125142265b969,
    0xc27d3b440c61ed465645d002ccd0d3ed, 0x787c2ae46d6ca3207b7ed8e9f8276d3d,
    0x2ceda91302995d3f142dafecb2a03308, 0x32085c03b5a4ae19a588480e768ad049,
    0xc99ecd9e14a63f567523897712703487, 0xfad076964572cb8a88ad54a0120dfb95,
    0x57baa2164596b2b28373a519a09a9dde, 0xf5de1e640a3fb8b86cfede3a169a401b,
    0x3bd2207d4871b79884a7e963aded4d1d, 0x8177b1749892b3706d1c9a90aab83880,
    0x45e17986fb154de9d8ff86d3d5e1bb71, 0x66e9165a2cfd2dd05e4018af311ebf14,
    0x869f17e883f6029950fc67cacb345c8e, 0x50279cb106f4858291e174ddf1aed7a6,
    0xb85c24414b530719ed85f7f37d7c7ff2, 0xa084df16247d0f1e616186435ce0d3e1,
    0x1578566bebc1a89d968bff882c3955f4, 0xcf028cbb3cf16ac030171612e33bb21b,
    0xcf6af50fcec7d8cc8746c199bc73bb2f, 0x46f4a2698d42191e99651b0536e26c46,
    0x0575a655c3700692321cf09845b36f68, 0xe544a5ca4fbcf3324cbe180e0c00d662,
    0x2d60f57d9b9b046bc7fe89641f1621d7, 0x31bfa08272d3f0a0ae1f2aafad0b2c88,
    0x002d2bfef078176926080a04e4190ca2, 0x6d1611abfb21275964f412bfdacede39,
    0x10e3510d7dd843fb0dd1734d808816e3, 0x9b1c45419934ea3fd519160f358e147b,
    0x3436f673f823c50f4372cac77f291903, 0xa8275688594b91cb42f0d446e4d3ce56,
    0x505d594a7a0efca19f671faf26850deb, 0xbdf5253f0790d9fef5f1ef076a51ad71,
  ],
  [ # lane 1
    0x8abc82c8951854f63b9036f1207c3026, 0x18f1ccda9f66e68ccc085fedbc45024e,
    0x10eb88a99b5ce5f0d9fb2460b9ea47f5, 0x5ad0f9b4e6d8bd072804e0f582089deb,
    0xad33cff75bda0fceabb9b38d4c9d1ac6, 0xb84c230965ac5af69ce0d29a9ae311a2,
    0x7d92791dceab2a83821beb263850201f, 0x1d9a0002cc7f8ac36aa5689858b0024e,
    0x2393a6d7f4e2ce48a03bc670826f6745, 0xe6c7d7ac2a9ef4112f2dae3f7bb25ed7,
    0x92cfa5b67ff7d871bd17219f09ae0e24, 0x349a4bfed345385dc147365023dcbc8e,
    0x119a4911cc1e4d251d2e56eeec4af8aa, 0x12a3c4479386b51c20d705ecc3aeeee4,
    0x47d4e419fdde1177fd82b42cc81d4492, 0x105354575fb3b76cfde6c563c66d90d7,
    0xc95ceb7bdaa9ccf5039052b1d2f9d010, 0x836759d8dfbbe6a0a9d9643020a812f9,
    0x302cffb53ab5956c5614d4529a099373, 0x1ffd9444d81e9d7377d5c611f0ddff4d,
    0xa0688fb3ac44ece6273b237a0c4fd6ea, 0x544d14e72a221c5dff853d93838e2890,
    0xce38ccc77352e0dd513380b93481f55c, 0x91657f8106e7a47596b523207955f146,
    0xbb173b2265a9e429d1853f6bdceac405, 0x1173d2ef62970cbd4b9965071a82118d,
    0xd1c9481209c3fb81755d2184e5a74a58, 0x35c7fcb229d58fe1f94fb1444da970c1,
    0xbfc2e55186cbb855831f745326b59ff5, 0x96819176baaf0409b23ee936e3f28686,
    0x34778439df76c8363965c400965da7cb, 0xc19b24f67d509053d90c335f2b055cf1,
    0x1cd9949e8bf81db406317632c4812ea0, 0x2057b724ae4fbf4b49368f559c571d7b,
    0xe8e3d6958b2ab3b6d2e1f22da6c990e2, 0x744c918d9feddda7311280ec3efbf81d,
    0xd2c4e7ae6cd9d0c74b8e817ea7316dc2, 0xfbdd586abe78458a03dd9ce364889bbe,
    0xdffab31f01e4ffdab6e0d881e23deba8, 0xd7841241c0f0cef2d959ef2646b283c1,
    0x4027795df2212e14146422f6ac15a89e, 0xe9ea3f08678bfe1b45712dca47cbd1f1,
    0x4ac2266f98aeb6ce172d1e4b9da11869, 0xd08c11dcfa84c4b0635398322847a901,
    0xbd3d9794c6d391e0fb04340f8930b854, 0x309bdf7a97009bfc9d163f7b285dac4e,
    0x095587d04376cd611404384043f97514, 0xdf91efe29144e7a7b881269ad4e1494a,
    0x7cabfa5dac1fdb290f08a89dbecd57f7, 0x20e39ca7f02c408f961bbefc623db470,
    0x1f0175f6e1b0993104f34b94f4736fcd, 0x343489bba317c9f029ddb22f4320d9b9,
    0xc16092efd003b5992ea2308f086b4432, 0x708e79f41eeacc52aa2b27be92e0dc5b,
    0x029b8493ff13bf6db232cc50a3e4fd2a, 0xa19f97a3efa284ca1b14575c08f84cd8,
    0x309b86838559cff06b8fd7c8abeed4e7, 0x19c75fda7874cd7e69b448c033cb7fd2,
    0xcbba32c6280b4553041d0de0affd544d, 0xcd58c10b02676e9c38a5fd79d9e0c62b,
    0xc246024abdf491f773b433d1b4c9511a, 0x77d532d1ecf9ddbe46933ba2196f280a,
    0xc2d7b135111a80bd9d919c62c978a7e3, 0xaad1ac4e21147815886adfd11c91eca7,
    0x3300638c12379c43e3e133e27073c321, 0x5e63011c5ba1b3f1f0796d327d0c63d0,
  ],
  [ # lane 2
    0x513bd9adee0c7f50e2b8f0afdb886759, 0x4664759a9fe2845daea249fa6f3775dc,
    0x2192b764459bfd3b168598e850beabf2, 0x63093d65e6c56f3ff405cd55eb5bb465,
    0x641bb7f6b54553a0f0dc707dd9bd84a9, 0x39ba887cbcf2b26b5bdab39213c0da50,
    0xfbfdbed799c023d2320b157b1c03c686, 0xafb1e44b47d0e30ead7531a403a89b10,
    0x9648af7ce98a65fc835f561e5af57eed, 0xd7c6f1374945ebe471fa290837359f5b,
    0x554af209e4a6780357981d0b034d3b5d, 0xd879a1b14cd59c91c21b2eb057739833,
    0x269a7d199a0977a0358cdc6ae48e55b2, 0x5cf7a464def82ce5faaa720fa3afb23a,
    0xac18eadb2ebae96f68fd97352639d268, 0xad52a1641e6139df544e57e0dfa8796b,
    0x6bfa68358401bdf8c839b0e2f27abaaf, 0xa46802006737c0946fca228b0428e147,
    0x57cecbcf443e5c825d7be8b504e2b7c8, 0xd501e01e4a1bb9f08afef19ef2cfee9f,
    0x0d3105b07721be4b09419601cf871387, 0x338812527ee92b90c6c4f39f7edf87b6,
    0x38dcd9e4d5fd987c520999ac8dcbe04f, 0x39ddde1b9746f30386e95f8de11f2f43,
    0x0fdc761a2899a3608160718d35ce15b7, 0xe4bb19f64aac8efec36b52ecd1b4d893,
    0xb9d354f625fc7078e8b6fcd493aa16e9, 0x67f7816aa06d6eef1955b56b99109658,
    0x1f6c6b573f8b407f9e23486c8d426d78, 0xdf0800829b654e293ccdecc9af2a4897,
    0x3a7debfec1f4116809150c468db1b421, 0xdd9ad50666785f804ae5cc1bdc0f1661,
    0xc1d2d7a8ebe83c1a85bdf4185cf28f6e, 0x91c7dcaafe420845c49d9dfcae1cc36d,
    0x2d5966fddc228ad51ee0c442a4c827d2, 0xa7dd9f674478b276cc97d090d5215a60,
    0x311ebf337e1e7bb9e4a91ecd49283674, 0x939e9206c51831fb1063fd4397c30a03,
    0x9b9cecb4d1f4d7a1035b8f9ffeaa1f25, 0x209d0e705f9e7841447ea6491ddf8e5f,
    0x2d5c7b20b15e07b77f4399cac0dff365, 0xf8a65f7c9c4af194f1030630225babc5,
    0x5787a843081c80a74bc6dcbb8518b0af, 0x2ed82062cb8605c50ddf971a1453bf32,
    0xdb09d9f565906e24e3352b33ea436a74, 0x036d260fa826267c21412eea5a146975,
    0xb9db6c3d6838a7ae97882703cf8fc4d7, 0x86b470c2c5827ed7c71fbccf278f26dd,
    0x819fb4eb9ac962eb5eff620b162ad8ee, 0xdbc78a56dbbf830ee35c0b6595a7ca9c,
    0x29a10df2770d69147d58ee8430205714, 0xb54f21191f6b76472b3b5095ce03a298,
    0x9e5c23f6346ab385caf433ec3caa0fd2, 0xb251ce94e786175ee5b38b1dd17f7c6a,
    0xee3074272ee35bd134cb37a826fd30a4, 0x4fba84e21c485c85158eb779cfa1acbc,
    0x9b381babb6b0a5258ae6e776ee268e10, 0x8051ebf45c75d9f8a55420ddf8fa3648,
    0xae033ba4d016f94d1c71ec6f31bb1a6e, 0xb47746841eeb1ab4dd40e3edb648b0b9,
    0x046a49b0b921066006c3b2b1657e58e0, 0x12dab5ca552be119f92b4cee4d4527f1,
    0xd25da2a03183dbd27ff4c3337a44befb, 0xd13e4937442fa766b9a2e46be351ecaa,
    0x6842152f80e74d2a3b806b39068a25ce, 0xa7cbf8c1fbd87bf6f378483e134abc6b,
  ],
  [ # lane 3
    0xae1948272938ac1e00c8c8b6f66f71fb, 0x60fb58deb7a4065fdfc6855984d7365b,
    0xde3053e6a4c1b20edb65907c6c4daca4, 0x1d5ba8d0a7e804b72946aaa877ff5009,
    0x0182464c9773cbce6e074bc62571fe90, 0x4943a37ba9288d0527f80eda2df6dd56,
    0x0db297149d3a6e22b49dfc140675fd16, 0xf00705687ac4c6db9475f3a05220380f,
    0x8764395e637071a1e1b8c171cc96edd5, 0x192ca9bf57ccf6235d71c02adb652178,
    0xeae0e08a00f002116dc59d0eb9123e31, 0x63fd9a858a9be62f3e3d72cc658338ae,
    0xe18cfe3f707332b07c687af6e7e2c92a, 0x76f47cddbfd431cd873f4aaa53a38e23,
    0x77b6204f7b9707da13080e4d4d2bbd10, 0x58af66e0353f77197582f088a5685633,
    0xf33cc0cdd4d4c4e2eb1c3a35267edab6, 0x340dfdef2c85804ace03b35a49de7a5f,
    0x914dff21bf62c57c81cdadd1d07dd1e3, 0xdbd4c3d6505aa601c27c03c07e03fb9f,
    0x3652c11a204a3086f9ae21a297b16bbe, 0xa73929f6c9531eaa7e0991ffdb690551,
    0x9bef115df16efa5a3a82cc05dbd2ce49, 0xc060c0bf9f6ff6b693cd6132b4dc756b,
    0x9bd0fba55e228edc7f67d75532d748b0, 0x877b5cf1df8740c94f167f58c3c23350,
    0xf4d0cc4e8fc0f7ee9fada0c09e4b7945, 0x6438ff43d7ad1131db5d00a2cf756719,
    0xc1a89db6170738c97cd6274c9a43b176, 0x0e0d27b81df37f45150708adaf2922db,
    0x7f4ff77739564e7ed63f5f3084d27c08, 0x284b563e34fac95b0e751b9c5809918a,
    0x6e08e7bd42b7205b9c4fb38ad3196b3c, 0x5b387e3425089c3293e48b949370114b,
    0xd6f0380cf8cb33dde10e26b9714a285a, 0xc9abae26989a761f1635ce6461723349,
    0x0ef5e53adbdd6865224822998aabe4d0, 0x290752411254a1c69dd3ae62098674ea,
    0xb9b958655c091a4c978e1b1d7241ec0a, 0x530ceb667ec1c8b263a9a6b1dc514018,
    0x4ddc3c7b987097cc432a17812c7ce9ce, 0x768edffd4014f609d77e6f3dc2f8dcf9,
    0xee8c5d0c072a419dc909e2c89db36765, 0x5c8f74243b75df68dd78cd1f1aacdcb5,
    0xaa2854c8c1aab2dcbd84284d3626bdb6, 0x0374da664a3d29ff5e05484b5a1bf362,
    0x2d7b3aa714875568829df4d346c02806, 0xadaac85439b62e31fed411a7d810ada7,
    0x0a25439eea14b9f5ad08e5ab4572ff4e, 0xf3c2359b1938568849d4e5e6867ce981,
    0xcdd6699e819e7e6d870a385d9d92bf6e, 0x91f129e04ef2de1ae6498cc5fb421c2c,
    0x0ad3c248f289fcb087375fdb41e27d1a, 0xa11dbf9deb273118ad402f9261b1717b,
    0x87804ea1af8cd53059bbd74dc0e33f32, 0x9b73f81518f22b7b44c5913659124c63,
    0xb5d11b77730171f2ecc0e35cbc9cf0f3, 0xe3731792758a9df6b0d0a0dd0c445300,
    0x6ebaa3bf870622a98744717ebe0525cf, 0xeb9cda51606079126060cf28e6292d22,
    0x7790743e2410ca1c43d04f4e8f8746c4, 0x263e630f519657be990c4860f6c1b3a8,
    0xf489e387e01c40c2b766575a2827f48d, 0x9298b122c1cb167558a4fe0018aeb841,
    0x38b5afe434fa80c592bf5f8a20184d58, 0x3bfc87564db937f78a9bf07053de8d1c,
  ],
]
```

# Appendix B — Test vectors

Every value below was produced by the consensus implementation and cross-checked by the §3.9 reference code. Hex of 32 digits = a u128 value (not wire bytes) unless the row says otherwise; digests are wire bytes in order.

### B.1 Field arithmetic vectors (flat basis, GF(2)[x]/(x^128 + x^7 + x^2 + x + 1), bit i = coefficient of x^i)

| a | b | `gf_mul(a, b)` |
|---|---|---|
| `00000000000000000000000000000002` | `00000000000000000000000000000002` | `00000000000000000000000000000004` |
| `80000000000000000000000000000000` | `00000000000000000000000000000002` | `00000000000000000000000000000087` |
| `80000000000000000000000000000000` | `80000000000000000000000000000000` | `c0000000000000000000000000001067` |
| `0123456789abcdeffedcba9876543210` | `deadbeefcafebabe0123456789abcdef` | `9a174b3b999992a57a16dce056102045` |
| `ffffffffffffffffffffffffffffffff` | `ffffffffffffffffffffffffffffffff` | `5555555555555555555555555555402f` |

| x | `sbox7(x) = x^7` |
|---|---|
| `00000000000000000000000000000002` | `00000000000000000000000000000080` |
| `0123456789abcdeffedcba9876543210` | `fa0323684ae0270cfdd1e5aaf6b2a71b` |
| `deadbeefcafebabe0123456789abcdef` | `4c752bcc30b0a6654a20f9bad3784786` |

### B.2 Basis conversion vectors

| tower value | `T2F(tower)` | round trip `F2T(T2F(v)) == v` |
|---|---|---|
| `00000000000000000000000000000001` | `00000000000000000000000000000001` | `True` |
| `00000000000000000000000000000002` | `3d5bd35c94646a247573da4a5f7710ed` | `True` |
| `00000000000000000000000000000003` | `3d5bd35c94646a247573da4a5f7710ec` | `True` |
| `00000000000000000000000000000005` | `a72ec17764d7ced55e2f716f4ede412e` | `True` |
| `00000000000000000000000000000007` | `9a75122bf0b3a4f12b5cab2511a951c3` | `True` |
| `00000000000000000000000000000020` | `486fb01f93aa169afd8ee716e990cf14` | `True` |
| `00000000000000000000000000002000` | `86b6a57216f083193e1b361e8a1a5bbf` | `True` |
| `0000000000000000455f504f57484452` | `e7f94e2a65c5ecd28277765bc95b9451` | `True` |
| `0123456789abcdeffedcba9876543210` | `fbdef4953abe30e869895f34f5ee64e2` | `True` |

### B.3 Permutation vectors

Flat-basis state in → flat-basis state out (`permute_flat`):

```
in  = [0x00000000000000000000000000000000, 0x00000000000000000000000000000000, 0x00000000000000000000000000000000, 0x00000000000000000000000000000000]
out = [0x70aed62b3d3aca0a9defe344d87fc407, 0x8b3ad2ad34e12fcb06c9dede1443951e, 0x13e2fb0973cf8d0015d1ccd889f04f5b, 0x0f1b4ce354ab19ec4d90adb36de2416a]

in  = [0x00000000000000000000000000000001, 0x00000000000000000000000000000000, 0x00000000000000000000000000000000, 0x00000000000000000000000000000000]
out = [0x277320824fa1e10e7c9d7ed3b7c58ac8, 0x1ba20fc5f8f706c52f4d0d6c57e41752, 0x6f0a4b74de987f4428c06dcc12410c70, 0xf334ed9054f7a9637d11db08d2606faa]

in  = [0x00000000000000000000000000000001, 0x00000000000000000000000000000002, 0x00000000000000000000000000000003, 0x00000000000000000000000000000004]
out = [0x8cc7889bacca3d35affd5d13215ad9a1, 0xcb44b4de9e048795bc01efa58ed29b3d, 0x734db3e79999fcb8621e9a282aa96778, 0x1ec2d9651c6e622a1addcab25ff4a8c2]

in  = [0x0123456789abcdeffedcba9876543210, 0xffff0000ffff0000aaaa5555aaaa5555, 0x11112222333344445555666677778888, 0xdeadbeefcafebabe0123456789abcdef]
out = [0xadadcfb8b07dd5688bc2563d9d1b8d6a, 0x7f3a98e5445da8d53b5d4d9d84254071, 0x4c9d9a463d816f337df9e9c7fe570761, 0x26b8b7c8dd98b9ea15c367193e6ccecd]

```
Tower-basis state in → tower-basis state out (`F2T ∘ permute_flat ∘ T2F`, i.e. the consensus `Poseidon2bPermutation`):

```
in  = [0x00000000000000000000000000000001, 0x00000000000000000000000000000000, 0x00000000000000000000000000000001, 0x00000000000000000000000000000000]
out = [0x7aa4a5e68b7881364e3687b6873a120b, 0xb9a32a3a9924dee84923a06dfea0b791, 0xa9e6d9b54ff8aaeda92787fd50679cd0, 0xaba1037fc7fd81c07a4521b4f4a0bc64]

in  = [0x0123456789abcdeffedcba9876543210, 0xffff0000ffff0000aaaa5555aaaa5555, 0x11112222333344445555666677778888, 0xdeadbeefcafebabe0123456789abcdef]
out = [0xe339a5364d12cee5db3236760a2d5ff4, 0xd0fdaa365a5e58babc3d0f66c50680aa, 0x1e85912881bdeb968d1dd51aed4aff63, 0x2613e7609ba2c72295dd93ed73fe0d62]

```

### B.4 TowerHash vectors (full 16-field schedule)

Each field is given as its u128 value in hex (the wire form is the 16 little-endian bytes of that value). The digest is given as the 32 output bytes in order (byte 0 first).

**V-0: all sixteen fields zero**

```
f[ 0] = 00000000000000000000000000000000
f[ 1] = 00000000000000000000000000000000
f[ 2] = 00000000000000000000000000000000
f[ 3] = 00000000000000000000000000000000
f[ 4] = 00000000000000000000000000000000
f[ 5] = 00000000000000000000000000000000
f[ 6] = 00000000000000000000000000000000
f[ 7] = 00000000000000000000000000000000
f[ 8] = 00000000000000000000000000000000
f[ 9] = 00000000000000000000000000000000
f[10] = 00000000000000000000000000000000
f[11] = 00000000000000000000000000000000
f[12] = 00000000000000000000000000000000
f[13] = 00000000000000000000000000000000
f[14] = 00000000000000000000000000000000
f[15] = 00000000000000000000000000000000
digest = 553deadf17a2472a935c73b68cf07e4f8ac53e1009bcfaef4f50f84b17e6a3b4
digest as LE u256 (hex, for the target comparison) = 0xb4a3e6174bf8504feffabc09103ec58a4f7ef08cb6735c932a47a217dfea3d55
```

**V-1: nonce = 1, every other field zero**

```
f[ 0] = 00000000000000000000000000000001
f[ 1] = 00000000000000000000000000000000
f[ 2] = 00000000000000000000000000000000
f[ 3] = 00000000000000000000000000000000
f[ 4] = 00000000000000000000000000000000
f[ 5] = 00000000000000000000000000000000
f[ 6] = 00000000000000000000000000000000
f[ 7] = 00000000000000000000000000000000
f[ 8] = 00000000000000000000000000000000
f[ 9] = 00000000000000000000000000000000
f[10] = 00000000000000000000000000000000
f[11] = 00000000000000000000000000000000
f[12] = 00000000000000000000000000000000
f[13] = 00000000000000000000000000000000
f[14] = 00000000000000000000000000000000
f[15] = 00000000000000000000000000000000
digest = 57324c381b611bdd7b21dd3dcaf34f42ffab800b4cd6ba2c3aec51b578ebfa46
digest as LE u256 (hex, for the target comparison) = 0x46faeb78b551ec3a2cbad64c0b80abff424ff3ca3ddd217bdd1b611b384c3257
```

**V-2: nonce = 2^127, every other field zero**

```
f[ 0] = 80000000000000000000000000000000
f[ 1] = 00000000000000000000000000000000
f[ 2] = 00000000000000000000000000000000
f[ 3] = 00000000000000000000000000000000
f[ 4] = 00000000000000000000000000000000
f[ 5] = 00000000000000000000000000000000
f[ 6] = 00000000000000000000000000000000
f[ 7] = 00000000000000000000000000000000
f[ 8] = 00000000000000000000000000000000
f[ 9] = 00000000000000000000000000000000
f[10] = 00000000000000000000000000000000
f[11] = 00000000000000000000000000000000
f[12] = 00000000000000000000000000000000
f[13] = 00000000000000000000000000000000
f[14] = 00000000000000000000000000000000
f[15] = 00000000000000000000000000000000
digest = 98688da9c6e9b6b5235fd015bf764020540e2010a896e88805971db85ac76c60
digest as LE u256 (hex, for the target comparison) = 0x606cc75ab81d970588e896a810200e54204076bf15d05f23b5b6e9c6a98d6898
```

**V-3: field i = i + 1**

```
f[ 0] = 00000000000000000000000000000001
f[ 1] = 00000000000000000000000000000002
f[ 2] = 00000000000000000000000000000003
f[ 3] = 00000000000000000000000000000004
f[ 4] = 00000000000000000000000000000005
f[ 5] = 00000000000000000000000000000006
f[ 6] = 00000000000000000000000000000007
f[ 7] = 00000000000000000000000000000008
f[ 8] = 00000000000000000000000000000009
f[ 9] = 0000000000000000000000000000000a
f[10] = 0000000000000000000000000000000b
f[11] = 0000000000000000000000000000000c
f[12] = 0000000000000000000000000000000d
f[13] = 0000000000000000000000000000000e
f[14] = 0000000000000000000000000000000f
f[15] = 00000000000000000000000000000010
digest = 8afaed0735952105ddeeb729894df4169850f7bb75b0546c1344b4af14090398
digest as LE u256 (hex, for the target comparison) = 0x98030914afb444136c54b075bbf7509816f44d8929b7eedd0521953507edfa8a
```

**V-G0: golden.txt line 1 (must match `golden.txt`)**

```
f[ 0] = dac82fcc996a8ddcd51b012481a942f1
f[ 1] = 64fa7fd19993efea7d255c80da42935a
f[ 2] = 780a1ab5ec704d43e2518fdd045d50a3
f[ 3] = 4dd2fb2824462567b730caaedf8ee98d
f[ 4] = 2ddae489677075adff41532e225cdcc5
f[ 5] = ad81c87a6050959476e24902cb528c1d
f[ 6] = 1aa5a5d421aaaf4f54f22d87e68f9dbf
f[ 7] = d6f00cd6eb0e0a99939ab6fd3871df44
f[ 8] = adc1b7b66d791afb311eb31ad228860e
f[ 9] = c9c5eb0fd9520ce4251743c7b1e0b9ab
f[10] = bb37b007610bdc7c9ec0d8b4d4fdd392
f[11] = d7c85effc50062aff7904ea3de524f44
f[12] = bd38f79fcf92e0f51ec3732f8bac2a9c
f[13] = 4c12c07d340c588f2c64fc112ea589f7
f[14] = d26cc5177f267b03dd61dbdb20c3dab7
f[15] = 0000a697dcb3308cddef69fac3bffa43
digest = 026439e650aa0ae35e0cb99cb10f3d1027a183bfd6adf1d710a83308ba6b9cb4
digest as LE u256 (hex, for the target comparison) = 0xb49c6bba0833a810d7f1add6bf83a127103d0fb19cb90c5ee30aaa50e6396402
```

**V-G1: golden.txt line 2 (must match `golden.txt`)**

```
f[ 0] = 98ee681c26a0b0491a685296d050c003
f[ 1] = f6cd4d78289130cfcaf62f25cac18ae2
f[ 2] = 9ae38425339e1ad93edb341aa82cfc6c
f[ 3] = 549f98b01698fba66b9ca90f2bfab311
f[ 4] = f1d080e2f2e51a7a0355f9bdc5edd107
f[ 5] = 55e06c688d67295aa7858f37db77c62b
f[ 6] = 75d096f5b3f60ce71fcddfad75edaa90
f[ 7] = 9072cd5858f98d59b005bea10052973d
f[ 8] = fb9cf4b4381e7c5c8e1f6689d75aa99e
f[ 9] = 9158a973cc6bb0b4a8d2d34a4d1b6a4c
f[10] = a9c8ab586bba0c24c25209bde94eecae
f[11] = e24d516aeb9abf91584eb62703e83b25
f[12] = 49b5b2bbdfc954ff15c9c6476a11ff3a
f[13] = 02c74e9a69e6349820d3b93ab1f028a3
f[14] = 3630febda444dbbba198aa7da9caeacf
f[15] = 301a12eefc05e2afa21efe34ae2f5ef5
digest = de7f80985b5582796e73bf3e2e199d9df72f6e1fe9958f9e62818e7d2d1c1792
digest as LE u256 (hex, for the target comparison) = 0x92171c2d7d8e81629e8f95e91f6e2ff79d9d192e3ebf736e7982555b98807fde
```

**V-G11999: golden.txt line 12000 (must match `golden.txt`)**

```
f[ 0] = f53076d635ce681097d98df9c522163e
f[ 1] = 125e3d9a5c835e81cc81c5d03825ca9e
f[ 2] = a8501ba0a5b8e6a99d52272a64bcc077
f[ 3] = 2fd2f6bcd8f45ad5dc1cb861a3d3bf82
f[ 4] = 11e2e352cb7d5a0f1df405ac6dddadc5
f[ 5] = 4e86386ff337ffbf732791521a82d02d
f[ 6] = 1da10076b414c4091c4faeea75612789
f[ 7] = 69455c3ccf9c9c61bca122ac04b6da2f
f[ 8] = 216152a06038d483182c8deabc510f69
f[ 9] = bf6ee26a429d949d1dd9d8222db83c7b
f[10] = 8615ca9a63163ce84422be2da3f27704
f[11] = 7c115d56d14ef64740735d94e24287ea
f[12] = 3300a2c483f6b4c5957042215f60ce39
f[13] = 4ea20511c79b21a657ed20b86c0dacc6
f[14] = 997454c25c9180318c27f5a6b287b21f
f[15] = e64b5f63e9eb09787ca6444b601b72a5
digest = 88dee990a6d2edbe7c98477b5eb4b7037269d19d318f8df578a4f827dc2c6c44
digest as LE u256 (hex, for the target comparison) = 0x446c2cdc27f8a478f58d8f319dd1697203b7b45e7b47987cbeedd2a690e9de88
```

### B.5 A real mainnet block, end to end

Header of mainnet block **2880** as returned by `jetsam_getBlockHeader` (read on 2026-09-06). It was mined by a third party, not by the Jetsam operators:

```json
{
  "height": 2880,
  "hash": "8c223ca7e11b842f58d427ef3bed47eca62cda7b4bfe63dd335c80667f156079",
  "prev_hash": "5b1bfebf6fe549af5180ee5b3f982d946debcea870d4285d988d98e1c2a39d90",
  "state_root": "0d708cb589da9bcc57b00efdaa73c2d3bf249aa6168e2099b7b0a70665b2a12e",
  "tx_root": "538d6371211bb0d8e8ca12825649f6901eaa78205af2c0b9b204088638ec32fb",
  "timestamp": 1788724698,
  "miner": "j1ryr28fawt4y3fy0rqd80cq2jhau7pr3lgdsuc0jfyqr9drd8hgvsd8cw8g",
  "nonce_hex": "153d56430000000002a091947bd4c50b",
  "difficulty_target": "d5fbc8a9eb09ee1a9b0c80b3552dcf1a47cf48a1912b2ec8cee8290b00000000",
  "log_slots": 24,
  "active_slot_count": 2822,
  "alloc_counter": 2909
}
```

Decoded `miner` (bech32m, HRP `j`) → 32 bytes: `1906a3a7ae5d491491e3034efc0152bf79e08e3f4361cc3e492006568da7ba19`

Resulting PoW schedule and digest:

**V-M2880: mainnet block 2880**

```
f[ 0] = 0bc5d47b9491a0020000000043563d15
f[ 1] = 942d983f5bee8051af49e56fbffe1b5b
f[ 2] = 909da3c2e1988d985d28d470a8ceeb6d
f[ 3] = d3c273aafd0eb057cc9bda89b58c700d
f[ 4] = 2ea1b26506a7b0b799208e16a69a24bf
f[ 5] = 90f649568212cae8d8b01b2171638d53
f[ 6] = fb32ec38860804b2b9c0f25a2078aa1e
f[ 7] = 0000000000000000000000006a9dc5da
f[ 8] = 00000000000000000000000000000b40
f[ 9] = bf5201fc4e03e39114495daea7a30619
f[10] = 19baa78d560620493ecc61433f8ee079
f[11] = 1acf2d55b3800c9b1aee09eba9c8fbd5
f[12] = 000000000b29e8cec82e2b91a148cf47
f[13] = 00000000000000000000000000000018
f[14] = 00000000000000000000000000000b06
f[15] = 00000000000000000000000000000b5d
digest = 2ee2c1e5c690dd05668878cbf9973db05384b076757b1cad70162a0400000000
digest as LE u256 (hex, for the target comparison) = 0x00000000042a1670ad1c7b7576b08453b03d97f9cb78886605dd90c6e5c1e22e
```

`le256_lt(digest, difficulty_target)` = **True** — the block is valid, as the network agreed.

The same schedule as the 256-byte `pow_fields_hex` string (nonce lane included):

```
153d56430000000002a091947bd4c50b5b1bfebf6fe549af5180ee5b3f982d946debcea870d4285d988d98e1c2a39d900d708cb589da9bcc57b00efdaa73c2d3bf249aa6168e2099b7b0a70665b2a12e538d6371211bb0d8e8ca12825649f6901eaa78205af2c0b9b204088638ec32fbdac59d6a000000000000000000000000400b00000000000000000000000000001906a3a7ae5d491491e3034efc0152bf79e08e3f4361cc3e492006568da7ba19d5fbc8a9eb09ee1a9b0c80b3552dcf1a47cf48a1912b2ec8cee8290b0000000018000000000000000000000000000000060b00000000000000000000000000005d0b0000000000000000000000000000
```

### B.6 Share example (reduced target) on the same block

Share target with 10 leading zero bits: `0000000000000000000000000000000000000000000000000000000000004000` (LE), i.e. `2^246`.

Searching nonces upward from `00000000000000000000000007000000` (region prefix 7, offset 0) — the first nonce that meets the share target:

```
nonce (u128)     = 0x00000007000000000000000000000a7d
nonce_hex (wire) = 7d0a0000000000000000000007000000
digest           = c3a4450b92e5a37647403b8c33f3eb88a06b54e2dd278fc21d6247ee06dc0900
digest LE u256   = 0x0009dc06ee47621dc28f27dde2546ba088ebf3338c3b404776a3e5920b45a4c3
share_target LE  = 0x0040000000000000000000000000000000000000000000000000000000000000
meets share target : True
meets block target : False
```

