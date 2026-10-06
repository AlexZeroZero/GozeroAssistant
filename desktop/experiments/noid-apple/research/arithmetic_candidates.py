# SPDX-License-Identifier: Apache-2.0
"""Reproducible, experimental Metal variants; never changes the shipped kernel."""
import argparse
import hashlib
import json
import random
import re
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent / 'noid'))
from reference import convert
from generate import array

BASELINE_REF='e2f25760b1bba6965dfe787c704a6ab4ac493202'

def metal_source(name='kernel.metal'):
    if name not in ('kernel.metal','dispatch.h','core.h','constants.h','tower_linear.h'):
        raise ValueError('Unexpected include')
    source=subprocess.check_output(['git','show',BASELINE_REF+':desktop/experiments/noid-apple/'+name],cwd=ROOT).decode('utf8').replace('#pragma once','')
    return re.sub(r'^#include "([^"\n]+)"\s*$',lambda m:metal_source(m[1]),source,flags=re.MULTILINE)

SIX = '''static inline W cl16(W a, W b) {
    W a0=a&0x9249u,a1=(a>>1)&0x1249u,a2=(a>>2)&0x1249u;
    W b0=b&0x9249u,b1=(b>>1)&0x1249u,b2=(b>>2)&0x1249u;
    W p0=(a0*b0)&0x49249249u,p1=(a1*b1)&0x49249249u,p2=(a2*b2)&0x49249249u;
    W p01=((a0^a1)*(b0^b1))&0x49249249u;
    W p02=((a0^a2)*(b0^b2))&0x49249249u;
    W p12=((a1^a2)*(b1^b2))&0x49249249u;
    return p0^((p01^p0^p1)<<1)^((p02^p0^p2^p1)<<2)^((p12^p1^p2)<<3)^(p2<<4);
}
'''

def cl16(a,b):
    x=[(a>>i)&(0x9249 if i==0 else 0x1249) for i in range(3)]
    y=[(b>>i)&(0x9249 if i==0 else 0x1249) for i in range(3)]
    p=[(x[i]*y[i])&0x49249249 for i in range(3)]
    cross=lambda i,j: ((x[i]^x[j])*(y[i]^y[j]))&0x49249249
    return (p[0]^((cross(0,1)^p[0]^p[1])<<1)^((cross(0,2)^p[0]^p[2]^p[1])<<2)^((cross(1,2)^p[1]^p[2])<<3)^(p[2]<<4))&0xffffffff

def polynomial(a,b):
    out=0
    for i in range(16):
        if b>>i&1: out^=a<<i
    return out

def check():
    rng=random.Random(607)
    pairs=[(a,b) for a in (0,1,0xffff,0xaaaa,0x5555) for b in range(65536)]
    pairs.extend((rng.randrange(65536),rng.randrange(65536)) for _ in range(100000))
    for a,b in pairs: assert cl16(a,b)==polynomial(a,b),(a,b)
    return len(pairs)

def replace(source,start,end,text):
    a=source.index(start); b=source.index(end,a)
    return source[:a]+text+source[b:]

def basis_variant(source,bits):
    count=(128+bits-1)//bits
    tables=[]
    for name,direction in [('HT2F','TOWER_TO_FLAT'),('HF2T','FLAT_TO_TOWER')]:
        data=[[convert((n&((1<<min(bits,128-pos*bits))-1))<<(bits*pos),direction) for n in range(1<<bits)] for pos in range(count)]
        tables.append('GZ_CONSTANT U '+name+f'[{count}][{1<<bits}]='+array(data)+';')
    terms=[]
    words=['a.x','a.y','a.z','a.w']
    for i in range(count):
        pos=i*bits; word,shift=divmod(pos,32)
        expr=f'({words[word]}>>{shift})'
        if shift+bits>32 and word<3: expr=f'({expr}|({words[word+1]}<<{32-shift}))'
        terms.append(f'    r=gx(r,table[{i}][{expr}&{(1<<bits)-1}u]);')
    helper=f'static inline U towerBasis(U a,GZ_TABLE U table[{count}][{1<<bits}]){{\n    U r={{0,0,0,0}};\n'+'\n'.join(terms)+'\n    return r;\n}\n'
    end='static inline W xtimeBytes(' if 'static inline W xtimeBytes(' in source else 'static inline W towerWord0('
    return replace(source,'GZ_CONSTANT U HT2F[',end, '\n'.join(tables)+'\n'+helper)

def diagonal_tables(source):
    # Recover each exact binary linear map from the generated shift/XOR code.
    for k in range(4):
        pat=rf'static inline W towerWord{k}\(W a\)\{{return (.*?);\}}'
        match=re.search(pat,source); expr=re.sub(r'(0x[0-9a-f]+)u',r'\1',match.group(1))
        def value(a):return eval(expr,{'__builtins__':{}},{'a':a})&65535
        table=[[value(n<<(8*j)) for n in range(256)] for j in range(2)]
        code=f'GZ_CONSTANT W D{k}[2][256]='+json.dumps(table).replace('[','{').replace(']','}')+';\n'
        code+=f'static inline W towerWord{k}(W a){{return (D{k}[0][a&255u]^D{k}[1][(a>>8)&255u]) | ((D{k}[0][(a>>16)&255u]^D{k}[1][a>>24])<<16);}}'
        source=source[:match.start()]+code+source[match.end():]
    return source

