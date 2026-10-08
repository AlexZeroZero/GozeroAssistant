"""Sequential, bounded offline rx/2 benchmarks. No pools, wallets or online submission."""
import argparse, hashlib, json, re, subprocess, time
from pathlib import Path

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--official',type=Path,required=True)
    p.add_argument('--original',type=Path,help='Historical failed binary; retained for CLI compatibility, not launched')
    p.add_argument('--current',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
    config={'autosave':False,'background':False,'colors':False,'title':False,'http':{'enabled':False},
      'randomx':{'init':4,'mode':'fast','1gb-pages':False,'rdmsr':False,'wrmsr':False,'numa':True},
      'cpu':{'enabled':True,'huge-pages':False,'huge-pages-jit':False,'priority':1,'yield':True,'asm':True,
             'rx':list(range(8)),'rx/2':list(range(8)),'*':False},
      'cuda':{'enabled':False},'opencl':{'enabled':False},'print-time':5,'health-print-time':60,
      'benchmark':{'size':'250K','algo':'rx/2','submit':False},'pools':[]}
    cfg=a.output/'benchmark.json';cfg.write_text(json.dumps(config,indent=2)+'\n')
    records=[]
    # Reverse order for the second pass to reduce ordering/thermal bias.
    # cpu.1 was already verified to crash during dataset initialization; do not
    # repeatedly launch it. Keep its earlier failure report alongside this run.
    order=[('official',a.official),('cpu.2',a.current),('cpu.2',a.current),('official',a.official)]
    for index,(name,exe) in enumerate(order):
        log=a.output/(str(index+1)+'-'+name+'.log');log.write_text('');print('Starting '+name+' round '+str(index+1),flush=True)
        start=time.monotonic();result=None;proc=None
        try:
            with log.with_suffix('.stdout.log').open('wb') as stream:
                proc=subprocess.Popen([str(exe.resolve()),'--config',str(cfg.resolve()),'--log-file',str(log.resolve())],cwd=a.output,
                    stdout=stream,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
                while time.monotonic()-start<360:
                    text=log.read_text(encoding='utf-8',errors='replace')
                    done=re.search(r'benchmark finished in ([\d.]+) seconds \(([\d.]+) h/s\).*hash sum = ([0-9A-F]+)',text)
                    if done:
                        result={'name':name,'seconds':float(done[1]),'hashrate':float(done[2]),'hashSum':done[3],'completed':True};break
                    if proc.poll() is not None or 'unable to open' in text or 'no valid configuration' in text:break
                    time.sleep(1)
        finally:
            if proc and proc.poll() is None:proc.kill();proc.wait(timeout=10)
        if result is None:result={'name':name,'completed':False,'exitCode':proc.returncode if proc else None,'error':'exited or exceeded 360 second deadline'}
        result.update(exeSha256=hashlib.sha256(exe.read_bytes()).hexdigest(),log=log.name)
        records.append(result)
        (a.output/'results.json').write_text(json.dumps({'algorithm':'rx/2','hashesPerRun':250000,
          'cpuAffinity':list(range(8)),'hugePages':False,'msr':False,'onlineSubmission':False,'runs':records},indent=2)+'\n')
        print(json.dumps(result),flush=True)
        if not result['completed']:raise SystemExit(1)
        if index<len(order)-1:time.sleep(15)

if __name__=='__main__':main()
