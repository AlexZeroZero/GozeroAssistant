"""Package verified native Mac core test binaries; never claims a complete mining app."""
import hashlib
import argparse
import json
from pathlib import Path
import platform
import stat
import subprocess
import zipfile
import tarfile

REPO = Path(__file__).resolve().parents[2]
CORE = REPO / 'desktop/experiments/noid-apple'
BUILD = CORE / 'artifacts/macos-arm64'
NAME = 'Gozero-NOID-Mac-Core-Test-arm64'

LAUNCHER = '''#!/bin/zsh
set -u
cd "$(dirname -- "$0")" || exit 1
mkdir -p results || exit 1
REPORT="results/check-$(date +%Y%m%d-%H%M%S)-$$"
echo 'Gozero NOID Mac 内核自检 / 短基准；不连接矿池，不是完整助手。'
./noid-apple-check __METAL_FLAG__ "$PWD/__METAL_FILE__" --benchmark --count 32 > "$REPORT.json" 2> "$REPORT.log"
RESULT=$?
cat "$REPORT.json" "$REPORT.log"
echo "退出码: $RESULT；报告目录: $PWD/results"
if [[ -t 0 && -z "${SSH_CONNECTION:-}" ]]; then
  read '?按回车关闭窗口。'
fi
exit "$RESULT"
'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node-archive', type=Path, help='Verified official ARM64 Node archive; include the bounded Mac-local miner')
    args=parser.parse_args()
    package_name='Gozero-NOID-Mac-Miner-arm64' if args.node_archive else NAME
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        raise RuntimeError('Package native test binaries only on an Apple Silicon Mac after successful selftests')
    result = json.loads((BUILD / 'selftest.json').read_text())
    if result.get('cpuSelftest') != 'passed' or result.get('metalSelftest') != 'passed':
        raise RuntimeError('Both CPU and Metal selftests must pass before packaging')
    expected = result.get('sourceSha256', {})
    if not expected or any(hashlib.sha256((CORE / name).read_bytes()).hexdigest() != digest for name, digest in expected.items()):
        raise RuntimeError('Missing or stale source verification; rerun build_mac.py')
    files = {}
    for name in ('noid-apple-check',):
        data = (BUILD / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != result.get('binarySha256', {}).get(name):
            raise RuntimeError('Unverified native binary: ' + name)
        files[name] = data
    mode = result.get('metalCompilation')
    metal_name = 'noid-runtime.metal' if mode == 'runtime-source' else 'noid.metallib'
    if mode not in ('runtime-source', 'offline-metallib') or result.get('metalArtifact', {}).get('name') != metal_name:
        raise RuntimeError('Missing verified Metal artifact metadata')
    metal_data = (BUILD / metal_name).read_bytes()
    if hashlib.sha256(metal_data).hexdigest() != result['metalArtifact']['sha256']:
        raise RuntimeError('Unverified Metal artifact')
    files[metal_name] = metal_data
    arch = subprocess.check_output(['lipo', '-archs', str(BUILD / 'noid-apple-check')], text=True).strip()
    if arch != 'arm64':
        raise RuntimeError('Expected native arm64 executable, found ' + arch)
    for name in ('LICENSE-Apache-2.0.txt', 'NOTICE'):
        files[name] = (CORE / name).read_bytes()
    files['build-selftest.json'] = (BUILD / 'selftest.json').read_bytes()
    flag = '--metal-source' if mode == 'runtime-source' else '--metallib'
    files['Run-Core-Test.command'] = LAUNCHER.replace('__METAL_FLAG__', flag).replace('__METAL_FILE__', metal_name).encode('utf-8')
    performance = LAUNCHER.replace('内核自检 / 短基准', '内核自检 / 30秒大批次算力测试')
    performance = performance.replace('--benchmark --count 32', '--benchmark --count 4096 --search-seconds 30 --search-batch 65536')
    files['Run-Performance-Test.command'] = performance.replace('__METAL_FLAG__', flag).replace('__METAL_FILE__', metal_name).encode('utf-8')
    files['README.txt'] = ('Gozero NOID Apple Silicon 内核测试包\n\n'
        '这是已通过构建机 CPU / Metal 自检的独立内核测试程序，不是完整 Gozero助手，不能连接矿池。\n'
        '双击 Run-Core-Test.command，或在终端执行 /bin/zsh Run-Core-Test.command。\n'
        '测大批次算力请双击 Run-Performance-Test.command；预热后测量30秒，查看 metalSearch.hashesPerSecondWall（H/s）。\n'
        '除以1000000得到 MH/s；32候选短测的 metalDigestBatch 数值不代表持续算力。\n'
        '无需安装 Python 或 Xcode；程序使用系统 Metal / Foundation 框架。\n'
        '启动后先校验向量，再运行少量候选短基准；结果保存在 results/。\n'
        '测试包不包含开发者分发签名或公证；不修改系统安全设置。\n'
        '构建机型号和系统见 build-selftest.json；其他 M 系列设备仍需要实机验证。\n'
        '短基准不是持续算力、矿池有效份额或收益证明。\n').encode('utf-8')
    if args.node_archive:
        node=json.loads((REPO/'desktop/macos/node-runtime.json').read_text())
        if hashlib.sha256(args.node_archive.read_bytes()).hexdigest()!=node['sha256']:
            raise RuntimeError('Node archive checksum mismatch')
        prefix='node-v'+node['version']+'-darwin-arm64/'
        with tarfile.open(args.node_archive,'r:gz') as archive:
            # Read only exact regular files; no archive extraction or path traversal.
            for source,dest in [('bin/node','node'),('LICENSE','NODE-LICENSE.txt')]:
                member=archive.getmember(prefix+source)
                if not member.isfile():raise RuntimeError('Unexpected Node archive member')
                files[dest]=archive.extractfile(member).read()
        files['node-runtime.json']=(REPO/'desktop/macos/node-runtime.json').read_bytes()
        for name in ('pool_runner.cjs','pool_session.cjs','miner_cli.cjs'):
            data=(CORE/name).read_bytes()
            if hashlib.sha256(data).hexdigest()!=expected.get(name):raise RuntimeError('Unverified controller source: '+name)
            files[name]=data
        files['Run-Mining-Test.command']='''#!/bin/zsh
