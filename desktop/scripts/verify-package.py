"""Verify packaged files and exercise window startup/close only; never start mining."""
from pathlib import Path
import ctypes, hashlib, json, os, subprocess, time, tempfile
from ctypes import wintypes

root = Path(__file__).resolve().parents[1]
version = json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
folder = root/'dist'/f'GozerAssistant-{version}-win-x64'
manifest = json.loads((folder/'SHA256.json').read_text(encoding='utf-8'))
def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()
bad = [name for name, expected in manifest['files'].items() if digest(folder/name) != expected]
assert not bad, bad
archive = Path(str(folder)+'.zip')
expected = archive.with_suffix('.zip.sha256').read_text().split()[0]
assert digest(archive) == expected
(root/'artifacts').mkdir(exist_ok=True)
profile = '--profile-dir='+tempfile.mkdtemp(prefix='package-profile-',dir=root/'artifacts')
env = os.environ.copy()
env.pop('ELECTRON_RUN_AS_NODE', None)
env.pop('GOZER_UI_TEST', None)
env.pop('GOZER_TEST_DATA', None)
api = ctypes.WinDLL('user32', use_last_error=True)
callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
api.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
api.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
api.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
api.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
api.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
api.IsWindowVisible.argtypes = [wintypes.HWND]
with (root/'artifacts/packaged-startup.log').open('wb') as log:
    process = subprocess.Popen([str(folder/'GozerAssistant.exe'),profile], cwd=folder, env=env,
                               stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
    def windows():
        found = []
        @callback_type
        def visit(handle, _):
            pid = wintypes.DWORD()
            api.GetWindowThreadProcessId(handle, ctypes.byref(pid))
            if pid.value == process.pid:
                text = ctypes.create_unicode_buffer(256)
                api.GetWindowTextW(handle, text, 256)
                if text.value:
                    found.append((handle, text.value, bool(api.IsWindowVisible(handle))))
            return True
        api.EnumWindows(visit, 0)
        return found
    deadline = time.monotonic()+40
    main = None
    try:
        while time.monotonic() < deadline and process.poll() is None:
            main = next((r for r in windows() if r[1] == 'Gozero助手' and r[2]), None)
            if main:
                break
            time.sleep(.25)
        assert main, 'Packaged main window did not open (another instance may be running)'
        time.sleep(3)
        api.PostMessageW(main[0], 0x0010, 0, 0)  # WM_CLOSE: X must create the draggable monitor.
        deadline = time.monotonic()+10
        mini = None
        while time.monotonic() < deadline:
            mini = next((r for r in windows() if r[1] != 'Gozero助手' and r[2] and 'Gozer' in r[1]), None)
            if mini:
                break
            time.sleep(.2)
        assert mini, 'Packaged floating window did not appear on close'
        subprocess.run([str(folder/'GozerAssistant.exe'),profile,'--quit'],env=env,timeout=10,creationflags=subprocess.CREATE_NO_WINDOW)  # Explicit quit, X now opens the monitor.
        code = process.wait(timeout=20)
        assert code == 0, code
        report = {'version':version,'manifestFiles':len(manifest['files']),
                  'allHashesValid':True,'archiveSha256':expected,'windowTitle':main[1],
                  'minimizeFloatingWindow':mini[1],'gracefulExitCode':code,'noMiningExecuted':True}
        (root/'artifacts/packaged-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(report, ensure_ascii=True))
    finally:
        if process.poll() is None:
            for handle, title, _ in windows():
                if title == 'Gozero助手':
                    subprocess.run([str(folder/'GozerAssistant.exe'),profile,'--quit'],env=env,timeout=10,creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.terminate()  # Only this test-launched application's process.
