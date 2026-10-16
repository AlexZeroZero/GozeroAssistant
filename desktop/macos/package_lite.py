"""Split a verified full Mac app into a small GUI and pinned on-demand runtimes."""
import argparse,hashlib,json,plistlib,shutil,subprocess,tarfile,os
from pathlib import Path
REPO=Path(__file__).resolve().parents[2]
VERSION='0.1.18'
def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def run(*a):subprocess.run([str(v) for v in a],check=True)
def inventory(root):
    files={}
    for p in sorted(root.rglob('*')):
        name=p.relative_to(root).as_posix()
        if p.is_symlink():
            assert p.resolve().is_relative_to(root.resolve()),p
            files[name]={'type':'link','target':os.readlink(p)}
        elif p.is_file():files[name]={'type':'file','bytes':p.stat().st_size,'mode':p.stat().st_mode&0o777,'sha256':sha(p)}
    return files
def copy(src,dest):
    dest.parent.mkdir(parents=True,exist_ok=True)
    if src.is_dir():shutil.copytree(src,dest,symlinks=True)
    else:shutil.copy2(src,dest)
def packs(base,out):
    assert not out.exists();out.mkdir(parents=True)
    native=base/'Contents/Resources/app/native'
    groups={'node':['node','NODE-LICENSE.txt'],
            'noid':['noid-apple-check','noid-runtime.metal','build-selftest.json','LICENSE-Apache-2.0.txt','NOTICE'],
            'python':['cores/python','cores/licenses'],
            'qtc':['cores/qtc','cores/licenses','cores/sources.json'],
            'prl':['cores/prl','cores/prl_gui.py','cores/licenses','cores/sources.json'],
            'bnt':['cores/bnt'],'mds':['cores/mds']}
    catalog={'format':1,'version':VERSION,'packages':{},'coins':{'NOID':['node','noid'],'BNT':['node','bnt'],'MDS':['mds'],'QTC':['python','qtc'],'PRL':['python','prl']}}
    for key,names in groups.items():
        root=out/key;root.mkdir()
        for name in names:copy(native/name,root/'native'/name)
        entries=inventory(root);manifest=root/'PAYLOAD.json'
        manifest.write_text(json.dumps({'files':entries},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        archive=out/f'Gozero-Mac-Core-{key}-{VERSION}-arm64.tar.gz'
        with tarfile.open(archive,'w:gz',compresslevel=6) as tf:
            tf.add(root,arcname='.',filter=lambda info:clean(info))
        catalog['packages'][key]={'url':'https://github.com/AlexZeroZero/GozeroAssistant/releases/download/mac-v0.1.2/'+archive.name,'bytes':archive.stat().st_size,'sha256':sha(archive),'manifestSha256':sha(manifest)}
        print(json.dumps({'package':key,**catalog['packages'][key]}),flush=True)
    source=out/f'Gozero-Mac-Core-Sources-{VERSION}.tar.gz'
    with tarfile.open(source,'w:gz',compresslevel=6) as tf:tf.add(native/'cores/sources',arcname='sources',filter=lambda info:clean(info))
    (out/'core-catalog.json').write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8')
def clean(info):
    info.uid=info.gid=0;info.uname=info.gname='';return info
def app(base,out,catalog):
    assert not out.exists();out.mkdir(parents=True);dest=out/'Gozero助手.app'
    run('codesign','--verify','--deep','--strict',base);run('ditto',base,dest)
    target=dest/'Contents/Resources/app';native=target/'native'
    assert native.resolve().is_relative_to(out.resolve())
    telemetry=(native/'mac-telemetry').read_bytes();shutil.rmtree(native);native.mkdir()
    (native/'mac-telemetry').write_bytes(telemetry);(native/'mac-telemetry').chmod(0o755)
    for p in (REPO/'desktop/macos/gui').rglob('*'):
        if p.is_file() and p.suffix in ('.cjs','.js','.css','.html') and 'tests' not in p.parts:
            d=target/p.relative_to(REPO);d.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,d)
    shutil.copy2(catalog,target/'desktop/macos/gui/core-catalog.json')
    shutil.copy2(REPO/'desktop/macos/gui/CORE-DOWNLOADS.txt',target/'CORE-DOWNLOADS.txt')
    p=target/'package.json';data=json.loads(p.read_text());data['version']=VERSION;p.write_text(json.dumps(data,ensure_ascii=False))
    p=dest/'Contents/Info.plist';data=plistlib.loads(p.read_bytes());data.update(CFBundleShortVersionString=VERSION,CFBundleVersion='19');p.write_bytes(plistlib.dumps(data))
    run('codesign','--force','--sign','-',dest);run('codesign','--verify','--deep','--strict',dest)
    manifest={'version':VERSION,'distribution':'on-demand-cores','files':{p.relative_to(target).as_posix():sha(p) for p in target.rglob('*') if p.is_file()}}
    (out/'BUILD-MANIFEST.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    image=out/f'Gozero-Assistant-Mac-{VERSION}-arm64.dmg'
    volume=out/'volume';volume.mkdir();run('ditto',dest,volume/dest.name);(volume/'Applications').symlink_to('/Applications')
    run('hdiutil','create','-volname',f'Gozero Mac {VERSION}','-srcfolder',volume,'-format','UDZO','-ov',image)
    run('hdiutil','verify',image)
    archive=out/f'Gozero-Assistant-Mac-{VERSION}-arm64.zip';run('ditto','-c','-k','--sequesterRsrc','--keepParent',dest,archive)
    result={'version':VERSION,'app':str(dest),'dmg':{'sha256':sha(image),'bytes':image.stat().st_size},'zip':{'sha256':sha(archive),'bytes':archive.stat().st_size},'payloadFiles':len(manifest['files'])}
    (out/'package-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['packs','app']);p.add_argument('--base-app',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--catalog',type=Path)
    a=p.parse_args();packs(a.base_app,a.output) if a.mode=='packs' else app(a.base_app,a.output,a.catalog)