set -u
cd "$(dirname -- "$0")" || exit 1
echo 'Gozero NOID Mac 实验挖矿核心；需要 macOS 13.5 或更新系统。'
echo '本次使用 Innovlab HK2 TLS，最多运行180秒；Ctrl+C可停止。'
read 'WALLET?请输入你的 NOID 公开收款地址（不需要助记词或私钥）：'
if [[ -z "$WALLET" ]]; then exit 1; fi
/usr/bin/caffeinate -i ./node ./miner_cli.cjs --wallet "$WALLET" --seconds 180
RESULT=$?
if [[ -t 0 && -z "${SSH_CONNECTION:-}" ]]; then read '?按回车关闭窗口。'; fi
exit "$RESULT"
'''.encode('utf-8')
        files['README.txt']=('Gozero NOID Apple Silicon 实验挖矿核心\n\n'
            '双击 Run-Mining-Test.command，输入 NOID 公开地址，运行180秒矿池测试。\n'
            'TLS连接、任务调度、Metal计算和CPU校验都在Mac本机执行，无需Windows/SSH控制器。\n'
            '需要 Apple Silicon 和 macOS 13.5 或更新系统；已实测设备见 build-selftest.json。\n'
            '内置官方 Node ARM64 运行时，无需另装 Node/Python/Xcode；许可证见 NODE-LICENSE.txt。\n'
            '日志和结果在 results/；Ctrl+C停止，子进程也有独立期限；不后台自动挖矿。\n'
            '命令行示例：./node miner_cli.cjs --wallet YOUR_PUBLIC_ADDRESS --seconds 600\n'
            '每次限1至600秒，默认65536候选一批；支持 --worker / --host / --port / --report。\n'
            '双击 Run-Performance-Test.command 可做不联网的30秒大批次算力测试。\n'
            '这是实验命令行核心，不是完整Gozero助手或长期生产矿工；本轮未集成助手服务费。\n'
            '算力为本地测量，不代表矿池长期有效算力或收益；其他M系列需要实机复测。\n'
            '测试包没有开发者分发签名或公证，不修改系统安全设置。\n').encode('utf-8')
    files['MANIFEST.json'] = (json.dumps({'type': 'bounded-native-mac-miner' if args.node_archive else 'native-core-selftest-not-mining-app',
        'architecture': arch, 'files': {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}}, indent=2) + '\n').encode()
    out = REPO / 'desktop/dist'; out.mkdir(parents=True, exist_ok=True)
    archive = out / (package_name + '.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for name, data in sorted(files.items()):
            item = zipfile.ZipInfo(package_name + '/' + name)
            item.create_system = 3
            item.compress_type = zipfile.ZIP_DEFLATED
            mode = 0o755 if name in ('noid-apple-check','node') or name.endswith('.command') else 0o644
            item.external_attr = (stat.S_IFREG | mode) << 16
            bundle.writestr(item, data)
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip() is not None:
            raise RuntimeError('Native package CRC check failed')
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(digest + '  ' + archive.name + '\n', encoding='ascii')
    print(str(archive))
    print('SHA256:', digest)


if __name__ == '__main__':
    main()
