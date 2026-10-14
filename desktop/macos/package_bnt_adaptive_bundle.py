"""Export source + local updater; no Mac binary is built on Windows."""
import argparse, hashlib, json, shutil, tempfile, zipfile
from pathlib import Path
REPO = Path(__file__).resolve().parents[2]
NAME = 'Gozero-BNT-Mac-0.1.12-update'
README = """Gozero BNT Mac 0.1.12 自动内存更新包（需 Mac 0.1.11）

这是源码及本机更新工具，不是 DMG。
新版现已通过 M3 实测：150 秒接受 2 份、拒绝 0 份；自动扩线程及恢复通过。
底层 ARM64 哈希内核沿用之前验证过的 0.1.11 二进制，不改变 BNT 算法。

在原来的 Apple Silicon Mac 上：
1. 把整个 ZIP 解压到任意文件夹。桌面须保留 Gozero助手.app 0.1.11。
2. 打开 Run-Update.command；若不可执行，在终端输入 bash 后拖入该文件。
3. 工具会关闭助手、执行离线测试、检查中英界面；内存足够时执行完整参数自检，
   生成并校验新版 .app 和 DMG，然后替换桌面应用；不会自动开始挖矿。
4. 原应用和配置保存在 ~/Gozero-Mac-Test/run-20261006-t31JTC/bnt-adaptive/。
   已有 BNT 配置改为自动线程；地址、其它币种配置及服务费账本保持不变。
5. 点击开始挖矿，等待约一分钟观察自动扩线程。没有 10 分钟限制。

自动模式：每线程仍需完整 2 GiB 内存，最多 8 线程且不超过逻辑 CPU 数。
每 5 秒读取内存；连续 3 次有余量才增加一个线程。内存告警减线程，
严重压力释放全部计算内存；压力恢复后经过冷却和稳定检查自动继续。
手动停止/退出不会自动重启。持续挖矿不等于保证 CPU 占用 100%。
没有 BNT GPU/Metal 后端；统一内存不会变出额外显存容量。

要求原 Mac 的 Xcode Python 3 / codesign / hdiutil（此前构建环境）。
应用沿用临时本机签名，未经过 Apple 公证；脚本不修改系统安全设置。
若任何检查失败，请保留终端日志，勿删除原应用。更新包不发布 GitHub。
"""

def build(output):
    output = Path(output).resolve()
    if output.exists():
        raise FileExistsError(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='gozero-bnt-bundle-') as tmp:
        root = Path(tmp) / NAME; root.mkdir()
        payload = root / 'payload'
        gui = REPO / 'desktop/macos/gui'
        for p in gui.rglob('*'):
            if p.is_file() and p.suffix in ('.cjs', '.js', '.css', '.html'):
                dest = payload / p.relative_to(REPO); dest.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p, dest)
        shutil.copytree(REPO / 'desktop/macos/cores/bnt', payload / 'desktop/macos/cores/bnt', ignore=shutil.ignore_patterns('target', '__pycache__'))
        shutil.copy2(REPO / 'desktop/macos/package_bnt_update.py', payload / 'desktop/macos/package_bnt_update.py')
        shutil.copy2(REPO / 'desktop/macos/install_bnt_adaptive.py', root / 'install_bnt_adaptive.py')
        (root / 'README.txt').write_text(README, encoding='utf-8')
        (root / 'Run-Update.command').write_text('#!/bin/bash\ncd -- "$(dirname -- "$0")" || exit 1\n/usr/bin/python3 install_bnt_adaptive.py\nresult=$?\nprintf "\\nExit: %s. Press Enter to close.\\n" "$result"\nread -r _\nexit "$result"\n', encoding='utf-8', newline='\n')
        files = {str(p.relative_to(root)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
        (root / 'UPDATE-MANIFEST.json').write_text(json.dumps({'version':'0.1.12', 'kind':'source-updater', 'macValidation':'M3 controller and GUI tested; updater script not separately executed', 'files':files}, indent=2), encoding='utf-8')
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
            for p in sorted(root.rglob('*')):
                if p.is_file():
                    info = zipfile.ZipInfo(str(p.relative_to(root.parent)).replace('\\', '/'))
                    info.create_system = 3
                    info.external_attr = (0o100755 if p.name.endswith('.command') else 0o100644) << 16
                    info.compress_type = zipfile.ZIP_DEFLATED
                    z.writestr(info, p.read_bytes())
    print(json.dumps({'bundle':str(output), 'bytes':output.stat().st_size, 'sha256':hashlib.sha256(output.read_bytes()).hexdigest(), 'macValidation':'M3 controller and GUI tested; updater script not separately executed'}, ensure_ascii=False))

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output', type=Path, required=True)
    build(ap.parse_args().output)
