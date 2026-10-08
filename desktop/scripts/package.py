"""Build the portable Windows folder using an official SHA-256-verified Electron runtime.
No npm install, remote source execution, admin privileges, or miner execution.
"""
from pathlib import Path
import hashlib, json, os, shutil, subprocess, urllib.request, zipfile, struct, ctypes

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT.parent / '.local' / 'gozer-build'
VERSION = '44.5.1'
RUNTIME_HASH = '9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db'
ARCHIVE = f'electron-v{VERSION}-win32-x64.zip'
RUNTIME_URL = f'https://github.com/electron/electron/releases/download/v{VERSION}/{ARCHIVE}'

def digest(p):
    with p.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def icon_resource(exe, ico):
    # Replace Electron's application icon with the existing Gozer brand asset.
    # Resource changes invalidate upstream signing; this is an unsigned dev build.
    raw = ico.read_bytes()
    count = struct.unpack_from('<H', raw, 4)[0]
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.BeginUpdateResourceW.argtypes = [ctypes.c_wchar_p, ctypes.c_bool]
    kernel.BeginUpdateResourceW.restype = ctypes.c_void_p
    kernel.UpdateResourceW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ushort, ctypes.c_void_p, ctypes.c_uint]
    kernel.UpdateResourceW.restype = ctypes.c_bool
    kernel.EndUpdateResourceW.argtypes = [ctypes.c_void_p, ctypes.c_bool]
    kernel.EndUpdateResourceW.restype = ctypes.c_bool
    handle = kernel.BeginUpdateResourceW(str(exe), False)
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    group = bytearray(raw[:6])
    try:
        for i in range(count):
            entry = raw[6+i*16:22+i*16]
            size, offset = struct.unpack_from('<II', entry, 8)
            data = ctypes.create_string_buffer(raw[offset:offset+size])
            resource_id = 400+i
            if not kernel.UpdateResourceW(handle, 3, resource_id, 1033, data, size):
                raise ctypes.WinError(ctypes.get_last_error())
            group.extend(entry[:12]+struct.pack('<H', resource_id))
        buf = ctypes.create_string_buffer(bytes(group))
        if not kernel.UpdateResourceW(handle, 14, 1, 1033, buf, len(group)):
            raise ctypes.WinError(ctypes.get_last_error())
    except Exception:
        kernel.EndUpdateResourceW(handle, True)
        raise
    if not kernel.EndUpdateResourceW(handle, False):
        raise ctypes.WinError(ctypes.get_last_error())

