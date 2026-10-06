# Gozero Mac 开发测试包与局域网连接

这是**源码构建测试包**，不是已编译的 Gozero Mac 应用。目前包含 NOID
算术、PMULL / Metal 源码、自检和短基准测试；尚无可连接矿池的 Mac 完整助手。
不需要填写钱包，不会进行池挖矿。正式 `.app` / `.dmg` 要在 Mac 上完成构建、
适配及验证后再提供。

## 推荐：Windows 操作，Mac 负责编译和测试

1. 让 Windows 和 Mac 接入同一个局域网。Mac 保持开机、连接电源；测试期间
   保持唤醒。首次 GPU 检查建议 Mac 已登录桌面。
2. Mac 打开“系统设置 → 通用 → 共享 → 远程登录”，开启并允许你的用户登录。
   不需要打开“远程管理”，也不需要开放互联网端口或路由器端口映射。
3. 记下页面显示的 SSH 用户名和地址，例如 `ali@192.168.1.23`。
   用户名是 Mac 账户短名称，不是 Apple ID 邮箱。
4. Windows PowerShell 执行 `ssh ali@192.168.1.23`，首次连接确认主机身份后，
   在本机终端输入 Mac 登录密码。密码不会在终端回显。不要把密码或私钥发到聊天。
5. 登录后运行 `uname -m` 和 `sw_vers`；M 芯片原生会话应显示 `arm64`。
   执行 `exit` 返回 Windows。

首次主机指纹可在 Mac 终端用下列只读命令查看，并与 Windows SSH 提示比较：

```sh
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

### 让开发助手继续远程构建

提供 `用户名@IP` 即可先尝试只读连接检查。已有 SSH 密钥登录时可以直接使用。
如果只能密码登录，先由你在 Windows 终端完成一次登录和公钥授权，之后助手再
使用该密钥；私钥留在 Windows 本机。不要关闭主机身份校验。

手动设置专用密钥的示例（文件已存在时不要覆盖，使用已有密钥或换一个文件名）：

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\gozero_mac"
Get-Content "$env:USERPROFILE\.ssh\gozero_mac.pub" | ssh ali@192.168.1.23 'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys'
ssh -i "$env:USERPROFILE\.ssh\gozero_mac" ali@192.168.1.23
```

若密钥设置了口令，使用本机 SSH agent 解锁后再交给自动化连接；无需公开口令。

## Mac 构建环境

- Apple Silicon，原生 arm64 Python 3。
- Xcode / Command Line Tools，包含 Clang 和 macOS SDK。离线生成 metallib
  需要 Metal Toolchain；没有它时，默认使用系统 Metal 运行时编译接口。
- 启动一次 Xcode 完成必要组件安装和许可设置。多个 Xcode 并存时，选择正确的
 开发工具目录。
- 检查：`xcrun --find clang++`、`xcrun -sdk macosx --find metal`、
  `xcrun -sdk macosx --find metallib`。

现代 Xcode 如提示缺失 Metal Toolchain，可在 Xcode 的组件设置安装它；
支持该命令的 Xcode 也可执行 `xcodebuild -downloadComponent MetalToolchain`。
本测试包不自动安装系统工具、接受许可或修改系统设置。

已在一台 M3 上验证：Command Line Tools + 系统 Metal 运行时编译可完成
CPU 和 GPU 自检，不必为了这项自检单独等待完整 Xcode。

注意：`uname -m` 显示 arm64，不代表 `python3` 也是原生 ARM64。请执行
`python3 -c 'import platform; print(platform.machine())'` 检查；旧 Intel Python
可能仍通过 Rosetta 运行，无法加载 ARM64 测试库。可以用 `GOZERO_PYTHON`
指定原生解释器。开发环境也可按 `python-runtime.json` 中固定的 URL / SHA256
准备独立运行时，解压在测试目录的 `python/` 下，与 `Gozero-Mac-DeveloperKit/`
并列；启动器会优先使用它，不改动系统 Python。

## 拷贝与执行

把 `Gozero-Mac-DeveloperKit.zip` 拷到 Mac，解压后双击
`Run-Mac-Checks.command`。也可以从终端执行，避免 Finder 可执行权限差异：

```sh
cd ~/Gozero-Mac-DeveloperKit
/bin/zsh Run-Mac-Checks.command
```

默认运行 CPU 与 Metal 正确性检查，再做 32 个候选的短基准。
仅需检查 CPU、明确跳过 Metal 时：

```sh
/bin/zsh Run-Mac-Checks.command --cpu-only
```

Windows → Mac 的命令示例（替换用户名、IP 及本机 ZIP 路径）：

```powershell
scp "D:\网格化指数系统\gozero-macos\desktop\dist\Gozero-Mac-DeveloperKit.zip" ali@192.168.1.23:~/
ssh ali@192.168.1.23 'mkdir -p ~/Gozero-Mac-Test; ditto -x -k ~/Gozero-Mac-DeveloperKit.zip ~/Gozero-Mac-Test'
ssh ali@192.168.1.23 'cd ~/Gozero-Mac-Test/Gozero-Mac-DeveloperKit && caffeinate -i /bin/zsh Run-Mac-Checks.command'
scp 'ali@192.168.1.23:~/Gozero-Mac-Test/Gozero-Mac-DeveloperKit/desktop/artifacts/mac-check-*.zip' .
```

已有测试目录时，建议换一个新的目录名解压，保留上一轮结果。
诊断包保存到 `desktop/artifacts/mac-check-时间-随机标识.zip`。即使构建失败也会
保存诊断。可将诊断包提供给开发助手定位问题；其中包含环境、源文件哈希和构建
日志，不包含 SSH 私钥或钱包配置。旧运行留下的报告不会当作本次成功结果。

## 需要远程看 Mac 桌面时

SSH 足够完成构建、测试与日志读取。后续验证助手窗口、托盘和浮窗时，可在 Mac
同一个“共享”页面开启“屏幕共享”，再用 Windows 上兼容 macOS 屏幕共享的 VNC
客户端连接。图形远控用于 UI 验证，不是编译的必要条件。

下一步依次是：实机自检通过 → Mac 矿池与任务调度接入 → 有效份额验证 →
Gozero 紧凑界面适配 → `.app` / `.dmg` 测试包。短基准不能替代持续矿池算力。
