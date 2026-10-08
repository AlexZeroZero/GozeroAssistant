"""Package only reviewed experimental sources, bounded tools and public results."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tomllib
import zipfile

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]

def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--exe',type=Path,required=True);p.add_argument('--cargo-home',type=Path,required=True);a=p.parse_args()
    research=ROOT/'.local/blocknet-research'
    output=ROOT/'desktop/dist/GozeroBlocknetCore-0.1.0-experimental-win-x64'
    output.mkdir(parents=True,exist_ok=True)
    shutil.copy2(a.exe,output/'GozeroBlocknetCore.exe')
    for name in ['README.md','REPORT.zh-CN.md','LICENSE','sources.json','compare.py','node-miner.cjs','node-protocol.cjs','node.example.json','Run-Offline-Compare.cmd']:
        shutil.copy2(HERE/name,output/name)
    source=output/'source';source.mkdir(exist_ok=True)
    for item in HERE.iterdir():
        if item.name in ['target','results','__pycache__'] or item.name.startswith('.'):continue
        if item.is_dir():shutil.copytree(item,source/item.name,dirs_exist_ok=True)
        else:shutil.copy2(item,source/item.name)
    results=output/'results';results.mkdir(exist_ok=True)
    for name in ['benchmark-v1.json','benchmark-prefetch.json','benchmark-sustained.json','verify-final.jsonl']:
        shutil.copy2(research/name,results/name)
    shutil.copy2(research/'consensus-validation/local-consensus-result.json',results/'local-consensus-result.json')
    # License files for the exact locked Rust dependencies, including build-only
    # crates for a complete source-bundle notice set. No cache or profile data.
    records=tomllib.loads((HERE/'Cargo.lock').read_text(encoding='utf-8'))['package']
    licenses=output/'third-party-licenses';licenses.mkdir(exist_ok=True)
    dependency_rows=[]
    for dep in records:
        if 'source' not in dep:continue
        folder=next((a.cargo_home/'registry/src').glob('*/'+dep['name']+'-'+dep['version']),None)
        if folder is None:
            # Cargo.lock also records target-inactive dependencies (e.g. libc
            # on this Windows build); Cargo never downloaded or compiled them.
            dependency_rows.append({'name':dep['name'],'version':dep['version'],'checksum':dep.get('checksum'),'targetInactive':True})
            continue
        found=[]
        for item in folder.rglob('*'):
            if item.is_file() and item.name.upper().startswith(('LICENSE','COPYING','COPYRIGHT','NOTICE')):
                relative=item.relative_to(folder);dest=licenses/folder.name/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(item,dest);found.append(str(relative))
        meta=tomllib.loads((folder/'Cargo.toml').read_text(encoding='utf-8'))['package']
        dependency_rows.append({'name':dep['name'],'version':dep['version'],'checksum':dep.get('checksum'),'license':meta.get('license'),'noticeFiles':found})
    (licenses/'dependencies.json').write_text(json.dumps(dependency_rows,indent=2)+'\n',encoding='utf-8')
    rust_notices=a.cargo_home.parent/'rust/share/doc/rust'
    if (rust_notices/'licenses').is_dir():
        shutil.copytree(rust_notices/'licenses',licenses/'rust-standard-library',dirs_exist_ok=True)
    for name in ['COPYRIGHT.html','COPYRIGHT','LICENSE-APACHE','LICENSE-MIT']:
        if (rust_notices/name).is_file():shutil.copy2(rust_notices/name,licenses/('rust-'+name))
    record={'version':'0.1.0-experimental','exeSha256':sha(output/'GozeroBlocknetCore.exe'),
        'toolchain':{'rust':'1.99.0-x86_64-pc-windows-gnu','gcc':'16.2.0'},
        'upstream':json.loads((HERE/'sources.json').read_text(encoding='utf-8')),
        'cargoLockSha256':sha(HERE/'Cargo.lock'),'tests':{'rust':5,'protocol':5,'fullMemoryComparisons':20,'nativeIpcSmoke':True,'officialLocalTestnetAccepted':True,'mainnetVerified':False},
        'sourceFiles':{str(f.relative_to(source)).replace('\\','/'):sha(f) for f in source.rglob('*') if f.is_file()}}
    (output/'build-record.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    archive=Path(str(output)+'.zip')
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9,strict_timestamps=False) as z:
        for file in sorted(output.rglob('*')):
            if file.is_file():z.write(file,file.relative_to(output.parent))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert hashlib.sha256(z.read(output.name+'/GozeroBlocknetCore.exe')).hexdigest()==record['exeSha256']
    Path(str(archive)+'.sha256').write_text(sha(archive)+'  '+archive.name+'\n',encoding='ascii')
    print(json.dumps({'archive':str(archive),'size':archive.stat().st_size,'sha256':sha(archive),'exeSha256':record['exeSha256']}))

if __name__=='__main__':main()
