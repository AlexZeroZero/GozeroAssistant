Gozero助手 Mac Beta 0.1

运行要求
Apple Silicon（arm64），macOS 13.5 或更新。当前只在 Apple M3 实机验证。
独立 Electron 应用，内置 Node、NOID Metal / PMULL 内核；运行不需要安装 Xcode。
开发构建使用 ad-hoc 签名，尚无 Developer ID 签名或 Apple 公证。

操作
1. 双击 Gozero助手.app，打开“挖矿工作台”。
2. 输入自己的 NOID 主网公开收款地址，选择矿池和计算模式。
3. 默认 Metal GPU；可选 CPU 2 / 4 / 8 线程协同，不保证协同更快。
4. 选择本次时长（1 / 3 / 5 / 10 分钟），点击“一键挖矿”。
5. “停止”结束任务；关闭窗口或退出应用也会停止内核。
   最小化保持任务运行。打开应用不会自动挖矿。
6. “本机测试”执行自检和30秒离线测速，不连接矿池、不需要钱包。

界面沿用原版 Gozero 的图标、紫黑主题、导航与面板样式。
支持设备总览、CPU逐核/GPU利用率、统一内存、钱包与矿池保存、
实时算力曲线、有效份额、运行日志、深浅主题和严重热状态停止。
配置与报告：~/Library/Application Support/gozero-assistant-mac/
可以从界面打开目录或导出日志。没有默认收款地址。

范围
这是 NOID 有界测试版 GUI，每次最多10分钟。PRL、QTC 尚未适配。
浮窗、托盘、租赁、自动更新等 Windows 功能尚未移植。
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
