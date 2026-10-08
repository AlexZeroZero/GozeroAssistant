# 1.0.27 release validation (2026-10-08)

- 145 automated tests passed, covering dual-task isolation, start/stop cancellation, shared fee ledger persistence, logical-thread budgets, and owned-process cleanup.
- Dual-workbench, light-theme, and ZCD UI smoke checks passed in isolated profiles. The theme and dual-mode checks exercised Chinese, English, Japanese, and Russian interfaces. No miners were started by these UI checks.
- The earnings-test page, its navigation entry, and workbench test buttons were removed. Normal hashrate monitoring, pool account data, and earnings estimates remain; estimate settings moved to Preferences.
- Two harmless real child processes verified stop isolation; this does not establish mining performance. Real-pool simultaneous GPU + CPU mining has not been tested in this round.
- Windows ZIP CRC and all 155 payload hashes verified. Source files in the package match the published source. XMRig remains an explicit on-demand download, not a bundled executable.
- ZIP SHA256: `d6a39dfbcde52b75ec0096eb43c2957146feb0d09ab5d30d42088c97d0c31efe` (158,796,291 bytes).

Earlier validation records follow; their scope applies to the stated versions only.

# 1.0.24 发布验证（2026-10-08）

- 137项自动化测试通过；覆盖64核128逻辑线程的64/96/128线程档位、128线程内核配置、CPU100%配额以及GPU原有90%上限。
- 四语界面与按需下载安装测试通过；新增硬件总览、ZCD和YSR待机界面截图，无模拟挖矿数值。
- 1.0.23修正ZCD日志渠道；自编译CPU内核离线运行读到有效算力及日志。官方XMRig被本机系统拒绝启动，本轮未完成其实际运行测试。
- XMRig不随助手包分发，自编译/官方内核均为手动下载；压缩包和文件级SHA256另行校验。
- 未进行128线程实体设备性能测试，未宣称ZCD矿池有效份额、结算或杀毒软件兼容性已验收。

以下为历史版本记录，不代表全部功能仍处于同一状态。

# Beta 1.01 租赁市场（包修订1.0.3）

2026-10-03，Windows 11 x64；未进行真实挖矿、下单或支付。

- 本地79项自动化测试通过；公开源码78项通过、1项可选KRig压缩包验证跳过。新增租赁输入校验、固定推荐链接、未知值、缓存合并/过期/故障保留、容量上限与加载重试测试。
- Electron真实接口与界面测试通过：GPU/CPU、4090/5090/3090/PRO6000筛选、分页、搜索、线程筛选、费用试算、卡片节点保留、四语与浅色模式；无渲染错误。四语主界面均无横向或纵向溢出。
- 全部原有四语页面、托盘与悬浮卡片回归通过。
- 发布包132个文件SHA256全部验证，主窗口启动、X进入悬浮卡片与正常退出通过。
- ZIP：158593320字节；SHA256 ef2120bf6b909a1dac4c4a063ab3a813490b9731a6a19fbce7c6020437e08ef0。
- 当前PRO6000查询无可租报价时显示空状态；不使用A6000或其他型号补位。报价受平台库存与更新时间影响。

---
# 1.0 Beta 四语界面与悬浮停止状态（包修订1.0.2）

2026-10-03。

