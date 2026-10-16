"""Overlay the Mac MDS port onto an existing verified Mac app; no user profiles."""
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
    before={n:sha(native/n) for n in ['noid-apple-check','noid-runtime.metal','cores/qtc/gozero_worker','cores/bnt/gozero-blocknet-core']}
    gui=REPO/'desktop/macos/gui'
    for p in gui.rglob('*'):
        if p.is_file() and p.suffix in ('.cjs','.js','.css','.html') and 'tests' not in p.parts:
            dest=target/'desktop/macos/gui'/p.relative_to(gui);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
    for name in ['service-fee.cjs']:
        shutil.copy2(REPO/'desktop/src'/name,target/'desktop/src'/name)
    core=native/'cores/mds';core.mkdir(exist_ok=True)
    shutil.copy2(a.core,core/'GozeroMdsCore');(core/'GozeroMdsCore').chmod(0o755)
    run('codesign','--force','--sign','-',core/'GozeroMdsCore')
    shutil.copytree(REPO/'desktop/macos/cores/mds',core/'source',ignore=shutil.ignore_patterns('target','__pycache__'),dirs_exist_ok=True)
    shutil.copy2(core/'source/GPU_OC_SETTINGS.toml',core/'GPU_OC_SETTINGS.toml')
    (core/'MANIFEST.json').write_text(json.dumps({'arch':'arm64','version':'0.1.14-mac','files':{n:sha(core/n) for n in ['GozeroMdsCore','GPU_OC_SETTINGS.toml']}}),encoding='utf-8')
    shutil.copy2(core/'source/README-MAC.txt',target/'MDS-MAC.txt')
    pkg=target/'package.json';d=json.loads(pkg.read_text());d['version']='0.1.14';pkg.write_text(json.dumps(d,ensure_ascii=False))
    plist=a.output/'Contents/Info.plist';d=plistlib.loads(plist.read_bytes());d.update(CFBundleShortVersionString='0.1.14',CFBundleVersion='15');plist.write_bytes(plistlib.dumps(d))
    run('codesign','--force','--sign','-',a.output)
    run('codesign','--verify','--deep','--strict',a.output)
    assert all(sha(native/n)==h for n,h in before.items()),'Previous cores changed'
    manifest={'version':'0.1.14','baseAppVersion':plistlib.loads((a.base_app/'Contents/Info.plist').read_bytes())['CFBundleShortVersionString'],
              'files':{str(p.relative_to(target)):sha(p) for p in target.rglob('*') if p.is_file()}}
    (a.output.parent/'BUILD-MANIFEST.json').write_text(json.dumps(manifest,indent=2))
    print(json.dumps({'app':str(a.output),'core':json.loads((core/'MANIFEST.json').read_text())},ensure_ascii=False))
if __name__=='__main__':main()