def word_basis(source,bits):
    count=(32+bits-1)//bits
    tables=[]
    for name,direction in [('HT2F','TOWER_TO_FLAT'),('HF2T','FLAT_TO_TOWER')]:
        values=[[convert((n&((1<<min(bits,32-pos*bits))-1))<<(32*w+bits*pos),direction)
                 for n in range(1<<bits)] for w in range(4) for pos in range(count)]
        tables.append(f'GZ_CONSTANT U {name}[{4*count}][{1<<bits}]='+array(values)+';')
    helper=f'''static inline U towerBasis(U a,GZ_TABLE U table[{4*count}][{1<<bits}]){{
    U r={{0,0,0,0}};W words[4]={{a.x,a.y,a.z,a.w}};
    for(W j=0;j<4;++j)for(W i=0;i<{count};++i)r=gx(r,table[j*{count}+i][(words[j]>>(i*{bits}))&{(1<<bits)-1}u]);
    return r;
}}
'''
    return replace(source,'GZ_CONSTANT U HT2F[','static inline W towerWord0(','\n'.join(tables)+'\n'+helper)

def diagonal_packed(source):
    helper='''static inline W xtimeBytes(W a){return ((a&0x7f7f7f7fu)<<1)^(((a>>7)&0x01010101u)*0x1bu);}
static inline W times32Bytes(W a){a=xtimeBytes(a);a=xtimeBytes(a);a=xtimeBytes(a);a=xtimeBytes(a);return xtimeBytes(a);}
'''
    source=source.replace('static inline W towerWord0(',helper+'static inline W towerWord0(',1)
    for k,power in enumerate((0,5,1,3)):
        code='return a^times32Bytes(a);' if k==0 else 'W t=a;'+('t=xtimeBytes(t);'*power)+'''W h=(t>>8)&0x00ff00ffu;
    W low=(a&0x00ff00ffu)^times32Bytes(h);
    W high=((a>>8)^t^h)&0x00ff00ffu;
    return low|(high<<8);'''
        pat=rf'static inline W towerWord{k}\(W a\)\{{return (.*?);\}}'
        match=re.search(pat,source);expr=re.sub(r'(0x[0-9a-f]+)u',r'\1',match.group(1))
        def xtime(a):return (((a&0x7f7f7f7f)<<1)^(((a>>7)&0x01010101)*0x1b))&0xffffffff
        for a in [1<<i for i in range(32)]+[0xffffffff,0xdeadbeef]:
            t=a
            for _ in range(5 if k==0 else power):t=xtime(t)
            if k==0: result=a^t
            else:
                h=(t>>8)&0x00ff00ff; low=h
                for _ in range(5):low=xtime(low)
                result=((a&0x00ff00ff)^low)|((((a>>8)^t^h)&0x00ff00ff)<<8)
            assert result==eval(expr,{'__builtins__':{}},{'a':a}),(k,a)
        source=source[:match.start()]+f'static inline W towerWord{k}(W a){{'+code+'}\n'+source[match.end():]
    return source

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
    n=check();source=metal_source();args.out.mkdir(parents=True,exist_ok=True)
    six=replace(source,'static inline W cl16(','static inline Pair cl32(',SIX)
    packed=diagonal_packed(source)
    variants={'baseline':source,'six-products':six,'diagonal-byte':diagonal_tables(source),'basis-six':basis_variant(source,6),'basis-byte':basis_variant(source,8),
              'diagonal-packed':packed,'packed-six':basis_variant(packed,6),'basis-five':basis_variant(source,5),'basis-four-unroll':basis_variant(source,4),
              'noinline-gm':source.replace('static inline U gm(', '__attribute__((noinline)) static U gm('),
              'noinline-sbox':source.replace('static inline U sbox(', '__attribute__((noinline)) static U sbox(')}
    for size in (64,128,256,512):
        variants['register-'+str(size)]=source.replace('kernel void ',f'[[max_total_threads_per_threadgroup({size})]] kernel void ')
    variants['constant-prepared']=source.replace('GZ_THREAD const Prepared& p','constant Prepared& p').replace('Prepared p = job.prepared;','').replace('hashPrepared(p,nonce)','hashPrepared(job.prepared,nonce)')
    variants['word-six']=word_basis(source,6)
    variants['word-five']=word_basis(source,5)
    # Match the bytes used in the original Windows-generated Mac screening on
    # every host. Line endings have no semantic effect on Metal compilation.
    for name,data in variants.items():(args.out/(name+'.metal')).write_bytes(data.replace('\n','\r\n').encode('utf8'))
    (args.out/'sources.json').write_text(json.dumps({'baselineRevision':BASELINE_REF,'cl16IndependentPairs':n,
        'files':{name:hashlib.sha256((args.out/(name+'.metal')).read_bytes()).hexdigest() for name in variants}},indent=2)+'\n')
    print(json.dumps({'cl16IndependentPairs':n,'variants':list(variants)}))

if __name__=='__main__':main()