def main():
    WORK.mkdir(parents=True, exist_ok=True)
    archive = WORK / ARCHIVE
    if not archive.exists():
        with urllib.request.urlopen(urllib.request.Request(RUNTIME_URL, headers={'User-Agent':'GozerBuilder/0.1'}), timeout=120) as r, archive.open('wb') as f:
            shutil.copyfileobj(r, f)
    if digest(archive) != RUNTIME_HASH:
        raise RuntimeError('Electron runtime checksum mismatch')
    runtime = WORK/'runtime'
    if not (runtime/'electron.exe').exists():
        runtime.mkdir(exist_ok=True)
        with zipfile.ZipFile(archive) as z:
            for entry in z.infolist():
                if not (runtime/entry.filename).resolve().is_relative_to(runtime.resolve()):
                    raise RuntimeError('Invalid runtime archive path')
            z.extractall(runtime)
    csc = Path(os.environ.get('SystemRoot', r'C:\Windows')) / r'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    (ROOT / 'vendor').mkdir(exist_ok=True)
    subprocess.run([str(csc), '/nologo', '/target:exe', '/platform:x64', '/optimize+', '/r:System.Web.Extensions.dll', r'/out:vendor\ProcessGuard.exe', r'scripts\ProcessGuard.cs'], cwd=ROOT, check=True)
    subprocess.run([str(csc), '/nologo', '/target:exe', '/platform:x64', '/optimize+', '/r:System.Web.Extensions.dll', r'/out:vendor\NvmlInfo.exe', r'scripts\NvmlInfo.cs'], cwd=ROOT, check=True)
    subprocess.run([str(csc), '/nologo', '/target:exe', '/platform:x64', '/optimize+', '/r:System.Web.Extensions.dll', '/r:System.Management.dll', r'/out:vendor\Inventory.exe', r'scripts\Inventory.cs'], cwd=ROOT, check=True)
    subprocess.run([str(csc), '/nologo', '/target:exe', '/platform:x64', '/optimize+', '/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll', r'/out:vendor\ExtractKernel.exe', r'scripts\ExtractKernel.cs'], cwd=ROOT, check=True)
    subprocess.run([str(csc), '/nologo', '/target:exe', '/platform:x64', '/optimize+', '/r:System.Web.Extensions.dll', '/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll', r'/out:vendor\ExtractBundle.exe', r'scripts\ExtractBundle.cs'], cwd=ROOT, check=True)
    subprocess.run([str(csc), '/nologo', '/target:exe', '/platform:x64', '/optimize+', '/r:System.Web.Extensions.dll', r'/out:native\GozerQtcCore.exe', r'native\GozerQtcCore.cs'], cwd=ROOT, check=True)
    package = json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
    app_version = package['version']
    name = f'GozerAssistant-{app_version}-win-x64'
    target = ROOT/'dist'/name
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        for entry in z.infolist():
            final = (target/entry.filename).resolve()
            if not final.is_relative_to(target.resolve()):
                raise RuntimeError('Invalid runtime archive path')
        z.extractall(target)
    default_app = target/'resources/default_app.asar'
    if default_app.is_file():
        default_app.unlink()
    app_dir = target/'resources/app'
    app_dir.mkdir(parents=True, exist_ok=True)
    # Rebuilding the same version must not retain an older bundled CPU miner.
    excluded_cpu = app_dir/'native/zcd'
    if excluded_cpu.exists():
        if excluded_cpu.is_symlink() or not excluded_cpu.resolve().is_relative_to(target.resolve()):
            raise RuntimeError('Unsafe stale CPU kernel path')
        shutil.rmtree(excluded_cpu)
    for folder in ['src','renderer','assets','vendor','native']:
        shutil.copytree(ROOT/folder, app_dir/folder, dirs_exist_ok=True, ignore=shutil.ignore_patterns('noid','zcd') if folder == 'native' else None)
    if any(p.name.lower() == 'xmrig.exe' for p in target.rglob('*')):
        raise RuntimeError('XMRig must be downloaded on demand, never bundled')
    shutil.copy2(ROOT/'package.json', app_dir/'package.json')
    exe = target/'GozerAssistant.exe'
    (target/'electron.exe').replace(exe)
    icon_resource(exe, ROOT/'assets/icon.ico')
    shutil.copy2(ROOT/'QUICKSTART.txt', target/'使用说明.txt')
    shutil.copy2(ROOT/'THIRD-PARTY.md', target/'THIRD-PARTY.md')
    shutil.copy2(ROOT/'LICENSE', target/'LICENSE-Gozero.txt')
    manifest = {'version':app_version,'displayVersion':package.get('displayVersion',app_version),'channel':package.get('releaseChannel','development'), 'runtime':{'version':VERSION,'url':RUNTIME_URL,'sha256':RUNTIME_HASH}, 'files':{str(p.relative_to(target)):digest(p) for p in target.rglob('*') if p.is_file() and p.name!='SHA256.json'}}
    (target/'SHA256.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
    output = ROOT/'dist'/(name+'.zip')
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for file in sorted(target.rglob('*')):
            if file.is_file():
                z.write(file, str(file.relative_to(target.parent)))
    (ROOT/'dist'/(name+'.zip.sha256')).write_text(digest(output)+'  '+output.name+'\n',encoding='ascii')
    print(str(exe), flush=True)
    print(str(output), output.stat().st_size, digest(output), flush=True)

if __name__=='__main__':
    main()
