"""Publish measured offline results without claiming pool earnings or parity."""
import argparse,json,statistics,shutil
from pathlib import Path

def main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);a=p.parse_args()
    root=a.root;run=root/'comparison/run3';out=root/'output';report=json.loads((run/'results.json').read_text())
    rows=report['runs'];assert len(rows)==4 and all(r['completed'] for r in rows)
    sums={r['hashSum'] for r in rows};assert len(sums)==1
    groups={n:[r['hashrate'] for r in rows if r['name']==n] for n in ['official','cpu.2']}
    means={n:statistics.mean(rates) for n,rates in groups.items()}
    delta=(means['cpu.2']/means['official']-1)*100
    lines=[
        'Gozero ZCD / XMRig 离线算力对比 · 2026-10-08',
        '',
        '设备：Intel Core Ultra 9 275HX，Windows x64。',
        '配置：rx/2；固定逻辑处理器 0–7 共8线程；每轮250,000次哈希；初始化4线程。',
        '相同数据种子；关闭大页和MSR；不连接矿池、不提交在线排名；每轮间隔15秒。',
        '顺序：官方 → 源码版 → 源码版 → 官方。算力使用内核完成整个任务的统计，不取瞬时峰值。',
        '',
        '官方 XMRig 6.26.0（MSVC）：'+ ' / '.join(f'{x:.1f}' for x in groups['official'])+' H/s',
        '源码版 6.26.0-cpu.2（GCC）：'+ ' / '.join(f'{x:.1f}' for x in groups['cpu.2'])+' H/s',
        f"两轮算术均值：官方 {means['official']:.1f} H/s；源码版 {means['cpu.2']:.1f} H/s。",
        f'本机本配置均值差：{delta:+.2f}%。',
        '四轮校验和相同：'+next(iter(sums)),
        '',
        '结论：这批任务的哈希校验结果一致。测量有轮次波动，没有锁定CPU频率/功耗，',
        '也没有长期温度测量；以上短测不足以证明全部设备、全线程配置或矿池有效算力完全一致。',
        '不能把离线H/s当作矿池份额接受率、到账收益或长期性能保证。',
        '',
        '旧 cpu.1：实际初始化数据集时退出，不能使用；修复前的诊断构建捕获到 0xC0000005。',
        'cpu.2 修复 AVX2 数据集 JIT 分配区的权限切换范围，并按要求把内核开发者费改为0%。',
        '助手0.5%软件费保持不变；手动选择未修改的官方内核时，官方1%开发者费仍适用。',
        '本次没有改变安全软件设置，未宣称无报毒。',
        '',
        '原始日志、输入配置、EXE SHA256 见 benchmark/ 目录。'
    ]
    (out/'BENCHMARK-RESULTS.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    shutil.copytree(run,out/'benchmark',dirs_exist_ok=True)
    shutil.copy2(root/'comparison/run2/results.json',out/'benchmark/previous-cpu1-failure.json')
    summary={'means':means,'differencePercent':delta,'identicalHashSums':True,'hardware':'Core Ultra 9 275HX',
             'threads':8,'roundsPerEngine':2,'frequencyLocked':False,'poolAcceptanceTested':False}
    (out/'benchmark/summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary))

if __name__=='__main__':main()
