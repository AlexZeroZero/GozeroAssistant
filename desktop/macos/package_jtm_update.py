"""Build the complete Gozero GUI with bundled JTM; retain pinned other cores."""
import argparse,hashlib,json,plistlib,shutil,subprocess,tarfile
from pathlib import Path
REPO=Path(__file__).resolve().parents[2]
VERSION='0.1.20'
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def run(*a):subprocess.run([str(x) for x in a],check=True)
def main():
 p=argparse.ArgumentParser();p.add_argument('--base-app',type=Path,required=True);p.add_argument('--jtm-core',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 assert not a.output.exists(),'Choose a fresh output directory'
 run('codesign','--verify','--deep','--strict',a.base_app)
 assert subprocess.check_output(['lipo','-archs',str(a.jtm_core)],text=True).strip()=='arm64'
 a.output.mkdir(parents=True);app=a.output/'Gozero助手.app';run('ditto',a.base_app,app)
 target=app/'Contents/Resources/app'
 for f in (REPO/'desktop/macos/gui').rglob('*'):
  if f.is_file() and f.suffix in ['.cjs','.js','.html','.css'] and 'tests' not in f.parts:
   d=target/f.relative_to(REPO);d.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,d)
 shutil.copy2(REPO/'desktop/src/service-fee.cjs',target/'desktop/src/service-fee.cjs')
 # Existing catalog bytes and all unrelated native payloads are preserved.
 catalog=target/'desktop/macos/gui/core-catalog.json'
 assert catalog.exists(),'Use the verified 0.1.18 small application as base'
 core=target/'native/cores/jtm';core.mkdir(parents=True,exist_ok=True)
 shutil.copy2(a.jtm_core,core/'GozeroJtmCore');(core/'GozeroJtmCore').chmod(0o755)
 run('codesign','--force','--sign','-',core/'GozeroJtmCore')
 (core/'MANIFEST.json').write_text(json.dumps({'arch':'arm64','cpuTarget':'apple-m1','version':VERSION,'sha256':sha(core/'GozeroJtmCore')},indent=2))
 shutil.copy2(REPO/'desktop/macos/cores/jtm/LICENSE',core/'LICENSE')
 shutil.copy2(REPO/'desktop/macos/cores/jtm/README-MAC.txt',target/'JTM-MAC.txt')
 with tarfile.open(core/'source.tar.gz','w:gz') as tf:tf.add(REPO/'desktop/macos/cores/jtm',arcname='jtm',filter=lambda i:None if any(x in i.name.split('/') for x in ['target','__pycache__']) else i)
 data=json.loads((target/'package.json').read_text());data['version']=VERSION;(target/'package.json').write_text(json.dumps(data,ensure_ascii=False))
 info=app/'Contents/Info.plist';data=plistlib.loads(info.read_bytes());data.update(CFBundleShortVersionString=VERSION,CFBundleVersion='21');info.write_bytes(plistlib.dumps(data))
 run('codesign','--force','--sign','-',app);run('codesign','--verify','--deep','--strict',app)
 manifest={'version':VERSION,'distribution':'GUI with bundled JTM; other cores on demand','files':{f.relative_to(target).as_posix():sha(f) for f in target.rglob('*') if f.is_file()}}
 (a.output/'BUILD-MANIFEST.json').write_text(json.dumps(manifest,indent=2))
 print(json.dumps({'app':str(app),'coreSha256':sha(core/'GozeroJtmCore'),'catalogSha256':sha(catalog)}),flush=True)
if __name__=='__main__':main()
