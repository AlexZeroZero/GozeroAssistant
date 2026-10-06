"""Apply narrow Apple-family admission fixes to the pinned Apache-2.0 source."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
test = root / 'libpmk/tests/PMKTests/KernelTests.swift'
text = test.read_text(encoding='utf-8')
needle = 'for kernel in [K3Kernel.sg, K3Kernel.na] {'
replacement = needle + '''
                // Gozero: NA is an Apple10+ path; M1-M4 must certify SG only.
                // Keep all correctness checks for every supported kernel.
                if kernel == .na, let device = MTLCreateSystemDefaultDevice(),
                   !device.supportsFamily(.apple10) {
                    print("G3: SKIP na: requires Apple10+ GPU family")
                    continue
                }'''
if 'Gozero: NA is an Apple10+' not in text:
    assert text.count(needle) == 1
    test.write_text(text.replace(needle, replacement), encoding='utf-8')

host = root / 'libpmk/Sources/PMK/Host.swift'
text = host.read_text(encoding='utf-8')
needle = 'let selectedKernel = try kernelOverride ?? resolveK3Kernel(device: dev)'
replacement = needle + '''
        // Gozero: explicit overrides obey the same capability rule as auto selection.
        if selectedKernel == .na && !dev.supportsFamily(.apple10) {
            throw PMKError("DO NOT MINE: K3-NA requires Apple10+ GPU family")
        }'''
if 'Gozero: explicit overrides' not in text:
    assert text.count(needle) == 1
    host.write_text(text.replace(needle, replacement), encoding='utf-8')
print('Patched supported-kernel admission; all SG oracle comparisons retained.')

pool = root / 'miner/pmk_miner/pool.py'
text = pool.read_text(encoding='utf-8')
needle = '"plain_proof": _proof_text(proof),'
replacement = needle + '''
                        # Kryptex's submit dialect carries the authorized worker name.
                        **({"worker": f"{self.wallet}.{self.worker}"}
                           if self.endpoint.host.endswith(".kryptex.network") else {}),'''
if "Kryptex's submit dialect" not in text:
    assert text.count(needle) == 1
    pool.write_text(text.replace(needle, replacement), encoding='utf-8')
