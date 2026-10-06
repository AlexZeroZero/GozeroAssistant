"""Build an ad-hoc signed Apple Silicon Gozero GUI with verified local runtimes."""
import argparse
import hashlib
import json
import platform
import plistlib
import shutil
import subprocess
import time
from pathlib import Path

REPO=Path(__file__).resolve().parents[2]
DESKTOP=REPO/'desktop'

def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def run(*args):
    subprocess.run([str(a) for a in args],check=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--electron-archive',type=Path,required=True)
    parser.add_argument('--miner-package',type=Path,required=True,help='Previously verified native CPU-GPU miner ZIP')
    args=parser.parse_args()
    if platform.system()!='Darwin' or platform.machine()!='arm64':raise RuntimeError('Build on Apple Silicon')
    runtime=json.loads((DESKTOP/'macos/electron-runtime.json').read_text())
    if sha(args.electron_archive)!=runtime['sha256']:raise RuntimeError('Electron SHA256 mismatch')
    # The CLI package manifest binds the native executable, shader and Node.
    import zipfile
    with zipfile.ZipFile(args.miner_package) as z:
        prefix='Gozero-NOID-Mac-Miner-CPU-GPU-arm64/'
        m=json.loads(z.read(prefix+'MANIFEST.json'))
        for name,digest in m['files'].items():
            if '/' in name or '\\' in name or name in ('.','..'):raise RuntimeError('Invalid native manifest name')
            if hashlib.sha256(z.read(prefix+name)).hexdigest()!=digest:raise RuntimeError('Native manifest mismatch: '+name)
        native={name:z.read(prefix+name) for name in ('noid-apple-check','noid-runtime.metal','node','build-selftest.json','NODE-LICENSE.txt','LICENSE-Apache-2.0.txt','NOTICE')}
    build=DESKTOP/'dist'/('gui-build-'+str(time.time_ns()));build.mkdir(parents=True)
    run('/usr/bin/ditto','-x','-k',args.electron_archive,build/'runtime')
    app=build/'Gozero助手.app';shutil.move(str(build/'runtime/Electron.app'),str(app))
    contents=app/'Contents';resources=contents/'Resources';target=resources/'app'
    target.mkdir();(target/'package.json').write_text(json.dumps({'name':'gozero-assistant-mac','version':'0.1.3','productName':'Gozero助手 Mac','main':'desktop/macos/gui/main.cjs'},ensure_ascii=False))
    licenses=target/'licenses';licenses.mkdir()
    shutil.copy2(build/'runtime/LICENSE',licenses/'ELECTRON-LICENSE.txt')
    shutil.copy2(build/'runtime/LICENSES.chromium.html',licenses/'LICENSES.chromium.html')
    shutil.copy2(DESKTOP/'macos/gui/README.txt',target/'README.txt')
    gui=DESKTOP/'macos/gui'
    for p in gui.rglob('*'):
        if p.is_file() and p.suffix in ('.cjs','.js','.css','.html') and 'tests' not in p.parts:
            out=target/'desktop/macos/gui'/p.relative_to(gui);out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,out)
    sources=['src/service-fee.cjs','src/noid.cjs','renderer/app.css','renderer/logo.svg',
             'experiments/noid-apple/pool_runner.cjs','experiments/noid-apple/pool_session.cjs','experiments/noid-apple/miner_cli.cjs']
    for name in sources:
        out=target/'desktop'/name;out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(DESKTOP/name,out)
    native_dir=target/'native';native_dir.mkdir()
    for name,data in native.items():
        p=native_dir/name;p.write_bytes(data);p.chmod(0o755 if name in ('node','noid-apple-check') else 0o644)
    run('xcrun','clang++','-O2','-fobjc-arc','-arch','arm64','-mmacosx-version-min=13.5',gui/'telemetry.mm','-framework','Foundation','-o',native_dir/'mac-telemetry')
    # Reuse the original Gozero brand icon; no replacement artwork.
    iconset=build/'Gozero.iconset';iconset.mkdir()
    for size in (16,32,128,256,512):
        for scale in (1,2):
            name=f'icon_{size}x{size}'+('@2x' if scale==2 else '')+'.png'
            run('/usr/bin/sips','-z',size*scale,size*scale,DESKTOP/'assets/icon.png','--out',iconset/name)
    run('/usr/bin/iconutil','-c','icns',iconset,'-o',resources/'gozero.icns')
    info_path=contents/'Info.plist';info=plistlib.loads(info_path.read_bytes())
    info.update(CFBundleDisplayName='Gozero助手 Mac',CFBundleName='Gozero助手',CFBundleIdentifier='trade.gozero.assistant.mac',CFBundleShortVersionString='0.1.3',CFBundleVersion='4',CFBundleIconFile='gozero.icns',LSMinimumSystemVersion='13.5',NSHighResolutionCapable=True)
    info_path.write_bytes(plistlib.dumps(info))
    # Re-seal Electron helper bundles after ZIP extraction (empty resources
    # directories may be omitted upstream). Do not re-sign the proven miner.
    for executable in (contents/'MacOS/Electron',native_dir/'node',native_dir/'noid-apple-check'):
        arch=subprocess.check_output(['lipo','-archs',str(executable)],text=True).strip()
        if arch!='arm64':raise RuntimeError('Unexpected runtime architecture: '+arch)
    nested=list((contents/'Frameworks').rglob('*.app'))+list((contents/'Frameworks').rglob('*.framework'))
    for helper in sorted(nested,key=lambda p:len(p.parts),reverse=True):
        run('/usr/bin/codesign','--force','--sign','-','--preserve-metadata=entitlements',helper)
    run('/usr/bin/codesign','--force','--sign','-',app)
    run('/usr/bin/codesign','--verify','--deep','--strict',app)
    for name in ('noid-apple-check','noid-runtime.metal'):
        if sha(native_dir/name)!=m['files'][name]:raise RuntimeError('Native artifact changed while packaging')
    manifest={'type':'mac-noid-gui','electron':runtime,'nativePackageSha256':sha(args.miner_package),
              'files':{str(p.relative_to(target)):sha(p) for p in target.rglob('*') if p.is_file()}}
    (build/'BUILD-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
    out=DESKTOP/'dist/Gozero-Assistant-Mac-arm64.zip'
    run('/usr/bin/ditto','-c','-k','--sequesterRsrc','--keepParent',app,out)
    out.with_suffix('.zip.sha256').write_text(sha(out)+'  '+out.name+'\n')
    (DESKTOP/'dist/gui-latest.json').write_text(json.dumps({'app':str(app),'zip':str(out),'manifest':str(build/'BUILD-MANIFEST.json'),'sha256':sha(out)},indent=2))
    print(json.dumps({'app':str(app),'zip':str(out),'sha256':sha(out)},ensure_ascii=False))

if __name__=='__main__':main()
