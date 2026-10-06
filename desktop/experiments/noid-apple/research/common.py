# SPDX-License-Identifier: Apache-2.0
# Experimental generators; consensus attribution and pinned sources: ../NOTICE.
# These rejected/screened variants are NOT used by the distributed miner.
import sys,json,pathlib,functools,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT.parent/'noid'))
from reference import convert,multiply,TABLES
import subprocess,re
from generate import word,array
OUT=ROOT/'artifacts/research-tower';OUT.mkdir(parents=True,exist_ok=True)

@functools.lru_cache(None)
def tm(a,b,n=128):
    if n==8:
        r=0
        for _ in range(8):
            if b&1:r^=a
            a=((a<<1)^(0x11b if a&128 else 0))&255;b>>=1
        return r
    h=n//2;mask=(1<<h)-1
    p=tm(a&mask,b&mask,h);q=tm(a>>h,b>>h,h);r=tm((a&mask)^(a>>h),(b&mask)^(b>>h),h)
    return (p^tm(q,0x20<<(h-8),h))|((p^r)<<h)


def metal_source(name='kernel.metal'):
    if name not in ('kernel.metal','dispatch.h','core.h','constants.h'):
        raise ValueError('Unexpected pinned include')
    source=subprocess.check_output(['git','show','692df24:desktop/experiments/noid-apple/'+name],cwd=ROOT).decode('utf-8').replace('#pragma once','')
    return re.sub(r'^#include "([^"\n]+)"\s*$',lambda m:metal_source(m[1]),source,flags=re.MULTILINE)
