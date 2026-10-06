"""Exact half operands with FP32 accumulation on the measured base Apple M3.

Apply after patch_kernels.py prl; rebuild libpmk AND the G3 helper. Real G3
admission must be regenerated. GZ_PRL_FP32=1 selects the 0.1.8 representation.
"""
import argparse
import hashlib
from pathlib import Path


def once(source, old, new):
    assert source.count(old) == 1, f'Unexpected pinned source: {old}'
    return source.replace(old, new)


def patch(root):
    shader = root / 'libpmk/metal/k3sg.metal'
    host = root / 'libpmk/Sources/PMK/Host.swift'
    source = shader.read_text(encoding='utf-8')
    code = host.read_text(encoding='utf-8')
    if 'GOZERO_HALF_INPUT' in source:
        assert 'gozero-half-v1' in code, 'Incomplete half-input patch'
        return
    assert hashlib.sha256(source.encode()).hexdigest() == '85ba49b88afe424b49f747efee80c3d66b08484c3954c2b58506319f8c80c679', 'Apply pinned 0.1.8 PRL patch first'
    source = once(source, 'kernel void k3sg(', '''// Integers [-127,127] are exact in half. Products and rank sums stay FP32.
#if GOZERO_HALF_INPUT && VARIANT != 1
typedef half stage_t;
typedef half4 stage4_t;
typedef simdgroup_half8x8 operand_matrix_t;
#else
typedef float stage_t;
typedef float4 stage4_t;
typedef simdgroup_float8x8 operand_matrix_t;
#endif
kernel void k3sg(''')
    # Only staging and input fragments change. C, rank conversion, the integer
    # running accumulator, transcript and BLAKE3 remain untouched. A rank sums
    # at most 128 * 127**2 = 2,064,512, below FP32's exact integer limit.
    for old, new in [
        ('threadgroup float4', 'threadgroup stage4_t'),
        ('threadgroup float', 'threadgroup stage_t'),
        ('threadgroup const float*', 'threadgroup const stage_t*'),
        ('= float4(', '= stage4_t('),
        ('simdgroup_float8x8 Af[TM], Bf[TN];', 'operand_matrix_t Af[TM], Bf[TN];'),
    ]:
        assert old in source
        source = source.replace(old, new)
    assert 'simdgroup_float8x8 C[TM][TN];' in source
    code = once(code, '        if selectedKernel == .sg {\n            options.preprocessorMacros',
                '        let gozeroHalf = gozeroM3 && ProcessInfo.processInfo.environment["GZ_PRL_FP32"] != "1"\n        if selectedKernel == .sg {\n            options.preprocessorMacros')
    code = once(code, '"GOZERO_M3_TUNING": NSNumber(value: gozeroM3 ? 1 : 0)',
                '"GOZERO_M3_TUNING": NSNumber(value: gozeroM3 ? 1 : 0),\n                "GOZERO_HALF_INPUT": NSNumber(value: gozeroHalf ? 1 : 0)')
    code = once(code, ';gozero-m3-v1=\\(gozeroM3)',
                ';gozero-m3-v1=\\(gozeroM3);gozero-half-v1=\\(gozeroHalf)')
    shader.write_text(source, encoding='utf-8')
    host.write_text(code, encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    patch(parser.parse_args().root)
