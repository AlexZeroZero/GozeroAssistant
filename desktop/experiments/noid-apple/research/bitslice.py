# SPDX-License-Identifier: Apache-2.0
# Experimental generators; consensus attribution and pinned sources: ../NOTICE.
# These rejected/screened variants are NOT used by the distributed miner.
from common import *
class Graph:
    def __init__(self):self.lines=[];self.cache={}
    def op(self,op,a,b):
        if op=='^':
            if a==b:return '0u'
            if a=='0u':return b
            if b=='0u':return a
        if op=='&':
            if a==b:return a
            if '0u' in (a,b):return '0u'
        a,b=sorted((a,b));key=op,a,b
        if key not in self.cache:
            name='t'+str(len(self.lines));self.lines.append(f'W {name}={a}{op}{b};');self.cache[key]=name
        return self.cache[key]
    def xor(self,*xs):
        r='0u'
        for x in xs:r=self.op('^',r,x)
        return r
    def poly(self,a,b):
        n=len(a)
        if n==1:return [self.op('&',a[0],b[0]),'0u']
        h=n//2;l=self.poly(a[:h],b[:h]);r=self.poly(a[h:],b[h:])
        m=self.poly([self.xor(a[i],a[h+i]) for i in range(h)],[self.xor(b[i],b[h+i]) for i in range(h)])
        out=['0u']*(2*n)
        for i in range(n):
            out[i]=self.xor(out[i],l[i]);out[n+i]=self.xor(out[n+i],r[i]);out[h+i]=self.xor(out[h+i],m[i],l[i],r[i])
        return out
    def matrix(self,a,images):
        return [self.xor(*(a[i] for i,v in enumerate(images) if (v>>j)&1)) for j in range(len(a))]

header=['// Experimental bit-sliced AES-tower arithmetic; Apache-2.0; see NOTICE.', 'struct BS {W b[128];};']
g=Graph();p=g.poly([f'a[{i}]' for i in range(8)],[f'b[{i}]' for i in range(8)])
for i in range(14,7,-1):
    for j in (0,1,3,4):p[i-8+j]=g.xor(p[i-8+j],p[i])
header+=['static inline void bm8(GZ_THREAD const W* a,GZ_THREAD const W* b,GZ_THREAD W* o){']+g.lines+[f'o[{i}]={p[i]};' for i in range(8)]+['}']
for n in (16,32,64,128):
    h=n//2;g=Graph();tau=g.matrix([f'q[{i}]' for i in range(h)],[tm(1<<i,0x20<<(h-8),h) for i in range(h)])
    header+=[f'static inline void bm{n}(GZ_THREAD const W* a,GZ_THREAD const W* b,GZ_THREAD W* o){{',f'W p[{h}],q[{h}],r[{h}],x[{h}],y[{h}];',
             f'bm{h}(a,b,p);bm{h}(a+{h},b+{h},q);']
    for i in range(h):header+=[f'x[{i}]=a[{i}]^a[{h+i}];y[{i}]=b[{i}]^b[{h+i}];']
    header+=[f'bm{h}(x,y,r);']+g.lines
    for i in range(h):header+=[f'o[{i}]=p[{i}]^{tau[i]};o[{h+i}]=p[{i}]^r[{i}];']
    header+=['}']
g=Graph();sq=g.matrix([f'a.b[{i}]' for i in range(128)],[tm(1<<i,1<<i) for i in range(128)])
header+=['static inline void bs_square(GZ_THREAD const BS& a,GZ_THREAD BS& o){']+g.lines+[f'o.b[{i}]={v};' for i,v in enumerate(sq)]+['}']
header+=['static inline void bs_sbox(GZ_THREAD BS& a){BS x2,x3,x4;bs_square(a,x2);bm128(a.b,x2.b,x3.b);bs_square(x2,x4);bm128(x3.b,x4.b,a.b);}']

