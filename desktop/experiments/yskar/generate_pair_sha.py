"""Experimental two independent nonces per thread; not a production kernel."""
from pathlib import Path
import re

def generate_pair():
    source=(Path(__file__).parent/'upstream/node-core/gpu/yskar_sha256.h').read_text(encoding='utf-8')
    constants=re.findall(r'0x[0-9a-f]+u',source.split('YSKAR_K[64] = {',1)[1].split('};',1)[0])
    lines=['// MIT derivative: Copyright (c) 2026 The YSKAR developers.',
           '__device__ __forceinline__ void pair_block(uint32_t s[2][8],const uint32_t in[2][16]) {']
    for lane in range(2):
        lines+=['uint32_t '+','.join(f'w{lane}_{i}=in[{lane}][{i}]' for i in range(16))+';']
        lines+=['uint32_t '+','.join(f'{name}{lane}=s[{lane}][{i}]' for i,name in enumerate('abcdefgh'))+';']
    for i in range(64):
        for lane in range(2):
            if i>=16:
                p,q,r,t=[f'w{lane}_{j%16}' for j in [i,i-15,i-2,i-7]]
                lines+=[f'{p}+=(YSKAR_ROTR({q},7)^YSKAR_ROTR({q},18)^({q}>>3))+{t}+(YSKAR_ROTR({r},17)^YSKAR_ROTR({r},19)^({r}>>10));']
            a,b,c,d,e,f,g,h=[f'{"abcdefgh"[(j-i)%8]}{lane}' for j in range(8)]
            lines += [f'{{uint32_t t1={h}+(YSKAR_ROTR({e},6)^YSKAR_ROTR({e},11)^YSKAR_ROTR({e},25))+(({e}&{f})^(~{e}&{g}))+{constants[i]}+w{lane}_{i%16};',
                      f'uint32_t t2=(YSKAR_ROTR({a},2)^YSKAR_ROTR({a},13)^YSKAR_ROTR({a},22))+(({a}&{b})^({a}&{c})^({b}&{c}));{d}+=t1;{h}=t1+t2;}}']
    for lane in range(2):
        lines+=[''.join(f's[{lane}][{i}]+={name}{lane};' for i,name in enumerate('abcdefgh'))]
    lines+=['}', '''
__device__ __forceinline__ void pair_hash(uint8_t out[2][32],const uint32_t mid[8],uint64_t n0,uint64_t n1){
 uint32_t s[2][8],w[2][16],t[2][8];uint64_t ns[2]={n0,n1};
 #pragma unroll
 for(int lane=0;lane<2;lane++){
  #pragma unroll
  for(int k=0;k<8;k++)s[lane][k]=mid[k];
  uint64_t n=ns[lane];
  w[lane][0]=__byte_perm((uint32_t)n,0,0x0123);w[lane][1]=__byte_perm((uint32_t)(n>>32),0,0x0123);
  w[lane][2]=0x80000000u;
  #pragma unroll
  for(int k=3;k<15;k++)w[lane][k]=0;
  w[lane][15]=1088;
 }
 pair_block(s,w);
 #pragma unroll
 for(int lane=0;lane<2;lane++){
  yskar_sha_init(t[lane]);
  #pragma unroll
  for(int k=0;k<8;k++)w[lane][k]=s[lane][k];
  w[lane][8]=0x80000000u;
  #pragma unroll
  for(int k=9;k<15;k++)w[lane][k]=0;
  w[lane][15]=256;
 }
 pair_block(t,w);
 #pragma unroll
 for(int lane=0;lane<2;lane++){
  #pragma unroll
  for(int k=0;k<32;k++)out[lane][k]=(uint8_t)(t[lane][k/4]>>(24-8*(k%4)));
 }
}
''']
    return '\n'.join(lines)
