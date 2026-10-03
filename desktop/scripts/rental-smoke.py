"""Exercise the real Electron rental catalogue, without mining or opening referral links."""
from pathlib import Path
import os, subprocess, tempfile, sys
root=Path(__file__).resolve().parents[1]
runtime=root.parent/'.local/gozer-build/runtime/electron.exe'
(root/'artifacts').mkdir(exist_ok=True)
env=os.environ.copy()
env.pop('ELECTRON_RUN_AS_NODE',None)
env.update(GOZER_UI_TEST='1',GOZER_RENTAL_TEST='1',GOZER_TEST_DATA=tempfile.mkdtemp(prefix='rental-profile-',dir=root/'artifacts'))
result=subprocess.run([str(runtime),str(root)],env=env,capture_output=True,timeout=240,creationflags=subprocess.CREATE_NO_WINDOW)
sys.stdout.reconfigure(encoding='utf-8')
output=(result.stdout+result.stderr).decode('utf-8','replace')
print(output)
raise SystemExit(0 if 'GOZER_SMOKE_PASS' in output and result.returncode==0 else 1)
