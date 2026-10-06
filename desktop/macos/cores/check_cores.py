"""Run the real GPU/reference comparisons in a relocated core package."""
import fcntl
import os
from pathlib import Path
import subprocess

root=Path(__file__).resolve().parent
(root/'state').mkdir(exist_ok=True)
with (root/'state/mining.lock').open('w') as lock:
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise SystemExit('Stop the running core before checking the GPU.')
    env=dict(os.environ,PMK_HOME=str(root/'state/prl'),
             PMK_RESOURCE_BUNDLE=str(root/'prl/libpmk/.build/release/libpmk_PMK.bundle'))
    for command in [[str(root/'qtc/gpu_cpu_parity'),'25'],
                    [str(root/'qtc/arithmetic_edges')],
                    [str(root/'qtc/dispatch_coverage')],
                    [str(root/'python/bin/python3'),str(root/'prl/scripts/pmk_quickstart.py'),'admission','--force']]:
        subprocess.run(command,cwd=root,env=env,check=True)
    print('QTC GPU/CPU parity and PRL cert-v3 SG correctness checks PASSED. This is an offline check, not proof of pool acceptance.')
