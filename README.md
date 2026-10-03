# Gozero助手 · 1.0 Beta

Windows GPU 挖矿助手，提供紧凑的硬件监测、PRL / QTC 挖矿工作台、参考收益与桌面悬浮卡片。

[软件下载](https://github.com/AlexZeroZero/GozeroAssistant/releases/tag/v1.0.1-beta) · [使用指南](desktop/QUICKSTART.txt) · [构建说明](desktop/README.md) · [官网](https://pro.gozero.trade/)

## 下载与使用

在 Releases 下载 `GozerAssistant-1.0.1-win-x64.zip`，完整解压后运行 `GozerAssistant.exe`。SHA256 校验文件与安装包同时提供。

请保留整个解压文件夹。升级前从托盘退出旧版，再解压新版运行；钱包和配置保存在本机并会继续保留。

## 功能

- GPU、CPU、内存、主板和 BIOS 参数读取；显示已支持的传感器数据。
- PRL / QTC 挖矿、主备矿池、多卡选择与逐卡日志。
- 5分钟或10分钟算力均值、参考收益、60秒实际挖矿测试与 Kryptex 地址账本。
- 节能、均衡、高性能预算；默认90°C GPU温度保护。
- 可拖动悬浮卡片及系统托盘；显示设备算力、当前模式、负载和收益。

官方发行版的软件服务费为0.5%，挖矿和收益测试均适用，按有效GPU运行时间分时累计；不是按币量精确扣款。矿工内核费、矿池费及电费另计，详细规则见使用指南和程序底部。

当前 TSC 挖矿入口未开放。QTC 实验计算核用于离线自检；实际 PRL/QTC 挖矿使用 KRig。

## 从源码构建

需要 Windows 10/11 x64、Python 3.11+，以及 Windows 自带的 .NET Framework 4 C# 编译器。运行测试另需 Node.js 22+。

```powershell
git clone https://github.com/AlexZeroZero/GozeroAssistant.git
cd GozeroAssistant
python desktop/scripts/package.py
```

构建脚本下载固定版本的官方 Electron 并校验 SHA256，编译原生辅助程序，输出至 `desktop/dist/`。构建过程不启动挖矿。无需 npm 安装依赖；CUDA 实验核的 PTX 与对应源码、来源和许可证一起提供，重新编译 PTX 的要求见 `desktop/native/README.md`。

## 源码结构

| 目录 | 内容 |
| --- | --- |
| `desktop/src` | Electron 主进程、设备读取、矿工管理、费用调度与数据接口 |
| `desktop/renderer` | 主界面和悬浮卡片 |
| `desktop/scripts` | 构建、打包、签名及验证脚本和原生组件源码 |
| `desktop/native` | QTC 实验计算核源码、PTX、参考向量及来源记录 |
| `desktop/tests` | 配置、安装、设备、收益与窗口回归测试 |
| `lib/assistant.cjs` | 自愿算力上报的校验和汇总模块，供配套服务及测试使用 |

## 许可证与第三方组件

Gozero 自有代码采用 [MIT](LICENSE)。Quantus 派生计算代码保留 [Apache-2.0](desktop/native/LICENSE-Quantus.txt)。第三方组件沿用各自许可证，详见 [THIRD-PARTY.md](desktop/THIRD-PARTY.md)。

KRig 是闭源第三方矿工，不包含在本仓库或发行包中；用户通过程序单独下载安装。公开助手源码不代表 KRig 已开源。

本版本为 Beta 测试版，尚未完成全部设备、混卡及长期挖矿验证。参考收益不代表实际到账；未知传感器值显示为缺失。