- 新增中文、英文、日文、俄文，顶部/设置入口即时切换并持久化，独立受控IPC只允许白名单语言；旧配置默认中文。主窗、悬浮卡片、托盘菜单同步。
- 本地词典696条源词句；主界面、硬件详情/提示、收益、工作台、矿池账本、安装、状态和常见错误均可切换。原始来源数据不改写，输入值不参与翻译。
- 数值更新通过绑定原文的setText比较后写入，MutationObserver只处理新增/变化的节点和3类提示属性。切换语言保留已有节点及未保存的钱包输入；传感器每次推送不会反复写语言偏好。
- 悬浮停止状态由真实任务会话和状态判定；首次待机、启动、停止中及服务费切换不误报已停止。已停止使用12px加粗状态色块，保留历史均值；原状态字体7.5px。
- GitHub官网、使用指南及软件官网入口均为https://gozero.trade/；行情API、签名更新/下载API继续使用pro.gozero.trade，不更改信任边界。
- 本地74项测试全部通过；公开源码独立目录73通过、1项可选KRig实包测试跳过。
- 隔离Electron四语×六页面、CPU/服务费弹窗、停止/运行状态、动态文本/提示往返翻译、钱包未保存输入和数值节点稳定性通过，无页面横向溢出/控制台错误。截图和report.json在desktop/artifacts/languages/，不公开上传设备截图。
- 打包128个文件哈希、EXE启动/X进入悬浮/明确退出通过；未启动实际矿工。
- ZIP 158576874字节；SHA256 `0ca8164134a40938f396f6a6e5b5a66e7ea561c9ecc7e0190d556888f5a7eaff`。源码提交`bb75955f3742f3a0ebfe63596c263d0d35a75c14`。
- GitHub `v1.0.2-beta`已公开发布，匿名核验3个附件与标签提交通过；官网清单1.0.2/sequence16签名和ZIP首尾Range核验通过。发布记录在DEPLOYMENT.md。

---

# 1.0 Beta 开源与使用指南整理（包修订1.0.1）

2026-10-03。

- QUICKSTART使用说明改为当前操作指南，删除全部0.3系列历史记录与过时的TSC操作步骤。
- 新建独立公开源码目录，仅收录桌面源码、资源、测试、构建脚本、Quantus实验核源码/PTX/许可证，以及配套记录校验模块。排除dist、日志、硬件截图、用户配置、服务端部署文件与所有私钥。
- 自有代码MIT，Quantus派生代码Apache-2.0；闭源KRig不随源码/包分发。
- 从独立目录成功构建。Node测试70项：69通过，1项缺少可选KRig实包而跳过。真实打包126文件哈希和启动/浮窗/退出检查通过；未执行挖矿。
- 发行包158534972字节，SHA256 fb1278e6d569044c1d9f7281ada87aef30ffc131be0e6aa00c5825df59f9dd5c。包含MIT许可证及当前使用说明。
- 源码首次提交2fdcd5d12eab6a81b6f4ad3d4355e38e70b12fcf；待提交文件与ZIP检查未发现私钥、PAT或服务器凭据。
- 已公开发布：https://github.com/AlexZeroZero/GozeroAssistant/releases/tag/v1.0.1-beta 。未登录GitHub API确认公开仓库、预发行状态与标签指向；3个附件大小和SHA256均一致，ZIP的HEAD/Range及两份文本的完整下载通过。源码工作区干净。
- 官网同步1.0.1/sequence15，公网清单签名和完整本地ZIP哈希通过；官网ZIP的长度与首尾Range核验通过。检查记录保存于`.local/github-public-release-verification.json`和`.local/assistant-public-release.json`，不纳入公开仓库。

---

# 1.0 Beta 版本标识

2026-10-03。

- 主窗、更新面板、启动日志和使用说明统一为1.0 Beta，发布通道beta。底层数字版本1.0.0保留旧客户端版本比较和下载路径兼容；不更改挖矿功能或配置目录。
- 旧0.3.12客户端verify/compare实际接受新签名清单（sequence14），判断为升级。
- Electron完整界面检查通过（GOZER_SMOKE_PASS）；首次运行测试遇到一次未定位的executeJavaScript异常，增加诊断信息后重跑通过，未改动产品逻辑规避。
- 打包125文件哈希、EXE启动/关闭浮窗/退出通过；ZIP158538587字节，SHA256 f05914db7c565bd5f03f8881b02f70e3da454fb61e19061ab760522b320468ea。未启动实际挖矿。

---

# 0.3.12 暂停TSC挖矿入口

2026-10-03。

- 工作台、收益卡、手动测算币种、网络卡、服务费地址展示只保留PRL/QTC；移除设备详情中的TSC矿工行。两列铺满原区域。
- 保存配置时拒绝选择未开放币种，现有矿工底层仍拒绝TSC；旧TSC当前币种启动时迁移PRL，保留TSC钱包及手动输入。TSC网络刷新不再加入桌面轮询。
- 隔离配置预置TSC和重复设备编号，Electron检查迁移为PRL、原TSC钱包保留、TSC选项不存在、网络卡两列、PRL/QTC切换及窗口生命周期通过（GOZER_SMOKE_PASS）。未执行挖矿。
- 打包125文件哈希、EXE启动/关闭浮窗/退出通过；ZIP158538728字节，SHA256 f9eba4b0693da8398183a5d17e20b05c76c5b83208dc759bae838a4109b98f33。
- 本次没有新增TSC适配，也未创建官方版本监控任务；后续需取得官方Windows内核并验证后恢复。

