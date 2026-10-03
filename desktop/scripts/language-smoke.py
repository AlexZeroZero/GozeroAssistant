"""Four-language Electron UI checks in an isolated profile, without mining."""
from pathlib import Path
import json, os, subprocess, tempfile, sys
root = Path(__file__).resolve().parents[1]
runtime = root.parent / '.local/gozer-build/runtime/electron.exe'
(root / 'artifacts').mkdir(exist_ok=True)
env = os.environ.copy()
env.pop('ELECTRON_RUN_AS_NODE', None)
env['GOZER_UI_TEST'] = '1'
env['GOZER_LANGUAGE_TEST'] = '1'
env['GOZER_TEST_DATA'] = tempfile.mkdtemp(prefix='language-profile-', dir=root/'artifacts')
Path(env['GOZER_TEST_DATA'], 'settings.json').write_text(json.dumps({'language':'zh-CN'}), encoding='utf-8')
result = subprocess.run([str(runtime), str(root)], env=env, capture_output=True, timeout=120, creationflags=subprocess.CREATE_NO_WINDOW)
sys.stdout.reconfigure(encoding='utf-8')
output = (result.stdout + result.stderr).decode('utf-8','replace')
print(output)
raise SystemExit(0 if 'GOZER_SMOKE_PASS' in output and result.returncode == 0 else 1)
