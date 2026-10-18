"""Lossless package-only compaction; miner executables are never rewritten."""
from pathlib import Path, PurePosixPath
import hashlib, json, tarfile, zipfile, os, shutil

LOCALES = {'en-US.pak', 'en-GB.pak', 'zh-CN.pak', 'zh-TW.pak', 'ja.pak', 'ru.pak'}

def digest(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def compact_source(source, cache):
    """Retain every source member, verifying names and bytes after conversion."""
    cache.mkdir(parents=True, exist_ok=True)
    source_hash = digest(source)
    target = cache/(source_hash+'.tar.xz')
    receipt = cache/(source_hash+'.json')
    if target.exists() and receipt.exists():
        data = json.loads(receipt.read_text(encoding='utf-8'))
        if data['sourceSha256'] == source_hash and data['archiveSha256'] == digest(target):
            return target, data
    temp = target.with_suffix('.tmp')
    expected = {}
    with zipfile.ZipFile(source) as z, tarfile.open(temp, 'w:xz', preset=6) as tar:
        for member in sorted(z.infolist(), key=lambda x:x.filename):
            name = PurePosixPath(member.filename)
            if name.is_absolute() or '..' in name.parts or '\\' in member.filename:
                raise RuntimeError('Unsafe source archive path')
            if member.is_dir():
                continue
            if member.filename in expected:
                raise RuntimeError('Duplicate source archive member')
            info = tarfile.TarInfo(member.filename)
            info.size = member.file_size
            info.mode = ((member.external_attr >> 16) & 0o777) or 0o644
            with z.open(member) as f:
                tar.addfile(info, f)
            with z.open(member) as f:
                expected[member.filename] = hashlib.file_digest(f, 'sha256').hexdigest()
    actual = {}
    with tarfile.open(temp, 'r:xz') as tar:
        for member in tar:
            if not member.isfile():
                raise RuntimeError('Unexpected non-file source member')
            with tar.extractfile(member) as f:
                actual[member.name] = hashlib.file_digest(f, 'sha256').hexdigest()
    if actual != expected:
        raise RuntimeError('Source archive verification failed')
    os.replace(temp, target)
    data = {'sourceSha256':source_hash, 'archiveSha256':digest(target),
            'filesVerified':len(expected), 'originalBytes':source.stat().st_size,
            'compressedBytes':target.stat().st_size}
    receipt.write_text(json.dumps(data, indent=2)+'\n', encoding='utf-8')
    return target, data

def compact_package(target, cache):
    target = target.resolve()
    app = target/'resources/app'
    removed = []
    for path in (target/'locales').glob('*.pak'):
        if path.name not in LOCALES:
            if not path.resolve().is_relative_to(target):
                raise RuntimeError('Locale path outside package')
            removed.append({'file':path.name, 'bytes':path.stat().st_size})
            path.unlink()
    meta_path = app/'src/mds-kernel.json'
    meta = json.loads(meta_path.read_text(encoding='utf-8'))
    native = app/'native/mds'
    records = []
    for name in list(meta['files']):
        if not name.endswith('-source.zip'):
            continue
        original = native/name
        if digest(original) != meta['files'][name]:
            raise RuntimeError('MDS source checksum mismatch')
        compressed, data = compact_source(original, cache)
        new_name = name[:-4]+'.tar.xz'
        shutil.copy2(compressed, native/new_name)
        original.unlink()
        del meta['files'][name]
        meta['files'][new_name] = digest(native/new_name)
        records.append({**data, 'archive':new_name})
    meta_path.write_text(json.dumps(meta, indent=2)+'\n', encoding='utf-8')
    return {'localesKept':sorted(LOCALES), 'localesRemoved':removed, 'sourceArchives':records}

if __name__ == '__main__':
    import sys
    source=Path(sys.argv[1]); cache=Path(sys.argv[2])
    path, data=compact_source(source, cache)
    print(path)
    print(json.dumps(data, indent=2))
