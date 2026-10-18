"""Validate the desktop layout without starting mining or using the real profile."""
from pathlib import Path
import os, subprocess, tempfile, sys
root=Path(__file__).resolve().parents[1]
env=os.environ.copy()
env.pop('ELECTRON_RUN_AS_NODE',None)
env['GOZER_UI_TEST']='1'
env['GOZER_JTM_TEST' if '--jtm' in sys.argv else 'GOZER_AUTOSAVE_TEST' if '--autosave' in sys.argv else 'GOZER_LAYOUT_TEST']='1'
out=root/'artifacts'/'layout-refresh'
out.mkdir(parents=True,exist_ok=True)
env['GOZER_TEST_DATA']=tempfile.mkdtemp(prefix='profile-',dir=out)
result=subprocess.run([str(root.parent/'.local/gozer-build/runtime/electron.exe'),str(root)],env=env,capture_output=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW)
output=(result.stdout+result.stderr).decode('utf-8','replace')
(out/('autosave.log' if '--autosave' in sys.argv else 'smoke.log')).write_text(output,encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
print(output[-9000:])
raise SystemExit(0 if 'GOZER_SMOKE_PASS' in output and result.returncode==0 else 1)