---

# 0.3.11 悬浮卡片性能模式

2026-10-03。

- 主工作台与悬浮卡片共用性能模式：50–64%节能、65–89%均衡、90–100%高性能。浮窗任务期间显示session中已应用预算，待机显示保存值。
- 固定宽度模式徽标，三个档位有轻量配色，无新增轮询和动画，不改变288×218窗口尺寸。
- 9项性能/收益/记录回归检查通过；修复会话尚未提供币种时浮窗回退当前配置，零收益保持为0。
- Electron真实窗口检查通过；预置重复设备配置恢复、多模式文本与固定几何、深浅主题、浮窗和托盘生命周期验证完成。未启动实际挖矿。
- 打包125文件哈希及EXE启动/关闭到浮窗/退出通过。ZIP158538432字节，SHA256 ce513b91b5b4ac3678b0c6af50bf51dc1e693102c5753f5e15ddb5822b598124。
- Racer核查：GitHub king-2386/tsc-miner 最新0.9.5提供Linux普通版/数据中心版tar.gz；仓库根目录仅README，无可用于原生Windows移植的源码。用户明确要求原生Windows编译；没有安装WSL、没有将Linux兼容层标记为原生适配。TSC挖矿仍禁用。

---

# 0.3.10 显卡选择编号兼容修复

2026-10-03。

- 本机旧配置同时包含同一 RTX 5060 Laptop 的 UUID 哈希编号和当前 PnP 哈希编号；界面过滤后显示一张，矿工数量校验仍收到两项，复现“所选设备已变化”。
- 启动、重新扫描、保存和启动任务前，仅按当前设备附带的 NVIDIA UUID 证明旧编号与 PnP 编号关系，合并选择并迁移手动输入。同型号多卡不按名称或顺序匹配；未知/冲突编号保留并阻止启动，界面提供显式清理入口。
- 17 项针对性 Node 测试通过，覆盖重复编号、同型号双卡、未知/冲突编号、无 PCI 时重复传感器采样、配置持久化及内核启动校验。校正后通过设备校验并到达模拟的内核校验，未启动矿工。
- 隔离配置预置旧/新双编号，真实 Electron 启动自动修复成功；保存、重新扫描、失效项提示/清理，以及既有界面/收益/浮窗/托盘检查通过（GOZER_SMOKE_PASS）。
- 0.3.10 安装包 124 文件哈希、独立 EXE 启动/浮窗/退出通过。ZIP 158537326 字节，SHA256 dec0e6d9ae646923dbad4c04fb9c109cb9e668ed43f45404e5ace772559dc961。
- 签名更新清单 sequence11。没有修改用户正在运行的实例，没有执行真实挖矿或支付。

---

# 0.3.9 下载版硬件扫描兼容修复

2026-10-03。

- 根因：RemoteSigned会拒绝带Internet区域标记、未签名的inventory.ps1；非UTF-8的PowerShell错误输出显示乱码。
- 使用自编译Inventory.exe，通过固定WMI查询和Configuration Manager只读设备属性保持CPU/内存/主板/BIOS/缓存/PCI参数。运行不依赖PowerShell、不修改执行策略、不删除下载标记。
- 12项针对性检查通过。复制旧PS1并设置Zone.Identifier=3，在子进程RemoteSigned下复现UnauthorizedAccess；同样带标记的原生组件在继承Restricted/AllSigned的环境下扫描成功。组件缺失/超时/权限/服务异常/格式错误均转换为中文提示。
- 本机读取Core Ultra9 275HX、Intel核显PCI00:02.0和RTX5060 Laptop PCI01:00.0、两条内存及缓存/主板/BIOS成功；无来源警告。
- Electron完整界面检查通过，硬件监测节点稳定、池账本、浮窗及托盘回归成功。未启动真实挖矿。
- 123文件哈希、打包EXE启动/悬浮/退出通过；最终打包Inventory.exe在AllSigned子环境中扫描成功，发行包不存在inventory.ps1。
- ZIP158535522字节，SHA256：90f1f15905bc6753c057ce444fada060b083a6d34bad563242a281a9c2fbf9fd。

