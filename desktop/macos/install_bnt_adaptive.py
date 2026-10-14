"""Run inside the exported update bundle on the previously tested Apple Silicon Mac."""
import hashlib, json, os, platform, plistlib, shutil, subprocess, sys, tempfile, time
from pathlib import Path

VERSION = '0.1.12'
CORE_SHA = '84620b1680ed4f858055568fe867cc3fd95a1920a23cf90108afa0903ef97dd1'

def sha(p):
    with p.open('rb') as f:
        h = hashlib.sha256()
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
        return h.hexdigest()

def run(*args, **kw):
    return subprocess.run([str(a) for a in args], check=True, **kw)

def auto_settings(data):
    # Explicit update request selects Auto only for the existing BNT profile.
    result = json.loads(json.dumps(data))
    if result.get('coin') == 'BNT':
        result['cpuThreads'] = 0
    bnt = result.get('profiles', {}).get('BNT')
    if bnt is not None:
        bnt['cpuThreads'] = 0
    return result

def verify_files(root, files, allow_symlinks=False):
    for name, digest in files.items():
        p = root / name
        if (p.is_symlink() and not allow_symlinks) or root.resolve() not in p.resolve().parents or sha(p) != digest:
            raise RuntimeError('File verification failed: ' + name)

def main():
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        raise RuntimeError('Run this updater on an Apple Silicon Mac.')
    bundle = Path(__file__).resolve().parent
    verify_files(bundle, json.loads((bundle / 'UPDATE-MANIFEST.json').read_text())['files'])
    home = Path.home(); desktop = home / 'Desktop'; base = desktop / 'Gozero助手.app'
    if base.is_symlink():
        raise RuntimeError('Desktop app must be a real app directory, not a symlink.')
    if plistlib.loads((base / 'Contents/Info.plist').read_bytes())['CFBundleShortVersionString'] != '0.1.11':
        raise RuntimeError('This update requires the previously delivered Mac 0.1.11 app on Desktop.')
    run('codesign', '--verify', '--deep', '--strict', base)
    resource = base / 'Contents/Resources/app'
    core = resource / 'native/cores/bnt/gozero-blocknet-core'
    if sha(core) != CORE_SHA:
        raise RuntimeError('Base BNT core differs from the verified 0.1.11 build.')
    profile = home / 'Library/Application Support/gozero-assistant-mac'
    settings = profile / 'settings.json'
    # Read before touching the app; missing or invalid profiles are never overwritten.
    json.loads(settings.read_text())
    workroot = home / 'Gozero-Mac-Test/run-20261006-t31JTC/bnt-adaptive'
    workroot.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix='update-', dir=workroot))
    print('Update results and backups: ' + str(work), flush=True)
    run('osascript', '-e', 'on run argv\ntell application (item 1 of argv) to quit\nend run', base)
    for _ in range(30):
        if subprocess.run(['pgrep', '-f', str(base / 'Contents/MacOS/Electron')], capture_output=True).returncode == 1:
            break
        time.sleep(1)
    else:
        raise RuntimeError('The app has not exited; no replacement performed.')
    for pattern in ['/gozero-blocknet-core worker', '/noid-apple-check', '/gozero_worker', '/(prl_gui|pmk_mine)\\.py']:
        if subprocess.run(['pgrep', '-f', pattern], capture_output=True).returncode != 1:
            raise RuntimeError('A miner is still running; stop it before updating: ' + pattern)
    saved = settings.read_bytes(); data = json.loads(saved)
    (work / 'settings-before.json').write_bytes(saved)
    ledger = profile / 'service-fee-ledger.json'; ledger_before = ledger.read_bytes() if ledger.exists() else None
    repo = work / 'repo'; shutil.copytree(bundle / 'payload', repo)
    # Use the installed dependencies; the update neither downloads nor replaces other cores.
    shutil.copytree(resource / 'desktop/src', repo / 'desktop/src', dirs_exist_ok=True)
    shutil.copytree(resource / 'desktop/experiments', repo / 'desktop/experiments', dirs_exist_ok=True)
    node = resource / 'native/node'
    with (work / 'unit-tests.log').open('w') as log:
        run(node, '--test', *sorted((repo / 'desktop/macos/gui/tests').glob('*.test.cjs')), stdout=log, stderr=subprocess.STDOUT)
    info = json.loads(run(core, '--info', capture_output=True, text=True, timeout=15).stdout)
    native_verified = info['maxThreads'] > 0
    if native_verified:
        with (work / 'native-verify.jsonl').open('w') as log:
            run(core, 'verify', stdout=log, stderr=subprocess.STDOUT, timeout=240)
    else:
        print('Low memory: core identity verified; full-memory selftest will run before each worker mines.', flush=True)
    app = work / 'build/Gozero助手.app'; app.parent.mkdir()
    run(sys.executable, repo / 'desktop/macos/package_bnt_update.py', '--base-app', base, '--core', core, '--output', app)
    env = os.environ.copy()
    wallet = data.get('profiles', {}).get('BNT', {}).get('wallet') or (data.get('wallet') if data.get('coin') == 'BNT' else None)
    if not wallet:
        raise RuntimeError('No saved BNT public wallet; original app and settings are untouched.')
    env.update(GOZERO_BNT_TEST_WALLET=wallet, GOZERO_BNT_THREAD_LIMIT='0', GOZERO_BNT_VISUAL_ONLY='1')
    with (work / 'visual-tests.log').open('w') as log:
        run(app / 'Contents/MacOS/Electron', '--profile-dir=' + str(work / 'visual-profile'), '--ui-smoke', '--bnt-smoke', env=env, stdout=log, stderr=subprocess.STDOUT, timeout=90)
    manifest = json.loads((work / 'build/BUILD-MANIFEST.json').read_text())
    verify_files(app / 'Contents/Resources/app', manifest['files'], True)
    stage = work / 'dmg-stage'; stage.mkdir(); run('ditto', app, stage / app.name)
    (stage / 'Applications').symlink_to('/Applications')
    dmg = work / ('Gozero-Assistant-Mac-' + VERSION + '-arm64.dmg')
    run('hdiutil', 'create', '-volname', 'Gozero Assistant Mac ' + VERSION, '-srcfolder', stage, '-format', 'UDZO', dmg)
    run('hdiutil', 'verify', dmg)
    mount = work / 'verify-mount'; mount.mkdir()
    run('hdiutil', 'attach', dmg, '-readonly', '-nobrowse', '-mountpoint', mount)
    try:
        run('codesign', '--verify', '--deep', '--strict', mount / app.name)
        verify_files(mount / app.name / 'Contents/Resources/app', manifest['files'], True)
    finally:
        run('hdiutil', 'detach', mount)
    dest_dmg = desktop / dmg.name
    if dest_dmg.exists():
        raise RuntimeError('Installer already exists on Desktop; no app replaced: ' + str(dest_dmg))
    backup = work / 'previous-Gozero-0.1.11.app'
    temporary = desktop / ('.Gozero-' + work.name + '.app')
    if temporary.exists() or settings.read_bytes() != saved:
        raise RuntimeError('App/profile changed during update; no replacement performed.')
    run('ditto', app, temporary); run('codesign', '--verify', '--deep', '--strict', temporary)
    verify_files(temporary / 'Contents/Resources/app', manifest['files'], True)
    base.rename(backup)
    try:
        temporary.rename(base)
        tmp_settings = work / 'settings-auto.json'
        tmp_settings.write_text(json.dumps(auto_settings(data), ensure_ascii=False, indent=2), encoding='utf-8')
        # Replace settings atomically on the same volume, retaining the pre-update backup.
        local_tmp = profile / ('settings-' + work.name + '.tmp')
        shutil.copy2(tmp_settings, local_tmp); local_tmp.chmod(0o600); local_tmp.replace(settings)
        if (ledger.read_bytes() if ledger.exists() else None) != ledger_before:
            raise RuntimeError('Fee ledger changed unexpectedly.')
        shutil.copy2(dmg, dest_dmg)
        if sha(dest_dmg) != sha(dmg):
            raise RuntimeError('Desktop DMG checksum mismatch.')
    except BaseException:
        if base.exists():
            base.rename(work / 'failed-new-app.app')
        backup.rename(base); settings.write_bytes(saved)
        raise
    report = {'version': VERSION, 'app': str(base), 'dmg': str(dest_dmg), 'dmgSha256': sha(dmg),
              'backup': str(backup), 'autoThreads': True, 'nativeCoreReused': True,
              'nativeVerify': native_verified, 'unitTests': True, 'visualTests': True,
              'livePoolTest': False, 'feeLedgerUnchanged': True, 'miningStarted': False}
    (work / 'deployment.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    run('open', base)
    print('Updated to ' + VERSION + '. BNT is set to Auto. Click Start to test. No mining was automatically started.', flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('Update failed: ' + str(exc), file=sys.stderr)
        sys.exit(1)
