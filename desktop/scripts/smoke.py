"""Exercise the real Electron renderer and hardware collector without mining."""
from pathlib import Path
import os, subprocess, sys, tempfile, json

root = Path(__file__).resolve().parents[1]
runtime = root.parent/'.local/gozer-build/runtime/electron.exe'
if not runtime.exists():
    raise SystemExit('Run scripts/package.py first to prepare the verified runtime.')
(root/'artifacts').mkdir(exist_ok=True)
env = os.environ.copy()
env.pop('ELECTRON_RUN_AS_NODE', None)
env['GOZER_UI_TEST'] = '1'
env['GOZER_TEST_DATA'] = tempfile.mkdtemp(prefix='smoke-', dir=root/'artifacts')
# Seed the historical duplicate selection in an isolated profile. No wallets or
# mining processes are involved; startup must migrate it before the UI is ready.
probe = subprocess.run(['node', '-e',
    "const {Hardware}=require('./src/hardware.cjs');const {deviceId}=require('./src/device-selection.cjs');new Hardware().scan().then(h=>{const g=h.gpus.find(g=>g.vendor==='NVIDIA'&&g.sensors?.uuid);console.log(JSON.stringify({selected:[deviceId(g.sensors.uuid),g.id]}))});"],
    cwd=root, capture_output=True, timeout=55, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
fixture=json.loads(probe.stdout.decode('utf-8'))
fixture.update(coin='TSC',wallets={'TSC':'tc1qfixturepreserved'})
Path(env['GOZER_TEST_DATA'], 'settings.json').write_text(json.dumps(fixture), encoding='utf-8')
result = subprocess.run([str(runtime), str(root)], env=env, capture_output=True, timeout=100, creationflags=subprocess.CREATE_NO_WINDOW)
output = (result.stdout+result.stderr).decode('utf-8', 'replace')
sys.stdout.reconfigure(encoding='utf-8')
print(output)
raise SystemExit(0 if 'GOZER_SMOKE_PASS' in output and result.returncode == 0 else 1)
