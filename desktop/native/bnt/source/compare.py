"""Bounded offline A/B benchmark. No pool access, wallet or paid mining.

Runs one variant at a time on identical public block headers/nonces, rotates
variant order, validates every digest and reports wall-clock aggregate H/s.
"""
import argparse
import ctypes
import datetime
import hashlib
import json
import os
from pathlib import Path
import statistics
import struct
import subprocess
import winreg

HERE = Path(__file__).resolve().parent

class Memory(ctypes.Structure):
    _fields_ = [('length',ctypes.c_ulong),('load',ctypes.c_ulong)] + [(x,ctypes.c_ulonglong) for x in
        ['totalPhys','availPhys','totalPage','availPage','totalVirtual','availVirtual','extended']]

def memory():
    m=Memory();m.length=ctypes.sizeof(m)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)): raise OSError('Memory query failed')
    return m

def performance_cpus():
    k=ctypes.windll.kernel32;n=ctypes.c_ulong()
    k.GetSystemCpuSetInformation(None,0,ctypes.byref(n),None,0)
    buf=ctypes.create_string_buffer(n.value)
    if not k.GetSystemCpuSetInformation(buf,n,ctypes.byref(n),None,0):raise OSError('CPU query failed')
    rows=[];offset=0
    while offset<n.value:
        size,kind=struct.unpack_from('<II',buf.raw,offset)
        if size<8:raise ValueError('Invalid CPU set')
        if kind==0:
            cid,group,logical,core,cache,numa,eff,flags=struct.unpack_from('<IHBBBBBB',buf.raw,offset+8)
            if group==0:rows.append({'logical':logical,'core':core,'efficiency':eff})
        offset+=size
    fastest=max(r['efficiency'] for r in rows)
    unique={}
    for r in rows:
        if r['efficiency']==fastest:unique.setdefault(r['core'],r['logical'])
    return list(unique.values()),rows

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--exe',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--threads',default='1,2,4')
    p.add_argument('--engines',default='official,reuse,avx2,gozero')
    p.add_argument('--rounds',type=int,default=3)
    p.add_argument('--hashes',type=int,default=8)
    a=p.parse_args()
    if not 1<=a.rounds<=5 or not 2<=a.hashes<=100:raise ValueError('Bounds: rounds 1..5, hashes 2..100')
    cpus,topology=performance_cpus()
    k=ctypes.WinDLL('kernel32',use_last_error=True)
    k.GetCurrentProcess.restype=ctypes.c_void_p
    k.SetProcessAffinityMask.argtypes=[ctypes.c_void_p,ctypes.c_size_t]
    k.GetProcessAffinityMask.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_size_t),ctypes.POINTER(ctypes.c_size_t)]
    current=k.GetCurrentProcess();original=ctypes.c_size_t();system=ctypes.c_size_t()
    if not k.GetProcessAffinityMask(current,ctypes.byref(original),ctypes.byref(system)):raise OSError('Affinity query failed')
    cpus=[x for x in cpus if original.value & (1<<x)]
    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,r'HARDWARE\DESCRIPTION\System\CentralProcessor\0') as key:
        cpu=winreg.QueryValueEx(key,'ProcessorNameString')[0].strip()
    report={'createdUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cpu':cpu,
        'totalMemoryBytes':memory().totalPhys,'topology':topology,'exeSha256':hashlib.sha256(a.exe.read_bytes()).hexdigest(),
        'method':'Sequential rotated order; same P-core affinity per worker count; full 2 GiB hashes; one warm-up hash per worker excluded; all digests checked across engines.',
        'limitation':'Offline PoW function comparison, not official GUI/node executable, pool acceptance, power efficiency, or long-run mining validation.',
        'runs':[]}
    a.out.parent.mkdir(parents=True,exist_ok=True)
    def save():a.out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    engines=a.engines.split(',')
    if 'official' not in engines:raise ValueError('Official reference is required')
    reference={}
    for threads in map(int,a.threads.split(',')):
        if not 1<=threads<=min(8,len(cpus)):raise ValueError('Too many threads for available physical P cores')
        selected=cpus[:threads]
        for r in range(a.rounds):
            order=engines[r%len(engines):]+engines[:r%len(engines)]
            for engine in order:
                if threads*2*1024**3 > min(memory().availPhys//2,memory().availPhys-4*1024**3):
                    raise MemoryError('Insufficient spare RAM; benchmark leaves >=4 GiB and >=50% available RAM')
                if not k.SetProcessAffinityMask(current,sum(1<<x for x in selected)):raise OSError('Set affinity failed')
                try:
                    child=subprocess.Popen([str(a.exe.resolve()),'bench',engine,str(threads),str(a.hashes)],
                        stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
                finally:k.SetProcessAffinityMask(current,original.value)
                try:out,err=child.communicate(timeout=max(120,a.hashes*threads*15))
                except BaseException:
                    child.kill();child.communicate();raise
                if child.returncode:raise RuntimeError(err or f'Exit {child.returncode}')
                row=json.loads(out);row.update(round=r+1,affinity=selected)
                for worker in row['workers']:
                    for nonce,digest in enumerate(worker['hashes']):
                        key=(worker['worker'],nonce)
                        if key in reference and reference[key]!=digest:raise AssertionError(f'Incorrect hash: {engine} {key}')
                        reference[key]=digest
                report['runs'].append(row);save()
                print(f'{threads} thread(s), round {r+1}, {engine}: {row["hashrate"]:.4f} H/s',flush=True)
    summary=[]
    for threads in sorted({x['threads'] for x in report['runs']}):
        baseline=statistics.median(x['hashrate'] for x in report['runs'] if x['threads']==threads and x['requestedEngine'].lower()=='official')
        for engine in engines:
            values=[x['hashrate'] for x in report['runs'] if x['threads']==threads and x['requestedEngine'].lower()==engine]
            med=statistics.median(values)
            summary.append({'threads':threads,'engine':engine,'medianHs':med,'minHs':min(values),'maxHs':max(values),'vsOfficialPercent':(med/baseline-1)*100})
    report['summary']=summary;report['allDigestsMatch']=True;save()
    print(json.dumps(summary,indent=2))

if __name__=='__main__':main()
