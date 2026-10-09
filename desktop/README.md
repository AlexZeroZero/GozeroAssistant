# 桌面助手构建与测试

当前显示版本：Beta 1.02；包修订号：1.0.40（用于保持自动更新版本单调递增）。

1.0.40：单挖与双挖性能配置自动保存，CPU同步调整线程数；连续修改按顺序合并保存，启动等待完成，失败保留草稿并阻止启动。移除工作台应用/保存按钮和双挖冗余设置按钮，更多参数用展开栏访问。

1.0.39：补齐 BNT 默认端口14444的升级迁移；内核库统一卡片、状态和操作区，官方全节点分区展示；放大工作台设备选择按钮。已验证深浅色、四语言、默认及宽窗口布局，界面验证未启动挖矿。

BNT 核心 0.2.1 新增 AVX2 stream 路径，缓存固定寻址表并改进内存预取和压缩函数调用。
自动调优会将其与原有路径对比；新内核会使旧调优缓存失效，建议更新后重新运行一次自动调优。
测试方法、结果和适用范围见 `native/bnt/REPORT.zh-CN.md`。

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

## GPU + CPU 双任务

1.0.25 支持一组 GPU 矿工与 ZCD CPU 矿工同时运行。`src/dual-tasks.cjs` 管理独立配置、启动锁和任务状态，复用两个独立 `Miner` / `FeeController` 实例。两路共用一个序列化账本，按币种与钱包分键，保留旧账本余额，不迁移或清零。

`renderer/dual.js` / `dual.css` 提供紧凑任务卡、真实算力曲线、独立启停及日志筛选；主窗口、悬浮卡片不相加不同算法的算力。新增 `tests/dual.test.cjs` 验证并发、异常、停止与账本隔离，`tests/dual-smoke.cjs` 验证四语言及伸缩布局。`GOZER_UI_TEST=1 GOZER_DUAL_TEST=1` 使用独立 `GOZER_TEST_DATA` 路径执行界面测试，测试不会启动矿工。

已验证双进程控制及单挖回归；真实矿池双挖的长时间稳定性和不同硬件资源竞争仍需设备实测。

### BNT 内核与下载（1.0.37）

- 工作台保留默认 Gozero Blocknet CPU 0.2.1，也可选择 Seine 0.2.15；先到“币种与内核库”点击下载并安装，再选择内核，自动保存后手动启动。
- Seine 直接从作者 GitHub 下载原版 ZIP，固定校验安装包、EXE、DLL 和许可证文件 SHA256，不随助手打包，不自动挖矿。当前接入 CPU 后端，遵循约 2 GiB/线程与系统预留内存限制。
- Seine 内核费为 2.5%（bntpool.com 及其子域名为 1%），独立于助手 0.5% 服务费及矿池费；保留上游计费逻辑。工作台公开显示费率。
- 支持 TCP 主矿池和备用地址；连续 90 秒未恢复任务时先停止旧进程再切换备用地址。TLS 不会自动降级。连接中断不沿用旧算力。
- 使用实际哈希计数增量生成采样，再计算 5/10 分钟算力统计。停止、退出及助手异常退出由原有 Windows Job Object 管理矿工进程。
- 自动调优仅用于 Gozero 内核。新 stream 路径只作为实测候选，默认路径保持不变；并非所有 CPU/线程数都更快。
- 内核库提供 [Blocknet Core 0.20.0 官方下载](https://github.com/blocknetprivacy/core/releases/tag/v0.20.0)。这是需要同步链的全节点单挖程序，不能作为当前工作台的矿池内核。

## Gozero 矿池账本（1.0.38）

YSR、ZCD、BNT 使用已保存的地址自动查询 `https://pool.gozero.trade/portal-api/{coin}`。
仅在主矿池为对应 Gozero 域名时启用，不把自定义矿池记为 Gozero 收益。
算力/Worker/份额约30秒查询；钱包、分页支付与动态规则约60秒查询。
金额采用最小单位整数字符串和 BigInt，保留8位精度。错误、429和服务端缓存状态保留旧数据并退避；空值不补零。
YSR 链上余额与本池已索引奖励分开，ZCD/BNT 可用、未成熟、预留、已付分开。BNT PPLNS 预估说明保留。
双挖工具栏的 GPU/CPU 矿池账本按钮按对应任务的收款地址查询，不停止挖矿。
