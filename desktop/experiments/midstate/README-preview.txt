Gozero MDS Core 0.1.11 / Gozero助手 1.0.48 本地测试版

针对3090稳定14.83K与矿池繁忙断线的检查：
- 新增线程块和计算分段自动实测；差异不足3%优先较保守配置。
- 矿池提交窗口默认4；繁忙后降为1并退避，重连仍保留限制。
- 不重复提交已拒绝或未确认份额，不修改accepted统计口径。
- 启动及30秒诊断显示U/线程块/分段/批量，提交队列改为可读日志。
- 初始哈希、百万轮链、CPU完整复核、最高档90%预算保持一致。
- 本轮本机ABBA算力差异约+0.06%，视为持平；没有验证出大幅提速。

本地验证GPU：RTX5060Laptop。3090/4090仍需实测，不保证18K。
启动短探测不是长期速度或收益保证；完整实测报告见PERFORMANCE.txt。

助手：解压1.0.48到新目录，选择MDS，安装0.1.11核心，填写自己的MSS
可重复收款地址并确认，选设备和性能档，一键挖矿。不要同时运行旧版。
启动先进行短时本机调优和完整自检，期间尚未连接矿池。
默认 stratum+tcp://mds.gozero.trade:13333，当前只支持单TCP节点。
50/75/100档对应45%/67.5%/90%计算预算；温度保护保留。
助手服务费0.5%，独立核心无额外内核费。MDS价格/收益估算暂未接入。

独立核心：
  GozeroMdsCore.exe --backend cuda --payout-address YOUR_MSS_ADDRESS --worker Rig1 --mss-confirmed --duty 0.9 --duration 60
需较新NVIDIA驱动（PTX9.0），无需Python/CUDA Toolkit。不更改时钟、
电压、功率限制、风扇或安全软件。无参数不会自动挖矿。
独立核心不自带温控，助手和测试脚本负责温控。

3090新旧对比：
停止其它矿工后双击COMPARE-CUDA.cmd，选择旧版1.0.47内的：
  resources/app/native/mds/GozeroMdsCore.exe
脚本校验旧核心SHA256，按旧/新/新/旧顺序离线测试，每轮30秒，同90%预算。
每轮冷却至64°C后开始，达到85°C立即停止；不连矿池，不更改设备设置。
记录温度/频率/功耗/算力，保存在comparison-时间/RESULT.json。
PowerShell参数：-GpuIndex / -Seconds / -Duty / -Baseline。
TEST-CUDA.cmd用于当前核心短测；TUNE-RTX仅用于通用WGSL后端。

高级参数：--cuda-batch 0自动，显式64..65536；--cuda-unroll 0自动，显式1/2/4/8。
--cuda-dispatch 0自动（显式1..32000）；--cuda-block 0自动（32/64/128/256）。
--backend gpu保留WGSL，--backend cpu保留CPU；默认后端仍为gpu。
N/s计实际执行的链工作等效量，completedBatchNonces只计完整交付批次。
探测不计入算力，locallyVerifiedShares不等同矿池accepted或收入。
GPLv3许可证、来源和可重建源码随包提供。

