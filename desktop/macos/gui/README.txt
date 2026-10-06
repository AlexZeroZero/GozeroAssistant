Gozero助手 Mac 0.1.4

运行要求
Apple Silicon（arm64），macOS 13.5 或更新。当前只在 Apple M3 实机验证。
独立 Electron 应用，内置 Node、NOID Metal / PMULL 内核；运行不需要安装 Xcode。
开发构建使用 ad-hoc 签名，尚无 Developer ID 签名或 Apple 公证。

操作
1. 双击 Gozero助手.app，打开“挖矿工作台”。
2. 输入自己的 NOID 主网公开收款地址，选择矿池和计算模式。
3. 默认 Metal GPU；可选 CPU 2 / 4 / 8 线程协同，不保证协同更快。
4. 选择本次时长（1 / 3 / 5 / 10 分钟），点击“一键挖矿”。
5. “停止”结束任务；关闭主窗口收起到顶部菜单栏，任务继续。
   菜单栏显示实际算力，可打开窗口、停止任务或退出；⌘Q 退出会停止内核。
   隐藏窗口时运行时限仍有效。打开应用不会自动挖矿。
6. “本机测试”执行自检和30秒离线测速，不连接矿池、不需要钱包。

界面沿用原版 Gozero 的图标、紫黑主题、导航与面板样式。
支持设备总览、CPU逐核/GPU利用率、统一内存、钱包与矿池保存、
实时算力曲线、有效份额、运行日志、深浅主题和严重热状态停止。
配置与报告：~/Library/Application Support/gozero-assistant-mac/
可以从界面打开目录或导出日志。没有默认收款地址。

范围
当前版本提供 NOID 挖矿 GUI，每次运行最多10分钟。PRL、QTC 尚未适配。
顶部菜单栏支持算力及任务控制；桌面浮窗、租赁、自动更新尚未移植。
原版 0.5% 软件服务费控制器及累计账本保留；内核费0%。
温度与功耗未接入时显示“—”；系统热状态不等于摄氏温度。
算力是本地真实采样，不能当作矿池长期结算算力或收益。

开发验证
node --test desktop/macos/gui/tests/gui.test.cjs
在 Mac 使用 desktop/macos/package_gui.py 构建；必须提供 SHA256 校验过的
Electron ZIP 和已验证的 CPU-GPU CLI ZIP。版本固定在 electron-runtime.json。
通过 --profile-dir=绝对路径 --ui-smoke 可在隔离配置中执行GUI自动检查。
默认只做离线检查；只有显式提供 GOZERO_SMOKE_WALLET_FILE 才测试矿池。
GOZERO_SMOKE_SHUTDOWN_ACTIVE=1 可追加运行中退出检查；调用方需验证无残留进程。
生产启动不传上述测试参数，不会运行自动检查或自动挖矿。

矿池选项包含 Innovlab 六个地区、Suprnova 四个地区，及欧洲 TCP 兼容入口，共两家运营方。
TLS 节点来自官方页面；TCP 兼容入口使用 2026-10-06 核实的 Suprnova 欧洲 IP，非加密，需主动选择。区域可达性随网络变化。
自定义节点需兼容所选矿池的 NOID Stratum 协议，不支持 HTTP 矿池。
