"""Overlay the Mac BNT port onto an existing verified Mac app; no user profiles."""
import argparse,hashlib,json,plistlib,shutil,subprocess
from pathlib import Path
REPO=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(*args):subprocess.run([str(x) for x in args],check=True)
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--base-app',type=Path,required=True)
    ap.add_argument('--core',type=Path,required=True)
    ap.add_argument('--output',type=Path,required=True)
    a=ap.parse_args();assert not a.output.exists(),a.output
    run('codesign','--verify','--deep','--strict',a.base_app)
    assert subprocess.check_output(['lipo','-archs',str(a.core)],text=True).strip()=='arm64'
    run('ditto',a.base_app,a.output)
    target=a.output/'Contents/Resources/app';native=target/'native'
    before={n:sha(native/n) for n in ['noid-apple-check','noid-runtime.metal','cores/qtc/gozero_worker']}
    gui=REPO/'desktop/macos/gui'
    for p in gui.rglob('*'):
        if p.is_file() and p.suffix in ('.cjs','.js','.css','.html') and 'tests' not in p.parts:
            dest=target/'desktop/macos/gui'/p.relative_to(gui);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
    for name in ['service-fee.cjs','bnt.cjs','bnt-pool.cjs','bnt-worker.cjs','bnt-vectors.json','sha3-256.cjs','log-privacy.cjs']:
        shutil.copy2(REPO/'desktop/src'/name,target/'desktop/src'/name)
    core=native/'cores/bnt';core.mkdir(exist_ok=True)
    shutil.copy2(a.core,core/'gozero-blocknet-core');(core/'gozero-blocknet-core').chmod(0o755)
    run('codesign','--force','--sign','-',core/'gozero-blocknet-core')
    (core/'MANIFEST.json').write_text(json.dumps({'arch':'arm64','version':'0.2.1-mac','sha256':sha(core/'gozero-blocknet-core')}))
    shutil.copytree(REPO/'desktop/macos/cores/bnt',core/'source',ignore=shutil.ignore_patterns('target','__pycache__'),dirs_exist_ok=True)
    shutil.copy2(REPO/'desktop/macos/cores/bnt/README-MAC.txt',target/'BNT-MAC.txt')
    pkg=target/'package.json';d=json.loads(pkg.read_text());d['version']='0.1.12';pkg.write_text(json.dumps(d,ensure_ascii=False))
    plist=a.output/'Contents/Info.plist';d=plistlib.loads(plist.read_bytes());d.update(CFBundleShortVersionString='0.1.12',CFBundleVersion='13');plist.write_bytes(plistlib.dumps(d))
    run('codesign','--force','--sign','-',a.output)
    run('codesign','--verify','--deep','--strict',a.output)
    assert all(sha(native/n)==h for n,h in before.items()),'Previous cores changed'
    manifest={'version':'0.1.12','baseAppVersion':plistlib.loads((a.base_app/'Contents/Info.plist').read_bytes())['CFBundleShortVersionString'],
              'files':{str(p.relative_to(target)):sha(p) for p in target.rglob('*') if p.is_file()}}
    (a.output.parent/'BUILD-MANIFEST.json').write_text(json.dumps(manifest,indent=2))
    print(json.dumps({'app':str(a.output),'core':json.loads((core/'MANIFEST.json').read_text())},ensure_ascii=False))
if __name__=='__main__':main()
