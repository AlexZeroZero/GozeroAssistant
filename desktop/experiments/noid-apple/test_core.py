"""Differential tests of compiled native code; no networking, no mining.

Usage: python test_core.py --library artifacts/core.dll --report artifacts/core-tests.json
The loaded library's path/platform do NOT prove Apple execution.
"""
import argparse
import ctypes as C
import hashlib
import json
from pathlib import Path
import platform
import random
import sys
import time
import unittest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / 'noid'))
from reference import convert, multiply, permute, pow_hash

U = C.c_uint32 * 4
Digest = C.c_uint32 * 8
State = U * 4
Header = U * 16
FourNonces = U * 4
FourDigests = Digest * 4
VECTORS = json.loads((ROOT.parent / 'noid' / 'pool-vectors.json').read_text())
LIB = None


def words(value, cls=U):
    return cls(*((value >> (32 * i)) & 0xffffffff for i in range(C.sizeof(cls) // 4)))


def integer(value):
    return int.from_bytes(bytes(value), 'little')


class NativeCoreTests(unittest.TestCase):
    def test_all_field_basis_pairs(self):
        # Exhaust the 128x128 bilinear basis as well as carry-heavy patterns.
        out = U()
        for i in range(128):
            for j in range(128):
                LIB.gz_mul(words(1 << i), words(1 << j), out)
                self.assertEqual(integer(out), multiply(1 << i, 1 << j), (i, j))

    def test_random_and_dense_arithmetic(self):
        rng = random.Random(0xA991E)
        values = [0, 1, 2, (1 << 128) - 1, int('aa' * 16, 16), int('55' * 16, 16)]
        pairs = [(a, b) for a in values for b in values]
        pairs += [(rng.getrandbits(128), rng.getrandbits(128)) for _ in range(4096)]
        out = U()
        for a, b in pairs:
            LIB.gz_mul(words(a), words(b), out)
            self.assertEqual(integer(out), multiply(a, b), (hex(a), hex(b)))
            LIB.gz_square(words(a), out)
            self.assertEqual(integer(out), multiply(a, a))

    def test_pool_arithmetic_and_mislabeled_square(self):
        out = U()
        for i, v in enumerate(VECTORS['flat_mul_samples']):
            a, b = int(v['a'], 16), int(v['b'], 16)
            LIB.gz_mul(words(a), words(b), out)
            self.assertEqual(integer(out), int(v['clmul_gcm(a,b)'], 16))
            LIB.gz_square(words(b if i == 1 else a), out)
            self.assertEqual(integer(out), int(v['square(a)'], 16))
        self.assertNotEqual(multiply(2, 2), int(VECTORS['flat_mul_samples'][1]['square(a)'], 16))

    def test_basis(self):
        rng = random.Random(71)
        values = [1 << i for i in range(128)] + [rng.getrandbits(128) for _ in range(128)]
        for value in values:
            for reverse, table in enumerate(('TOWER_TO_FLAT', 'FLAT_TO_TOWER')):
                out = U()
                LIB.gz_basis(words(value), out, reverse)
                self.assertEqual(integer(out), convert(value, table))

    def test_permutations(self):
        rng = random.Random(82)
        cases = [([int(x, 16) for x in v['in_flat']], [int(x, 16) for x in v['out_flat']]) for v in VECTORS['permutation_vectors']]
        for _ in range(16):
            values = [rng.getrandbits(128) for _ in range(4)]
            cases.append((values, permute(values.copy())))
        for values, expected in cases:
            state = State(*(words(v) for v in values))
            LIB.gz_permute(state)
            self.assertEqual([integer(v) for v in state], expected)

    def test_pool_and_mainnet_hashes(self):
        for v in json.loads((ROOT / 'fixtures.json').read_text()):
            out = Digest()
            LIB.gz_hash(Header.from_buffer_copy(bytes.fromhex(v['header'])), out)
            self.assertEqual(bytes(out).hex(), v['digest'], v['name'])

    def test_cached_random_headers_and_namespace(self):
        rng = random.Random(93)
        # Each header retains an unrelated field 10: prepared state must ignore it.
        for _ in range(12):
            header = rng.randbytes(256)
            namespace = rng.randbytes(8)
            for counter in (0, (1 << 32) - 1, 1 << 32, (1 << 64) - 1):
                nonce = counter.to_bytes(8, 'little') + namespace
                out = Digest()
                LIB.gz_cached(Header.from_buffer_copy(header), U.from_buffer_copy(nonce), out)
                self.assertEqual(bytes(out), pow_hash(header, nonce))

    def test_strict_256bit_little_endian_targets(self):
        rng = random.Random(104)
        pairs = [(0, 0), (0, 1), (255, 256), (256, 255)]
        for bit in range(256):
            pairs += [(1 << bit, 1 << bit), ((1 << bit) - 1, 1 << bit), (1 << bit, (1 << bit) - 1)]
        pairs += [(rng.getrandbits(256), rng.getrandbits(256)) for _ in range(1024)]
        for digest, target in pairs:
            self.assertEqual(bool(LIB.gz_below(words(digest, Digest), words(target, Digest))), digest < target)

    def test_interleaved_four_states(self):
        rng = random.Random(115)
        for _ in range(4):
            header = rng.randbytes(256)
            nonces = FourNonces(*(words(rng.getrandbits(128)) for _ in range(4)))
            out = FourDigests()
            LIB.gz_cached4(Header.from_buffer_copy(header), nonces, out)
            for i in range(4):
                self.assertEqual(bytes(out[i]), pow_hash(header, bytes(nonces[i])))

    def test_dispatch_range_and_counter_carry(self):
        rng = random.Random(126)
        for counter in (0, (1 << 32) - 2, (1 << 64) - 1048576, (1 << 64) - 2, (1 << 64) - 1):
            namespace = rng.getrandbits(64)
            nonce = words(counter | (namespace << 64))
            for count in (0, 1, 2, 3, 1048576, 1048577, (1 << 32) - 1):
                expected = 0 < count <= 1048576 and counter + count <= 1 << 64
                self.assertEqual(bool(LIB.gz_range(nonce, count)), expected)
                if expected:
                    out = U()
                    LIB.gz_nonce(nonce, count - 1, out)
                    self.assertEqual(integer(out), counter + count - 1 | (namespace << 64))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library', required=True, type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    LIB = C.CDLL(str(args.library.resolve()))
    for name, params, result in [
        ('gz_mul', [C.POINTER(U)] * 3, None), ('gz_square', [C.POINTER(U)] * 2, None),
        ('gz_basis', [C.POINTER(U), C.POINTER(U), C.c_uint32], None),
        ('gz_permute', [C.POINTER(State)], None), ('gz_hash', [C.POINTER(Header), C.POINTER(Digest)], None),
        ('gz_cached', [C.POINTER(Header), C.POINTER(U), C.POINTER(Digest)], None),
        ('gz_below', [C.POINTER(Digest)] * 2, C.c_int),
        ('gz_cached4', [C.POINTER(Header), C.POINTER(FourNonces), C.POINTER(FourDigests)], None),
        ('gz_range', [C.POINTER(U), C.c_uint32], C.c_int), ('gz_nonce', [C.POINTER(U), C.c_uint32, C.POINTER(U)], None),
    ]:
        function = getattr(LIB, name)
        function.argtypes, function.restype = params, result
    started = time.monotonic()
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(NativeCoreTests))
    if args.report:
        record = {'platform': platform.platform(), 'machine': platform.machine(), 'python': platform.python_version(),
                  'librarySha256': hashlib.sha256(args.library.read_bytes()).hexdigest(),
                  'tests': result.testsRun, 'passed': result.wasSuccessful(), 'elapsedSeconds': time.monotonic() - started,
                  'failures': [str(t) + '\n' + msg for t, msg in result.failures + result.errors],
                  'scope': 'Native library differential tests only; no Metal execution or accepted pool shares',
                  'sourceSha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT / name for name in ('core.h', 'constants.h', 'test_bridge.cpp', 'cpu_batch.h', 'dispatch.h', 'test_core.py')]}}
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    sys.exit(0 if result.wasSuccessful() else 1)
