"""Bounded version and configuration checks; never starts mining or contacts a pool."""
import argparse
import json
from pathlib import Path
import subprocess
import time

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--config',type=Path,required=True)
    args=p.parse_args()
    exe=args.output.resolve()/'xmrig.exe'
    results=[]
    for flags,marker in [(['--version'],'XMRig 6.26.0'),
                         (['--config',str(args.config.resolve()),'--dry-run'],'config')]:
        start=time.monotonic()
        try:
            run=subprocess.run([str(exe),*flags],cwd=args.output,capture_output=True,timeout=15)
            row={'flags':flags,'exitCode':run.returncode,'stdout':run.stdout.decode('utf-8','replace'),
                 'stderr':run.stderr.decode('utf-8','replace'),'timedOut':False}
            row['passed']=run.returncode==0 and marker in row['stdout'] and (marker!='config' or 'OK' in row['stdout'])
        except subprocess.TimeoutExpired as e:
            row={'flags':flags,'timedOut':True,'passed':False,
                 'stdout':(e.stdout or b'').decode('utf-8','replace'),
                 'stderr':(e.stderr or b'').decode('utf-8','replace')}
        row['elapsedSeconds']=round(time.monotonic()-start,3)
        results.append(row)
        print(json.dumps(row,ensure_ascii=False),flush=True)
        if not row['passed']:break
    report={'checks':results,'miningStarted':False,'poolAcceptanceTested':False,
            'antivirusClearance':'not established','performanceTested':False}
    (args.output/'validation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    if len(results)!=2 or not all(r['passed'] for r in results):raise SystemExit(1)

if __name__=='__main__':main()
