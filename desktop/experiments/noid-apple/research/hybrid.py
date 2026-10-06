# SPDX-License-Identifier: Apache-2.0
# Experimental generators; consensus attribution and pinned sources: ../NOTICE.
# These rejected/screened variants are NOT used by the distributed miner.
from common import *
source=metal_source()
tables=[]
for name in ('TOWER_TO_FLAT','FLAT_TO_TOWER'):
    data=[[convert(n<<(4*pos),name) for n in range(16)] for pos in range(32)]
    tables.append('GZ_CONSTANT U '+('HT2F' if name=='TOWER_TO_FLAT' else 'HF2T')+'[32][16]='+array(data)+';')
helper='\n'.join(tables)+'''
static inline U hbasis(U a,GZ_TABLE U table[32][16]) {
    U r={0,0,0,0};W words[4]={a.x,a.y,a.z,a.w};
    for(W j=0;j<4;++j)for(W i=0;i<8;++i)r=gx(r,table[j*8+i][(words[j]>>(4*i))&15u]);return r;
}
'''
for k,coef in enumerate((0x21,0x2001,0x201,0x801)):
    masks={}
    for i in range(16):
        value=tm(1<<i,coef,16)
        for j in range(16):
            if value>>j&1:masks[j-i]=masks.get(j-i,0)|(1<<i)|(1<<(i+16))
    terms=[]
    for shift,mask in sorted(masks.items()):
        v=f'(a&0x{mask:08x}u)'
        if shift:v=f'({v}{"<<" if shift>0 else ">>"}{abs(shift)})'
        terms.append(v)
    helper+=f'static inline W hl{k}(W a){{return '+ '^'.join(terms)+';}\n'
    helper+=f'static inline U hu{k}(U a){{return {{hl{k}(a.x),hl{k}(a.y),hl{k}(a.z),hl{k}(a.w)}};}}\n'
code='''static inline void permute(GZ_THREAD State& s) {
    mix(s,true);
    for(W r=0;r<4;++r){for(W i=0;i<4;++i)s.v[i]=sbox(gx(s.v[i],RC[i][r]));mix(s,true);}
    for(W i=0;i<4;++i)s.v[i]=hbasis(s.v[i],HF2T);
    for(W r=4;r<62;++r){
        s.v[0]=hbasis(sbox(gx(hbasis(s.v[0],HT2F),RC[0][r])),HF2T);
        U sum=gx(gx(s.v[0],s.v[1]),gx(s.v[2],s.v[3]));
        s.v[0]=gx(sum,hu0(s.v[0]));s.v[1]=gx(sum,hu1(s.v[1]));s.v[2]=gx(sum,hu2(s.v[2]));s.v[3]=gx(sum,hu3(s.v[3]));
    }
    for(W i=0;i<4;++i)s.v[i]=hbasis(s.v[i],HT2F);
    for(W r=62;r<66;++r){for(W i=0;i<4;++i)s.v[i]=sbox(gx(s.v[i],RC[i][r]));mix(s,true);}
}
'''
s=source.index('static inline void permute(');e=source.index('static inline Prepared prepare(',s)
(OUT/'hybrid.metal').write_text(source[:s]+helper+code+source[e:])
print('Generated hybrid partial-round kernel')
