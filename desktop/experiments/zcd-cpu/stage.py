"""Stage the pinned source build and provenance; never runs a miner."""
import argparse, hashlib, json, shutil, zipfile
from pathlib import Path

HERE=Path(__file__).resolve().parent
DESKTOP=HERE.parents[1]

def digest(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True)
    args=parser.parse_args();root=args.root.resolve();out=root/'output';dest=DESKTOP/'native/zcd'
    dest.mkdir(parents=True,exist_ok=True)
    source=root/'source/xmrig-b2ca72480c58d197e18c885d9fc1a0c8d517e60a'
    changed=[]
    with zipfile.ZipFile(root/'source.zip') as z:
        for n in z.namelist():
            if n.endswith('/'):continue
            rel=n.split('/',1)[1]
            if (source/rel).read_bytes()!=z.read(n):changed.append(rel)
    expected={'CMakeLists.txt','src/version.h','src/crypto/common/VirtualMemory_win.cpp',
              'src/donate.h','src/crypto/randomx/jit_compiler_x86.cpp'}
    if set(changed)!=expected:raise RuntimeError('Unexpected source changes: '+repr(changed))
    donation=(source/'src/donate.h').read_text()
    assert 'kDefaultDonateLevel = 0' in donation and 'kMinimumDonateLevel = 0' in donation
    validation=json.loads((out/'validation.json').read_text())
    assert all(x['passed'] for x in validation['checks'])
    assert 'DONATE       0%' in validation['checks'][1]['stdout']
    record=json.loads((out/'build-record.json').read_text())
    assert record['exeSha256']==digest(out/'xmrig.exe')
    (out/'source-audit.json').write_text(json.dumps({'changedFiles':changed,'upstreamDonationPercent':0,
      'secureJitAllocationFix':True,'driverInstalled':False},indent=2)+'\n')
    for name in ['README.md','build.py','inputs.json','validate.py','compare.py','stage.py','summarize.py','使用说明.txt']:
        shutil.copy2(HERE/name,out/name)
    for name in ['source-changes.patch','build-record.json','validation.json','source-audit.json']:
        shutil.copy2(out/name,HERE/name)
    for file in out.iterdir():
        if file.is_file() and file.name!='SHA256.json':shutil.copy2(file,dest/file.name)
    shutil.copytree(out/'dependency-sources',dest/'dependency-sources',dirs_exist_ok=True)
    shutil.copytree(out/'benchmark',dest/'benchmark',dirs_exist_ok=True)
    metaPath=DESKTOP/'src/zcd-local-kernel.json';meta=json.loads(metaPath.read_text())
    meta['files']={name:digest(dest/name) for name in meta['files']}
    meta['exeSha256']=meta['files']['xmrig.exe'];metaPath.write_text(json.dumps(meta,indent=2)+'\n')
    files={p.relative_to(out).as_posix():digest(p) for p in out.rglob('*') if p.is_file() and p.name!='SHA256.json'}
    (out/'SHA256.json').write_text(json.dumps(files,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    archive=DESKTOP/'dist/Gozero-XMRig-CPU-6.26.0-cpu.2-test.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in out.rglob('*'):
            if p.is_file():z.write(p,'Gozero-XMRig-CPU-6.26.0-cpu.2/'+p.relative_to(out).as_posix())
    with zipfile.ZipFile(archive) as z:assert z.testzip() is None
    print(archive,archive.stat().st_size,digest(archive))

if __name__=='__main__':main()