---

# 0.3.8 矿池实际收益与悬浮卡片

2026-10-03。

- 39项针对性Node检查通过：公开固定域名/币种/地址路由、微小余额和0值、支付状态、查询合并/60秒节流、分接口缓存错误标记、切换地址丢弃旧显示，以及已有算力窗口、配置、收益、服务费、浮窗回归。
- Kryptex官方网页公开脚本确认余额、支付统计和记录端点；PRL/QTC公开API只读访问成功。Electron真实接口读取QTC已确认余额及空支付记录成功，未发起支付或设置修改。
- UI检查矿池数据与估算分开、记录弹窗、Gozero助手名称、90°C新配置默认值通过。已有温度阈值保留；恢复默认需要用户点击并保存。
- 288×218透明悬浮卡片截图角落alpha=0、15px圆角及算力字号超过币价两倍验证通过。深浅主题、窗口位置边界、X到托盘/恢复回归通过。算力123GH/s截图是渲染器隔离示意，未执行挖矿。
- 新SVG源图、应用PNG、简化托盘PNG及含16/24/32/48/64/128/256像素ICO已生成；实际打包EXE加载新图标、主窗新名称、关闭到新悬浮窗并正常退出。
- 122文件哈希及ZIP校验通过。ZIP158530942字节；SHA256：db2a6af98183b6c286d83b24172701fbe0be262ac51892f2dc81c6f1e3a42414。
- 证据：artifacts/live-report.json、packaged-report.json、pool-account-live.png、pool-payouts-live.png、floating-hash-fixture-dark.png、floating-hash-fixture-light.png。

限制：当前账本适配Kryptex PRL/QTC，统计该地址在本池的全部矿机；TSC及其它矿池标记未适配。公开余额/支付记录读取不代表本次验证了真实挖矿到账。

---

# 0.3.7 算力均值与备用矿池

2026-10-02。没有启动真实挖矿或提交钱包份额。

- 37项针对性测试通过：固定5/10分钟窗口、逐卡不同采样间隔的时间加权、上一窗口保持、零值/重复/未来/缺测处理、覆盖率、停止状态，以及既有配置/内核/费用/收益/浮窗回归。
- 新加坡→香港→美国的默认顺序、重复URL去重、错误协议/币种/超量备用拒绝、旧全球地址一次性迁移、自定义地址保留、按币保存及第三方内核费保守估算通过。
- 官方PRL/QTC矿池页确认地区域名及SSL8048/8049；已校验KRig1.5.4的只读--help确认重复--url支持原生failover，测试验证命令仅包含同一用户钱包与明确PCI设备。
- 本机只读TLS1.3握手成功：PRL新加坡172ms/香港125ms/美国1750ms，QTC新加坡156ms/香港188ms/美国672ms。仅证明测试时本机连接可达，不是矿池实际认证/份额或所有用户网络保证。
- Electron验证周期与主/备节点保存、断流时均值保持、停止与覆盖提示、紧凑布局、浮窗/托盘等通过；渲染器错误0。人工查看pool-backups.png及紧凑/扩展截图。
- 打包后118个文件哈希、独立EXE启动/X转浮窗/退出通过。ZIP158335111字节，SHA256：882e2b30e0f8057fbb448b0f8728055fb23692f4cc0e2a2b37b2226d5382927c。

限制：均值来自矿工日志，样本最多延用60秒并显示覆盖率，不等于矿池有效接受份额。首次周期、性能切换、服务收款切换、重新开挖重新采集；真实长时矿池故障切换未进行实挖验收。

---

# 0.3.5 挖矿工作台验证

2026-10-02。

