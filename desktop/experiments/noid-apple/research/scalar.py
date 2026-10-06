# SPDX-License-Identifier: Apache-2.0
# Experimental generators; consensus attribution and pinned sources: ../NOTICE.
# These rejected/screened variants are NOT used by the distributed miner.
from common import *
from hybrid import source,helper
def carray(v,fmt):return '{'+','.join(carray(x,fmt) if isinstance(x,list) else fmt(x) for x in v)+'}'
tables=''
logs=[0]*256;exp=[];a=1
for i in range(255):logs[a]=i;exp.append(a);a=tm(a,3,8)
assert len(set(exp))==255
tables+='GZ_CONSTANT uchar TLOG[256]='+carray(logs,str)+';\n'
tables+='GZ_CONSTANT uchar TEXP[512]='+carray([exp[i%255] for i in range(512)],str)+';\n'
tables+='GZ_CONSTANT uchar TSQ[256]='+carray([tm(i,i,8) for i in range(256)],str)+';\n'
tables+='GZ_CONSTANT uchar TT8[256]='+carray([tm(i,0x20,8) for i in range(256)],str)+';\n'
for n in (16,32,64):
    data=[[tm(k<<(4*pos),0x20<<(n-8),n) for k in range(16)] for pos in range(n//4)]
    fmt=(lambda x:'{0x%08xu,0x%08xu}'%(x&0xffffffff,x>>32)) if n==64 else lambda x:hex(x)+'u'
    tables+=f'GZ_CONSTANT {"uint2" if n==64 else "W"} TT{n}[{n//4}][16]='+carray(data,fmt)+';\n'
func='''
static inline W tg8(W a,W b){return (a && b)?TEXP[W(TLOG[a])+W(TLOG[b])]:0u;}
static inline W tt16(W a){W r=0;for(W i=0;i<4;++i)r^=TT16[i][(a>>(4*i))&15u];return r;}
static inline W tt32(W a){W r=0;for(W i=0;i<8;++i)r^=TT32[i][(a>>(4*i))&15u];return r;}
static inline uint2 tt64(uint2 a){uint2 r=0;for(W i=0;i<8;++i){r^=TT64[i][(a.x>>(4*i))&15u];r^=TT64[i+8][(a.y>>(4*i))&15u];}return r;}
static inline W tg16(W a,W b){W p=tg8(a&255u,b&255u),q=tg8(a>>8,b>>8),r=tg8((a^(a>>8))&255u,(b^(b>>8))&255u);return (p^TT8[q])^((p^r)<<8);}
static inline W tg32(W a,W b){W p=tg16(a&65535u,b&65535u),q=tg16(a>>16,b>>16),r=tg16((a^(a>>16))&65535u,(b^(b>>16))&65535u);return (p^tt16(q))^((p^r)<<16);}
static inline uint2 tg64(uint2 a,uint2 b){W p=tg32(a.x,b.x),q=tg32(a.y,b.y),r=tg32(a.x^a.y,b.x^b.y);return uint2(p^tt32(q),p^r);}
static inline U tg128(U a,U b){uint2 p=tg64(uint2(a.x,a.y),uint2(b.x,b.y)),q=tg64(uint2(a.z,a.w),uint2(b.z,b.w)),r=tg64(uint2(a.x^a.z,a.y^a.w),uint2(b.x^b.z,b.y^b.w));q=p^tt64(q);r^=p;return {q.x,q.y,r.x,r.y};}
static inline W ts16(W a){W p=TSQ[a&255u],q=TSQ[a>>8];return (p^TT8[q])^(q<<8);}
static inline W ts32(W a){W p=ts16(a&65535u),q=ts16(a>>16);return (p^tt16(q))^(q<<16);}
static inline uint2 ts64(uint2 a){W p=ts32(a.x),q=ts32(a.y);return uint2(p^tt32(q),q);}
static inline U ts128(U a){uint2 p=ts64(uint2(a.x,a.y)),q=ts64(uint2(a.z,a.w));p^=tt64(q);return {p.x,p.y,q.x,q.y};}
static inline U tsbox(U a){U x2=ts128(a);return tg128(tg128(a,x2),ts128(x2));}
'''
for name,coef in [('two',2),('four',4)]:
    masks={}
    for i in range(8):
        for j in range(8):
            if tm(1<<i,coef,8)>>j&1:masks[j-i]=masks.get(j-i,0)|sum(1<<(i+8*k) for k in range(4))
    terms=[]
    for shift,mask in sorted(masks.items()):
        v=f'(a&0x{mask:08x}u)';terms.append(f'({v}{"<<" if shift>0 else ">>"}{abs(shift)})' if shift else v)
    func+=f'static inline W tl{name}(W a){{return '+ '^'.join(terms)+';}\n'
    func+=f'static inline U tu{name}(U a){{return {{tl{name}(a.x),tl{name}(a.y),tl{name}(a.z),tl{name}(a.w)}};}}\n'
old=source[source.index('static inline void mix('):source.index('static inline U sbox(')]
old=old.replace('void mix(', 'void tmix(')
old=old.replace('for (W i = 0; i < 4; ++i) s.v[i] = gx(sum,linear(s.v[i],i + 2));',''.join(f's.v[{i}]=gx(sum,hu{i}(s.v[{i}]));' for i in range(4)))
import re
old=re.sub(r'linear\((\w),([01])\)',lambda m:'tu'+('two' if m[2]=='0' else 'four')+'('+m[1]+')',old)
rc='GZ_CONSTANT U TRC[4][66]='+array([[convert(int(v,16),'FLAT_TO_TOWER') for v in row] for row in TABLES['round_constants_flat']])+';\n'
code='''static inline void permute(GZ_THREAD State& s){
    for(W i=0;i<4;++i)s.v[i]=hbasis(s.v[i],HF2T);
    tmix(s,true);
    for(W r=0;r<4;++r){for(W i=0;i<4;++i)s.v[i]=tsbox(gx(s.v[i],TRC[i][r]));tmix(s,true);}
    for(W r=4;r<62;++r){s.v[0]=tsbox(gx(s.v[0],TRC[0][r]));tmix(s,false);}
    for(W r=62;r<66;++r){for(W i=0;i<4;++i)s.v[i]=tsbox(gx(s.v[i],TRC[i][r]));tmix(s,true);}
    for(W i=0;i<4;++i)s.v[i]=hbasis(s.v[i],HT2F);
}
'''
s=source.index('static inline void permute(');e=source.index('static inline Prepared prepare(',s)
new=source[:s]+helper+tables+func+old+rc+code+source[e:]
(OUT/'tower-log.metal').write_text(new)
fullmul='GZ_CONSTANT uchar TGM[256][256]='+carray([[tm(a,b,8) for b in range(256)] for a in range(256)],str)+';\n'
new=new.replace('static inline W tg8(W a,W b){return (a && b)?TEXP[W(TLOG[a])+W(TLOG[b])]:0u;}',fullmul+'static inline W tg8(W a,W b){return TGM[a][b];}')
(OUT/'tower-table.metal').write_text(new)
print('Generated scalar AES-tower log/table kernels')