full=[[convert(int(x,16),'FLAT_TO_TOWER') for x in row] for row in TABLES['mds_full_flat']]
diag=[convert(int(TABLES['mds_partial_flat'][i][i],16)^1,'FLAT_TO_TOWER') for i in range(4)]
header+=['static inline void bs_mix(GZ_THREAD BS& a,GZ_THREAD BS& b,GZ_THREAD BS& c,GZ_THREAD BS& d,bool full){','if(full){']
for base in range(0,128,8):
    g=Graph();rows=[]
    for row in range(4):
        pieces=[g.matrix([f'{name}.b[{base+i}]' for i in range(8)],[tm(1<<i,full[row][col],8) for i in range(8)]) for col,name in enumerate('abcd')]
        rows.append([g.xor(*(v[i] for v in pieces)) for i in range(8)])
    header+=['{']+g.lines
    for row,name in enumerate('abcd'):header += [f'{name}.b[{base+i}]={v};' for i,v in enumerate(rows[row])]
    header+=['}']
header+=['}else{']
for base in range(0,128,16):
    g=Graph();sums=[g.xor(*(f'{name}.b[{base+i}]' for name in 'abcd')) for i in range(16)]
    rows=[]
    for col,name in enumerate('abcd'):
        v=g.matrix([f'{name}.b[{base+i}]' for i in range(16)],[tm(1<<i,diag[col],16) for i in range(16)])
        rows.append([g.xor(v[i],sums[i]) for i in range(16)])
    header+=['{']+g.lines
    for row,name in enumerate('abcd'):header += [f'{name}.b[{base+i}]={v};' for i,v in enumerate(rows[row])]
    header+=['}']
header+=['}}']
header+=['GZ_CONSTANT U BS_RC[4][66]='+array([[convert(int(v,16),'FLAT_TO_TOWER') for v in row] for row in TABLES['round_constants_flat']])+';']
header+=['static inline void bs_xor(GZ_THREAD BS& s,U v){']+[f's.b[{i}]^=0u-((v.{"xyzw"[i//32]}>>{i%32})&1u);' for i in range(128)]+['}']
header+=['static inline void bs_load(GZ_THREAD BS& s,U v){']+[f's.b[{i}]=0u-((v.{"xyzw"[i//32]}>>{i%32})&1u);' for i in range(128)]+['}']
header+=['static inline void bs_round(GZ_THREAD BS& a,GZ_THREAD BS& b,GZ_THREAD BS& c,GZ_THREAD BS& d,W r,bool full){',
         'bs_xor(a,BS_RC[0][r]);bs_sbox(a);if(full){bs_xor(b,BS_RC[1][r]);bs_sbox(b);bs_xor(c,BS_RC[2][r]);bs_sbox(c);bs_xor(d,BS_RC[3][r]);bs_sbox(d);}bs_mix(a,b,c,d,full);}',
         'static inline void bs_permute(GZ_THREAD BS& a,GZ_THREAD BS& b,GZ_THREAD BS& c,GZ_THREAD BS& d){bs_mix(a,b,c,d,true);',
         'for(W r=0;r<4;++r)bs_round(a,b,c,d,r,true);for(W r=4;r<62;++r)bs_round(a,b,c,d,r,false);for(W r=62;r<66;++r)bs_round(a,b,c,d,r,true);}',
         'static inline void bs_hash(GZ_THREAD const Prepared& p,U nonce,GZ_THREAD BS& a,GZ_THREAD BS& b){BS c,d,n;']
