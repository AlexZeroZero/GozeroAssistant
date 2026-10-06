# SPDX-License-Identifier: Apache-2.0
# Experimental generators; consensus attribution and pinned sources: ../NOTICE.
# These rejected/screened variants are NOT used by the distributed miner.
from pathlib import Path
from common import OUT as root
source=(root/'hybrid.metal').read_text()
start=source.index('static inline W cl16(');end=source.index('static inline Pair cl32(',start)
for bits in (4,8):
    size=1<<bits
    vals=[]
    for a in range(size):
        row=[]
        for b in range(size):
            value=0
            for i in range(bits):
                if b>>i&1:value^=a<<i
            row.append(str(value))
        vals.append('{'+','.join(row)+'}')
    code=f'GZ_CONSTANT {"uchar" if bits==4 else "ushort"} CLUT[{size}][{size}]='+'{'+','.join(vals)+'};\n'
    if bits==4:
        code+='static inline W cl8(W a,W b){W l=CLUT[a&15u][b&15u],h=CLUT[a>>4][b>>4],m=CLUT[(a^(a>>4))&15u][(b^(b>>4))&15u]^l^h;return l^(m<<4)^(h<<8);}\n'
    else:code+='static inline W cl8(W a,W b){return CLUT[a][b];}\n'
    code+='static inline W cl16(W a,W b){a&=65535u;b&=65535u;W l=cl8(a&255u,b&255u),h=cl8(a>>8,b>>8),m=cl8((a^(a>>8))&255u,(b^(b>>8))&255u)^l^h;return l^(m<<8)^(h<<16);}\n'
    (root/f'hybrid-cl{bits}.metal').write_text(source[:start]+code+source[end:])
