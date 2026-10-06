"""Apache-2.0. Gozero offline NOID reference; never connects to a pool.

Parameters/basis matrices: Paranoid Zero (2026), pinned in provenance.json.
This implementation validates correctness, not mining speed.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TABLES = json.loads((ROOT / 'constants.json').read_text())
MASK = (1 << 128) - 1


def convert(value, name):
    result = 0
    for bit, coefficient in enumerate(TABLES[name]):
        if (value >> bit) & 1:
            result ^= int(coefficient, 16)
    return result


def multiply(a, b):
    result = 0
    while b:
        if b & 1:
            result ^= a
        a = ((a << 1) ^ (0x87 if a >> 127 else 0)) & MASK
        b >>= 1
    return result


def mix(state, matrix):
    result = []
    for row in matrix:
        value = 0
        for a, b in zip(state, row):
            value ^= multiply(a, int(b, 16))
        result.append(value)
    return result


def permute(state):
    state = mix(state, TABLES['mds_full_flat'])
    for r in range(66):
        full = r < 4 or r >= 62
        for i in range(4 if full else 1):
            x = state[i] ^ int(TABLES['round_constants_flat'][i][r], 16)
            x2 = multiply(x, x)
            x4 = multiply(x2, x2)
            state[i] = multiply(multiply(x, x2), x4)
        state = mix(state, TABLES['mds_full_flat' if full else 'mds_partial_flat'])
    return state


def pow_hash(fields, nonce):
    if len(fields) != 256 or len(nonce) != 16:
        raise ValueError('Expected 256-byte fields and 16-byte nonce')
    fields = bytearray(fields)
    fields[160:176] = nonce
    state = [0, 0] + [int(x, 16) for x in TABLES['powhdr_iv_flat']]
    for start in range(0, 256, 32):
        for lane in range(2):
            offset = start + lane * 16
            state[lane] ^= convert(int.from_bytes(fields[offset:offset+16], 'little'), 'TOWER_TO_FLAT')
        state = permute(state)
    return b''.join(convert(x, 'FLAT_TO_TOWER').to_bytes(16, 'little') for x in state[:2])


def meets_target(digest, target):
    if len(digest) != 32 or len(target) != 32:
        raise ValueError('Expected 32-byte digest and target')
    return int.from_bytes(digest, 'little') < int.from_bytes(target, 'little')