- 12项针对性Node测试通过：旧配置自动迁移默认推荐、按币种保存手动选择、拒绝实验核/任意路径/不支持的内核，默认与手动KRig生成一致挖矿参数，以及已有配置和矿工保护检查。
- Electron界面验证通过：操作按钮至少33px、地址输入字号至少11px、切换币种保留内核选择、QTC实验核不可选择。
- 底部日志至少125px，720×540紧凑窗口与720×820扩展窗口均贴合可用底部；最多120个日志节点，更新/淘汰旧记录后保留阅读位置，自动跟随可切换，无横向溢出。
- 实时硬件读取、浮窗/托盘、安装进度、热保护显示、主题与签名更新既有界面检查通过；渲染器错误为0。未启动真实挖矿。
- 证据：artifacts/live-report.json、workbench-compact.png、workbench-expanded.png。
- 打包后116个文件与ZIP哈希验证通过，隔离配置EXE启动/X转悬浮/退出通过。公网HEAD200、首尾Range206与本地一致，Ed25519清单version0.3.5/sequence6验证通过。
- ZIP：158329725字节；SHA256：ad3d7e2103fd3587febd31e7d93faa36113bdd8058d62884b874726be92d0589。

---

# 0.3.4 内核安装兼容修复验证

2026-10-02。

- 根因：旧解压器以PowerShell -File执行未签名PS1，Restricted策略阻止脚本；本地编码stderr显示乱码。
- 改用自编译ExtractKernel.exe，固定名称提取，不执行BAT/矿工/解压脚本，不修改系统执行策略；原PS1不再打包。
- 8项针对性检查通过：真实阶段/双哈希/错误重试/下载流，原生解压中文空格特殊字符路径、重复条目/穿越/缺失/损坏拒绝、坏哈希保留原内核、临时文件清理、错误码中文映射。
- 使用仅限子进程的Restricted策略复现旧脚本UnauthorizedAccess；在继承Restricted环境的新流程中，以固定SHA256的真实KRig 1.5.4 ZIP完成安装和EXE哈希检查。没有执行矿工。
- 对最终打包版本重复真实解压安装验证通过，确认ExtractKernel.exe存在且extract-miner.ps1不在包内；115文件哈希、独立EXE启动/X悬浮/正常退出通过。
- Electron既有界面检查通过。ZIP 158327236字节；SHA256 6e52e12a13da0fd9be5069c294ed41d225ab99ff37bd49e7eefb3a26b7e0bf3e。

---

# 0.3.3 开发版验证记录

2026-10-02。仅调整收费提示布局，计费调度与比例保持不变。
- 主窗口底部常驻低对比度“服务费0.5%”入口；工作台重复收费栏移除；详情仍显示规则、实时收款方及地址。
- 悬浮卡片底部同步提示；主窗口/卡片截图人工复核通过。
- Electron既有界面检查通过：底部入口定位、三币地址详情、稳定布局、字体、安装进度、托盘隐藏与复原、实时硬件/网络，无渲染错误。
- 独立配置EXE启动/X转悬浮/正常退出及115文件哈希验证通过。未执行真实挖矿。
- ZIP：158323612字节；SHA256 ad00c175830233fdd9158d12264c2265b0d4a2d7f9647a5d41169169f7237829。

---

# 0.3.2 开发版验证记录

2026-10-02，Windows 11 x64。

- 43项自动检查通过，新增安装阶段顺序、双SHA256、损坏下载禁止解压、解压/文件/网络失败、可重试、临时文件清理、真实流字节进度、未知长度、截断/超限拒绝。
- Electron界面检查通过：悬浮窗按钮隐藏到托盘、原生关闭隐藏、不被刷新重开、实际托盘菜单复原、保留退出入口；主界面及悬浮窗字号为原来的1.08倍；进度变化不改变安装面板尺寸；未知进度不伪造百分比；成功后显示KRig 1.5.4可用。
- 安装UI截图使用隔离的明确测试数据。自动安装流程使用测试文件校验及注入解压实现；未执行真实矿工、未产生钱包交易。本次未重新下载完整的82MB上游包，固定上游双SHA256未改变。
- 0.3.2 EXE独立配置启动/X转悬浮/正常退出通过；115个文件及整个ZIP SHA256通过。
- 公网HEAD200、首尾Range206、Ed25519更新清单version0.3.2/sequence3及服务器完整ZIP哈希核对通过。
- ZIP大小158,323,396字节，SHA256：984c9cf82376bceadaaf87b89875f4104403ffeacde863ed7c09649eed2aac29。

