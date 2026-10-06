/* Shared UI/menu/log translations. Protocol values and saved logs stay intact. */
(function(root){
'use strict';
const entries=`
Gozero助手 Mac|Gozero Assistant Mac
Gozero助手|Gozero Assistant
切换主题|Change theme
最小化|Minimize
最大化／还原|Maximize / restore
收起到顶部菜单栏，任务继续|Hide to menu bar; keep mining
▦ 设备总览|▦ Devices
⌁ 本机测试|⌁ Benchmark
ϟ 挖矿工作台|ϟ Mining
▣ 运行日志|▣ Logs
⚙ 偏好与保护|⚙ Settings
◈ 信息窗口|◈ About
设备总览|Devices
本机实时|Live
正在读取设备|Reading devices
⌗ 重新扫描|⌗ Rescan
Metal · 统一内存|Metal · Unified memory
参与设备|Device
读取中…|Loading…
☑ 当前计算设备|☑ Active device
GPU 设备利用率|GPU utilization
系统统一内存|Unified memory
温度 / 功耗|Temperature / Power
共享内存容量，不是独立显存容量|Shared memory capacity, not dedicated VRAM
无法读取的传感器显示 —|Unavailable sensors show —
GPU 参数|GPU details
由这台 Mac 实际读取|Read from this Mac
CPU各核利用率|CPU usage per core
系统累计时间差分采样|Sampled from OS CPU time counters
统一内存 / 系统|Memory / System
内存占用|Memory usage
系统占用包含缓存等内存|System usage includes caches
设备就绪后可开始|Start when devices are ready
默认使用 Metal GPU。CPU 协同可选，更多线程不保证算力更高。|Metal GPU is the default. Optional CPU mining may not improve hashrate.
进入挖矿工作台 ↗|Open mining ↗
CPU 闲置率和 GPU 利用率是不同指标。设备忙碌率也不代表内核效率已经最优。监控不会自动开始挖矿。|CPU idle time and GPU utilization are different measures. High usage does not imply optimal efficiency. Monitoring never starts mining.
本机算力测试|Local benchmark
不连接矿池|Offline
▶ 30s 离线测速|▶ 30s benchmark
CPU / Metal 自检 → 预热 → 实际搜索|CPU / Metal self-test → Warmup → Search
等待本机测试|Ready to benchmark
使用工作台保存的计算模式；无需填写钱包地址。|Uses the saved mining mode. No wallet required.
结果是离线搜索吞吐，不等于矿池长期有效算力或收益。预热与自检不包含在30秒测速区间内。|Offline search throughput is not sustained pool hashrate or earnings. Self-test and warmup are outside the 30-second measurement.
GPU 算力|GPU hashrate
CPU 算力|CPU hashrate
日收益|Daily earnings
以矿池实际结算为准|Based on actual pool payouts
运行中可随时停止|Stop at any time
■ 停止测试|■ Stop test
打开测试报告|Open reports
如何比较模式|Comparing modes
在挖矿工作台选择「GPU」或「GPU＋CPU」并保存，然后分别运行本机测试。请勿同时启动多个矿工。持续发热、功耗分配和系统负载都会影响结果。|Save GPU or GPU + CPU mode in Mining, then benchmark each separately. Avoid concurrent miners. Heat, power allocation and system load affect results.
目前只对这台 M3 完成验证。4／8 CPU线程尚未证明显著、稳定的持续增益。|Validated on this M3 only. A significant sustained gain from 4 or 8 CPU threads has not been established.
挖矿工作台|Mining
待机|Idle
此 Mac 版尚无可用内核|No compatible Mac kernel yet
Mac 未适配|Not on Mac
原生 arm64|Native arm64
收款地址|Wallet
填写自己的 NOID 主网公开地址|Enter your public NOID mainnet address
矿机名|Worker
矿池节点|Pool
矿池与地区|Pool and region
矿池协议|Pool protocol
矿池 ↗|Pool ↗
主机 / 端口|Host / Port
矿池端口|Pool port
连接方式|Transport
TLS 加密（校验证书）|TLS (verified certificate)
TCP 兼容（非加密）|TCP (unencrypted)
计算模式|Mode
Metal GPU（默认）|Metal GPU (default)
GPU＋2 个 CPU 线程|GPU + 2 CPU threads
GPU＋4 个 CPU 线程|GPU + 4 CPU threads
GPU＋8 个 CPU 线程|GPU + 8 CPU threads
本次时长|Duration
1 分钟|1 minute
3 分钟|3 minutes
5 分钟|5 minutes
10 分钟|10 minutes
矿工内核|Kernel
内置 · 启动校验|Bundled · Verified at startup
费用规则|Fees
内核费 0% · 软件服务费 0.5%|Kernel 0% · Service fee 0.5%
按有效运行时间分时累计|Accrued over eligible runtime
保存配置后手动启动；到时自动停止|Save and start manually; stops at the time limit
保存配置|Save
▶ 一键挖矿|▶ Start mining
■ 停止|■ Stop
合计本地算力|Total local hashrate
等待真实采样|Waiting for samples
当前实际计算贡献|Actual compute contribution
未启用协同时为 0|Zero when CPU mining is off
接受|Accepted
拒绝|Rejected
提交|Submitted
运行|Runtime
算力采样|Hashrate samples
本轮连接 · 每秒采样|Current session · 1s samples
等待矿工输出|Waiting for miner output
本地算力曲线|Local hashrate chart
运行日志|Logs
最近12条|Last 12 entries
全部日志 ↗|All logs ↗
Mac 测试版每次最多运行10分钟，不自动续跑。软件服务费沿用原版分时账本，短任务余额会累计；收益按矿池结算。|Sessions are limited to 10 minutes and do not restart automatically. The original service-fee ledger carries balances across short runs. Payouts are determined by the pool.
打开结果目录|Open results
导出日志|Export logs
偏好与保护|Settings
监控刷新间隔|Monitor refresh
1 秒|1 second
2 秒|2 seconds
5 秒|5 seconds
界面主题|Theme
紫黑 · 深色|Purple · Dark
浅色|Light
系统热状态达到严重／临界时停止任务|Stop on serious or critical thermal state
读取 macOS 系统热状态，不冒充摄氏温度。温度与功耗传感器未接入时显示 —。|Uses the macOS thermal state, not a Celsius estimate. Unavailable temperature and power sensors show —.
保存设置|Save settings
任务生命周期|Window and task behavior
关闭主窗口会收起到顶部菜单栏，当前任务继续运行。菜单栏显示实时算力，可打开窗口、停止任务或退出助手；退出或按 ⌘Q 会停止内核。达到所选时限仍会自动停止。应用启动、系统唤醒均不会自动开始新的挖矿任务。|Closing the window hides it to the menu bar and keeps the task running. Use the menu bar to view hashrate, reopen, stop or quit. Quit or ⌘Q stops the miner. The session time limit still applies. Launching or waking the app never starts a new task.
配置与运行结果保存在本机。此 Mac 版使用独立配置目录，不共享 Windows 设置。|Settings and results stay on this Mac in a separate profile from Windows.
打开配置目录|Open profile
官方网站 ↗|Website ↗
与 Gozero 助手一致的操作界面|The Gozero Assistant interface for Mac
沿用原版品牌、紫黑色主题与顶部导航，为 Mac 接入 Metal GPU 和 ARM PMULL 核心。|The original branding, purple theme and navigation with native Metal GPU and ARM PMULL support.
当前提供 NOID 挖矿、设备监控、离线测速、公开服务费调度、实时日志与结果导出。支持顶部菜单栏算力显示；PRL、QTC、租赁市场及自动更新尚未在此 Mac 版本适配。|Includes NOID mining, device monitoring, offline benchmarks, disclosed service fees, logs, exports and menu-bar hashrate. PRL, QTC, rentals and auto-update are not available on Mac yet.
已验证：Apple M3。其他 M 系列仍需实机验证。高 CPU 占用不代表更高算力，协同模式为可选实验功能。|Tested on Apple M3. Other M-series chips need hardware validation. High CPU usage does not guarantee higher hashrate; CPU collaboration is optional and experimental.
独立 Mac 应用，尚无开发者分发签名或公证。不会修改系统安全设置。|Independent Mac app without Developer ID signing or notarization. System security settings are not changed.
正在连接本机设备|Connecting to local devices
热状态 —|Thermal state —
本机数据 · 不自动挖矿|Local data · No auto-mining
设备|Device
GPU 核心|GPU cores
内存架构|Memory
统一内存|Unified memory
架构|Architecture
设备利用率|Utilization
核心温度|Core temperature
整机功耗|System power
物理核心|Physical cores
当前利用率|Current usage
性能核|Performance cores
能效核|Efficiency cores
容量|Capacity
空闲|Free
系统|System
热状态|Thermal state
正常|Nominal
偏热|Fair
严重|Serious
临界|Critical
扫描中|Scanning
等待有效计算|Waiting for work
矿池暂停，等待新任务|Pool paused; awaiting work
持续计算中|Mining
断线重连中|Reconnecting
启动中|Starting
离线测速中|Benchmarking
运行中|Running
停止中|Stopping
初始化|Initializing
本机设备已连接|Device connected
正在读取本机设备|Reading devices
系统热状态：|Thermal state: 
最后一次采样 / 待机|Last sample / idle
真实本地算力 · 非矿池结算|Local hashrate · Not pool-side
当前为用户收款时段|Mining to your wallet
分时服务费 0.5% · 余额跨任务累计|0.5% service fee · Balance carries over
离线自检／测速，不连接矿池|Offline self-test / benchmark
不会自动挖矿；关闭窗口收起到菜单栏；退出才停止任务|No auto-mining. Close hides; Quit stops.
测速进行中…|Benchmarking…
本次结果已保存到本机报告目录|Results saved to local reports
正在执行算法自检、预热与30秒搜索|Self-test, warmup and 30-second search
等待实际算力|Waiting for hashrate
自定义节点|Custom endpoint
挖矿配置已保存|Mining settings saved
设置已保存|Settings saved
日志已导出|Logs exported
等待采样|Waiting for sample
等待矿池|Waiting for pool
重连中|Reconnecting
等待计算|Waiting for work
读取配置|Loading settings
打开主窗口|Open main window
停止挖矿 / 测速|Stop mining / benchmark
退出助手（停止内核）|Quit (stop miner)
关于 Gozero助手|About Gozero Assistant
退出 Gozero助手|Quit Gozero Assistant
编辑|Edit
窗口|Window
Gozero 切换中|Gozero switching
Gozero 测速中|Gozero benchmarking
Gozero 已启动|Gozero started
香港 HK2|Hong Kong HK2
欧洲 EU2|Europe EU2
欧洲 EU|Europe EU
欧洲（Windows 同矿池）|Europe (same pool as Windows)
欧洲二区|Europe 2
欧洲 TCP兼容（非加密）|Europe TCP (unencrypted)
美国 US2|US2
美国 US|US
俄罗斯|Russia
亚太|APAC
美国|US
用户停止|User stopped
菜单栏停止|Stopped from menu bar
本次运行时限已到|Session time limit reached
退出应用|Quit application
启动失败|Startup failed
启动已取消|Startup cancelled
主窗口已收起，任务继续；顶部菜单栏可查看算力、停止或退出|Window hidden; task continues. Use the menu bar to view hashrate, stop or quit.
Gozero助手 Mac 已启动；不会自动挖矿|Gozero Assistant Mac started; mining starts manually
CPU / Metal 自检通过|CPU / Metal self-test passed
TLS 证书已验证|TLS certificate verified
TCP 兼容连接已建立（非加密）|TCP connected (unencrypted)
矿池授权成功|Pool authorized
已完成新任务首批有效计算，持续搜索中|First valid batch completed; search continues
连接中断，等待重连|Disconnected; waiting to reconnect
正在连接矿池|Connecting to pool
本次任务已结束|Session ended
收到有效工作|New valid work received
矿池要求暂停旧任务，保持连接等待新任务|Pool requested a pause; staying connected for new work
原因：|Reason: 
矿池未接受|Not accepted by pool
内核退出码|Miner exit code
无效算力采样|Invalid hashrate sample
离线自检和30秒测速已启动，不连接矿池|Offline self-test and 30-second benchmark started
正在校验内核并连接矿池|Verifying miner and connecting to pool
TLS 加密|TLS encrypted
内核|Miner
矿池|Pool
任务|Work
份额|Share
算力|Hashrate
连接|Connection
结果|Result
报告|Report
错误|Error
停止|Stop
测速|Benchmark
挖矿|Mining
提示|Notice
配置|Settings
服务费|Service fee
服务费0.5%；挖矿与收益测试统一累计，短测试未满服务时段的余额保留至后续任务|Service fee 0.5%; balances accrue across mining and short test sessions.
恢复用户收款地址；软件服务时段已结束|Resuming your wallet; service-fee interval ended
请先停止当前任务或等待设备扫描完成|Stop the current task or wait for the device scan
已有命令行内核在运行，请先停止它，避免重复占用设备|A command-line miner is already running; stop it first
系统处于严重热状态，请冷却后再试|Serious thermal state; allow the system to cool
系统报告严重热状态，已停止任务|Task stopped due to serious thermal state
停止任务后再修改配置|Stop the task before changing mining settings
请先停止任务|Stop the task first
配置格式无效|Invalid settings format
请输入有效的 NOID 主网公开收款地址|Enter a valid public NOID mainnet address
请先填写自己的 NOID 收款地址|Enter your NOID wallet address first
矿机名限字母、数字、下划线和连字符|Worker name allows letters, digits, underscores and hyphens
矿池协议不支持|Unsupported pool protocol
Innovlab 必须使用 TLS；TCP 兼容仅限 Suprnova|Innovlab requires TLS; TCP compatibility is for Suprnova only
矿池主机名无效，不要填写协议或路径|Invalid hostname; omit the scheme and path
矿池端口无效|Invalid pool port
CPU 线程数无效|Invalid CPU thread count
本次时长需要 1、3、5 或 10 分钟|Duration must be 1, 3, 5 or 10 minutes
偏好设置无效|Invalid preferences
语言设置无效|Invalid language
已有运行任务|A task is already running
本次运行时限已到|Session time limit reached
离线校验报告无效|Invalid offline validation report
测速报告过大|Benchmark report too large
内核输出过大|Miner output too large
 % 系统占用| % system usage
0.5% 服务时段|0.5% service-fee interval
账本保存失败：|Could not save fee ledger: 
公开服务费调度：切换到|Service-fee schedule: switching to 
用户收款时段|your wallet interval
服务时段启动超时|Service interval startup timed out
调度异常，停止全部任务：|Scheduler error; stopping all tasks: 
服务费调度失败|Service-fee scheduler failed
配置无法读取，已使用默认值；原文件保留。|Settings could not be read; using defaults. Original file preserved.
语言|Language
`.trim().split('\n').map(row=>row.split('|'));
const dictionary=Object.fromEntries(entries),ordered=Object.keys(dictionary).sort((a,b)=>b.length-a.length);
const pattern=new RegExp(ordered.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
const rules=[
 [/^本次最多 (\d+) 秒，到时自动停止$/,(_,n)=>`Stops automatically after ${n}s`],
 [/^已采样 (\d+) 点$/,(_,n)=>`${n} samples`],
 [/^最近1秒有效工作 (.+) · GPU (.+) \/ CPU (.+) · 接受 (\d+) \/ 拒绝 (\d+)$/,(_,n,g,c,a,r)=>`Last 1s valid work ${n} · GPU ${g} / CPU ${c} · Accepted ${a} / Rejected ${r}`],
 [/^已提交 #(.+)，等待矿池确认$/,(_,id)=>`Submitted #${id}; awaiting pool confirmation`],
 [/^NOID share accepted · #(.+) · 累计接受 (\d+)$/,(_,id,n)=>`NOID share accepted · #${id} · Total accepted ${n}`],
 [/^矿池等待 ([\d.]+) 秒，收到新任务 · (.+)$/,(_,n,id)=>`Pool wait ${n}s; new work · ${id}`],
 [/^30秒离线总算力 (.+)$/,(_,n)=>`30s offline total hashrate ${n}`],
 [/^接受 (\d+) \/ 拒绝 (\d+)；(.+)$/,(_,a,r,reason)=>`Accepted ${a} / Rejected ${r}; ${reason}`],
 [/^已连接 (.+)$/,(_,device)=>`Connected ${device}`],
 [/^结算已累计服务时间，最多60秒；随后(.+)$/,()=>`Settling accrued service time, up to 60s; then resuming your task`],
 [/^(.+) 服务时段开始，收款地址 (.+)；最多 ([\d.]+) 秒$/,(_,coin,w,n)=>`${coin} service interval started, wallet ${w}; up to ${n}s`],
];
function t(value,language='zh'){const s=String(value??'');if(language!=='en')return s;for(const [r,fn] of rules)if(r.test(s))return s.replace(r,fn);return s.replace(pattern,key=>dictionary[key]);}
const textSources=new WeakMap(),attrSources=new WeakMap();
function localize(document,language){
 document.documentElement.lang=language==='en'?'en':'zh-CN';
 const walker=document.createTreeWalker(document.body,4);let node;
 while((node=walker.nextNode())){
  if(['SCRIPT','STYLE'].includes(node.parentElement?.tagName)||node.parentElement?.closest('[data-no-i18n]'))continue;
  const old=textSources.get(node),source=old&&node.nodeValue===old.output?old.source:node.nodeValue;
  const output=t(source,language);textSources.set(node,{source,output});if(node.nodeValue!==output)node.nodeValue=output;
 }
 for(const element of document.querySelectorAll('[title],[placeholder],[aria-label]')){
  const saved=attrSources.get(element)||{};
  for(const key of ['title','placeholder','aria-label'])if(element.hasAttribute(key)){const current=element.getAttribute(key),old=saved[key],source=old&&current===old.output?old.source:current,output=t(source,language);saved[key]={source,output};if(current!==output)element.setAttribute(key,output);}
  attrSources.set(element,saved);
 }
 document.title=t('Gozero助手 Mac',language);
}
const api={t,localize,dictionary};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.gozeroI18n=api;
})(globalThis);
