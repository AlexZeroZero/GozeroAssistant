Gozero · QTC / PRL 苹果 M 系列实验核心

这是命令行核心测试包，尚未接入 Gozero 助手正式 GUI。
已在 Apple M3 / macOS 26.5.1 验证；其他 M 系列尚未实测。
目标系统为 Apple Silicon macOS 14+，不支持 Intel Mac。

使用方法
1. 双击 Check-Cores.command，先运行本机计算自检。
2. 双击 Start-QTC.command 或 Start-PRL.command 开始。
3. Ctrl+C 停止；不要与 NOID 或另一核心同时占用 GPU 测速。
4. config.json 可修改公开收款地址、矿池和矿工名，不需要私钥。

两个启动命令均为持续挖矿，没有 10 分钟限制。
测试脚本的定时停止仅用于这次验证，不影响上述启动命令。
PRL 默认接电运行，电池供电时暂停；自检失效会重新验证。

验证范围
QTC：25 组 GPU/CPU 对拍、65920 组算术边界检查、15 组最小哈希
覆盖用例及 15 组无解区间均通过。5 分钟 Kryptex 香港 TLS 实测，
本地平均约 15.70 MH/s，32 个任务，0 重连；提交/接受均为 0。
PRL：cert-v3 的 SG 内核，94 个用例无差异，GPU 计算、构造证明及
官方 Rust 验证器完整流程通过。Kryptex 实测结果见 VALIDATION.json。
PRL cert-v4 尚未通过本机准入验证，不能宣称已经支持。

重要：真实矿池接受份额尚未确认。短时间有算力和收到任务不等于
已验证有效收益，因此本包保留“实验”状态。QTC 和 PRL 的算法与
算力单位不同，不能把这些数值与 NOID 的 MH/s 直接比较。
风扇、温度、批次大小和后台负载会影响持续算力，短测不是长期承诺。

来源与许可
QTC 使用 Quantus 官方 Apache-2.0 核心与独立矿池适配层。
PRL 使用 Apache-2.0 的 pearl-apple-miner 和 ISC 的 Pearl 参考库。
来源、固定提交及改动见 sources.json；构建方法见 BUILD.txt。
licenses、sources 及 Python 依赖随包保留。原 Gozero NOID GUI 未修改。
本包未经过 Apple Developer ID 公证。