证据：artifacts/live-report.json、packaged-report.json、install-progress-fixture.png、install-ready-fixture.png、floating-live.png、overview-live.png。

---

# 0.3.1 开发版验证记录

2026-10-02，Windows 11 x64。

- 39项Node检查通过：自动0.5%费用、短测试累计持久化、只做测试也会结算、服务时段结束恢复完整定时测试、停止/过热/失败不会重启，及既有配置/进程/网络/更新检查。
- 曲线真实采样去重、缺失/过期/非有限/未来数据拒绝、断流断线、会话重置、最多120点与120秒范围、温度阈值分级检查通过。
- Electron界面检查通过：信息导航最后、无服务费勾选、按钮放大、52px算力图、主表/逐卡/详情温度红色、数据刷新不改变面板尺寸、CSS轻量动画启停。测试曲线及85°C是仅注入隔离渲染器的明确测试值，不写入设备记录，不执行真实矿工。
- 720×540窗口、实时硬件/网络读取、深浅主题、X收起悬浮窗、恢复、更新签名等回归通过，渲染器错误为0。
- 测试费用采取本地累计、后续满时段结算；并非每次60秒测试立即转账0.5%币量。真实矿池接受份额和钱包到账未验证。

- 0.3.1压缩包158,320,276字节，113个文件SHA256全部匹配；独立配置EXE启动/X悬浮/退出成功。
- 公网下载HTTP200及首尾Range206一致；Ed25519清单version0.3.1、sequence2校验通过；服务器完整ZIP SHA256与本地一致。
- ZIP SHA256：b11b6b531601f73cb983515b75b509984f555ee8053a20cac525535177baaa4c。

证据：artifacts/live-report.json、packaged-report.json、mining-curve-fixture.png、overview-live.png；历史版本记录如下。

---

# 0.3.0 开发版验证记录

2026-10-02，Windows 11 x64。

- 34项Node测试通过（33项业务/保护测试及新增动态占空比真进程测试）：性能参数校验、NVIDIA负载反馈、改变档位后旧样本清空、设备记录隐私字段、上传需显式开启/关闭后停止队列、服务端去重/聚合、更新签名/过期/回退/域名限制、浮窗算力与0收益，保留全部0.2测试。
- 原生ProcessGuard以无害Node计时进程验证5%与90%调度预算确实改变运行量，停止/崩溃/父进程退出能回收进程树；没有用真实矿工做此测试。
- Electron界面测试通过：关闭X保留应用并打开新悬浮窗、恢复主界面、性能滑杆IPC、日/7/30日显示、实验内核自检、真实行情接口和硬件传感器、深浅主题与固定数据节点。
- 自编译Gozer QTC CUDA内核在RTX5060 Laptop通过16项官方哈希向量/目标边界/结果计数检查。3秒、50%离线预算共计算50,053,120个候选；完整哈希参考路径约111.17MH/s，优化路径约155.09MH/s，短时核内对照1.395倍。端到端含休息有效速率约16.67MH/s，与核内执行时间口径不同。结果不等于KRig对比、真实矿池接受份额或持续收益。
- 打包后的0.3.0独立配置实例启动成功，关闭X出现“Gozer 悬浮监控”，明确退出返回0；112个文件SHA256与压缩包校验通过。原有0.2实例保持运行，没有被测试停止。
- 服务器暂存端口验证记录聚合读取及无效POST400；安全回归测试通过。发布路径与在线验证见工作区DEPLOYMENT.md。

限制：自编译QTC是GPU计算实验核，尚未接入矿池协议/认证/份额提交；PRL/TSC自编译未完成。真实挖矿仍走KRig。进程运行时间与GPU瞬时占用不同；本次没有真实挖矿或钱包到账测试。7/30日是当前条件不变下的线性估算。

证据：artifacts/native-qtc-benchmark.json、live-report.json、packaged-report.json及对应截图。

---

