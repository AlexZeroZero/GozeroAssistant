# 桌面助手构建与测试

当前显示版本：Beta 1.02；包修订号：1.0.24（用于保持自动更新版本单调递增）。

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
- `src/rentals.cjs` / `renderer/rental*`：GPU / CPU 租赁报价、型号快捷筛选、列表随窗口尺寸自动填充、60秒缓存与可见页刷新、四语参数详情和租金试算。官网聚合 Clore 与 Vast.ai；所有跳转使用固定推荐链接。
- `renderer/i18n.js` / `renderer/translations.js`：中英日俄界面语言、动态文本绑定与完整词典。切换语言时保留原始文本和已有节点；常规数值刷新只处理变更节点。
- `tests/language-smoke.cjs`：四语界面、悬浮停止状态、语言持久化与布局检查，不启动矿工。

PRL / QTC 使用 KRig，NOID 使用 Suprminer / Fl4shMiner；YSR 使用随附开源 CUDA 内核，ZCD 使用手动下载的 Gozero XMRig CPU 或官方 XMRig。`native/` 根目录的 QTC 内核仍为独立实验模块。

## NOID 当前适配

NOID 默认使用 Suprminer，也可选择 Fl4shMiner；自研 NOID 运行文件不再打包。
自动连接先检测保存的主/备用节点，再尝试官方 Suprnova 节点的非加密 TCP 兼容连接。
旧配置迁移为自动模式，钱包和矿池保留。连接模式版本字段可避免反复覆盖用户后续手动设置。
运行时只向矿工传入已通过 NOID 协议检测的节点；运行中的重连沿用所选节点。
`desktop/tests/noid-connection.test.cjs` 覆盖协议检测、超时、取消、回退、自定义矿池边界及旧配置迁移。

## YSR / ZCD（1.0.24）

- YSR：SHA-256d，NVIDIA RTX 30 / SM 8.0 或更新显卡及兼容 CUDA 13 的驱动；默认 https://ysr.pool.gozero.trade:8443 。CUDA 源码、C# 矿池宿主和 MIT 上游输入在 `experiments/yskar`。随附 PTX、测试向量、运行文件和许可证在 `native/ysr`。
- ZCD：CPU RandomX v2（rx/2），永久 02 地址校验，默认 stratum+tcp://zcd.pool.gozero.trade:3333 。两个 XMRig 版本均仅在用户点击下载后安装，不包含在助手包中。自编译版完整源码及依赖另见独立 GitHub 内核 Release。
- CPU 档位按逻辑线程计算：64核128线程对应50%→64、75%→96、100%→128线程；100%允许完整 CPU 配额。GPU仍保留原有调度余量。线程数量不等于保证达到对应占用率或最佳算力。
- ZCD 读取内核原生日志，控制台启动诊断单独采集，避免输出重定向造成日志和算力缺失。
- 137项自动化测试通过，包含128线程配置与CPU100%配额；四语界面测试通过。自编译CPU内核离线日志及算力实测通过，官方XMRig在本机被系统拒绝启动，未完成本轮实机验证。未宣称ZCD矿池有效份额或收益验收完成。
