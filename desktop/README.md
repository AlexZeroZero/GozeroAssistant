# 桌面助手构建与测试

当前显示版本：Beta 1.01；包修订号：1.0.3（用于保持自动更新版本单调递增）。

## 构建

在仓库根目录运行：

```powershell
python desktop/scripts/package.py
```

需要 Windows x64、Python 3.11+，以及系统 .NET Framework 4 编译器。构建会下载并校验官方 Electron，编译 Inventory、ExtractKernel、ProcessGuard、NvmlInfo 和 QTC 实验宿主；输出到 `desktop/dist/`。无需 npm install，也不会安装或执行挖矿内核。

构建缓存位于仓库的 `.local/gozer-build/`。QTC PTX 已随源码提供，重新编译的可选依赖见 `native/README.md`。

## 开发运行

先完成构建，再从仓库根目录启动：

```powershell
.\.local\gozer-build\runtime\electron.exe .\desktop
```

开发运行与官方版默认使用相同配置目录。调试时建议使用绝对路径的独立配置目录：

```powershell
.\.local\gozer-build\runtime\electron.exe .\desktop --profile-dir=C:\GozerTestProfile
```

## 测试

构建后执行：

```powershell
node --test desktop/tests/*.test.cjs
python desktop/scripts/language-smoke.py
python desktop/scripts/rental-smoke.py
python desktop/scripts/verify-package.py
```

原生测试需要 Windows、Python 和构建生成的辅助程序；部分硬件测试需要能被 Windows 识别的 GPU。KRig 实包解压测试是可选项：本机 `.local/gozer-build/krig.zip` 不存在时跳过，合成压缩包的安全测试仍执行；不会自动下载矿工。

`python desktop/scripts/smoke.py` 使用隔离配置测试真实界面，需要 NVIDIA 显卡、兼容驱动及在线数据源；包含 QTC 离线计算校验，会短暂使用 GPU，不连接矿池挖矿。普通单元测试和打包校验也不会开始挖矿。

## 配置与数据

主配置位于 `%APPDATA%\gozer-assistant`。设备数据留在本机；自愿分享默认关闭。网络数据依赖公开服务，离线或来源过期时显示状态。

更新清单由 Ed25519 验签。仓库仅含公钥，不含发布私钥。`scripts/sign-release.cjs` 供维护者在独立受控环境使用；自行分发修改版时需要自己的密钥、公钥和更新服务。普通构建不需要发布密钥。

## 代码定位

- `src/hardware.cjs` / `scripts/Inventory.cs`：硬件枚举与驱动传感器。
- `src/miner.cjs` / `scripts/ProcessGuard.cs`：按PCI设备管理矿工与退出清理。
- `src/service-fee.cjs`：公开的分时服务费调度。
- `src/hash-windows.cjs`：按设备采样的5/10分钟均值。
- `src/device-selection.cjs`：已确认GPU身份的历史编号合并。
- `src/pool-account.cjs`：Kryptex公开地址余额与支付查询。
- `src/floating.cjs` / `renderer/mini.*`：悬浮卡片。
- `src/updates.cjs`：签名更新校验。
- `src/rentals.cjs` / `renderer/rental*`：GPU / CPU 租赁报价、型号快捷筛选、每页六台、60秒缓存与可见页刷新、四语参数详情和租金试算。官网聚合 Clore 与 Vast.ai；所有跳转使用固定推荐链接。
- `renderer/i18n.js` / `renderer/translations.js`：中英日俄界面语言、动态文本绑定与完整词典。切换语言时保留原始文本和已有节点；常规数值刷新只处理变更节点。
- `tests/language-smoke.cjs`：四语界面、悬浮停止状态、语言持久化与布局检查，不启动矿工。

实际挖矿使用 KRig；`native/` 为独立实验计算模块，尚未接入矿池。