for i,name in enumerate('abcd'):header += [f'bs_load({name},basis(p.prefix.v[{i}],F2T));']
header+=['W carry=0; W words[4]={nonce.x,nonce.y,nonce.z,nonce.w};', 'W patterns[5]={0xaaaaaaaau,0xccccccccu,0xf0f0f0f0u,0xff00ff00u,0xffff0000u};',
         'for(W i=0;i<64;++i){W av=0u-((words[i/32]>>(i%32))&1u),bv=i<5?patterns[i]:0;n.b[i]=av^bv^carry;carry=(av&bv)^((av^bv)&carry);}',
         'for(W i=64;i<128;++i)n.b[i]=0u-((words[i/32]>>(i%32))&1u);',
         'for(W i=0;i<128;++i)a.b[i]^=n.b[i];bs_xor(b,basis(p.suffix[0],F2T));bs_permute(a,b,c,d);',
         'bs_xor(a,basis(p.suffix[1],F2T));bs_xor(b,basis(p.suffix[2],F2T));bs_permute(a,b,c,d);',
         'bs_xor(a,basis(p.suffix[3],F2T));bs_xor(b,basis(p.suffix[4],F2T));bs_permute(a,b,c,d);}',
         'static inline U bs_extract(GZ_THREAD const BS& s,W lane){W words[4]={};for(W i=0;i<128;++i)words[i/32]|=((s.b[i]>>lane)&1u)<<(i%32);return {words[0],words[1],words[2],words[3]};}']
source=metal_source();source=source[:source.index('// Hash batches are bounded')]
bs='\n'.join(header)+'\n';(OUT/'bitslice.h').write_text(bs)
kernels='''
kernel void noid_hash(constant Request& job [[buffer(0)]],device Digest* output [[buffer(1)]],uint index [[thread_position_in_grid]]) {
    if(index>=(job.count+31)/32 || !validRange(job.nonce,job.count))return;
    Prepared p=job.prepared;BS a,b;bs_hash(p,nonceAt(job.nonce,index*32),a,b);
    for(W lane=0;lane<32 && index*32+lane<job.count;++lane)output[index*32+lane]={bs_extract(a,lane),bs_extract(b,lane)};
}
kernel void noid_search(constant Request& job [[buffer(0)]],constant Digest& target [[buffer(1)]],device U* candidates [[buffer(2)]],device atomic_uint& matches [[buffer(3)]],constant uint& capacity [[buffer(4)]],uint index [[thread_position_in_grid]]) {
    if(index>=(job.count+31)/32 || !validRange(job.nonce,job.count))return;
    Prepared p=job.prepared;BS a,b;U nonce=nonceAt(job.nonce,index*32);bs_hash(p,nonce,a,b);
    W less=0,equal=~0u;W words[8]={target.a.x,target.a.y,target.a.z,target.a.w,target.b.x,target.b.y,target.b.z,target.b.w};
    for(int i=255;i>=0;--i){W v=i>=128?b.b[i-128]:a.b[i],t=0u-((words[i/32]>>(i%32))&1u);less|=equal&~v&t;equal&=~(v^t);}
    W valid=min(32u,job.count-index*32);if(valid<32)less&=(1u<<valid)-1u;
    while(less){W lane=ctz(less);less&=less-1;W slot=atomic_fetch_add_explicit(&matches,1u,memory_order_relaxed);if(slot<capacity)candidates[slot]=nonceAt(nonce,lane);}
}
'''
(OUT/'bitslice.metal').write_text(source+bs+kernels)
print('Generated',len(bs),'bytes; tower diagonal',list(map(hex,diag)))
# Verify the tower recurrence against the independently transformed flat field.
import random
rng=random.Random(8197)
for _ in range(1000):
    a,b=rng.getrandbits(128),rng.getrandbits(128)
    assert tm(a,b)==convert(multiply(convert(a,'TOWER_TO_FLAT'),convert(b,'TOWER_TO_FLAT')),'FLAT_TO_TOWER')
print('1000 independent field-isomorphism checks passed')

shader=(OUT/'bitslice.metal').read_text()
(OUT/'bitslice-noinline.metal').write_text(shader.replace('static inline void bs_sbox','__attribute__((noinline)) static void bs_sbox'))
permutation=shader.replace('static inline void bs_permute','__attribute__((noinline)) static void bs_permute')
permutation=permutation.replace('for(W r=0;r<4;++r)bs_round(a,b,c,d,r,true);for(W r=4;r<62;++r)bs_round(a,b,c,d,r,false);for(W r=62;r<66;++r)bs_round(a,b,c,d,r,true);','for(W r=0;r<66;++r)bs_round(a,b,c,d,r,r<4||r>=62);')
(OUT/'bitslice-permutation.metal').write_text(permutation)
