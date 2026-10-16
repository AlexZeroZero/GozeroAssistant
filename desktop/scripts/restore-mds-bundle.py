"""Explicit build dependency restoration. Verifies bytes; never executes a miner."""
from pathlib import Path
import argparse,hashlib,json,urllib.request,zipfile

APP=Path(__file__).resolve().parents[1]
NAME='GozeroMdsCore-0.1.12-rc.2-preview-win-x64.zip'
SHA256='77547e6e2342e30ac6f7645943c66d1b8ebe3ad13ecfcacd974de62836fc81b4'
URL='https://github.com/AlexZeroZero/GozeroAssistant/releases/download/v1.0.49-beta/'+NAME

def digest(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive',type=Path,help='Use an already downloaded core ZIP instead of the network')
    args=parser.parse_args();archive=args.archive
    if archive is None:
        cache=APP.parent/'.local/mds-release';cache.mkdir(parents=True,exist_ok=True);archive=cache/NAME
        if not archive.exists():
            partial=archive.with_suffix('.zip.part')
            request=urllib.request.Request(URL,headers={'User-Agent':'GozeroSourceBuilder/1.0.49'})
            total=0
            with urllib.request.urlopen(request,timeout=120) as response,partial.open('wb') as out:
                while chunk:=response.read(1024*1024):
                    total+=len(chunk)
                    if total>100*1024*1024:raise RuntimeError('Bundle exceeds expected size limit')
                    out.write(chunk)
            if digest(partial)!=SHA256:raise RuntimeError('Downloaded bundle SHA256 mismatch')
            partial.replace(archive)
    if digest(archive)!=SHA256:raise RuntimeError('Bundle SHA256 mismatch')
    manifest=json.loads((APP/'src/mds-kernel.json').read_text(encoding='utf8'))
    assert manifest['version']=='0.1.12-rc.2'
    expected=manifest['files'];prefix=NAME.removesuffix('.zip')+'/'
    content={}
    with zipfile.ZipFile(archive) as bundle:
        members=bundle.namelist()
        assert len(members)==len(set(members))==len(expected),'Unexpected/duplicate ZIP entries'
        assert set(members)=={prefix+name for name in expected},'Unexpected bundle contents'
        for name,checksum in expected.items():
            assert Path(name).name==name and '/' not in name and '\\' not in name,'Unsafe manifest path'
            member=bundle.getinfo(prefix+name)
            assert member.file_size<=100*1024*1024,'Oversized entry'
            data=bundle.read(member)
            assert hashlib.sha256(data).hexdigest()==checksum,'File integrity mismatch: '+name
            content[name]=data
    native=APP/'native/mds';native.mkdir(parents=True,exist_ok=True)
    for name,data in content.items():(native/name).write_bytes(data)
    print(f'Restored {len(content)} verified MDS files; no executable was started.')

if __name__=='__main__':main()
