Gozero MDS Core 0.1.12-rc.2 — Linux x86-64
English first; 简体中文 below.

REQUIREMENTS
Linux x86-64 with glibc >= 2.31 (Ubuntu 20.04+/Debian 11+ baseline).
NVIDIA GPU compute capability >= 8.0 (compatible RTX 30/40/50), recent
driver supporting PTX 9.0 (CUDA 13, normally R580+). No CUDA Toolkit is
needed at runtime. Python >= 3.8 is required only for the supervisor.
ARM64, AMD, HiveOS-specific integration and bare-metal Linux performance
are not validated in this release. Binary was tested under Ubuntu WSL2.

QUICK START — NEVER STARTS MINING JUST BY EXTRACTING
1. Verify the archive SHA256 using the separate .sha256 file, then extract.
   Inside the extracted directory: sha256sum --check SHA256SUMS
2. cp config.example.json config.json
3. Edit config.json: set YOUR reusable MSS address (NOT one-time WOTS),
   mss_confirmed=true, and a unique worker_prefix for this machine.
   No default payout/developer wallet is supplied.
4. python3 run-miner.py --config config.json --check
5. python3 run-miner.py --config config.json
   Stop with Ctrl+C. A finite trial: add --duration 60.

Default pool: stratum+tcp://mds.gozero.trade:13333
This release uses the Gozero/native MDS protocol. LuckyPool uses a
different authentication dialect; its experimental adapter is NOT
included. Do not assume every MDS pool speaks the same Stratum dialect.

MULTI-GPU / PERFORMANCE
"gpus": ["all"] starts one independent process for each detected GPU.
To select cards, use UUID strings from nvidia-smi -L. CUDA_VISIBLE_DEVICES
isolates each owned process; it always receives --gpu-index 0.
Each stdout/stderr line is prefixed with the host worker and GPU index.
Same-user supervisor locks prevent accidentally launching the same card
twice; these locks cannot detect third-party miners or other user accounts.
"profile": "auto" uses measured U2/B256/D4000/N20992 on exact RTX 3090;
other models run bounded startup tuning. "tune" forces startup tuning.
"duty": 0.9 is the default compute budget; 1.0 removes the planned 10%
rest. It is not an overclock or a power-limit setting, and does not promise
continuous 100% utilization. Clocks, voltage, fans and power limits are
never modified. Default 85 C stop and 70 C restart threshold. Missing
temperature telemetry also stops owned miners. The bare executable has
no thermal supervisor: use run-miner.py for unattended deployment.

Standalone CLI (you must provide temperature supervision):
./GozeroMdsCore --backend cuda --pool-url stratum+tcp://mds.gozero.trade:13333 \
  --payout-address YOUR_MSS_ADDRESS --mss-confirmed --worker rig01 --duty 0.9
Offline self-test: ./GozeroMdsCore --backend cuda --self-test
Offline benchmark: ./GozeroMdsCore --backend cuda --benchmark 30 --duty 0.9
All mining candidates are CPU-verified; the full 1,000,000 rounds remain.
Reported N/s measures executed chain-work equivalents and can include
partial work cancelled when the pool changes jobs. It is not pool-estimated
or settled hashrate. Accepted shares/payouts depend on pool ACKs and ledger.

FLEET DEPLOYMENT (ANSIBLE CONTROLLER REQUIRED)
Install Ansible on your controller, with SSH keys/sudo already configured.
Review inventory.example.ini and deploy.yml. Use only machines you own or
are authorized to administer. Confirm driver and Python3 exist on targets.
Use an inventory alias <=23 characters as the per-host worker prefix.
First check syntax:
ansible-playbook -i inventory.ini deploy.yml --syntax-check
Deploy without starting:
ansible-playbook -i inventory.ini deploy.yml \
  -e '{"mds_release_dir":"/absolute/path/to/extracted-release","mds_wallet":"YOUR_MSS_ADDRESS","mds_mss_confirmed":true}'
To explicitly start and enable at boot, add -e '{"mds_start":true}'.
The playbook verifies local SHA256SUMS, installs under /opt/gozero-mds,
creates a dedicated unprivileged account and /etc/gozero-mds/config.json.
It does not install/upgrade GPU drivers or modify device power settings.
Existing service deployments are stopped when mds_start is false.
Use host_vars/<host>.yml for mds_gpus, mds_duty or mds_pool overrides.
Service nodes must permit gozero-mds to access NVIDIA device files; if your
distribution restricts them, add the service account to the appropriate
existing video/render groups according to your local policy.
Inspect: systemctl status gozero-mds; journalctl -u gozero-mds -f
Stop: sudo systemctl disable --now gozero-mds
Failures restart after 60 seconds; supervisor waits for GPUs to cool.
Fleet templates are examples; syntax and local supervisor lifecycle were
tested, not deployment across an actual multi-host farm.

FEES / SOURCE
This standalone engine/supervisor contains no developer or assistant fee
scheduler. The Windows Assistant separately retains its disclosed 0.5%
service fee. Pool fees remain independent. GPL-3.0 source is supplied as
the matching source ZIP and in desktop/experiments/midstate on GitHub.
See NOTICE.txt, PROVENANCE.json, VALIDATION.txt and BUILD-LINUX.txt.

简体中文
这是独立 Linux x86-64 MDS 内核，不是 Linux 图形版助手。
需 glibc 2.31+、兼容 NVIDIA RTX 30/40/50 显卡、支持 PTX 9.0 的新驱动。
不需要 CUDA Toolkit；使用守护脚本需 Python 3.8+。实测环境为 WSL2，
不能将 Windows 3090 的算力结果视为 Linux 或其它型号的实测保证。
解压校验后复制 config.example.json 为 config.json，填写自己的 MSS
可重复收款地址并将 mss_confirmed 设为 true，再执行上述 --check 和运行命令。
默认矿池 mds.gozero.trade:13333。LuckyPool 协议适配实验版未包含在此包。
多卡默认全选；可用 nvidia-smi -L 的 GPU UUID 单独指定。每卡独立进程和日志前缀。
默认 90% 计算预算，精确匹配 RTX 3090 时采用实测参数，其它型号自动调优。
duty=1.0 取消计划休息，不会修改显卡功耗、频率或电压。默认 85°C 停止、
降到 70°C 后允许重启；传感器失效也会停止。裸内核没有温控，请通过脚本托管。
Ctrl+C 停止；systemd 部署后可用 systemctl disable --now gozero-mds 停止并关闭自启。
批量部署使用随附 Ansible 模板。默认只部署不挖矿，明确 mds_start=true 后才启动。
模板校验过语法及本机进程生命周期，未进行真实多主机矿场部署测试。
独立程序不包含抽水调度；Windows 助手的软件服务费仍为 0.5%。
