"""Apply measured, bit-exact Apple Metal variants to the pinned upstream trees.

Run after patch_pearl.py. Original Apache-2.0 source and license remain intact.
GZ_QTC_BASELINE_SHADER=1 / GZ_PRL_BASELINE=1 select comparison implementations.
"""
import argparse
import hashlib
from pathlib import Path


def replace_function(source, name, replacement):
    start = source.index('fn ' + name + '(')
    end = source.index('{', start) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[:start] + replacement + source[end:]


def qtc(root):
    engine = root / 'crates/engine-gpu/src/lib.rs'
    code = engine.read_text(encoding='utf-8')
    old = 'current_start = current_start.saturating_add(U512::from(this_batch_size));'
    marker = '// Gozero: finishing the maximum nonce must exhaust, not repeat it.'
    if marker not in code:
        assert code.count(old) == 1
        code = code.replace(old, marker + '''
            current_start = match current_start.checked_add(U512::from(this_batch_size)) {
                Some(next) => next,
                None => break,
            };''')
        engine.write_text(code, encoding='utf-8')
    folder = root / 'crates/engine-gpu/src/kernels'
    path = folder / 'mining_u64_apple.wgsl'
    source = path.read_text(encoding='utf-8')
    if '// Gozero split-round Metal variant' in source:
        return
    assert hashlib.sha256(source.encode()).hexdigest() == '2d4b5146a3946ccefc29c42a15988eb67b40f2e4b3fdade01972e2ed35f0dadc'
    (folder / 'mining_u64_apple_baseline.wgsl').write_text(source, encoding='utf-8')
    source = replace_function(source, 'permute64', '''fn permute64(state: ptr<function, array<u64, 12>>) {
    ext_layer64(state, 0u);
    for (var r=0u; r<4u; r++) { sbox_lanes(state,12u); ext_layer64(state,r+1u); }
    for (var r=0u; r<22u; r++) {
        (*state)[0]=gf64_sbox((*state)[0]); int_layer64(state,RC_INTERNAL[r+1u]);
    }
    add_rc(state,RC_TERMINAL[0]);
    for (var r=0u; r<4u; r++) { sbox_lanes(state,12u); ext_layer64(state,r+5u); }
}''')
    source = replace_function(source, 'sbox_lanes', '''fn sbox_lanes(state: ptr<function, array<u64, 12>>, lanes: u32) {
    (*state)[0]=gf64_sbox((*state)[0]);
    if (lanes==12u) {
''' + ''.join(f'        (*state)[{i}]=gf64_sbox((*state)[{i}]);\n' for i in range(1, 12)) + '    }\n}')
    path.write_text('// Gozero split-round Metal variant; round constants and arithmetic unchanged.\n' + source, encoding='utf-8')
    module = folder / 'mod.rs'
    code = module.read_text(encoding='utf-8').replace("pub const fn source(self)", "pub fn source(self)")
    old = 'Self::Apple => include_str!("mining_u64_apple.wgsl"),'
    assert old in code
    code = code.replace(old, '''Self::Apple => if std::env::var("GZ_QTC_BASELINE_SHADER").as_deref() == Ok("1") {
                include_str!("mining_u64_apple_baseline.wgsl")
            } else { include_str!("mining_u64_apple.wgsl") },''')
    module.write_text(code, encoding='utf-8')


def prl(root):
    path = root / 'libpmk/metal/k3sg.metal'
    source = path.read_text(encoding='utf-8')
    if 'GOZERO_M3_TUNING' in source:
        return
    assert hashlib.sha256(source.encode()).hexdigest() == '03375a286d1aee1c7758eb3cb59e2cbb9a58db8c2f9c6f706fdb8a4f59bb7e8e'
    source = source.replace('#define PADA 4\n#define PADB 4', '''#if GOZERO_M3_TUNING
#define PADA 0
#define PADB 0
#else
#define PADA 4
#define PADB 4
#endif''')
    old = '''    UNROLL
    for (uint j = 0; j < 16; ++j) jp[j] = (j == s) ? (rotate(jp[j], 13u) ^ x) : jp[j];'''
    assert old in source
    switch = '    switch (s) {\n' + ''.join(f'    case {j}: jp[{j}] = rotate(jp[{j}], 13u) ^ x; break;\n' for j in range(16)) + '    }'
    source = source.replace(old, '#if GOZERO_M3_TUNING\n' + switch + '\n#else\n' + old + '\n#endif')
    path.write_text(source, encoding='utf-8')
    path = root / 'libpmk/Sources/PMK/Host.swift'
    code = path.read_text(encoding='utf-8')
    marker = '        if selectedKernel == .sg {\n            options.preprocessorMacros'
    assert marker in code
    code = code.replace(marker, '''        // Only the measured base M3 profile opts in. Other devices retain upstream defaults.
        let gozeroM3 = selectedKernel == .sg && dev.name == "Apple M3"
            && ProcessInfo.processInfo.environment["GZ_PRL_BASELINE"] != "1"
        if selectedKernel == .sg {
            options.preprocessorMacros''')
    code = code.replace('"BK": NSNumber(value: 16)', '"BK": NSNumber(value: gozeroM3 ? 32 : 16)')
    code = code.replace('"PF": NSNumber(value: 2)', '"PF": NSNumber(value: gozeroM3 ? 0 : 2),\n                "GOZERO_M3_TUNING": NSNumber(value: gozeroM3 ? 1 : 0)')
    code = code.replace('let settings = selectedKernel.settings', '''let effectiveSettings = gozeroM3
            ? selectedKernel.settings.replacingOccurrences(of: "BK=16", with: "BK=32").replacingOccurrences(of: "PF=2", with: "PF=0")
            : selectedKernel.settings
        let settings = effectiveSettings + ";gozero-m3-v1=\\(gozeroM3)"''')
    # Cache/admission identity includes the source AND effective tuned parameters.
    path.write_text(code, encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('coin', choices=['qtc', 'prl'])
    parser.add_argument('root', type=Path)
    args = parser.parse_args()
    (qtc if args.coin == 'qtc' else prl)(args.root)
