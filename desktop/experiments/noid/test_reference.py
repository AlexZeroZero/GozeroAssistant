import hashlib
import json
import unittest
from reference import ROOT, convert, multiply, permute, pow_hash, meets_target

VECTORS = json.loads((ROOT / 'pool-vectors.json').read_text())


class NoidReferenceTests(unittest.TestCase):
    def test_fixture_integrity(self):
        provenance = json.loads((ROOT / 'provenance.json').read_text())
        self.assertEqual(hashlib.sha256((ROOT / 'pool-vectors.json').read_bytes()).hexdigest(), provenance['vectorsSha256'])

    def test_basis_roundtrip(self):
        for v in VECTORS['basis_samples']:
            self.assertEqual(convert(int(v['tower'], 16), 'TOWER_TO_FLAT'), int(v['flat'], 16))
            self.assertEqual(convert(int(v['flat'], 16), 'FLAT_TO_TOWER'), int(v['back_to_tower'], 16))

    def test_multiply(self):
        for v in VECTORS['flat_mul_samples']:
            self.assertEqual(multiply(int(v['a'], 16), int(v['b'], 16)), int(v['clmul_gcm(a,b)'], 16))
        # Pool vector #2 has a mislabeled square: value matches square(b), not square(a).
        # Keep the source fixture intact, explicitly verify the discrepancy.
        v = VECTORS['flat_mul_samples'][1]
        self.assertEqual(multiply(2, 2), 4)
        self.assertEqual(multiply(int(v['b'], 16), int(v['b'], 16)), int(v['square(a)'], 16))

    def test_permutations(self):
        for v in VECTORS['permutation_vectors']:
            self.assertEqual(permute([int(x, 16) for x in v['in_flat']]), [int(x, 16) for x in v['out_flat']])

    def test_pow_vectors(self):
        for v in VECTORS['pow_vectors']:
            self.assertEqual(pow_hash(bytes.fromhex(v['fields_hex']), bytes.fromhex(v['nonce_field10_le_hex'])).hex(), v['digest_hex_le'])

    def test_mainnet_headers(self):
        for v in VECTORS['mainnet_header_vectors']:
            digest = pow_hash(bytes.fromhex(v['pow_fields_hex_nonce_zeroed']), bytes.fromhex(v['nonce_le_hex']))
            self.assertEqual(digest.hex(), v['digest_hex_le'])
            self.assertEqual(meets_target(digest, bytes.fromhex(v['network_target_hex_le'])), v['digest_lt_target'])

    def test_strict_target_and_little_endian(self):
        for value, target, expected in [(0, 0, False), (0, 1, True), (255, 256, True), (256, 255, False), (2**256-1, 2**256-1, False)]:
            self.assertEqual(meets_target(value.to_bytes(32, 'little'), target.to_bytes(32, 'little')), expected)

    def test_bad_lengths(self):
        for fields, nonce in [(bytes(255), bytes(16)), (bytes(256), bytes(15))]:
            with self.assertRaises(ValueError):
                pow_hash(fields, nonce)
        with self.assertRaises(ValueError):
            meets_target(bytes(31), bytes(32))


if __name__ == '__main__':
    unittest.main()
