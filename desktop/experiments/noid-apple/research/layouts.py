# SPDX-License-Identifier: Apache-2.0
# Experimental generators; consensus attribution and pinned sources: ../NOTICE.
# These rejected/screened variants are NOT used by the distributed miner.
from pathlib import Path
import re
from common import OUT as root
s=(root/'bitslice-noinline.metal').read_text()
start=s.index('// Experimental bit-sliced');end=s.index('kernel void noid_hash(',start)
h=s[start:end]
extract=h[h.index('static inline U bs_extract('):]
h=re.sub(r'\bW\b','ushort',h)
h=h.replace('ushort words[4]','W words[4]')
h=h.replace('ushort patterns[5]={0xaaaaaaaau,0xccccccccu,0xf0f0f0f0u,0xff00ff00u,0xffff0000u};','ushort patterns[5]={0xaaaa,0xcccc,0xf0f0,0xff00,0};')
h=h[:h.index('static inline U bs_extract(')]+extract
k=s[end:].replace('(job.count+31)/32','(job.count+15)/16').replace('index*32','index*16').replace('lane<32','lane<16').replace('min(32u,','min(16u,')
(root/'bitslice16.metal').write_text(s[:start]+h+k)

# Keep three passive states in explicitly addressed threadgroup storage.
# Default threadgroup is 32, 3*128*32*2 = 24 KiB. No lane reads another lane.
shared=h[:h.index('static inline void bs_mix(')]
mix=h[h.index('static inline void bs_mix('):h.index('GZ_CONSTANT U BS_RC')]
mix=mix.replace('GZ_THREAD BS& b,GZ_THREAD BS& c,GZ_THREAD BS& d,bool full',
    'threadgroup ushort* b,threadgroup ushort* c,threadgroup ushort* d,W tid,bool full')
mix=re.sub(r'([bcd])\.b\[(\d+)\]',lambda m:f'{m[1]}[{m[2]}*32+tid]',mix)
shared+=mix
shared+=h[h.index('GZ_CONSTANT U BS_RC'):h.index('static inline void bs_round(')]
shared+='''static inline void bs_gxor(threadgroup ushort* p,U v,W tid){W words[4]={v.x,v.y,v.z,v.w};for(W i=0;i<128;++i)p[i*32+tid]^=ushort(0u-((words[i/32]>>(i%32))&1u));}
static inline void bs_gload(threadgroup ushort* p,U v,W tid){W words[4]={v.x,v.y,v.z,v.w};for(W i=0;i<128;++i)p[i*32+tid]=ushort(0u-((words[i/32]>>(i%32))&1u));}
static inline void bs_gsbox(threadgroup ushort* p,U rc,W tid){BS temp;for(W i=0;i<128;++i)temp.b[i]=p[i*32+tid];bs_xor(temp,rc);bs_sbox(temp);for(W i=0;i<128;++i)p[i*32+tid]=temp.b[i];}
__attribute__((noinline)) static void bs_permute(GZ_THREAD BS& a,threadgroup ushort* b,threadgroup ushort* c,threadgroup ushort* d,W tid){
    bs_mix(a,b,c,d,tid,true);
    for(W r=0;r<66;++r){bool full=r<4||r>=62;bs_xor(a,BS_RC[0][r]);bs_sbox(a);
        if(full){bs_gsbox(b,BS_RC[1][r],tid);bs_gsbox(c,BS_RC[2][r],tid);bs_gsbox(d,BS_RC[3][r],tid);}bs_mix(a,b,c,d,tid,full);}
}
static inline void bs_hash(GZ_THREAD const Prepared& p,U nonce,GZ_THREAD BS& a,GZ_THREAD BS& outB,threadgroup ushort* shared,W tid){
    threadgroup ushort* b=shared;threadgroup ushort* c=shared+128*32;threadgroup ushort* d=shared+256*32;
    bs_load(a,basis(p.prefix.v[0],F2T));bs_gload(b,basis(p.prefix.v[1],F2T),tid);bs_gload(c,basis(p.prefix.v[2],F2T),tid);bs_gload(d,basis(p.prefix.v[3],F2T),tid);
    ushort carry=0;W words[4]={nonce.x,nonce.y,nonce.z,nonce.w};ushort patterns[4]={0xaaaa,0xcccc,0xf0f0,0xff00};
    for(W i=0;i<64;++i){ushort av=ushort(0u-((words[i/32]>>(i%32))&1u)),bv=i<4?patterns[i]:0;a.b[i]^=av^bv^carry;carry=(av&bv)^((av^bv)&carry);}
    for(W i=64;i<128;++i)a.b[i]^=ushort(0u-((words[i/32]>>(i%32))&1u));
    bs_gxor(b,basis(p.suffix[0],F2T),tid);bs_permute(a,b,c,d,tid);
    bs_xor(a,basis(p.suffix[1],F2T));bs_gxor(b,basis(p.suffix[2],F2T),tid);bs_permute(a,b,c,d,tid);
    bs_xor(a,basis(p.suffix[3],F2T));bs_gxor(b,basis(p.suffix[4],F2T),tid);bs_permute(a,b,c,d,tid);
    for(W i=0;i<128;++i)outB.b[i]=b[i*32+tid];
}
'''+extract
k=k.replace('uint index [[thread_position_in_grid]]) {','uint index [[thread_position_in_grid]],uint tid [[thread_index_in_threadgroup]]) {\n    threadgroup ushort shared[3*128*32];if(tid>=32)return;')
k=k.replace('index*16),a,b);','index*16),a,b,shared,tid);').replace('nonce,a,b);','nonce,a,b,shared,tid);')
(root/'bitslice16-shared.metal').write_text(s[:start]+shared+k)
print('Generated 16-lane private and 24-KiB shared-state variants')