# 0.2.0 开发版验证记录

2026-10-02，Windows 11 x64。没有启动真实挖矿或产生钱包交易。

- 25项自动化测试通过：含原有11项，以及服务费199:1账本、明确同意/测试豁免、服务地址切换和还原、启动前预留额度、崩溃不重复收费、过期采样不累计、切换中用户停止/超温取消、停止耗时记账、手动算力校验、网络比例不重复复利、QTC源时间/TSC单位隔离、请求合并/离线标记、实测收益优先和缺失功耗、信息阈值/去重/切换来源、悬浮窗过期数据和多屏位置。
- Electron原生界面测试通过：720×540紧凑窗口（150%缩放系统舍入721×541），硬件参数节点/位置稳定，手动算力输入、三币网络栏、三个收费地址逐字核对、信息筛选、独立悬浮窗/恢复、深浅主题、外链限制。无渲染器错误。
- 真实接口获取成功：PRL/QTC/TSC难度、全网算力、参考收益；信息目录跟踪62个资产。QTC来源超过180秒时正确标记过期，不将响应时间冒充源更新时间。
- 收益测试界面的100 TH/s/100W输入仅是隔离测试配置，不代表本机RTX 5060 Laptop实测性能。
- 服务收费测试全部使用内存模拟矿工，没有执行矿工或访问钱包；实际矿池份额、长期切换的有效比例/到账仍未验证。
- 原生悬浮窗为246×116，CPU/GPU/内存实际占用和GPU温度可读；CPU温度仍未接入，不显示虚构值。
- 打包后的EXE启动与SHA256全量校验结果见 `artifacts/packaged-report.json`；原生界面与来源信息见 `artifacts/live-report.json`。

截图：`earnings-manual.png`、`mining-live.png`、`fee-disclosure.png`、`information-live.png`、`floating-live.png`，均位于 `artifacts/`。

TSC Windows矿工、AMD/Intel传感器、真实混卡挖矿与长期运行仍属未完成的验收范围。服务费是公开分时分配，不是精确币量扣款。

---

# 0.1.0 开发版验证记录

2026-10-02，Windows 11 x64，本机测试，未启动真实挖矿。

- 11 项自动化测试通过：配置输入边界、原子持久化、传感器空值、同型号多卡 PCI 匹配、CPU 差分、明确选卡参数、真实算力单位解析、严格收益匹配、温度/失联保护、启动中取消、子进程树与父进程退出清理。
- Electron 原生界面测试通过：硬件读取、选卡、CPU 参数弹窗、PRL/QTC/TSC 切换、TSC 禁止启动、真实公共收益请求、深浅主题、不可信链接拒绝。
- 连续采样期间 GPU 行及 36 项数据单元格保留原节点和位置。Windows 150% 缩放下内容尺寸为 721×541 CSS px，属于 720×540 请求尺寸的系统像素舍入。
- 本机实际读取：Intel Core Ultra 9 275HX，24核/24线程，L1 2432KB / L2 40MB / L3 36MB；16+32GiB DDR5-5600；SK hynix / Samsung 厂商和各自料号。
- NVIDIA 驱动与 NVML：RTX 5060 Laptop GPU，3328 CUDA核心、128-bit位宽、Blackwell，8151MiB驱动报告显存；温度、板卡功耗、核心/显存时钟、负载、PCIe当前及最大链路可读。
- Intel 核显已枚举；其运行传感器未实现。虚拟显示适配器未列入物理GPU清单。
- KRig 1.5.4 的 `--help`、`--list-devices` 已只读执行；枚举结果与本机 PCI 地址 01:00.0 对应，未填写钱包或运行挖矿。
- 官方 Electron 下载 SHA256 已对照上游清单；应用打包时生成文件级 SHA256 清单与压缩包 SHA256。
- 打包后的实际 `GozerAssistant.exe` 已独立启动，窗口标题正确，正常退出；全量文件校验无差异。对应报告 `artifacts/packaged-report.json`。

界面截图和原生验证结果位于 `artifacts/`。实际挖矿日志格式、矿池接受份额、长时间稳定性、多张物理卡/AMD混卡，以及TSC Windows适配不在本次已验证范围内。
