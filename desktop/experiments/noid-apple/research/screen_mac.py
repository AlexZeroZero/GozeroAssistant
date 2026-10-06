# SPDX-License-Identifier: Apache-2.0
"""Run bounded, correctness-gated Metal candidate measurements on an idle Mac."""
import argparse, hashlib, json, statistics, subprocess, time
from pathlib import Path

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--executable',type=Path,required=True);p.add_argument('--sources',type=Path,required=True)
    p.add_argument('--names',nargs='+',default=['baseline','six-products','diagonal-byte','basis-six','basis-byte'])
    p.add_argument('--rounds',type=int,default=1);p.add_argument('--seconds',type=int,default=8)
    p.add_argument('--report',type=Path,required=True);p.add_argument('--stop-gui',action='store_true')
    a=p.parse_args();assert 1<=a.rounds<=10 and 1<=a.seconds<=60
    if a.stop_gui:
        subprocess.run(['/usr/bin/osascript','-e','tell application "/Users/apple/Desktop/Gozero助手.app" to quit'],check=True)
        time.sleep(2)
    report={'scope':'short offline synthetic screening; all hashes checked before timing','samples':[],
            'binarySha256':hashlib.sha256(a.executable.read_bytes()).hexdigest(),'seconds':a.seconds,'sources':{n:hashlib.sha256((a.sources/(n+'.metal')).read_bytes()).hexdigest() for n in a.names}}
    a.report.parent.mkdir(parents=True,exist_ok=True)
    for r in range(a.rounds):
        for name in (a.names if r%2==0 else list(reversed(a.names))):
            assert subprocess.run(['pgrep','-x','noid-apple-check'],capture_output=True).returncode==1,'Another worker is active'
            cmd=[str(a.executable),'--metal-source',str(a.sources/(name+'.metal')),'--benchmark','--count','4096','--search-seconds',str(a.seconds)]
            try:
                run=subprocess.run(cmd,text=True,capture_output=True,timeout=150)
                if run.returncode:raise RuntimeError(run.stderr)
                result=json.loads(run.stdout)
                assert result['metalSelftest']=='passed' and result['cpuSelftest']=='passed'
                sample={'name':name,'round':r+1,'result':result}
                print(name,r+1,round(result['metalSearch']['hashesPerSecondWall']),flush=True)
            except Exception as e:
                sample={'name':name,'round':r+1,'error':str(e)}
                print(name,'FAILED',str(e)[:500],flush=True)
            report['samples'].append(sample)
            a.report.write_text(json.dumps(report,indent=2)+'\n')
    report['medians']={n:statistics.median(s['result']['metalSearch']['hashesPerSecondWall'] for s in report['samples'] if s['name']==n and 'result' in s) for n in a.names if any(s['name']==n and 'result' in s for s in report['samples'])}
    a.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['medians']),flush=True)

if __name__=='__main__':main()
