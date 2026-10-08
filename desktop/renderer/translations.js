(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GozerTranslations=factory()})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 // Source phrase | English | Japanese | Russian. Technical IDs, input values and miner output are preserved.
 const rows=`
单位|Unit|単位|Единица
可用未支付|Available unpaid|利用可能・未払い|Доступно к выплате
待成熟收益|Immature rewards|未成熟報酬|Незрелые награды
待成熟 / 预估|Immature / estimated|未成熟 / 推定|Незрелые / оценка
支付预留|Reserved payout|支払い予約額|Резерв выплаты
成熟确认数|Maturity blocks|成熟ブロック数|Блоки до зрелости
矿池估算|Pool estimate|プール推定値|Оценка пула
在线 Worker|Online workers|オンライン Worker|Работники онлайн
Worker 明细|Worker details|Worker 詳細|Сведения о работниках
矿池未返回 Worker 记录。|The pool returned no worker records.|プールから Worker 記録が返されていません。|Пул не вернул записей о работниках.
Worker 是矿池会话，不等于物理设备数量。|Workers are pool sessions, not physical device counts.|Worker はプールのセッションで、物理デバイスの数ではありません。|Работники — сессии пула, а не число физических устройств.
本池已索引奖励|Indexed pool rewards|インデックス済みプール報酬|Награды пула в индексе
已索引区块|Indexed blocks|インデックス済みブロック|Блоки в индексе
矿池区块|Pool blocks|プールのブロック|Блоки пула
链查询深度|Chain scan depth|チェーン照会深度|Глубина сканирования
结算方式|Settlement|決済方式|Расчёт
区块奖励直付|Direct block rewards|ブロック報酬の直接払い|Прямые награды блока
奖励索引尚不完整，金额仅覆盖已索引区块。|The reward index is incomplete; amounts cover indexed blocks only.|報酬のインデックスは未完了です。金額は登録済みブロックのみ対象です。|Индекс наград неполон; суммы охватывают только проиндексированные блоки.
矿池自动支付暂未启用|Automatic pool payouts are disabled|プールの自動支払いは無効です|Автовыплаты пула отключены
支付窗口|Payout window|支払い期間|Окно выплат
查询中|Querying|照会中|Запрос
算力30秒 / 账本60秒|Hashrate 30s / ledger 60s|算力30秒 / 台帳60秒|Хешрейт 30с / баланс 60с
矿池估算不等于本机实时算力|Pool estimates differ from local live hashrate|プール推定値はローカルのリアルタイム算力と異なります|Оценка пула отличается от локального хешрейта
其它矿池收益不在本账本内|Other pools are excluded from this ledger|他のプールの収益は含まれません|Доход других пулов не включён
本池链上奖励记录|This pool's on-chain rewards|このプールのオンチェーン報酬|Награды этого пула в блокчейне
记录覆盖不完整，请以矿池说明为准。|Record coverage is incomplete; see the pool's explanation.|記録の対象範囲は未完了です。プールの説明を確認してください。|Охват записей неполон; см. пояснение пула.
已广播 / 待确认|Broadcast / unconfirmed|送信済み / 未承認|Отправлено / не подтверждено
已签名 / 未支付|Signed / unpaid|署名済み / 未払い|Подписано / не выплачено
已预留 / 未支付|Reserved / unpaid|予約済み / 未払い|Зарезервировано / не выплачено
链上奖励|On-chain reward|オンチェーン報酬|Награда в блокчейне
GPU 矿池账本|GPU pool ledger|GPU プール台帳|Баланс GPU-пула
CPU 矿池账本|CPU pool ledger|CPU プール台帳|Баланс CPU-пула
保存有效收款地址后查询矿池账本|Save a valid payout address to query the pool ledger|有効な受取アドレスを保存してプール台帳を照会|Сохраните адрес выплат для запроса баланса пула
矿池数据暂不可用|Pool data is temporarily unavailable|プールのデータは一時的に利用できません|Данные пула временно недоступны
支付规则|Payout policy|支払い規則|Правила выплат
待成熟为当前 PPLNS 预估，可能变化；这里只显示矿池账本余额，不是隐私钱包全链余额。|Immature rewards are a variable PPLNS estimate. This is the pool ledger, not the private wallet's full-chain balance.|未成熟報酬は変動する PPLNS 推定値です。プール台帳であり、ウォレット全体のオンチェーン残高ではありません。|Незрелые награды — изменяемая оценка PPLNS. Это баланс пула, а не полный баланс приватного кошелька.
本池收入仅筛选返回的最近40条链上交易；余额为该地址全链余额，不是矿池待支付余额。|Recent pool rewards cover only the latest 40 returned transactions; balance is the address's full-chain balance, not unpaid pool funds.|最近の報酬は返された直近40件の取引のみ対象です。残高はアドレスの全チェーン残高で、プールの未払い金ではありません。|Недавние награды охватывают последние 40 транзакций; баланс относится ко всему блокчейну, а не к невыплаченным средствам пула.
这是矿池账本余额，不是钱包全链余额。|This is the pool ledger balance, not the full-chain wallet balance.|これはプール台帳残高で、全チェーンのウォレット残高ではありません。|Это баланс пула, а не полный баланс кошелька в блокчейне.
已安装|Installed|インストール済み|Установлено
Windows 拒绝启动 Seine（错误码 5）。请查看安全软件拦截记录或文件权限；已停止任务。|Windows denied starting Seine (error 5). Check security software records or file permissions; the task has stopped.|Windows が Seine の起動を拒否しました（エラー 5）。セキュリティソフトの履歴またはファイル権限を確認してください。タスクは停止しました。|Windows запретила запуск Seine (ошибка 5). Проверьте журнал защиты и права файла; задача остановлена.
官方全节点|Official full node|公式フルノード|Официальный полный узел
下载 Windows 原版 ↗|Download Windows original ↗|Windows 原版をダウンロード ↗|Скачать оригинал для Windows ↗
发布页 / 校验值 ↗|Release / checksums ↗|リリース / チェックサム ↗|Релиз / контрольные суммы ↗
全节点单挖 · 需要同步区块链；不能作为工作台矿池内核启动。|Full-node solo mining. Blockchain sync required; cannot start as a workbench pool miner.|フルノードのソロ採掘。ブロックチェーン同期が必要です。ワークベンチのプール用マイナーとしては起動できません。|Соло-майнинг полного узла. Нужна синхронизация блокчейна; не запускается как пуловое ядро в рабочей панели.
Seine 原版 GitHub · 内核费 2.5%（bntpool 1%）· 软件服务费 0.5% · SHA256 校验|Seine upstream GitHub · Kernel fee 2.5% (bntpool 1%) · App fee 0.5% · SHA256 verified|Seine 公式 GitHub · カーネル料 2.5%（bntpool 1%）· アプリ料 0.5% · SHA256 検証|Seine GitHub автора · Сбор ядра 2,5% (bntpool 1%) · Сбор приложения 0,5% · Проверка SHA256
Seine 内核费 2.5%（bntpool 1%）· 软件服务费 0.5%|Seine kernel fee 2.5% (bntpool 1%) · App fee 0.5%|Seine カーネル料 2.5%（bntpool 1%）· アプリ料 0.5%|Сбор Seine 2,5% (bntpool 1%) · Сбор приложения 0,5%
内核费 2.5%（bntpool 1%）|Kernel fee 2.5% (bntpool 1%)|カーネル料 2.5%（bntpool 1%）|Сбор ядра 2,5% (bntpool 1%)
自动调优仅适用于 Gozero BNT 内核|Auto-tuning is only available for the Gozero BNT kernel|自動調整は Gozero BNT カーネルのみ対応|Автонастройка доступна только для ядра Gozero BNT
Seine 0.2.15 仅支持 stratum+tcp 矿池地址|Seine 0.2.15 supports only stratum+tcp pool addresses|Seine 0.2.15 は stratum+tcp のプールのみ対応|Seine 0.2.15 поддерживает только адреса пула stratum+tcp
请先下载并安装 Seine 内核|Download and install the Seine kernel first|まず Seine カーネルをダウンロードしてインストールしてください|Сначала скачайте и установите ядро Seine
Seine 运行失败|Seine stopped with an error|Seine 実行エラー|Ошибка работы Seine
Seine 连续 90 秒未恢复矿池任务，切换备用地址|Seine: no pool work recovered for 90 seconds; switching backup|Seine：90秒間プールの作業が復旧しないため予備アドレスに切り替えます|Seine: задания пула не восстановлены за 90 секунд; переход к резервному адресу
币种与内核库|Coins and kernels|通貨とマイナー|Монеты и ядра
内核库 ↗|Kernels ↗|マイナー ↗|Ядра ↗
返回工作台|Back to Workbench|ワークベンチへ|К рабочей панели
挖矿期间可查看其他币种和安装其他内核；当前任务继续运行。|Browse coins and install other kernels while the current task continues.|実行中のタスクを維持して他の通貨のマイナーをインストールできます。|Просматривайте монеты и устанавливайте другие ядра, не останавливая текущую задачу.
配置此币种挖矿|Configure this coin|この通貨を設定|Настроить монету
已有挖矿任务运行。请先停止当前任务，再切换币种启动；下载内核不会停止当前任务。|A task is running. Stop it before starting another coin. Kernel downloads do not stop mining.|タスク実行中です。別の通貨を開始する前に停止してください。ダウンロードは採掘を停止しません。|Задача уже запущена. Остановите её перед сменой монеты. Загрузка ядра не останавливает майнинг.
随附开源核心 · SHA256 校验|Bundled open-source core · SHA256 verified|付属オープンソース · SHA256 検証|Встроенное открытое ядро · SHA256
官方 GitHub 下载 · SHA256 双重校验|Official GitHub · Archive and binary SHA256 checks|公式 GitHub · SHA256 二重検証|Официальный GitHub · Двойная проверка SHA256
尚未安装|Not installed|未インストール|Не установлено
重新安装|Reinstall|再インストール|Переустановить
直连官方 GitHub 下载源|Direct connection to official GitHub|公式 GitHub に直接接続|Прямое подключение к GitHub
BNT 服务费地址待配置|BNT service-fee address pending|BNT 手数料アドレス未設定|Адрес комиссии BNT не настроен
BNT 价格和收益源尚未接入|BNT price and revenue data unavailable|BNT 価格・収益データ未接続|Данные цены и дохода BNT недоступны
选好设备，进入工作台配置挖矿|Select devices, then configure mining in Workbench|デバイスを選び、ワークベンチで採掘を設定|Выберите устройства и настройте майнинг в рабочей панели
工作台 ↗|Workbench ↗|ワークベンチ ↗|Рабочая панель ↗
收益估算参数|Earnings estimate settings|収益推定設定|Параметры расчёта дохода
待机 · 服务费0.5%|Idle · Service fee 0.5%|待機 · サービス料0.5%|Ожидание · Сервисный сбор 0,5%
软件服务费0.5%，按有效运行时间累计；服务时段临时切换收款地址，结束后恢复你的钱包。停止任务同时停止计费调度，未结算余额保留。|The 0.5% software fee accrues on effective runtime. Fee periods temporarily switch the payout address, then restore your wallet. Stopping the task stops fee scheduling; unsettled balances are retained.|ソフトウェア料0.5%は有効稼働時間に基づいて累積します。手数料期間中のみ受取先を変更し、終了後にウォレットを復元します。タスク停止で徴収も停止し、未精算分は保持します。|Сбор 0,5% начисляется за эффективное время работы. На время сбора адрес выплаты меняется, затем восстанавливается ваш кошелёк. Остановка задачи прекращает сбор; остаток сохраняется.
线程|Threads|スレッド|Потоки
设置|Settings|設定|Настройки
请先保存配置再切换币种|Save changes before switching coin|変更を保存してから通貨を切替|Сохраните изменения перед сменой монеты
此任务忙，请稍候|This task is busy|タスク処理中です|Задача занята
请先停止此任务再修改配置|Stop this task before editing|タスクを停止してから変更|Остановите задачу перед изменением
GPU挖矿|GPU mining|GPU採掘|GPU-майнинг
CPU挖矿|CPU mining|CPU採掘|CPU-майнинг
GPU＋CPU双挖|GPU + CPU|GPU＋CPU併用|GPU + CPU
独立任务 · 独立统计|Separate tasks · Separate rates|独立タスク・個別統計|Раздельные задачи и статистика
分别保存配置后启动|Save each configuration before starting|各設定を保存して開始|Сохраните настройки перед запуском
GPU / CPU 独立启停 · 不同算法不合计算力|Independent GPU / CPU controls · Rates kept separate|GPU / CPU個別操作・算力は別表示|Независимое управление GPU / CPU · Скорости раздельно
▶ 启动全部|▶ Start all|▶ すべて開始|▶ Запустить всё
实时算力|Live hashrate|リアルタイム算力|Текущий хешрейт
5分钟均值|5 min average|5分平均|Среднее за 5 мин
10分钟均值|10 min average|10分平均|Среднее за 10 мин
5分钟|5 min|5分|5 мин
10分钟|10 min|10分|10 мин
等待采样|Awaiting samples|サンプル待機|Ожидание замеров
02 永久收款地址|02 persistent wallet address|02永続受取アドレス|Постоянный адрес 02
主网收款地址|Mainnet wallet address|メインネット受取アドレス|Адрес основной сети
矿池 / 设备设置|Pool / device settings|プール・デバイス設定|Настройки пула / устройств
主矿池|Primary pool|メインプール|Основной пул
算力周期|Average window|平均期間|Период усреднения
重新下载|Re-download|再ダウンロード|Скачать заново
内核未安装|Kernel not installed|カーネル未導入|Ядро не установлено
有未保存的修改|Unsaved changes|未保存の変更|Есть несохранённые изменения
本期暂估|Provisional|暫定値|Предварительно
▶ 启动|▶ Start|▶ 開始|▶ Старт
接受|Accepted|承認|Принято
拒绝|Rejected|拒否|Отклонено
双挖模式请使用各任务的保存配置；全局设置需先退出双挖|Use each task's Save in dual mode; exit dual mode to edit global settings|併用モードは各タスクで保存。全体設定はモード切替後に変更|В двойном режиме сохраняйте задачи отдельно; общие настройки доступны после смены режима
请先停止全部任务再切换模式|Stop all tasks before switching mode|すべて停止してからモードを変更|Остановите все задачи перед сменой режима
官网 ↗|Website ↗|公式サイト ↗|Сайт ↗
填写并保存矿池地址后可启动|Enter and save a pool address to start|プールアドレスを入力・保存して開始|Введите и сохраните адрес пула для запуска
ZCD · CPU 矿池挖矿|ZCD · CPU pool mining|ZCD · CPUプール採掘|ZCD · CPU-майнинг в пуле
矿池密码|Pool password|プールパスワード|Пароль пула
未配置矿池|Pool not configured|プール未設定|Пул не задан
等待矿池任务 / RandomX 预热|Waiting for pool job / RandomX warm-up|プールジョブ待機 / RandomX準備中|Ожидание задания пула / прогрев RandomX
XMRig 内核费 1% · 软件服务费 0.5%|XMRig fee 1% · App fee 0.5%|XMRig手数料1%・アプリ手数料0.5%|Комиссия XMRig 1% · Приложения 0.5%
ZCD · CPU RandomX v2（rx/2）；填写主矿池及备用矿池后启动，无需本地全节点。|ZCD · CPU RandomX v2 (rx/2). Set primary and backup pools to start. No local full node required.|ZCD · CPU RandomX v2（rx/2）。メイン・予備プールを設定して開始。ローカルフルノードは不要です。|ZCD · CPU RandomX v2 (rx/2). Укажите основной и резервные пулы. Локальный полный узел не нужен.
填写矿池提供的 Stratum 地址；支持 TCP / TLS 和两个备用地址。收款地址使用 02 开头的永久地址。|Enter the pool's Stratum address. TCP / TLS and two backups supported. Use a persistent payout address starting with 02.|プールのStratumアドレスを入力。TCP / TLSと予備2件に対応。02で始まる永久受取アドレスを使用。|Введите Stratum-адрес пула. TCP / TLS и два резервных адреса. Для выплат — постоянный адрес с 02.
ZCD 矿池账本接口待适配；填入矿池后可挖矿，余额与支付请到该矿池查询|ZCD pool account API pending. Configure a pool to mine; check balance and payments on that pool.|ZCDプール台帳APIは未対応。プール設定後に採掘可能。残高・支払はプールで確認してください。|API баланса пула ZCD ещё не подключён. Настройте пул; баланс и выплаты смотрите на его сайте.
请先填写 ZCD 主矿池地址|Enter a ZCD primary pool address first|ZCDメインプールを先に入力してください|Сначала укажите основной пул ZCD
ZCD 矿池密码格式无效|Invalid ZCD pool password format|ZCDプールパスワードの形式が無効|Неверный формат пароля пула ZCD
挖矿设备类型|Mining device type|採掘デバイス種別|Тип устройства майнинга
搜索币种 / 名称 / 算法|Search coin / name / algorithm|通貨・名前・アルゴリズムを検索|Поиск монеты / названия / алгоритма
选择挖矿币种|Select mining coin|採掘する通貨を選択|Выбор монеты
没有匹配币种|No matching coins|一致する通貨なし|Совпадений нет
CPU 线程|CPU threads|CPUスレッド|Потоки CPU
0 = 自动预留线程|0 = Auto, reserve threads|0 = 自動、余裕を確保|0 = Авто, резерв потоков
本机节点 · SOLO|Local node · SOLO|ローカルノード · SOLO|Локальный узел · SOLO
内存需求 ≥ 4 GiB 可用|Requires ≥ 4 GiB free RAM|空きメモリ ≥ 4 GiB 必要|Требуется ≥ 4 GiB свободной RAM
CPU 温度 / 功耗：未接入|CPU temperature / power: unavailable|CPU温度・電力：未対応|Температура / мощность CPU: недоступны
设备运行明细|Device activity|デバイス稼働状況|Работа устройств
所选设备功耗|Selected device power|選択デバイスの消費電力|Мощность выбранных устройств
CPU 聚合任务 · 不影响 GPU 选择|One CPU job · GPU selection preserved|CPU集約タスク・GPU選択を保持|Задача CPU · Выбор GPU сохранён
CPU 按逻辑线程分配，100%档可使用全部线程和 CPU 配额；不修改频率或电压。|CPU modes use logical threads; 100% permits all threads and the full CPU budget. No clock or voltage changes.|CPUは論理スレッド数で配分。100%では全スレッドとCPU枠を使用可能。周波数・電圧は変更しません。|Режимы CPU используют логические потоки; 100% разрешает все потоки и полный лимит CPU. Частоты и напряжение не меняются.
未识别到可用 CPU|No available CPU detected|利用可能なCPUが未検出|Доступный CPU не обнаружен
节点已停止|Node stopped|ノード停止中|Узел остановлен
节点已同步|Node synchronized|ノード同期済み|Узел синхронизирован
正在同步区块|Syncing blocks|ブロック同期中|Синхронизация блоков
节点暂不可用|Node unavailable|ノード利用不可|Узел недоступен
等待节点 / RandomX 预热|Waiting for node / RandomX warm-up|ノード待機 / RandomX準備中|Ожидание узла / прогрев RandomX
内核费 0% · 软件服务费 0.5%|Miner fee 0% · App fee 0.5%|コア手数料0%・アプリ手数料0.5%|Комиссия ядра 0% · Приложения 0.5%
ZCD · CPU RandomX / SOLO；仅接受永久地址（02 开头），首次同步和数据集初始化需要时间。|ZCD · CPU RandomX / SOLO. Persistent (02) addresses only. Initial sync and dataset setup take time.|ZCD · CPU RandomX / SOLO。永久アドレス（02）のみ。初回同期とデータセット初期化には時間が必要です。|ZCD · CPU RandomX / SOLO. Только постоянные адреса (02). Начальная синхронизация и подготовка требуют времени.
单挖奖励需等待 240 个区块成熟；当前未接入价格和收益源，不显示虚构收益。|Solo rewards mature after 240 blocks. Price and income sources are not connected; no simulated returns.|単独採掘報酬は240ブロック後に成熟。価格・収益ソース未接続のため推測値は表示しません。|Награда SOLO созревает через 240 блоков. Источники цены и дохода не подключены; фиктивных данных нет.
ZCD 当前未接入价格和收益源|ZCD price and income sources unavailable|ZCDの価格・収益ソース未接続|Источники цены и дохода ZCD недоступны
永久服务费地址待配置|Persistent fee address pending|手数料用永久アドレス未設定|Ожидается постоянный адрес комиссии
等待同步 / RandomX 预热|Waiting for sync / RandomX warm-up|同期待機 / RandomX準備中|Ожидание синхронизации / прогрев RandomX
ZCD 为全节点单挖；奖励由区块直接结算，余额和成熟情况请在官方钱包查看|ZCD uses full-node solo mining. Check block rewards, balance and maturity in the official wallet.|ZCDはフルノード単独採掘。報酬・残高・成熟状況は公式ウォレットで確認できます。|ZCD — SOLO на полном узле. Награды, баланс и созревание смотрите в официальном кошельке.
校验通过 · ZCD|Verified · ZCD|検証済み · ZCD|Проверено · ZCD
ZCD 需要 02 开头的 32 字节永久地址，不能使用一次性地址|ZCD requires a 32-byte persistent address starting with 02, not a one-shot address.|ZCDには02で始まる32バイトの永久アドレスが必要です。使い捨てアドレスは不可。|ZCD нужен постоянный 32-байтовый адрес с 02, не одноразовый.
ZCD 服务费永久地址待配置，暂不可启动|ZCD persistent fee address is pending; start unavailable.|ZCD手数料用永久アドレス未設定のため起動できません。|Постоянный адрес комиссии ZCD не задан; запуск недоступен.
ZCD 至少需要 4 GiB 可用内存及实时内存读数|ZCD requires at least 4 GiB free RAM and live memory readings.|ZCDには4 GiB以上の空きメモリとリアルタイム計測が必要です。|ZCD требует 4 GiB свободной RAM и актуальные показания памяти.
有效设备运行时间|active device runtime|デバイスの有効稼働時間|активное время устройств
预估毛产币 / 日|Estimated gross coins / day|推定総産出量 / 日|Ожидаемые монеты / день до комиссий
美元毛收益（币价未接入）|Gross USD (price unavailable)|総収益 USD（価格未取得）|Доход USD (нет цены)
7日产币推算|7-day coin estimate|7日間の推定産出量|Монеты за 7 дней (прогноз)
30日产币推算|30-day coin estimate|30日間の推定産出量|Монеты за 30 дней (прогноз)
预估毛产币 / 日 · 未扣费用 · 非矿池结算|Estimated gross coins/day · Before fees · Not pool settlement|推定総産出量/日・手数料控除前・プール決済ではありません|Прогноз монет/день · До комиссий · Не расчёт пула
校验通过 · YSR|Verified · YSR|検証済み · YSR|Проверено · YSR
内核费 0% · 软件服务费 0.5% · 矿池费以节点为准|Engine 0% · App 0.5% · Pool fee set by node|カーネル 0%・ソフト 0.5%・プール料金はノード準拠|Ядро 0% · Приложение 0,5% · Комиссия пула по узлу
YSR：NVIDIA RTX 30 或更新显卡；HTTP 矿池独立会话，候选份额 CPU 复核；CPU / AMD 挖矿尚未开放。|YSR: NVIDIA RTX 30 or newer; individual HTTP sessions, CPU-verified shares. CPU / AMD mining not enabled.|YSR：NVIDIA RTX 30 以降。HTTP 個別セッション、CPU によるシェア検証。CPU / AMD 採掘は未対応。|YSR: NVIDIA RTX 30 и новее; отдельные HTTP-сессии, проверка шар на CPU. Майнинг CPU / AMD не включён.
链上余额|On-chain balance|オンチェーン残高|Баланс в блокчейне
待确认（未提供）|Pending (unavailable)|未確定（未提供）|Ожидается (нет данных)
返回记录收益|Rewards in returned records|取得記録内の報酬|Награды в полученных записях
近7日（未提供）|7 days (unavailable)|7日間（未提供）|7 дней (нет данных)
近30日（未提供）|30 days (unavailable)|30日間（未提供）|30 дней (нет данных)
直接入账 / 无门槛|Direct credit / No threshold|直接入金 / 下限なし|Прямое зачисление / Без порога
奖励记录|Reward records|報酬記録|Записи о наградах
链上奖励记录 · 最近10笔|On-chain rewards · Latest 10|オンチェーン報酬・直近10件|Награды в блокчейне · Последние 10
YSR 奖励随区块直接入账；仅列出节点返回的奖励记录，非全部历史收益，也不能单独归因于本次测试。|YSR rewards are credited directly in blocks. Only returned records are listed, not full history or earnings attributable to this test.|YSR 報酬はブロックで直接入金。取得記録のみで全履歴ではなく、本テスト単独の成果でもありません。|Награды YSR зачисляются в блоках. Показаны только полученные записи, не вся история и не доход только этого теста.
节点未返回奖励记录。|Node returned no reward records.|ノードに報酬記録がありません。|Узел не вернул записи о наградах.
区块直接入账|Direct block credit|ブロック直接入金|Зачисление в блоке
YSKAR 官方节点|YSKAR official node|YSKAR 公式ノード|Официальный узел YSKAR
YSKAR 节点|YSKAR node|YSKAR ノード|Узел YSKAR
YSR 当前难度 × SHA-256d 尝试次数估算；随机出块，非保证收益|Estimate from YSR difficulty and SHA-256d attempts; random blocks, no guaranteed earnings|YSR 難易度と SHA-256d 試行回数から推定。出块は確率的で収益保証なし|Расчёт по сложности YSR и попыткам SHA-256d; блоки случайны, доход не гарантирован
保存有效 YSR 地址后查询链上收益|Save a valid YSR address to query on-chain rewards|有効な YSR アドレスを保存して報酬を照会|Сохраните адрес YSR для запроса наград
自定义 YSR 节点暂未适配账本查询|Custom YSR node ledger queries are not yet supported|独自 YSR ノードの台帳照会は未対応|Запросы баланса к своим узлам YSR пока не поддерживаются
YSR 节点账本暂不可用|YSR ledger temporarily unavailable|YSR 台帳は一時利用不可|Реестр YSR временно недоступен
链上余额及返回的奖励记录，非待提现账本|On-chain balance and returned rewards, not pending withdrawals|オンチェーン残高と取得報酬。出金待ち残高ではありません|Баланс в блокчейне и награды, не ожидающие вывода средства
本次返回奖励记录|Returned reward records|今回取得した報酬記録|Полученные записи о наградах
软件费与内核费、矿池费分开：YSR CUDA 0%，Suprminer 0%，Fl4shMiner 3%；KRig在Kryptex池0%，其他池最低3%；电费另算。停止任务或明确退出程序会结束用户与服务时段的所有任务；关闭X收起窗口后任务继续。|App, engine and pool fees are separate: YSR CUDA 0%, Suprminer 0%, Fl4shMiner 3%; KRig 0% on Kryptex, at least 3% elsewhere. Electricity is additional. Stop or Quit ends all tasks; closing X keeps mining.|ソフト・カーネル・プール料金は別：YSR CUDA 0%、Suprminer 0%、Fl4shMiner 3%、KRig は Kryptex 0%、他は最低3%。電気代は別。停止・終了で全タスク終了、X収納時は継続。|Комиссии раздельны: YSR CUDA 0%, Suprminer 0%, Fl4shMiner 3%; KRig на Kryptex 0%, иначе минимум 3%. Электричество отдельно. Стоп/Выход завершают задачи; X оставляет майнинг работать.
NOID 已启用自动连接：原始连接失败后尝试兼容 TCP（非加密）|NOID auto connection enabled: try unencrypted TCP if the original connection fails.|NOID 自動接続を有効化：元の接続失敗時は暗号化なし TCP を試行。|NOID: включено автоподключение с резервным TCP без шифрования.
自研 NOID 内核已移除，默认使用 Suprminer|Custom NOID engine removed; Suprminer is the default.|自製 NOID カーネルを削除。標準は Suprminer。|Собственное ядро NOID удалено; по умолчанию Suprminer.
软件费与内核费、矿池费分开：Suprminer 0%，Fl4shMiner 3%；KRig在Kryptex池0%，其他池最低3%；电费另算。停止任务或明确退出程序会结束用户与服务时段的所有任务；关闭X收起窗口后任务继续。|App, engine and pool fees are separate: Suprminer 0%, Fl4shMiner 3%; KRig 0% on Kryptex, at least 3% elsewhere. Electricity is additional. Stop or Quit ends all tasks; closing the window keeps tasks running.|ソフト・カーネル・プール料金は別です。Suprminer 0%、Fl4shMiner 3%、KRig は Kryptex 0%、他は最低3%。電気代は別。停止・終了で全タスク終了、Xで収納した場合は継続。|Комиссии приложения, ядра и пула раздельны: Suprminer 0%, Fl4shMiner 3%; KRig 0% на Kryptex, минимум 3% на других пулах. Электричество отдельно. Стоп и Выход завершают задачи; закрытие окна оставляет их работать.
原始连接未通过，自动尝试兼容 TCP（非加密）|Original connections failed; trying compatible TCP (unencrypted).|元の接続失敗。互換 TCP（暗号化なし）を自動試行。|Исходное подключение не удалось; пробуем TCP без шифрования.
正在检测原始矿池连接，不更改协议|Testing original pool connection; preserving protocol.|元のプロトコルで接続を確認中。|Проверка исходного подключения без смены протокола.
NOID 协议响应通过；尚未验证登录/有效份额|NOID protocol OK; login and accepted shares not yet verified.|NOID 応答確認済み。ログイン・有効シェアは未検証。|Протокол NOID доступен; вход и принятые шары ещё не проверены.
连接/协议响应超时|Connection/protocol response timed out|接続・プロトコル応答のタイムアウト|Тайм-аут подключения/ответа протокола
备用矿池 · 按顺序检测|Backup pools · Check in order|予備プール・順番に確認|Резервные пулы · Проверка по очереди
默认推荐 · Suprminer 1.9.27|Recommended · Suprminer 1.9.27|推奨 · Suprminer 1.9.27|Рекомендуется · Suprminer 1.9.27
自动适配（失败转 TCP）|Auto (TCP fallback)|自動（失敗時 TCP）|Авто (резерв TCP)
原始连接失败后自动转 TCP（非加密）|On failure, try TCP (unencrypted)|失敗時は TCP（暗号化なし）|При сбое — TCP (без шифрования)
启动前检测主/备用节点；运行中不切换|Check primary/backups before start; no live failover|起動前に主・予備を確認、稼働中は切替なし|Проверка узлов до запуска; без смены при работе
Suprminer：驱动需 ≥ 610；启动前检测主/备用节点，运行中不切换。|Suprminer: driver ≥ 610; primary/backups tested before start, no live failover.|Suprminer：ドライバー ≥ 610。起動前に主・予備を確認、稼働中は切替なし。|Suprminer: драйвер ≥ 610; проверка узлов до запуска, без смены при работе.
不使用备用节点|No backup|予備なし|Без резерва
备用 1地址|Backup 1 address|予備1のアドレス|Адрес резерва 1
备用 2地址|Backup 2 address|予備2のアドレス|Адрес резерва 2
启动前按主节点、备用1、备用2检测；NOID 自动模式在原始连接失败后尝试兼容 TCP（非加密）。运行中切换能力取决于内核。所有节点使用同一收款钱包。|Before start, check primary, backup 1 and backup 2. NOID auto mode falls back to unencrypted TCP. Live failover depends on the engine. All nodes use the same wallet.|起動前に主・予備1・予備2を確認。NOID 自動モードは失敗時に暗号化なし TCP を試行。稼働中の切替はカーネル次第。同じウォレットを使用。|До запуска проверяются основной и два резервных узла. NOID авто использует TCP без шифрования при сбое. Смена во время работы зависит от ядра. Кошелёк одинаковый.
内置内核自行连接；选择第三方内核后可设置|Built-in engine connects itself; select a third-party engine to configure|内蔵カーネルは独自に接続。外部カーネル選択後に設定可|Встроенное ядро подключается само; настройка для сторонних ядер
连接模式|Connection mode|接続モード|Режим подключения
原始连接（保留协议）|Original protocol|元のプロトコル|Исходный протокол
兼容 TCP（非加密）|Compatible TCP (unencrypted)|互換 TCP（暗号化なし）|TCP (без шифрования)
检测连接|Test connection|接続テスト|Проверить связь
兼容模式检测主/备用节点；运行中不切换|Check primary/backups before start; no live failover|起動前に主・予備を確認、稼働中は切替なし|Проверка узлов до запуска; без смены при работе
NOID 协议响应通过；登录与份额待验证|NOID protocol OK; login and shares unverified|NOID 応答確認済み、ログイン・シェア未検証|Протокол NOID доступен; вход и шары не проверены
Suprminer：驱动需 ≥ 610；兼容模式启动前检测备用节点，运行中不切换。|Suprminer: driver ≥ 610; compatible mode checks backups before start, not during mining.|Suprminer：ドライバー ≥ 610。互換モードは起動前に予備を確認、稼働中は切替なし。|Suprminer: драйвер ≥ 610; проверка резервов до запуска, без смены при работе.
兼容模式在启动前检测主/备用节点，选用可连通节点；运行中不切换。原始模式下 Suprminer 仅使用主节点。所有节点使用同一收款钱包。|Compatible mode tests primary/backups before start; no live failover. Original mode uses only the primary for Suprminer. All nodes use the same wallet.|互換モードは起動前に主・予備を確認し接続先を選択。稼働中は切替なし。元の接続では Suprminer は主ノードのみ。同じウォレットを使用。|Совместимый режим выбирает доступный узел до запуска. Без смены при работе. В исходном режиме Suprminer использует основной узел. Кошелёк одинаковый.
Suprminer 1.9.27 · 官方下载|Suprminer 1.9.27 · Official download|Suprminer 1.9.27 · 公式ダウンロード|Suprminer 1.9.27 · Официальная загрузка
Fl4shMiner 1.5.0 · 官方下载|Fl4shMiner 1.5.0 · Official download|Fl4shMiner 1.5.0 · 公式ダウンロード|Fl4shMiner 1.5.0 · Официальная загрузка
下载并安装|Download and install|ダウンロード・インストール|Скачать и установить
内核费 3% · 软件服务费 0.5%|Kernel fee 3%; app fee 0.5%|カーネル 3%、ソフト利用料 0.5%|Комиссия ядра 3%; приложения 0.5%
Suprminer：驱动需 ≥ 610；仅使用主矿池，不自动切换备用节点。|Suprminer: driver ≥ 610; primary pool only, no backup failover.|Suprminer：ドライバー ≥ 610。メインプールのみ、予備へ自動切替なし。|Suprminer: драйвер ≥ 610; только основной пул, без автоматического резерва.
Fl4shMiner：可能要求关闭 AI / 调试应用；拒绝启动时请查看日志。|Fl4shMiner may require closing AI / debugging apps; check logs if startup is refused.|Fl4shMiner：AI・デバッグアプリの終了が必要な場合があります。起動拒否はログを確認。|Fl4shMiner может потребовать закрыть ИИ / отладчики; при отказе проверьте журнал.
NVIDIA 驱动 ≥ 610；Suprminer NOID 要求|NVIDIA driver ≥ 610; required by Suprminer NOID|NVIDIA ドライバー ≥ 610、Suprminer NOID の要件|Драйвер NVIDIA ≥ 610; требование Suprminer NOID
Windows x64 CPU；GPU 模式，CPU 用于调度|Windows x64 CPU; GPU mode, CPU handles scheduling|Windows x64 CPU。GPU モード、CPU は制御用|CPU Windows x64; режим GPU, CPU управляет заданиями
官方第三方内核；按 GPU UUID 独立启动，单币挖矿。算力以实际日志为准。|Official third-party kernel; separate GPU UUID processes, single-coin mining. Hashrate comes from logs.|公式カーネル。GPU UUID ごとに単一コイン採掘を起動。ハッシュレートは実ログから取得。|Официальное стороннее ядро; отдельный процесс по UUID GPU, одна монета. Хешрейт из журнала.
内核正在安装，请稍候|Kernel installation in progress; please wait|カーネル導入中です。お待ちください|Идёт установка ядра; подождите
显卡温度读数不可用，保护停机|GPU temperature unavailable; stopped for protection|GPU 温度を取得できないため保護停止|Температура GPU недоступна; защитная остановка
支持备用节点的内核会按配置尝试切换；Suprminer 仅使用主节点。所有节点使用当前币种和同一收款钱包。|Compatible kernels try configured backups; Suprminer uses the primary only. All nodes use the same coin and wallet.|対応カーネルは予備に切替。Suprminer はメインのみ。同じコインとウォレットを使用。|Совместимые ядра используют резерв; Suprminer — только основной узел. Монета и кошелёк одинаковы.
可选择预设节点或填写同币种的自定义矿池；内核费以当前内核说明为准。|Choose a preset or a custom pool for this coin; see the selected kernel fee.|プリセットか同一コインのプールを指定。手数料は選択中のカーネル説明を参照。|Выберите готовый или свой пул этой монеты; комиссия указана для выбранного ядра.
NOID 硬件要求|NOID hardware requirements|NOID ハードウェア要件|Требования NOID
Windows x64 CPU；仅通信与调度，无 AVX2 指令要求|Windows x64 CPU; communication and scheduling; AVX2 not required|Windows x64 CPU。通信・制御用、AVX2 不要|CPU Windows x64; связь и управление, AVX2 не требуется
NVIDIA Compute Capability ≥ 8.0；RTX 30 / 40 / 50 系列|NVIDIA compute capability ≥ 8.0; RTX 30 / 40 / 50 series|NVIDIA Compute Capability ≥ 8.0、RTX 30 / 40 / 50|NVIDIA Compute Capability ≥ 8.0; серии RTX 30 / 40 / 50
建议系统内存 ≥ 8 GB；矿池挖矿无需运行全节点|8 GB system RAM recommended; pool mining needs no local node|システムメモリ 8 GB 以上を推奨。プール採掘にノード不要|Рекомендуется 8 ГБ ОЗУ; локальный узел не нужен
需支持 CUDA 13 的 NVIDIA 驱动，启动时检查|NVIDIA driver supporting CUDA 13; checked at startup|CUDA 13 対応 NVIDIA ドライバー。起動時に確認|Драйвер NVIDIA с CUDA 13; проверка при запуске
启动时校验 CUDA 兼容性|CUDA compatibility checked at startup|起動時に CUDA 互換性を確認|Совместимость CUDA проверяется при запуске
不支持：当前内核仅支持 NVIDIA|Unsupported: this kernel supports NVIDIA only|非対応：このカーネルは NVIDIA 専用|Не поддерживается: ядро только для NVIDIA
不支持：需要 Ampere 或更新架构|Unsupported: Ampere or newer required|非対応：Ampere 以降が必要|Не поддерживается: требуется Ampere или новее
矿池挖矿，无需本地全节点；每张显卡独立分配 nonce。启动先执行算法自检。|Pool mining; no local node. Independent GPU nonce namespaces; startup algorithm self-test.|プール採掘、ローカルノード不要。GPU ごとに nonce を分離し、起動時に自己テスト。|Майнинг в пуле без локального узла. Отдельные nonce для GPU; самотест при запуске.
NOID 原生 Windows CUDA · 严格校验地址、任务期限与难度；合并挖矿暂未开放。|Native Windows NOID CUDA; validates address, job expiry and target. Merged mining unavailable.|Windows ネイティブ NOID CUDA。アドレス・期限・難易度を検証。マージマイニング未対応。|NOID CUDA для Windows: проверка адреса, срока задания и цели. Объединённый майнинг недоступен.
自有内核费 0% · 软件服务费 0.5%|Own kernel fee 0%; application fee 0.5%|独自カーネル手数料 0%、ソフト利用料 0.5%|Комиссия ядра 0%; комиссия приложения 0.5%
默认推荐 · Gozero NOID CUDA 0.2.2|Recommended · Gozero NOID CUDA 0.2.2|推奨 · Gozero NOID CUDA 0.2.2|Рекомендуется · Gozero NOID CUDA 0.2.2
Gozero NOID CUDA 0.2.2 · 自编译|Gozero NOID CUDA 0.2.2 · Own build|Gozero NOID CUDA 0.2.2 · 独自ビルド|Gozero NOID CUDA 0.2.2 · Своя сборка
校验通过 · NOID|Verified · NOID|検証済み · NOID|Проверено · NOID
Gozero助手 · 悬浮监控|Gozero Assistant · Monitor|Gozeroアシスタント · モニター|Gozero Ассистент · Монитор
Gozero助手|Gozero Assistant|Gozeroアシスタント|Gozero Ассистент
设备总览|Hardware|デバイス一覧|Оборудование
收益测试|Profit test|収益テスト|Тест доходности
挖矿工作台|Mining|マイニング|Майнинг
运行日志|Logs|ログ|Журнал
偏好与保护|Settings|設定と保護|Настройки
信息窗口|Updates feed|情報|События
界面语言|Language|表示言語|Язык интерфейса
即时切换主窗口、悬浮卡片和托盘菜单，并自动保存|Applies instantly to the app, floating monitor and tray; saved automatically.|メイン画面・フローティング表示・トレイに即時反映し、自動保存します。|Мгновенно применяется к окнам и меню трея; сохраняется автоматически.
切换主题|Switch theme|テーマ切替|Сменить тему
最小化|Minimize|最小化|Свернуть
最大化 / 还原|Maximize / restore|最大化 / 元に戻す|Развернуть / восстановить
收起到悬浮窗（继续任务）|Show floating monitor (keep mining)|フローティング表示（処理継続）|Плавающее окно (продолжить работу)
返回主窗口|Restore main window|メイン画面へ|Открыть главное окно
关闭卡片，继续在系统托盘运行|Hide card; continue in tray|カードを閉じてトレイで継続|Скрыть карточку; продолжить в трее
关闭到系统托盘|Hide to tray|トレイに格納|Свернуть в трей
停止全部任务并退出程序|Stop all tasks and exit|全タスクを停止して終了|Остановить все задачи и выйти
复原主窗口|Restore window|メイン画面を復元|Восстановить окно
停止全部任务|Stop all tasks|全タスクを停止|Остановить все задачи
本机硬件与挖矿管理|Hardware and mining|ハードウェアとマイニング管理|Оборудование и майнинг
退出程序|Exit app|アプリ終了|Выйти из приложения
退出|Exit|終了|Выход
实时|Live|リアルタイム|Онлайн
重新扫描|Rescan|再スキャン|Сканировать
GPU 设备|GPU devices|GPUデバイス|Видеокарты
读取中|Reading|読取中|Чтение
清理失效选择|Remove missing devices|未検出の選択を解除|Убрать отсутствующие
Windows / 本机|Windows / local|Windows / ローカル|Windows / локально
参与 / 设备 / PCIe|Use / device / PCIe|選択 / デバイス / PCIe|Выбор / устройство / PCIe
显存|VRAM|VRAM|Видеопамять
负载|Load|負荷|Нагрузка
温度|Temp.|温度|Темп.
功耗|Power|消費電力|Мощность
正在读取本机设备，请稍候…|Reading local hardware…|ハードウェアを読取中…|Чтение оборудования…
功耗待读取|Power pending|電力の読取待ち|Ожидание мощности
点击型号查看参数 · 列表内滚动|Click a model for details · scroll within list|型番をクリックして詳細表示 · リスト内スクロール|Нажмите модель для параметров · прокрутка списка
GPU 参数|GPU details|GPU詳細|Параметры GPU
等待设备|Waiting for devices|デバイス待機中|Ожидание устройств
更多|More|詳細|Подробнее
全部参数|All details|全パラメーター|Все параметры
SMBIOS 频率与实时频率分开|SMBIOS and live clocks are separate|SMBIOS周波数と実測周波数は別項目です|Частота SMBIOS и текущая частота различаются
内存 / 主板|Memory / board|メモリ / マザーボード|Память / плата
SMBIOS / 系统|SMBIOS / system|SMBIOS / システム|SMBIOS / система
BIOS 待读取|BIOS pending|BIOS読取待ち|Ожидание BIOS
已选设备，挖什么更合适？|Compare coins for the selected devices|選択デバイスに適したコインを比較|Сравнить монеты для выбранных устройств
无法读取的参数显示 —；AMD / Intel 传感器适配中。监测不会自动启动矿工。|Unavailable readings show —. AMD / Intel sensors are in development. Monitoring does not start mining.|未取得項目は —。AMD / Intelセンサーは対応作業中です。監視で採掘は自動開始されません。|Недоступные показания: —. Датчики AMD / Intel в разработке. Мониторинг не запускает майнинг.
刷新参考收益|Refresh estimates|参考収益を更新|Обновить оценку
60s 本机测试|60s device test|60秒実機テスト|Тест GPU 60 с
尚未选择显卡|No GPU selected|GPU未選択|GPU не выбран
电价|Electricity|電力料金|Цена энергии
矿池费|Pool fee|プール手数料|Комиссия пула
参考收益 ≠ 本机实测|Estimate ≠ device measurement|参考収益 ≠ 実機測定|Оценка ≠ замер устройства
未测试|Not tested|未テスト|Нет теста
逐卡测算 / 来源明细|Per-GPU estimates / sources|GPU別の試算 / ソース|Оценки по GPU / источники
实测优先 · 输入次之 · 最后采用同型号参考|Measured → manual → same-model reference|実測 → 手動入力 → 同型番参考値|Замер → ввод → данные той же модели
币种 / 算法|Coin / algorithm|コイン / アルゴリズム|Монета / алгоритм
数据状态|Data status|データ状態|Статус данных
显卡|GPU|GPU|GPU
算力单位|Hashrate unit|ハッシュ単位|Единица хешрейта
算力|Hashrate|ハッシュレート|Хешрейт
输入币种|Input coin|入力コイン|Монета для ввода
输入设备|Input device|入力デバイス|Устройство для ввода
保存输入|Save values|入力を保存|Сохранить ввод
清除|Clear|消去|Очистить
整机实测功耗|Measured system power|システム実測電力|Измеренная мощность ПК
可选|Optional|任意|Необязательно
留空使用来源算法功耗；不包含其他配件|Blank uses algorithm reference power; other components excluded|空欄時はアルゴリズム参考電力を使用。周辺機器は含みません|Пусто: мощность алгоритма из источника, без прочих компонентов
保存计算参数|Save calculation|計算設定を保存|Сохранить расчёт
网络指标独立错峰刷新；实测/输入算力可用于未收录的显卡型号。|Network metrics refresh independently. Measured or entered rates support unlisted GPUs.|ネットワーク指標は個別更新。未登録GPUにも実測・入力値を使用できます。|Сеть обновляется независимо. Замер или ввод доступны и для отсутствующих моделей GPU.
收益＝算力 × 单位产出 × 币价，再扣软件服务费、矿工费、矿池费和电费。收益测试适用同一收费规则，15s预热后采样；不是矿池已到账收益。|Income = hashrate × unit yield × price, less app, miner, pool and electricity costs. Tests use the same fees and sample after 15s warm-up; this is not a pool payout.|収益＝ハッシュレート×単位産出量×価格から各手数料と電気代を控除。テストも同じ手数料で15秒予熱後に測定。プール入金額ではありません。|Доход = хешрейт × выход × цена, за вычетом комиссий и электричества. Тесты с той же комиссией, замер после 15 с прогрева; это не выплата пула.
性能预算|Performance budget|性能予算|Режим нагрузки
节能|Eco|省電力|Экономичный
均衡|Balanced|バランス|Баланс
高性能|High|高性能|Высокий
100%档|100% level|100%設定|Уровень 100%
应用|Apply|適用|Применить
最高档预留10%进程调度时间；GPU已排队工作仍可能短时满载，不是显卡功率锁定。|Top level reserves 10% scheduling time. Queued GPU work can still briefly reach full load; this is not a power cap.|最高設定でもスケジュール時間の10%を確保。待機中のGPU処理で瞬間的に全負荷になる場合があり、電力制限ではありません。|На максимуме резервируется 10% времени. Очередь GPU может кратко давать полную нагрузку; это не лимит мощности.
参与设备|Devices|使用デバイス|Устройства
尚未选择|Not selected|未選択|Не выбрано
选择设备|Select devices|デバイス選択|Выбрать GPU
收款地址|Wallet|受取アドレス|Кошелёк
填写自己的主网钱包地址|Your mainnet wallet address|自分のメインネットアドレス|Ваш адрес кошелька основной сети
矿机名|Worker|ワーカー名|Воркер
矿池地址|Pool URL|プールURL|Адрес пула
矿池节点|Pool node|プールノード|Узел пула
设置自动切换的备用矿池|Configure failover pools|切替用プールを設定|Настроить резервные пулы
备用矿池 · 按顺序自动切换|Backup pools · sequential failover|予備プール · 順番に自動切替|Резервные пулы · переключение по порядку
主节点连接失败后，由 KRig 按配置尝试备用节点。所有节点使用当前币种和同一收款钱包。|If the primary fails, KRig tries backups in order. All nodes use the current coin and the same wallet.|主ノード接続失敗時はKRigが予備を順に試行。全ノードで同じコインと受取アドレスを使います。|При сбое основного узла KRig пробует резервные. Все узлы используют текущую монету и тот же кошелёк.
留空表示不使用|Leave blank to disable|空欄で無効|Пусто — отключено
可选择预设节点或填写同币种的自定义矿池；其它矿池内核费最低3%。|Select a preset or enter a pool for the same coin; other pools incur at least 3% miner fee.|プリセットまたは同コインのプールを指定。他プールの内核手数料は最低3%。|Выберите узел или пул той же монеты; комиссия майнера на других пулах — от 3%.
备用|Backup|予備|Резерв
矿工内核|Miner engine|マイナー内核|Ядро майнера
挖矿内核|Mining engine|採掘内核|Ядро майнинга
Kryptex 内核费 0% / 其他池 3%|Miner fee: Kryptex 0% / others 3%|内核手数料: Kryptex 0% / 他3%|Ядро: Kryptex 0% / прочие 3%
安装内核|Install engine|内核を導入|Установить ядро
来源|Source|ソース|Источник
等待安装|Waiting to install|導入待機中|Ожидание установки
系统日志|System logs|システムログ|Системный журнал
内核安装进度|Engine installation progress|内核導入の進捗|Ход установки ядра
内核安装日志|Engine installation log|内核導入ログ|Журнал установки ядра
配置保存后可启动任务|Save settings before starting|設定を保存してから開始|Сохраните настройки перед запуском
保存配置|Save config|設定保存|Сохранить
一键挖矿|Start mining|採掘開始|Начать майнинг
停止|Stop|停止|Стоп
逐卡运行明细|Per-GPU activity|GPU別稼働状況|Активность GPU
按 PCI 地址独立调度 / 同算法汇总|Per-PCI scheduling / totals by algorithm|PCI別制御 / 同一アルゴリズム集計|Управление по PCI / итог по алгоритму
任务状态|Task status|タスク状態|Статус задачи
合计算力均值|Average total rate|合計平均レート|Средний хешрейт
分钟均值| min average|分平均| мин, среднее
分钟暂估| min estimate|分暫定| мин, оценка
分钟| min|分| мин
等待启动统计|Waiting for samples|計測開始待ち|Ожидание замеров
所选 GPU 功耗|Selected GPU power|選択GPU電力|Мощность выбранных GPU
驱动读数 / 不等于整机功耗|Driver reading / not whole-system power|ドライバー値 / システム全体ではありません|Данные драйвера / не мощность всего ПК
预估净收益 / 日|Est. net / day|推定純益 / 日|Чистый доход / день
预计净收益 / 日 · 已扣软件费|Est. net / day · app fee deducted|推定日次純益 · ソフト手数料控除済|Чистый доход / день · комиссия ПО учтена
参考估算 / 非矿池结算|Estimate / not pool settlement|参考推定 / プール精算ではありません|Оценка / не расчёт пула
过期缓存参考 / 非矿池结算|Stale estimate / not pool settlement|古い参考値 / プール精算ではありません|Устаревшая оценка / не расчёт пула
当前币价|Coin price|現在価格|Цена монеты
7日推算|7-day est.|7日予測|За 7 дней
30日推算|30-day est.|30日予測|За 30 дней
算力采样|Hashrate samples|ハッシュレート測定|Замеры хешрейта
等待矿工输出|Waiting for miner output|マイナー出力待ち|Ожидание данных майнера
真实算力采样曲线|Measured hashrate chart|実測ハッシュレート曲線|График измеренного хешрейта
最近采样|Latest|最新測定|Последний замер
最近 120 条|Last 120 entries|最新120件|Последние 120 записей
最近 300 条|Last 300 entries|最新300件|Последние 300 записей
跟随新日志|Follow new logs|新規ログに追従|Следить за журналом
跟随|Follow|追従|Следить
全部日志|All logs|全ログ|Весь журнал
尚无运行日志|No logs yet|ログはありません|Записей пока нет
挖矿运行日志|Mining log|採掘ログ|Журнал майнинга
本机观察窗口|Observation window|本機の観測期間|Окно наблюдения
本机观察|Local watch|ローカル観測|Наблюдение
正在建立监控基线|Building baseline|監視基準を作成中|Создание базы наблюдений
刷新|Refresh|更新|Обновить
全部|All|すべて|Все
新收录|Newly listed|新規追加|Новые монеты
收益变动|Profit changes|収益変動|Доходность
价格异动|Price moves|価格変動|Цена
来源可追溯 · 同类15分钟去重|Linked sources · 15-min deduplication|ソース付 · 同種は15分間重複排除|Источники доступны · без повторов 15 мин
价格：≤5分钟变化≥2% ｜ 收益：同配置预估净利上涨≥10% ｜ 目录：每2分钟检查|Price: ≥2% within 5 min · Profit: ≥10% net rise for same config · Catalog: every 2 min|価格: 5分以内に2%以上 · 同設定の推定純益: 10%以上増加 · 目録: 2分毎|Цена: ≥2% за ≤5 мин · Доход: ≥10% при той же конфигурации · Каталог: каждые 2 мин
从首次运行建立基线；新收录不等同于新项目刚发布。离线期间不补造新闻，过期来源不生成新提醒。|Baseline starts at first launch. Newly listed does not mean newly launched. No simulated offline news or alerts from stale sources.|初回起動から基準作成。新規追加は新規公開とは限りません。オフライン中の架空ニュースや古いソースの通知は生成しません。|База строится с первого запуска. Добавление не означает запуск проекта. Нет выдуманных новостей или сигналов по устаревшим данным.
导出日志|Export logs|ログを出力|Экспорт журнала
钱包与 Token 自动脱敏|Wallets and tokens are masked|アドレスとトークンは自動マスク|Кошельки и токены скрыты
保存设置|Save settings|設定を保存|Сохранить настройки
实时监测|Live monitoring|リアルタイム監視|Мониторинг
传感器刷新周期|Sensor interval|センサー更新間隔|Период датчиков
设备目录只在启动或手动扫描时更新|Device list updates at launch or manual rescan only|一覧は起動時または手動スキャン時のみ更新|Список обновляется при запуске или ручном сканировании
秒| s|秒| с
GPU 温度保护|GPU thermal protection|GPU温度保護|Защита GPU по температуре
默认90°C；达到阈值停机，传感器失联10s也停止|Default 90°C; stops at threshold or after 10s without sensors|初期値90°C。到達時またはセンサー応答なし10秒で停止|По умолчанию 90°C; остановка по порогу или при потере датчиков на 10 с
恢复90°C|Reset to 90°C|90°Cに戻す|Вернуть 90°C
窗口关闭行为|Window close behavior|閉じる動作|Закрытие окна
主窗口X / 最小化进入悬浮卡片；卡片X收起到托盘，右键复原或退出|Main X/minimize opens the floating card; card X hides to tray. Right-click tray to restore or exit.|メインのX/最小化でカード表示。カードのXでトレイに格納。右クリックで復元または終了。|X/сворачивание открывает карточку; X на карточке скрывает в трей. Правый клик: восстановить или выйти.
收起为悬浮窗|Floating monitor|フローティング表示|Плавающее окно
自动启动 / 自动恢复挖矿|Auto-start / auto-resume mining|自動採掘 / 自動再開|Автозапуск / автовозобновление
每次启动都需要手动开始；异常停止后不会自行重启|Start manually each time; no automatic restart after a fault|開始は毎回手動。異常停止後に自動再起動しません|Каждый запуск вручную; после сбоя автоматического перезапуска нет
关闭|Off|無効|Выкл.
升级 / 算力资料|Updates / benchmark data|更新 / 測定データ|Обновления / замеры
检查更新|Check updates|更新を確認|Проверить обновления
更新服务准备中|Preparing updates|更新サービス準備中|Подготовка обновлений
新增币种通过受验证版本发布，不执行远程任意命令。|New coins arrive in verified releases; no arbitrary remote commands.|新コインは検証済み版で追加。任意のリモートコマンドは実行しません。|Новые монеты — в проверенных версиях; произвольные удалённые команды не выполняются.
下载新版|Download update|新版をダウンロード|Скачать обновление
贡献设备实测记录|Share device measurements|実測データを共有|Поделиться замерами
自愿分享型号、算法、实测算力、功耗、档位；不含钱包、序列号或设备唯一标识。|Optional sharing of model, algorithm, measured rate, power and mode; no wallet, serial or unique device ID.|型番・方式・実測速度・電力・モードを任意共有。アドレス・製造番号・固有IDは含みません。|Добровольно: модель, алгоритм, хешрейт, мощность, режим. Без кошелька, серийного номера или ID устройства.
自愿分享实测记录|Opt in to sharing measurements|実測記録の共有に参加|Добровольная отправка замеров
尚无记录|No records yet|記録なし|Записей пока нет
仅真实矿工采样进入参考库；手动输入和实验核测试分开，不混作矿池结果。|Only miner measurements enter the reference set. Manual and experimental data remain separate from pool results.|実測のみを参考庫に登録。手動入力と実験内核テストはプール結果と区別します。|В базу идут только замеры майнера. Ручной ввод и экспериментальные тесты отделены от результатов пула.
导出记录|Export records|記録を出力|Экспорт замеров
Gozer QTC CUDA · 实验内核|Gozer QTC CUDA · experimental|Gozer QTC CUDA · 実験内核|Gozer QTC CUDA · экспериментальное ядро
自编译计算内核；矿池协议尚未接入，当前挖矿仍使用KRig。|Custom compute core; no pool protocol yet. Mining currently uses KRig.|自前計算内核。プール接続は未対応で、採掘にはKRigを使用します。|Собственное вычислительное ядро без протокола пула. Для майнинга используется KRig.
自检内核|Core self-test|内核自己テスト|Проверить ядро
数据与隐私|Data and privacy|データとプライバシー|Данные и приватность
硬件信息保留在本机|Hardware data stays local|ハードウェア情報はローカル保存|Данные оборудования локальны
读取公共参考与所填地址的矿池账本；不上传硬件清单|Reads public references and the entered wallet's pool ledger; no hardware inventory upload|公開参考情報と入力アドレスのプール台帳を読取。機器一覧は送信しません|Чтение справочных данных и счёта кошелька в пуле; список оборудования не отправляется
内核完整性|Engine integrity|内核の整合性|Целостность ядра
版本固定 + 压缩包和 EXE 双 SHA256 校验；不修改杀毒软件或防火墙|Pinned version + ZIP and EXE SHA256 checks; antivirus and firewall unchanged|固定バージョンとZIP・EXEのSHA256検証。ウイルス対策とFWは変更しません|Фиксированная версия + SHA256 ZIP и EXE; антивирус и брандмауэр не меняются
内核来源|Engine source|内核配布元|Источник ядра
Beta版尚未完成 AMD / Intel 真机监测、混卡挖矿与长时间稳定性验证。TSC Windows 运行适配尚未完成；不对缺失参数和收益作推算填充。|Beta: AMD / Intel monitoring, mixed-GPU mining and long-run stability are not fully validated. TSC Windows support is pending; missing values are not invented.|Beta版: AMD / Intel監視・混在GPU採掘・長期安定性は未検証。TSC Windowsは未対応。欠損値を推測で補完しません。|Beta: мониторинг AMD / Intel, смешанные GPU и длительная работа ещё не полностью проверены. TSC для Windows не готов; пропуски не заполняются выдуманными данными.
正在识别本机|Detecting hardware|機器を検出中|Определение оборудования
本机硬件 / 实时监控|Local hardware / live monitoring|ローカル機器 / リアルタイム監視|Оборудование / мониторинг
查看服务费规则、当前收款方和收款地址|View fee rules, recipient and address|手数料規則・受取人・アドレスを表示|Правила комиссии, получатель и адрес
服务费|Fee|手数料|Комиссия
Gzero区块引擎|Gzero Block Engine|Gzeroブロックエンジン|Gzero Block Engine
矿池支付记录 · 最近10笔|Pool payouts · latest 10|プール支払い · 最新10件|Выплаты пула · последние 10
已确认余额|Confirmed|確定残高|Подтверждено
待确认收益|Pending|未確定収益|Ожидается
累计已支付|Total paid|支払済合計|Всего выплачено
近7日收益|Last 7 days|直近7日収益|Доход за 7 дней
近30日收益|Last 30 days|直近30日収益|Доход за 30 дней
支付门槛|Threshold|支払閾値|Порог выплаты
矿池实际收益|Pool earnings|プール実収益|Доход в пуле
地址账本|Address ledger|アドレス台帳|Счёт адреса
支付记录|Payouts|支払い履歴|Выплаты
账单|Ledger|台帳|Счёт
保存收款地址后自动查询|Auto-query after saving wallet|受取アドレス保存後に自動照会|Запрос после сохранения кошелька
保存地址后自动查询|Auto-query after saving address|アドレス保存後に自動照会|Запрос после сохранения адреса
正在读取矿池账本…|Reading pool ledger…|プール台帳を読取中…|Чтение счёта пула…
部分接口不可用 · 保留可用数据|Some APIs unavailable · keeping available data|一部API利用不可 · 取得済みデータを保持|Часть API недоступна · данные сохранены
每60秒刷新 · 单位|Refresh every 60s · unit|60秒毎更新 · 単位|Обновление каждые 60 с · единица
仅本池此地址全部矿机|All workers for this address at this pool only|このプールの当該アドレスの全ワーカーのみ|Все воркеры этого адреса только в данном пуле
（含备用矿池）|(including backups)|（予備プールを含む）|(включая резервные пулы)
缓存数据|Cached data|キャッシュデータ|Кэшированные данные
正在读取支付记录…|Reading payouts…|支払い記録を読取中…|Чтение выплат…
矿池未返回支付记录。余额达到门槛后，支付时间以矿池规则为准。|No payouts returned. Once the balance reaches the threshold, the pool sets payout timing.|支払い記録なし。残高が閾値に達した後の支払時刻はプール規則によります。|Выплат нет. После достижения порога срок выплаты определяется пулом.
矿池共|Pool total:|プール合計|Всего в пуле:
笔，展示接口第一页最近最多10笔。完整记录请查看矿池账单。| payouts; showing up to 10 from the first API page. See pool ledger for all records.|件。APIの1ページ目の最新最大10件を表示。全件はプール台帳を参照。| выплат; показано до 10 с первой страницы API. Все записи — в счёте пула.
查看矿池完整账单|Open full pool ledger|全プール台帳を開く|Открыть полный счёт пула
时间|Time|日時|Время
金额|Amount|金額|Сумма
状态|Status|状態|Статус
交易ID|Transaction ID|取引ID|ID транзакции
设备算力均值|Average device rate|デバイス平均速度|Средний хешрейт GPU
等待选择GPU|Select a GPU|GPUを選択|Выберите GPU
尚未选择GPU|No GPU selected|GPU未選択|GPU не выбран
预计日净利|Est. net/day|推定日次純益|Чистый доход/день
全网|Network|ネットワーク|Сеть
内存|RAM|メモリ|ОЗУ
已停止|Stopped|停止済み|Остановлено
监控待机|Monitoring|監視待機|Мониторинг
挖矿中|Mining|採掘中|Майнинг
当前任务性能预算|Active task budget|現在の性能予算|Режим текущей задачи
已保存性能预算|Saved budget|保存済み性能予算|Сохранённый режим
预算不等于实时GPU占用或功率上限|Budget is not live GPU load or a power cap|予算はGPU実負荷や電力上限ではありません|Режим не равен текущей загрузке или лимиту мощности GPU
采样覆盖|Sample coverage|測定カバー率|Охват замеров
GPU已读|GPUs read|取得済みGPU|Прочитано GPU
样本过期或已停止|Samples stale or stopped|測定値が古いか停止済み|Замеры устарели или остановлены
均值|average|平均|среднее
暂估|provisional|暫定|предварительно
计算核心 / 单元|Compute cores / units|演算コア / ユニット|Ядра / блоки
显存容量|VRAM size|VRAM容量|Объём VRAM
核心频率|Core clock|コア周波数|Частота ядра
显存时钟|Memory clock|メモリクロック|Частота VRAM
风扇|Fan|ファン|Вентилятор
核心温度|Core temp.|コア温度|Темп. ядра
显存占用|VRAM used|VRAM使用量|Занято VRAM
功耗上限|Power limit|電力上限|Лимит мощности
当前 PCIe|Current PCIe|現在PCIe|Текущий PCIe
最大 PCIe|Max PCIe|最大PCIe|Макс. PCIe
链路速率|Link speed|リンク速度|Скорость линии
驱动版本|Driver|ドライバー|Драйвер
架构 / 位宽|Arch. / bus|構成 / バス幅|Арх. / шина
板卡功耗|Board power|ボード電力|Мощность платы
热点 / 结温|Hotspot / junction|ホットスポット / 接合部|Hotspot / переход
监測来源|Sensor source|監視ソース|Источник датчика
物理核 / 线程|Cores / threads|コア / スレッド|Ядра / потоки
CPU 总占用|CPU load|CPU使用率|Загрузка CPU
实时频率|Live clock|実測周波数|Текущая частота
SMBIOS 频率|SMBIOS clock|SMBIOS周波数|Частота SMBIOS
L1 缓存|L1 cache|L1キャッシュ|Кэш L1
CPU 包温度|CPU package temp.|CPUパッケージ温度|Темп. CPU
CPU 包功耗|CPU package power|CPUパッケージ電力|Мощность CPU
插槽|Socket|ソケット|Сокет
逻辑核采样|Logical cores|論理コア測定|Логические ядра
安装 / 模块|Installed / modules|搭載量 / モジュール|Объём / модули
已用 / 可用|Used / available|使用中 / 使用可能|Занято / доступно
配置速率|Configured rate|設定転送速度|Заданная скорость
实际时钟|Actual clock|実クロック|Реальная частота
内存时序|RAM timings|メモリタイミング|Тайминги ОЗУ
工作通道|Channels|動作チャネル|Каналы
厂商|Vendor|メーカー|Производитель
配置正在保存，请稍候|Saving settings, please wait|設定保存中です。お待ちください|Сохранение настроек, подождите
未识别到物理 GPU，可重新扫描|No physical GPU detected; try rescanning|物理GPU未検出。再スキャンしてください|GPU не обнаружен; повторите сканирование
已选|Selected|選択済み|Выбрано
项失效|missing|件未検出|отсутствует
扫描|Scan|スキャン|Сканирование
该设备的矿工支持或 PCI 地址未就绪|Miner support or PCI address is not ready|マイナー対応またはPCIアドレス未取得|Нет поддержки майнера или адреса PCI
已知板卡功耗|Known board power|取得済みボード電力|Известная мощность GPU
项未知|unknown|件不明|неизвестно
未识别到 GPU|No GPU detected|GPU未検出|GPU не обнаружен
未读取|Not read|未取得|Нет данных
驱动实时|Live driver|ドライバー実測|Драйвер, онлайн
未接入|Unavailable|未対応|Не подключено
等待设备参数|Waiting for hardware|機器パラメーター待ち|Ожидание параметров
核 / 实时|cores / live|コア / リアルタイム|ядер / онлайн
主板未读取|Board unavailable|マザーボード未取得|Нет данных платы
系统就绪|System ready|準備完了|Система готова
传感器部分不可用 · 详情见字段|Some sensors unavailable · see details|一部センサー利用不可 · 詳細を確認|Часть датчиков недоступна · см. параметры
传感器|Sensors|センサー|Датчики
张 GPU|GPUs|枚 GPU|GPU
等待来源|Waiting for source|ソース待ち|Ожидание источника
毛收益|Gross income|総収益|Валовой доход
预计电费|Est. electricity|推定電気代|Стоимость энергии
参考功耗|Reference power|参考電力|Справочная мощность
7日净利推算|7-day net est.|7日純益予測|Чистый доход за 7 дн.
30日净利推算|30-day net est.|30日純益予測|Чистый доход за 30 дн.
配置|Configure|設定|Настройка
可估算|estimated|推定可能|рассчитано
缓存|Cached|キャッシュ|Кэш
未匹配|Unmatched|該当なし|Нет совпадения
本机采样 × 单位产出|Measured rate × unit yield|実測 × 単位産出量|Замер × выход
手动输入 × 单位产出|Manual rate × unit yield|入力 × 単位産出量|Ввод × выход
过期参考 / 非实测|Stale reference / not measured|古い参考値 / 非実測|Старая оценка / не замер
参考 / 非实测|Reference / not measured|参考値 / 非実測|Оценка / не замер
该型号无数据|No data for this model|この型番のデータなし|Нет данных этой модели
请先选择显卡|Select a GPU first|先にGPUを選択|Сначала выберите GPU
来源暂不可用，保留已缓存参考数据：|Source unavailable; cached references retained:|ソース利用不可。キャッシュを保持：|Источник недоступен; сохранены данные кэша:
数据|Data|データ|Данные
过期项目标记缓存，非当前收益保证。|Stale items are marked cached; no guarantee of current profit.|古い値はキャッシュ表示。現在収益を保証しません。|Устаревшие записи помечены; текущий доход не гарантируется.
点击刷新参考收益；型号未匹配时显示 —，不会移用其他型号。|Refresh estimates; unmatched models show —, not another model's data.|参考収益を更新。型番不一致時は — と表示し、他型番値は使用しません。|Обновите оценки; при отсутствии модели —, данные другой модели не подставляются.
最近测试|Last test|前回テスト|Последний тест
张卡取得足够样本|GPUs with enough samples|枚のGPUで十分なサンプル|GPU с достаточными замерами
自定义|Custom|カスタム|Свой
新加坡|Singapore|シンガポール|Сингапур
香港|Hong Kong|香港|Гонконг
美国|US|米国|США
欧洲|Europe|欧州|Европа
全球|Global|グローバル|Глобальный
默认推荐|Recommended|推奨|Рекомендуется
手动指定|Manual|手動選択|Вручную
实验 / 未接矿池|Experimental / no pool|実験 / プール未接続|Эксперимент / без пула
按所选周期统计逐卡时间加权均值|Time-weighted per-GPU means over the selected window|選択期間のGPU別時間加重平均|Среднее по времени для GPU за выбранный период
覆盖|Coverage|カバー率|Охват
上期均值|previous average|前回平均|предыдущее среднее
未满周期|partial window|期間未完了|неполный период
本期缺测 · 保留上次均值|Missing samples · previous average retained|測定不足 · 前回平均を保持|Нет замеров · сохранено предыдущее среднее
采样中断|Sampling interrupted|測定中断|Замеры прерваны
采样中|Sampling|測定中|Измерение
后结算|until calculation|後に集計|до расчёта
下次|Next|次回|Следующее
首轮暂估|First-window estimate|初回暫定値|Предварительная оценка
首轮尚未满周期|First window incomplete|初回期間未完了|Первый период не завершён
已结算|Calculated|集計済み|Рассчитано
每卡独立时间加权后合计。日志超过60秒缺失不计入有效采样，覆盖率为最低设备覆盖率。|Sum of per-GPU time-weighted means. Gaps over 60s are excluded; coverage is the lowest device coverage.|GPU別の時間加重平均を合計。60秒超の欠落は除外。カバー率は機器の最低値です。|Сумма средних GPU по времени. Пробелы свыше 60 с исключены; охват — минимальный среди устройств.
当前样本过期或已停止。|Current samples stale or stopped.|現在の測定値は古いか停止済みです。|Текущие замеры устарели или остановлены.
连接下载源|Connecting to download|ダウンロード元に接続|Соединение с сервером
下载内核|Downloading engine|内核ダウンロード|Загрузка ядра
校验安装包|Verifying package|パッケージ検証|Проверка пакета
解压内核|Extracting engine|内核を展開|Распаковка ядра
校验可执行文件|Verifying executable|実行ファイル検証|Проверка EXE
可用内核|Engine ready|内核利用可能|Ядро готово
安装失败 · 可重试|Install failed · retry available|導入失敗 · 再試行可能|Ошибка установки · повторите
校验通过|Verified|検証成功|Проверено
总大小待确认|Total size pending|総サイズ未確定|Размер уточняется
请稍候…|Please wait…|お待ちください…|Подождите…
下载与校验中…|Downloading / verifying…|ダウンロード / 検証中…|Загрузка / проверка…
已校验|Verified|検証済み|Проверено
暂无可用版本|No available version|利用可能版なし|Нет доступной версии
可用|Ready|利用可能|Доступно
未安装|Not installed|未導入|Не установлено
默认推荐与手动指定均使用已适配内核；Gozer CUDA实验核尚未接入矿池|Recommended and manual choices use supported engines; experimental Gozer CUDA has no pool protocol|推奨・手動とも対応済内核を使用。実験Gozer CUDAはプール未接続|Рекомендованный и ручной выбор используют поддерживаемые ядра; Gozer CUDA пока без пула
各币种独立保存内核选择|Engine choice saved per coin|内核選択はコイン別に保存|Ядро сохраняется для каждой монеты
PRL / QTC：KRig 上游支持 NVIDIA 与 AMD；本版按 PCI 地址启动独立进程，尚未完成实机挖矿验收。无传感器设备不具备温度保护。|PRL / QTC: KRig supports NVIDIA and AMD; separate processes by PCI address. Real-device mining validation is incomplete. No thermal protection without sensors.|PRL / QTC: KRigはNVIDIA/AMD対応。PCI別に独立プロセスを起動。実機採掘検証は未完了。センサーなしの機器は温度保護不可。|PRL / QTC: KRig поддерживает NVIDIA и AMD; процессы по PCI. Проверка майнинга на оборудовании не завершена. Без датчиков нет термозащиты.
待机|Idle|待機|Ожидание
启动中|Starting|起動中|Запуск
运行中|Running|稼働中|Работает
停止中|Stopping|停止中|Остановка
60 秒测试中，结束后自动停机|60s test; stops automatically|60秒テスト中。終了後に自動停止|Тест 60 с; затем автоостановка
任务运行中 · 不自动恢复|Task running · no auto-resume|タスク稼働中 · 自動再開なし|Задача выполняется · без автовозобновления
不会自动挖矿，保存配置后手动启动|No auto-mining; save settings and start manually|自動採掘なし。設定保存後に手動で開始|Без автомайнинга; сохраните и запустите вручную
运行 / 已采样|Running / sampled|稼働 / 測定済み|Работает / замер есть
运行 / 等待算力|Running / awaiting rate|稼働 / 速度待ち|Работает / ждём хешрейт
启动失败|Start failed|起動失敗|Ошибка запуска
准备中|Preparing|準備中|Подготовка
尚未选择设备|No devices selected|デバイス未選択|Устройства не выбраны
真实采样|Measured samples:|実測サンプル|Измеренных точек:
点|points|点|точек
已暂停 / 等待新数据|Paused / waiting for data|一時停止 / 新データ待ち|Пауза / ожидание данных
等待矿工实际算力输出|Waiting for measured miner rate|マイナーの実測速度待ち|Ожидание хешрейта майнера
未在测试|No test running|テスト未実行|Тест не запущен
挖矿配置已保存|Mining settings saved|採掘設定を保存しました|Настройки майнинга сохранены
内核安装并校验完成，尚未开始挖矿|Engine installed and verified; mining not started|内核導入・検証完了。採掘は未開始|Ядро установлено и проверено; майнинг не запущен
设置已保存|Settings saved|設定を保存しました|Настройки сохранены
日志已导出|Logs exported|ログを出力しました|Журнал экспортирован
请使用 GozerAssistant.exe 打开此界面，浏览器不能读取本机硬件。|Open with GozerAssistant.exe; browsers cannot read local hardware.|GozerAssistant.exeで開いてください。ブラウザーでは機器を取得できません。|Откройте GozerAssistant.exe; браузер не читает оборудование ПК.
更新中|Updating|更新中|Обновление
来源异常|Source error|ソース異常|Ошибка источника
缓存 / 过期|Cached / stale|キャッシュ / 期限切れ|Кэш / устарело
全网算力|Network hashrate|全体ハッシュレート|Хешрейт сети
当前难度|Difficulty|現在難易度|Сложность
参考币价|Reference price|参考価格|Справочная цена
网络数据|Network data|ネットワークデータ|Данные сети
未获取|Not fetched|未取得|Нет данных
服务费规则与收款地址|Fee rules and addresses|手数料規則と受取アドレス|Правила комиссии и адреса
待机 · 挖矿与收益测试统一计费|Idle · same fee for mining and tests|待機 · 採掘と収益テストは同じ手数料|Ожидание · одинаковая комиссия майнинга и тестов
服务收款时段|Service fee period|手数料受取期間|Период комиссии
用户收款时段|User mining period|ユーザー受取期間|Период пользователя
正在切换收款方|Switching recipient|受取先を切替中|Смена получателя
剩余|Remaining|残り|Осталось
测试计费累计中|Accumulating test fee time|テスト手数料時間を累積中|Накопление комиссии теста
约|About|約|Около
分钟后服务时段|min until fee period|分後に手数料期間|мин до периода комиссии
点击查看规则与地址|Click for rules and addresses|クリックで規則とアドレスを表示|Нажмите: правила и адреса
软件费|App fee|ソフト手数料|Комиссия ПО
矿工费|Miner fee|マイナー手数料|Комиссия майнера
未确认|Unconfirmed|未確定|Не подтверждено
来源暂不完整|Incomplete source data|ソースデータ不足|Неполные данные источника
检查目录中|Checking catalog|目録を確認中|Проверка каталога
来源暂不可用|Source unavailable|ソース利用不可|Источник недоступен
个资产|assets|資産|активов
暂无法连接来源：|Cannot reach source:|ソースに接続できません：|Источник недоступен:
正在积累真实观察数据。达到阈值后显示提醒，不生成模拟新闻。|Collecting observations. Alerts appear when thresholds are met; no simulated news.|実データを収集中。閾値到達で通知。架空ニュースは生成しません。|Сбор наблюдений. Сигналы по порогам; без выдуманных новостей.
检查更新中|Checking updates|更新確認中|Проверка обновлений
更新服务暂不可用|Update service unavailable|更新サービス利用不可|Сервис обновлений недоступен
可升级至|Update available:|更新可能:|Доступно обновление:
当前版本|Current version|現在のバージョン|Текущая версия
尚未检查更新|Updates not checked|更新未確認|Обновления не проверялись
更新清单经过Ed25519签名验证|Update manifest verified with Ed25519|更新マニフェストをEd25519で検証|Манифест обновления проверен Ed25519
本地|Local|ローカル|Локально
条 · 已分享|records · shared|件 · 共有済み|записей · отправлено
条|records|件|записей
等待重试|Awaiting retry|再試行待ち|Ожидание повтора
先选择显卡|Select a GPU first|先にGPUを選択|Сначала выберите GPU
请输入实际算力|Enter measured hashrate|実測速度を入力|Введите измеренный хешрейт
已按输入算力重新测算；实测结果存在时优先使用实测|Recalculated from input; measured data takes priority|入力で再計算。実測があれば実測を優先|Пересчитано по вводу; замеры приоритетны
已填入90°C，点击保存设置后生效|90°C entered; save settings to apply|90°Cを入力。設定保存で適用|Введено 90°C; сохраните настройки
查询|Query|照会|Запрос
矿池|Pool|プール|Пул
选择|Select|選択|Выбрать
查看|View|表示|Просмотр
完整参数|all parameters|全パラメーター|все параметры
类型|Type|種類|Тип
系统|System|システム|Система
硬件|Hardware|機器|Оборудование
安装|Install|導入|Установка
收益|Income|収益|Доход
窗口|Window|ウィンドウ|Окно
实验核|Experimental core|実験内核|Экспериментальное ядро
矿工|Miner|マイナー|Майнер
错误|Error|エラー|Ошибка
失败|Failed|失敗|Ошибка
超时|Timeout|タイムアウト|Тайм-аут
Gozero 软件服务费 · 0.5%|Gozero service fee · 0.5%|Gozeroソフト手数料 · 0.5%|Комиссия Gozero · 0.5%
挖矿与收益测试自动按0.5%计费，无需勾选。约199分钟有效GPU运行时间累计最多60秒服务时段。服务时段临时将矿工收款地址切换为下列地址，再恢复你的钱包；切换有重连开销。短测试的零碎服务时间保存于本机；累计满60秒后，在下一次任务开始先结算，再开始完整60秒采样。停止任务同时停止计费调度。|Mining and tests automatically incur 0.5%. About 199 minutes of effective GPU runtime accrues up to 60 seconds of fee mining. The wallet temporarily switches to the addresses below, then back; reconnecting has overhead. Fractional test fee time is saved locally; at 60 seconds it is settled before the next full 60-second test. Stopping a task also stops fee scheduling.|採掘とテストは自動で0.5%課金。約199分の有効GPU稼働で最大60秒の手数料期間が累積します。その間は下記アドレスに切り替え、その後元に戻ります。再接続の負荷があります。短いテストの端数時間はローカル保存し、60秒累積後の次回開始時に精算してから60秒測定します。停止で課金制御も止まります。|Майнинг и тесты: автоматическая комиссия 0,5%. За примерно 199 минут работы GPU накапливается до 60 секунд майнинга комиссии. Кошелёк временно меняется на адреса ниже, затем возвращается; переподключение требует времени. Доли времени тестов хранятся локально; накопленные 60 секунд отрабатываются до следующего полного теста. Остановка прекращает и планирование комиссии.
目标为同设备长周期0.5%算力时间。不是逐份额分流，币量受算力变化、有效份额、矿池门槛及结算影响；不承诺每100币恰好支付0.5币。切换、异常、停止可在日志查询，未满时段余额留存本机，不提前收费。|Target: 0.5% of long-run hashrate time on the same device, not share-by-share routing. Coin amounts depend on rate, accepted shares and pool settlement; exactly 0.5 coins per 100 is not guaranteed. Switches, faults and stops are logged. Unsettled time stays local without advance charges.|目標は同一機器の長期ハッシュ時間の0.5%で、シェア毎の分配ではありません。報酬は速度・有効シェア・閾値・精算に依存し、100コイン毎に正確に0.5コインとは限りません。切替・異常・停止はログに記録。未精算時間はローカル保存し、前払いしません。|Цель — 0,5% времени хешрейта на том же устройстве, а не доля каждой шары. Монеты зависят от хешрейта, принятых шар и расчётов пула; ровно 0,5 из 100 не гарантируется. Переключения, сбои и остановки в журнале. Неотработанное время хранится локально без авансовой платы.
软件费与KRig内核费、矿池费分开：KRig在Kryptex池0%，其他池最低3%；电费另算。停止任务或明确退出程序会结束用户与服务时段的所有任务；关闭X收起窗口后任务继续。|App, KRig and pool fees are separate: KRig is 0% at Kryptex, at least 3% elsewhere; electricity is extra. Stop or Exit ends all user and fee tasks. Closing X hides the window and keeps tasks running.|ソフト・KRig・プール手数料は別。KRigはKryptexで0%、他は最低3%。電気代別。停止または明示終了でユーザーと手数料の全タスクを終了。Xで格納した場合は継続します。|Комиссии ПО, KRig и пула отдельные: KRig — 0% в Kryptex, от 3% в других пулах; электричество отдельно. Стоп или Выход завершают все задачи. X скрывает окно, задачи продолжаются.
已启用自愿分享：上传已保存和后续实测，服务器访问日志可能包含IP|Sharing enabled: saved and future measurements upload; server access logs may contain your IP|共有を有効化。保存済みと今後の実測を送信。サーバーログにIPが含まれる場合があります|Отправка включена: сохранённые и будущие замеры; журнал сервера может содержать IP
已停止后续上传；已分享的数据保留在参考库|Future uploads stopped; shared data remains in the reference set|今後の送信を停止。共有済みデータは参考庫に残ります|Будущая отправка остановлена; отправленные данные остаются в базе
GPU计算校验通过|GPU compute checks passed:|GPU計算検証に成功|Проверки вычислений GPU пройдены:
项|checks|件|проверок
尚未接矿池|No pool protocol yet|プール未接続|Пул ещё не подключён
性能预算已应用：|Performance budget applied:|性能予算を適用：|Режим применён:
进程运行时间；实际GPU负载以驱动读数为准| process runtime; actual GPU load is reported by the driver|プロセス稼働時間。実際のGPU負荷はドライバー値を参照| времени процесса; реальная нагрузка GPU — по драйверу
NVIDIA 驱动 / nvidia-smi；传感器超过10秒未更新显示 —|NVIDIA / nvidia-smi; sensor readings older than 10s show —|NVIDIA / nvidia-smi。10秒超未更新のセンサーは —|NVIDIA / nvidia-smi; данные старше 10 с: —
驱动未提供核心数；规格库待核验|Driver did not report cores; specifications pending verification|コア数未報告。仕様データは検証待ち|Драйвер не сообщил ядра; спецификации не проверены
驱动报告总显存，不采用 WMI 32 位 AdapterRAM|Total VRAM from driver, not WMI 32-bit AdapterRAM|ドライバーの総VRAM値。WMIの32bit AdapterRAMは不使用|Объём VRAM от драйвера, не WMI 32-bit AdapterRAM
不等于显存有效传输速率|not effective memory transfer rate|実効メモリ転送速度とは異なります|не эффективная скорость передачи VRAM
按已读取 PCIe 代际对应的每通道标准速率，不等于当前吞吐量|Standard per-lane rate for detected PCIe generation, not current throughput|取得したPCIe世代の1レーン標準速度。実転送量とは異なります|Стандартная скорость линии PCIe, не текущая пропускная способность
Windows CIM 或 NVIDIA 驱动|Windows CIM or NVIDIA driver|Windows CIMまたはNVIDIAドライバー|Windows CIM или драйвер NVIDIA
热点 / 显存结温尚未接入|Hotspot / VRAM junction sensor unavailable|ホットスポット / VRAM接合部温度は未対応|Датчики hotspot / перехода VRAM не подключены
设备识别与传感器支持不同|Device detection differs from sensor support|機器識別とセンサー対応は別です|Обнаружение устройства не означает поддержку датчиков
CIM：第一个 CPU 插槽；多路系统详见全部参数|CIM: first CPU socket; see all details for multi-socket systems|CIM: 最初のCPUソケット。複数CPUは全パラメーター参照|CIM: первый сокет CPU; многосокетные данные — во всех параметрах
Windows 逻辑处理器累计时间差分|Windows logical-processor time deltas|Windows論理プロセッサー累積時間差分|Разность времени логических процессоров Windows
当前未接入每核有效频率传感器|Per-core effective-clock sensor unavailable|コア別実効周波数センサー未対応|Датчик эффективной частоты ядер не подключён
SMBIOS 报告值，不是实时频率或最高睿频|SMBIOS value, not live clock or peak boost|SMBIOS値。実測周波数や最大ブーストではありません|Значение SMBIOS, не текущая частота или максимальный boost
SMBIOS 枚举 L1 容量合计，不推断缓存拓扑|Sum of SMBIOS L1 sizes; no inferred cache topology|SMBIOSのL1容量合計。キャッシュ構成は推測しません|Сумма L1 из SMBIOS; топология кэша не предполагается
CIM，未提供的缓存不填零|CIM; missing cache sizes are not filled with zero|CIM。未取得のキャッシュをゼロで補完しません|CIM; неизвестный размер кэша не заменяется нулём
CPU 温度传感器尚未接入|CPU temperature sensor unavailable|CPU温度センサー未対応|Датчик температуры CPU не подключён
CPU 包功耗尚未接入|CPU package power unavailable|CPUパッケージ電力未対応|Мощность пакета CPU недоступна
SMBIOS 插槽名称|SMBIOS socket name|SMBIOSソケット名|Название сокета SMBIOS
详情中可查看每逻辑处理器占用|Per-logical-processor load in details|詳細で論理プロセッサー別使用率を確認|Загрузка логических процессоров в подробностях
SMBIOS 安装容量 / 模块数量|SMBIOS installed capacity / module count|SMBIOS搭載容量 / モジュール数|SMBIOS: объём / число модулей
操作系统可见已用 / 可用内存，可能不等于安装容量|OS-visible used / available RAM; may differ from installed capacity|OSが認識する使用中 / 使用可能量。搭載容量と異なる場合あり|Занятая / доступная ОС память; может отличаться от установленной
SMBIOS 配置传输速率；不是 MHz 时钟|SMBIOS configured transfer rate, not MHz clock|SMBIOS設定転送速度。MHzクロックではありません|Скорость передачи SMBIOS, не частота в МГц
内存控制器时钟未接入|Memory-controller clock unavailable|メモリコントローラー周波数未対応|Частота контроллера памяти недоступна
SPD 时序未读取|SPD timings not read|SPDタイミング未取得|Тайминги SPD не прочитаны
不按插槽数推断单双通道|Channel mode not inferred from slot count|スロット数からチャネル数を推定しません|Режим каналов не определяется по числу слотов
SMBIOS 厂商字段 / 已知 JEDEC 厂商代码映射|SMBIOS vendor / known JEDEC vendor mapping|SMBIOSメーカー / 既知JEDECコード対応|SMBIOS: производитель / известные коды JEDEC
TSC 需要矿池 Token / Linux 内核|TSC requires pool token / Linux engine|TSCはプールToken / Linux内核が必要|TSC требует токен пула / ядро Linux
厂商 / PCIe 地址|Vendor / PCIe address|メーカー / PCIeアドレス|Производитель / адрес PCIe
设备 ID|Device ID|デバイスID|ID устройства
核心数 / 架构|Core count / architecture|コア数 / 構成|Ядра / архитектура
显存位宽|VRAM bus width|VRAMバス幅|Шина VRAM
核心 / 显存时钟|Core / VRAM clock|コア / VRAMクロック|Частота ядра / VRAM
驱动；不是有效传输率|Driver; not effective transfer rate|ドライバー値。実効転送速度ではありません|Драйвер; не эффективная скорость
GPU 占用|GPU utilization|GPU使用率|Загрузка GPU
依硬件支持|Hardware dependent|機器の対応による|Зависит от оборудования
当前 / 最大 PCIe|Current / max PCIe|現在 / 最大PCIe|Текущий / макс. PCIe
热点 / 显存结温|Hotspot / VRAM junction|ホットスポット / VRAM接合部|Hotspot / переход VRAM
尚未接入|Not yet supported|未対応|Пока не поддерживается
传感器采样时间|Sensor timestamp|センサー測定時刻|Время замера датчика
未接入或已过期|Unavailable or stale|未対応または期限切れ|Недоступно или устарело
KRig 按 PCI 地址选择设备|KRig selects devices by PCI address|KRigはPCIアドレスで機器を選択|KRig выбирает GPU по адресу PCI
上游支持 NVIDIA / AMD；待挖矿验收|Upstream supports NVIDIA / AMD; mining validation pending|上流はNVIDIA / AMD対応。採掘検証待ち|Поддержка NVIDIA / AMD; проверка майнинга ожидается
CPU 拓扑 / 逻辑核占用|CPU topology / logical core load|CPU構成 / 論理コア負荷|Топология CPU / нагрузка ядер
物理核 / 逻辑线程|Physical cores / logical threads|物理コア / 論理スレッド|Физические ядра / логические потоки
SMBIOS 当前 / 最大频率|SMBIOS current / max clock|SMBIOS現在 / 最大周波数|SMBIOS: текущая / макс. частота
非实时频率 / 非最高睿频|Not live clock / not peak boost|実測周波数 / 最大ブーストではありません|Не текущая частота / не макс. boost
P / E 核拓扑|P / E core topology|P / Eコア構成|Топология P / E ядер
包温度 / 包功耗|Package temp. / power|パッケージ温度 / 電力|Темп. / мощность пакета
传感器尚未接入|Sensor not supported yet|センサー未対応|Датчик ещё не подключён
逻辑处理器|Logical processor|論理プロセッサー|Логический процессор
累计时间差分 / 本次采样|Time delta / current sample|累積時間差分 / 今回測定|Разность времени / текущий замер
内存插槽 / 主板 / BIOS|RAM slots / board / BIOS|メモリスロット / マザーボード / BIOS|Слоты ОЗУ / плата / BIOS
品牌 / 原字段|Brand / raw value|ブランド / 元の値|Марка / исходное значение
已知 JEDEC 码映射|Known JEDEC mapping|既知JEDECコード対応|Известные коды JEDEC
料号|Part number|部品番号|Номер детали
配置 / 额定速率|Configured / rated speed|設定 / 定格速度|Заданная / номинальная скорость
不是实际时钟 MHz|Not actual clock MHz|実クロックMHzではありません|Не реальная частота в МГц
类型 / 数据位宽|Type / data width|種類 / データ幅|Тип / ширина данных
主板|Motherboard|マザーボード|Материнская плата
工作通道 / 时序|Channels / timings|チャネル / タイミング|Каналы / тайминги
未接入控制器 / SPD|Controller / SPD unavailable|コントローラー / SPD未対応|Контроллер / SPD недоступны
参数|Parameter|パラメーター|Параметр
读取值|Reading|取得値|Показание
驱动|Driver|ドライバー|Драйвер
算力统计周期|Hashrate averaging window|ハッシュ平均期間|Период усреднения хешрейта
（Windows未支持，当前不执行）|(Windows unsupported; inactive)|（Windows未対応・実行しません）|(Windows не поддерживается; не выполняется)
矿池地址无效|Invalid pool URL|プールURLが無効|Неверный адрес пула
矿池需要 stratum+ssl:// 或 stratum+tcp:// 主机:端口|Pool requires stratum+ssl:// or stratum+tcp:// host:port|プールにはstratum+ssl://またはstratum+tcp:// ホスト:ポートが必要|Нужен stratum+ssl:// или stratum+tcp:// хост:порт
矿池端口无效|Invalid pool port|プールポートが無効|Неверный порт пула
配置格式无效|Invalid settings format|設定形式が無効|Неверный формат настроек
不支持的界面语言|Unsupported language|未対応の言語|Неподдерживаемый язык
主题无效|Invalid theme|テーマが無効|Неверная тема
超出范围|out of range|範囲外|вне диапазона
刷新周期无效|Invalid refresh interval|更新間隔が無効|Неверный интервал обновления
整机功耗无效|Invalid system power|システム電力が無効|Неверная мощность ПК
币种无效|Invalid coin|コインが無効|Неверная монета
设备选择无效|Invalid device selection|デバイス選択が無効|Неверный выбор устройств
矿机名仅支持字母、数字、点、下划线和连字符|Worker name: letters, digits, dots, underscores and hyphens only|ワーカー名は英数字・ピリオド・下線・ハイフンのみ|Имя воркера: только буквы, цифры, точки, подчёркивания и дефисы
钱包地址只能包含字母和数字|Wallet address must be alphanumeric|アドレスは英数字のみ|В адресе кошелька только буквы и цифры
算力周期仅支持5或10分钟|Averaging window must be 5 or 10 minutes|平均期間は5分または10分のみ|Период усреднения — 5 или 10 минут
备用矿池格式无效|Invalid backup pool format|予備プール形式が無効|Неверный формат резервных пулов
每币最多两个备用矿池|Up to two backups per coin|コイン毎に予備は最大2つ|Не более двух резервных пулов на монету
矿池地址与币种不一致|Pool URL does not match coin|プールURLとコインが不一致|Адрес пула не соответствует монете
内核选择无效|Invalid engine choice|内核選択が無効|Неверный выбор ядра
不支持所选内核|does not support this engine|は選択内核に未対応|не поддерживает выбранное ядро
手动输入数量无效|Invalid number of manual entries|手動入力の件数が無効|Неверное число ручных записей
实际算力或功耗输入无效|Invalid hashrate or power input|速度または電力の入力が無効|Неверный ввод хешрейта или мощности
性能预算需要50–100|Performance budget must be 50–100|性能予算は50–100|Режим нагрузки должен быть 50–100
分享设置无效|Invalid sharing setting|共有設定が無効|Неверная настройка отправки
旧版全球默认矿池已迁移为新加坡节点，可在工作台更改|Old global pool migrated to Singapore; change it in Mining|旧グローバルプールをシンガポールへ移行。採掘画面で変更可能|Старый глобальный пул заменён Сингапуром; меняется в Майнинге
配置损坏或版本不兼容，使用默认配置；原文件未删除|Settings damaged or incompatible; using defaults, original retained|設定が破損または非互換。初期設定を使用し元ファイルは保持|Настройки повреждены или несовместимы; загружены стандартные, исходный файл сохранён
来源数据过大|Source data too large|ソースデータが大きすぎます|Данные источника слишком велики
来源数据超过限制|Source data exceeds limit|ソースデータが上限超過|Данные источника превышают лимит
下载不完整，请重试|Incomplete download; retry|ダウンロード不完全。再試行してください|Неполная загрузка; повторите
NVIDIA 返回字段数量变化|NVIDIA response field count changed|NVIDIA応答のフィールド数が変化|Число полей ответа NVIDIA изменилось
其他|Other|その他|Прочее
NVIDIA NVML 驱动只读接口|NVIDIA NVML read-only driver API|NVIDIA NVML読取専用API|API драйвера NVIDIA NVML, только чтение
NVML 静态规格接口不可用|NVML static specification API unavailable|NVML静的仕様API利用不可|API спецификаций NVML недоступен
未安装 NVIDIA 驱动监测接口；其他厂商传感器待适配|NVIDIA monitoring interface missing; other vendors pending|NVIDIA監視API未導入。他メーカーは対応待ち|Нет интерфейса мониторинга NVIDIA; прочие производители в разработке
NVIDIA 传感器暂不可用：|NVIDIA sensors unavailable:|NVIDIAセンサー利用不可：|Датчики NVIDIA недоступны:
来源同算法单位算力收益 × 本机/输入/参考算力|Same-algorithm unit yield × measured/manual/reference rate|同方式の単位収益 × 実測/入力/参考速度|Выход алгоритма × измеренный/введённый/справочный хешрейт
用户填写整机功耗|User-entered system power|ユーザー入力のシステム電力|Введённая мощность ПК
所选算力来源功耗；不含整机其他配件|Power from chosen rate source; excludes other components|選択ソースの電力。他部品は含まれません|Мощность источника хешрейта; без прочих компонентов
收益源数据结构无效|Invalid earnings source data|収益ソースの形式が無効|Неверная структура данных дохода
短时价格变化|Short-term price move|短期価格変動|Краткосрочное изменение цены
预估净收益上涨|Estimated net income rise|推定純益上昇|Рост чистого дохода
相同设备/电价条件下：$|Same hardware / electricity price: $|同じ機器・電力料金：$|То же оборудование / цена энергии: $
/日，属于测算变化，非矿池到账。|/day; estimate change, not a pool payout.|/日。推定値の変化で、プール入金ではありません。|/день; изменение оценки, не выплата пула.
行情目录无效|Invalid market catalog|市場目録が無効|Неверный каталог рынка
目录来源过期，暂不生成新提醒|Catalog stale; new alerts paused|目録が古いため新規通知を保留|Каталог устарел; новые сигналы приостановлены
首次出现在本机跟踪目录；算法|First seen in local catalog; algorithm|ローカル目録に初登場。方式|Впервые в локальном каталоге; алгоритм
目录新增不等同于项目刚发布。|New listing does not mean a new project launch.|目録追加はプロジェクト新規公開とは限りません。|Добавление в каталог не означает запуск проекта.
信息监控已建立基线|Monitoring baseline established|監視基準を作成しました|База наблюдения создана
已跟踪|Tracking|追跡中|Отслеживается
个 PoW 资产。后续记录新收录、≤5分钟价格变化≥2%、相同配置收益上升≥10%；15分钟去重。|PoW assets. Tracks new listings, ≥2% moves within 5 min and ≥10% profit rise with the same config; 15-min deduplication.|PoW資産。新規追加・5分以内2%以上の変動・同設定10%以上の収益増を追跡。15分間重複排除。|активов PoW. Новые монеты, ≥2% за 5 мин и ≥10% дохода при тех же настройках; без повторов 15 мин.
硬件扫描组件缺失，请完整解压新版 Gozero助手后重试|Hardware scanner missing; fully extract the latest Gozero Assistant|スキャナーがありません。新版Gozeroアシスタントを完全展開してください|Сканер отсутствует; полностью распакуйте новую версию Gozero
硬件扫描超时，请稍后重新扫描；若持续失败，请检查 Windows WMI 服务|Hardware scan timed out; retry, then check Windows WMI if it persists|機器スキャンがタイムアウト。再試行し、続く場合はWindows WMIを確認|Тайм-аут сканирования; повторите, затем проверьте службу Windows WMI
Windows 阻止了硬件扫描组件，请检查系统应用控制或安全软件的拦截记录|Windows blocked the scanner; check application-control or security logs|Windowsがスキャナーをブロック。アプリ制御・セキュリティログを確認|Windows заблокировала сканер; проверьте журналы контроля приложений или защиты
Windows 硬件信息服务暂不可用，请检查 WMI 服务后重新扫描|Windows hardware information unavailable; check WMI and rescan|Windows機器情報を取得不可。WMI確認後に再スキャン|Служба сведений об оборудовании недоступна; проверьте WMI
硬件扫描组件运行失败，请重新扫描；若持续失败，请检查 WMI 服务或重新解压新版|Scanner failed; retry, check WMI or re-extract the latest version|スキャナー失敗。再試行・WMI確認・新版の再展開を行ってください|Ошибка сканера; повторите, проверьте WMI или распакуйте новую версию
硬件扫描结果格式无效，请完整解压新版扫描组件后重试|Invalid scan result; fully extract the latest scanner and retry|スキャン結果が無効。新版スキャナーを完全展開して再試行|Неверный результат сканирования; распакуйте новый сканер и повторите
暂无可用内核|No engine available|利用可能な内核なし|Нет доступного ядра
Windows 待适配|Windows support pending|Windows対応待ち|Поддержка Windows ожидается
该币种不支持所选内核|Coin does not support selected engine|このコインは選択内核に未対応|Монета не поддерживает выбранное ядро
TSC Windows 内核尚未接入|TSC Windows engine unavailable|TSC Windows内核は未対応|Ядро TSC Windows не подключено
解压参数无效|Invalid extraction arguments|展開引数が無効|Неверные параметры распаковки
安装路径或压缩包路径不安全|Unsafe installation or archive path|導入先または圧縮ファイルのパスが不正|Небезопасный путь установки или архива
压缩包内容无效或不完整|Archive invalid or incomplete|圧縮ファイルが無効または不完全|Архив неверен или неполон
压缩包中缺少内核文件|Engine file missing in archive|圧縮ファイルに内核がありません|В архиве нет ядра
内核文件 SHA256 不匹配，未替换现有内核|Engine SHA256 mismatch; existing engine untouched|内核SHA256不一致。既存内核は保持|SHA256 ядра не совпадает; текущее ядро сохранено
无法写入内核目录，请检查该目录的写入权限|Cannot write engine folder; check permissions|内核フォルダーに書込不可。権限を確認|Не удаётся записать в каталог ядра; проверьте права
无法写入内核文件，请检查文件占用与磁盘空间|Cannot write engine file; check file locks and disk space|内核ファイルに書込不可。使用中状態と空き容量を確認|Не удаётся записать ядро; проверьте блокировки и место на диске
内核解压失败，请重试|Engine extraction failed; retry|内核の展開失敗。再試行|Ошибка распаковки ядра; повторите
解压组件缺失，请重新解压完整的 Gozero助手安装包|Extractor missing; re-extract the full Gozero Assistant package|展開コンポーネントなし。全パッケージを再展開|Распаковщик отсутствует; распакуйте полный пакет Gozero
系统阻止启动解压组件，请检查文件访问权限|System blocked extractor; check file permissions|システムが展開処理をブロック。ファイル権限を確認|Система блокирует распаковщик; проверьте права
内核解压超时，请检查磁盘状态后重试|Extraction timed out; check disk and retry|展開タイムアウト。ディスクを確認して再試行|Тайм-аут распаковки; проверьте диск
内核解压组件运行失败，请重新解压完整安装包后重试|Extractor failed; re-extract full package and retry|展開コンポーネント失敗。全パッケージを再展開|Ошибка распаковщика; распакуйте весь пакет заново
连接 KRig|Connecting to KRig|KRigに接続|Подключение к KRig
官方下载源|official download source|公式ダウンロード元|официальному серверу
下载完成，校验压缩包 SHA256|Download complete; checking archive SHA256|取得完了。圧縮ファイルのSHA256を検証|Загрузка завершена; проверка SHA256 архива
内核下载 SHA256 不匹配，未安装|Downloaded engine SHA256 mismatch; not installed|内核SHA256不一致。未導入|SHA256 загруженного ядра не совпадает; не установлено
完整性通过，正在使用内置组件解压内核|Integrity passed; extracting with bundled component|整合性確認済み。内蔵コンポーネントで展開|Целостность подтверждена; распаковка встроенным компонентом
解压完成，校验可执行内核 SHA256|Extracted; verifying engine EXE SHA256|展開完了。実行内核のSHA256を検証|Распаковано; проверка SHA256 EXE ядра
内核文件校验失败|Engine verification failed|内核ファイル検証失敗|Проверка ядра не пройдена
尚未启动挖矿|Mining not started|採掘は未開始|Майнинг не запущен
配置目录必须为绝对路径|Profile directory must be an absolute path|設定ディレクトリーは絶対パスが必要|Каталог профиля должен быть абсолютным путём
不支持的数据源|Unsupported data source|未対応のソース|Неподдерживаемый источник
钱包已隐藏|Wallet hidden|アドレス非表示|Кошелёк скрыт
Token已隐藏|Token hidden|Token非表示|Токен скрыт
托盘停止|Stopped from tray|トレイから停止|Остановлено из трея
拒绝非本地界面请求|Non-local UI request rejected|ローカル外のUI要求を拒否|Запрос не из локального интерфейса отклонён
已合并同一显卡的旧设备编号，当前选择|Old IDs merged for the same GPU; selected|同GPUの旧IDを統合。現在の選択|Старые ID одной GPU объединены; выбрано
TSC挖矿入口已暂停，切换为PRL；TSC钱包和历史输入已保留|TSC mining paused; switched to PRL, keeping TSC wallet and history|TSC採掘を停止しPRLへ変更。TSCアドレスと履歴は保持|TSC временно отключён; выбран PRL, кошелёк TSC и ввод сохранены
运行任务期间不重新枚举设备|Cannot rescan devices while tasks run|タスク稼働中は再スキャン不可|Сканирование недоступно во время работы
正在扫描设备，请稍候|Scanning devices; please wait|機器スキャン中。お待ちください|Сканирование устройств; подождите
正在读取本机硬件参数|Reading local hardware parameters|本機の機器情報を読取中|Чтение параметров оборудования
识别到|Detected|検出|Обнаружено
张物理 GPU，虚拟显示器已排除|physical GPUs; virtual displays excluded|枚の物理GPU。仮想ディスプレイ除外済み|физических GPU; виртуальные дисплеи исключены
该币种的Windows挖矿入口暂未开放|Windows mining unavailable for this coin|このコインのWindows採掘は未対応|Майнинг этой монеты в Windows недоступен
请先停止当前任务再修改设备或挖矿配置|Stop tasks before changing devices or mining settings|機器・採掘設定の変更前にタスクを停止|Остановите задачу перед сменой GPU или настроек майнинга
使用缓存：|Using cache:|キャッシュ使用：|Используется кэш:
已更新参考收益；严格按相同 GPU 型号匹配|Estimates updated; exact GPU model matching|参考収益を更新。同型番GPUのみ照合|Оценки обновлены; строгое совпадение модели GPU
先停止任务再安装内核|Stop tasks before installing engine|内核導入前にタスク停止|Остановите задачи перед установкой ядра
先停止任务|Stop the task first|先にタスクを停止|Сначала остановите задачу
请求无效|Invalid request|要求が無効|Неверный запрос
设备正在扫描或任务正在启动，请稍候|Scanning or starting a task; please wait|スキャンまたはタスク起動中。お待ちください|Сканирование или запуск задачи; подождите
已有任务，请先停止|Task already active; stop first|タスク実行中。先に停止|Задача уже активна; сначала остановите
个已选设备未识别，请到设备总览重新扫描或清理失效选择|selected devices missing; rescan or remove missing selections in Hardware|台の選択機器が未検出。機器一覧で再スキャンか選択解除|выбранных устройств не найдено; повторите сканирование или удалите выбор
请先停止挖矿|Stop mining first|先に採掘を停止|Сначала остановите майнинг
先选择NVIDIA显卡|Select an NVIDIA GPU first|先にNVIDIA GPUを選択|Сначала выберите GPU NVIDIA
QTC CUDA 通过|QTC CUDA passed|QTC CUDA検証成功|QTC CUDA: пройдено
项离线校验；未连接矿池|offline checks; no pool connection|件のオフライン検証。プール未接続|автономных проверок; без подключения к пулу
收款切换/服务时段结束后可调节|Adjust after recipient switch / fee period|受取先切替・手数料期間終了後に変更可能|Меняйте после переключения / периода комиссии
信息不存在|Event not found|情報がありません|Событие не найдено
不支持的来源|Unsupported source|未対応ソース|Неподдерживаемый источник
无效窗口动作|Invalid window action|無効なウィンドウ操作|Неверное действие окна
无效窗口|Invalid window|無効なウィンドウ|Неверное окно
悬浮窗停止|Stopped from floating monitor|フローティング表示から停止|Остановлено из плавающего окна
链接不存在|Link not found|リンクなし|Ссылка не найдена
启动；不会自动开始挖矿|started; mining does not auto-start|起動。採掘は自動開始されません|запущен; майнинг автоматически не запускается
本机实时监控已连接|Local monitoring connected|本機監視に接続済み|Локальный мониторинг подключён
参数扫描失败，可重试：|Hardware scan failed; retry:|機器スキャン失敗。再試行：|Ошибка сканирования; повторите:
请填写自己的主网收款地址|Enter your own mainnet wallet address|自分のメインネット受取アドレスを入力|Введите свой кошелёк основной сети
PRL 地址应以 prl1 开头|PRL address must start with prl1|PRLアドレスはprl1で開始|Адрес PRL должен начинаться с prl1
设备缺少受支持的厂商或明确的 PCI 地址|Unsupported vendor or missing PCI address|非対応メーカーまたはPCIアドレス未取得|Неподдерживаемый производитель или нет адреса PCI
内核正在安装|Engine installation in progress|内核導入中|Идёт установка ядра
任务忙，请先停止当前任务|Busy; stop the active task first|処理中。現在のタスクを先に停止|Занято; сначала остановите задачу
所选设备已变化，请重新选择|Selected devices changed; select again|選択機器が変わりました。再選択してください|Выбранные устройства изменились; выберите заново
请先重新扫描设备|Rescan devices first|先に機器を再スキャン|Сначала повторите сканирование
请先安装并校验 KRig 内核|Install and verify KRig first|先にKRigを導入・検証|Сначала установите и проверьте KRig
启动已取消|Start cancelled|起動を取消|Запуск отменён
内核退出|Engine exited|内核終了|Ядро завершилось
任务保护进程启动失败|Task guard failed to start|タスク保護プロセス起動失敗|Ошибка запуска защитного процесса
所有矿工已退出|All miners exited|全マイナー終了|Все майнеры завершены
连接顺序：|Connection order:|接続順：|Порядок подключения:
连接失败由内核切换备用节点|Engine switches to backup on failure|接続失敗時は内核が予備へ切替|При ошибке ядро переключится на резерв
启动请求已发送，|start request sent,|起動要求送信済み、|запрос запуска отправлен,
张显卡；收款方见公开服务费状态|GPUs; recipient shown in fee status|枚GPU。受取先は手数料状態を確認|GPU; получатель указан в статусе комиссии
性能档位已改变，重新开始算力均值统计|Performance changed; restarting rate average|性能変更により平均測定を再開始|Режим изменён; расчёт среднего начат заново
性能预算无效|Invalid performance budget|性能予算が無効|Неверный режим нагрузки
矿工日志超过单次32MB上限，请检查日志后重新启动|Miner log exceeded 32 MB; check logs and restart|マイナーログが32MB超過。確認後に再起動|Журнал майнера превысил 32 МБ; проверьте и перезапустите
所选显卡已离线|Selected GPU went offline|選択GPUがオフライン|Выбранная GPU отключилась
温度达到|Temperature reached|温度が到達|Температура достигла
°C，已保护停机|°C; protective stop|°C、保護停止しました|°C; защитная остановка
显卡传感器超过 10 秒未更新，保护停机|GPU sensors stale for 10s; protective stop|GPUセンサー10秒未更新。保護停止|Нет данных датчиков GPU 10 с; защитная остановка
60 秒测试完成；前 15 秒预热不计入算力均值|60s test complete; first 15s warm-up excluded from average|60秒テスト完了。最初の15秒の予熱は平均から除外|Тест 60 с завершён; первые 15 с прогрева исключены
用户停止|User stopped|ユーザー停止|Остановлено пользователем
币种身份不匹配|Coin identity mismatch|コイン識別不一致|Монета не совпадает
Tiger Pool 单位 N/s 近24H有效奖励|Tiger Pool effective 24h reward per N/s|Tiger PoolのN/s単位の24時間有効報酬|Эффективная награда Tiger Pool за 24 ч на N/s
Kryptex 同币种同算法单位算力日产出|Kryptex daily yield per rate for same coin / algorithm|Kryptexの同コイン・方式の単位速度日次産出|Суточный выход Kryptex на хешрейт той же монеты / алгоритма
基准全网算力 / 当前全网算力（奖励机制不变假设）|baseline network rate / current rate (assuming unchanged rewards)|基準全体速度 / 現在全体速度（報酬方式一定と仮定）|базовый / текущий хешрейт сети (при неизменной награде)
Gozero 全节点|Gozero full node|Gozeroフルノード|Полный узел Gozero
未知币种|Unknown coin|不明なコイン|Неизвестная монета
此币种矿池账本接口尚未适配|Pool ledger API unsupported for this coin|このコインのプール台帳APIは未対応|API счёта пула для монеты не подключён
保存收款地址后自动查询矿池账本|Auto-query pool ledger after saving wallet|受取アドレス保存後にプール台帳を自動照会|Автозапрос счёта пула после сохранения кошелька
收款地址格式不正确|Invalid wallet address format|受取アドレス形式が無効|Неверный формат кошелька
当前矿池尚未适配地址账本接口|Current pool address ledger unsupported|現在プールのアドレス台帳API未対応|API счёта адреса текущего пула не поддерживается
矿池返回格式无效|Invalid pool response|プール応答が無効|Неверный ответ пула
矿池余额字段缺失|Pool balance fields missing|プール残高フィールドなし|Нет полей баланса пула
矿池收益字段缺失|Pool earnings fields missing|プール収益フィールドなし|Нет полей дохода пула
支付记录格式无效|Invalid payout format|支払い記録の形式が無効|Неверный формат выплат
已支付|Paid|支払済み|Выплачено
处理中|Processing|処理中|Обрабатывается
待确认|Pending|確認待ち|Ожидается
接口暂不可用，请稍后重试|API unavailable; retry later|API利用不可。後で再試行|API недоступен; повторите позже
当前地址暂无已适配账单页面|No supported ledger page for this address|このアドレスの台帳ページ未対応|Для адреса нет поддерживаемой страницы счёта
服务器未确认记录|Server did not acknowledge record|サーバーが記録を未確認|Сервер не подтвердил запись
本机实测，自报数据未经矿池证明；不包含钱包、硬件序列号或本机设备标识。|Local self-reported measurements, not pool-verified; no wallet, serial or device ID.|本機の自己申告実測値でプール未検証。アドレス・製造番号・デバイスIDは含みません。|Самостоятельные локальные замеры без подтверждения пула; без кошелька, серийного номера или ID.
按有效 GPU 运行时间分时；同设备长周期目标 0.5%，非逐份额/固定币量扣款；收益测试同样累计，零碎余额留存至后续任务结算|Time-based effective GPU runtime fee; long-run target 0.5%, not fixed shares/coins. Tests accrue too; fractional time settles in later tasks.|有効GPU時間の分時手数料。長期目標0.5%、固定シェア・コイン控除ではありません。テストも累積し端数は後続タスクで精算。|По времени работы GPU; цель 0,5%, не фиксированная доля шар/монет. Тесты тоже учитываются; остатки переносятся.
已有任务|Task already active|タスク実行中|Задача уже активна
请先填写并保存自己的收款地址|Enter and save your wallet first|先に自分の受取アドレスを入力・保存|Сначала введите и сохраните свой кошелёк
服务时段启动超时|Fee period start timed out|手数料期間の起動タイムアウト|Тайм-аут запуска периода комиссии
结算已累计服务时间，最多60秒；随后|Settling accrued fee time, up to 60s; then|累積手数料時間を最大60秒精算。その後|Отработка накопленной комиссии до 60 с; затем
开始60秒收益采样|start 60s profit sampling|60秒収益測定を開始|начало 60-секундного замера
恢复用户挖矿|resume user mining|ユーザー採掘を再開|возобновление майнинга пользователя
服务费0.5%；挖矿与收益测试统一累计，短测试未满服务时段的余额保留至后续任务|0.5% fee for mining and tests; partial test fee time carried to future tasks|採掘・テストとも0.5%。短いテストの端数時間は後続タスクに繰越|Комиссия 0,5% для майнинга и тестов; остаток времени переносится
账本保存失败：|Ledger save failed:|台帳保存失敗：|Ошибка сохранения счёта:
公开服务费调度：切换到|Disclosed fee schedule: switching to|公開手数料制御：切替先|План комиссии: переключение на
0.5% 服务时段|0.5% fee period|0.5%手数料期間|Период комиссии 0,5%
服务时段开始，收款地址|Fee period started, wallet|手数料期間開始、受取アドレス|Начался период комиссии, кошелёк
最多|up to|最大|до
恢复用户收款地址；软件服务时段已结束|User wallet restored; fee period ended|ユーザーアドレスに復帰。手数料期間終了|Кошелёк пользователя восстановлен; период комиссии завершён
调度已取消|Schedule cancelled|スケジュール取消|Планирование отменено
调度异常，停止全部任务：|Scheduler error; stopping all tasks:|制御異常。全タスクを停止：|Ошибка планировщика; остановка всех задач:
服务费调度失败|Fee scheduler failed|手数料制御失敗|Сбой планировщика комиссии
硬件保护停止：设备离线、温度阈值或传感器失联|Hardware protection: offline GPU, thermal limit or missing sensors|機器保護停止：機器オフライン・温度閾値・センサー途絶|Защита: GPU отключён, порог температуры или потеря датчиков
更新清单格式无效|Invalid update manifest|更新マニフェストが無効|Неверный манифест обновления
更新签名验证失败|Update signature verification failed|更新署名検証に失敗|Подпись обновления не прошла проверку
更新已过期或版本回退|Update expired or version rollback|更新期限切れまたは版の巻戻し|Обновление истекло или откат версии
更新下载信息无效|Invalid update download info|更新ダウンロード情報が無効|Неверные данные загрузки обновления
请先获取有效签名更新|Fetch a valid signed update first|先に有効な署名付き更新を取得|Сначала получите обновление с верной подписью
下载|Download|ダウンロード|Загрузка
内核|Engine|内核|Ядро
运行|Run|実行|Работа
统计|Statistics|統計|Статистика
张|GPUs|枚|GPU
有|Found|該当|Найдено
新增中英日俄语言切换，主窗口、悬浮卡片与托盘菜单同步并记忆|Added Chinese, English, Japanese and Russian with synchronized app, floating monitor and tray menus|中国語・英語・日本語・ロシア語切替を追加。画面・カード・トレイを同期し記憶|Добавлены китайский, английский, японский и русский; язык окон и трея синхронизируется и сохраняется
悬浮卡片停止状态加粗放大，保留历史算力参考|Floating stopped status is larger and bold; historical hashrate retained|カードの停止表示を太字で拡大。過去のハッシュレートは保持|Статус остановки крупнее и жирнее; прошлый хешрейт сохранён
官网链接更新为 https://gozero.trade/|Official website updated to https://gozero.trade/|公式サイトを https://gozero.trade/ に更新|Официальный сайт изменён на https://gozero.trade/
清理使用说明中的旧版更新记录，整理为1.0 Beta使用指南|Replaced old guide history with current 1.0 Beta instructions|旧更新履歴を整理し1.0 Betaの使用ガイドに更新|Старая история в инструкции заменена руководством 1.0 Beta
安装、选卡、挖矿、收益、性能预算与托盘操作统一按当前版本说明|Updated installation, GPU selection, mining, income, performance and tray instructions|導入・GPU選択・採掘・収益・性能・トレイ操作を現行版に統一|Инструкции установки, выбора GPU, майнинга, дохода, нагрузки и трея обновлены
`;
 const catalog=Object.create(null);
 catalog['Gozero XMRig 内核费 0% · 软件服务费 0.5%']=['Gozero XMRig fee 0% · App fee 0.5%','Gozero XMRig 手数料 0% · ソフト手数料 0.5%','Gozero XMRig: 0% · Комиссия приложения: 0.5%'];
 catalog['默认推荐 · Gozero XMRig CPU · 内核费 0%']=['Recommended · Gozero XMRig CPU · Miner fee 0%','推奨 · Gozero XMRig CPU · 採掘手数料 0%','Рекомендуется · Gozero XMRig CPU · Комиссия ядра 0%'];
 catalog['Gozero XMRig CPU 6.26.0-cpu.2 · 内核费 0%']=['Gozero XMRig CPU 6.26.0-cpu.2 · Miner fee 0%','Gozero XMRig CPU 6.26.0-cpu.2 · 採掘手数料 0%','Gozero XMRig CPU 6.26.0-cpu.2 · Комиссия ядра 0%'];
 catalog['官方 XMRig 6.26.0 · 内核费 1%']=['Official XMRig 6.26.0 · Miner fee 1%','公式 XMRig 6.26.0 · 採掘手数料 1%','Официальный XMRig 6.26.0 · Комиссия ядра 1%'];

 catalog['工作台']=['Workbench','ワークベンチ','Рабочая панель'];
 catalog['0 = 按性能档位自动']=['0 = follow performance mode','0 = 性能モードに連動','0 = по режиму нагрузки'];
 catalog['CPU 线程已按档位设置']=['CPU threads set for this mode','モードに応じて CPU スレッドを設定','Потоки CPU настроены по режиму'];
 catalog['CPU 挖矿中：停止后可切换线程档位']=['CPU mining: stop to change thread mode','CPU 採掘中：停止後にスレッドモードを変更','Остановите CPU-майнинг для смены числа потоков'];

 catalog["请填写 ZCD 的 02 永久收款地址"]=["Enter a ZCD 02 permanent payout address", "ZCD の 02 永久受取アドレスを入力", "Введите постоянный адрес ZCD с префиксом 02"];
 catalog["01 是一次性地址，不能挖矿；请从钱包获取 02 永久地址"]=["01 is one-time; obtain a permanent 02 address from your wallet", "01 は使い捨てです。ウォレットから 02 永久アドレスを取得してください", "01 — одноразовый адрес; получите в кошельке постоянный адрес 02"];
 catalog["仅支持 02 永久收款地址（可带 0x 前缀）"]=["Only permanent 02 addresses are supported (optional 0x prefix)", "02 永久アドレスのみ対応（0x 接頭辞は任意）", "Допустим только постоянный адрес 02 (префикс 0x необязателен)"];
 catalog["地址不完整或含非法字符：02 开头，共 64 位十六进制字符"]=["Invalid format: 02 followed by 62 hexadecimal characters", "形式不正：02 に続けて 62 桁の16進数が必要です", "Неверный формат: 02 и ещё 62 шестнадцатеричных символа"];
 catalog["02 永久地址格式正确"]=["02 permanent address format is correct", "02 永久アドレスの形式は正しいです", "Формат постоянного адреса 02 верен"];
 catalog["填写 0x02… 永久收款地址"]=["Enter a permanent 0x02… payout address", "0x02… 永久受取アドレスを入力", "Постоянный адрес выплат 0x02…"];

 catalog['租赁市场']=['Rentals','レンタル市場','Аренда'];
 catalog['新增GPU / CPU租赁市场，实时价格与详细参数、租金试算']=['New GPU / CPU rental market with current quotes, specifications and cost estimates','GPU / CPUレンタル市場、現在価格・詳細仕様・料金試算を追加','Новый рынок аренды GPU / CPU: цены, характеристики и расчёт стоимости'];
 catalog['新增4090、5090、3090、RTX PRO 6000快捷筛选']=['Added quick filters for 4090, 5090, 3090 and RTX PRO 6000','4090・5090・3090・RTX PRO 6000のクイックフィルターを追加','Добавлены фильтры 4090, 5090, 3090 и RTX PRO 6000'];
 catalog['Clore / Vast.ai跳转使用官方推荐链接；版本更新为Beta 1.01']=['Clore / Vast.ai use official referral links; updated to Beta 1.01','Clore / Vast.aiは公式紹介リンクを使用。Beta 1.01に更新','Clore / Vast.ai используют официальные реферальные ссылки; версия Beta 1.01'];
 for(const line of rows.trim().split('\n')){const [key,...values]=line.split('|');if(values.length!==3||values.some(v=>!v))throw Error('Invalid translation: '+key);if(catalog[key])throw Error('Duplicate translation: '+key);catalog[key]=values}
 catalog['等待矿池']=['Waiting for pool','プール待機','Ожидание пула'];
 catalog['计算初始化']=['Initializing compute','計算初期化','Инициализация'];
 catalog['已收到矿池任务']=['Pool job received','ジョブ受信済み','Задание получено'];
 catalog['已发送登录，等待矿池确认']=['Login sent, awaiting confirmation','ログイン送信済み、応答待機','Запрос входа отправлен'];
 catalog['已登录，等待矿池下发任务']=['Logged in, awaiting pool work','ログイン済み、ジョブ待機','Вход выполнен, ожидание задания'];
 catalog['正在连接矿池 TCP 端口']=['Connecting to pool TCP port','プールの TCP 接続中','Подключение к TCP-порту пула'];
 catalog['已解析域名，正在连接 TCP']=['DNS resolved, connecting TCP','名前解決完了、TCP 接続中','DNS разрешён, подключение TCP'];
 catalog['连接中断']=['Connection lost','接続切断','Соединение разорвано'];
 catalog['秒后重试']=['seconds until retry','秒後に再試行','сек. до повтора'];
 catalog['BNT 登录及任务接收通过']=['BNT login and work verified','BNT ログインとジョブ確認済み','Вход и задание BNT проверены'];
 catalog['BNT 每线程 2 GiB + 128 MiB 开销']=['BNT: 2 GiB + 128 MiB overhead per thread','BNT: スレッド毎に 2 GiB + 128 MiB','BNT: 2 GiB + 128 MiB на поток'];
 catalog['系统预留']=['System reserve','システム予約','Резерв системы'];
 catalog['预计占用']=['Estimated memory','推定使用量','Оценка памяти'];
 catalog['上限']=['Limit','上限','Лимит'];
 catalog['内存预算不足或线程超限，请重新应用档位']=['Insufficient RAM or too many threads; reapply the mode','メモリ不足またはスレッド超過。モードを再適用してください','Недостаточно памяти или слишком много потоков; примените режим заново'];
 catalog['自动调优']=['Auto-tune','自動調整','Автонастройка'];
 catalog['取消调优']=['Cancel tuning','調整を中止','Отменить настройку'];
 catalog['离线计算对比 · 约5–15分钟 · 完成后应用']=['Offline comparison · about 5–15 min · apply on completion','オフライン比較 · 約5～15分 · 完了後適用','Офлайн-сравнение · около 5–15 мин · применить по завершении'];
 catalog['准备调优']=['Preparing tuning','調整を準備中','Подготовка настройки'];
 catalog['当前配置基线']=['Current baseline','現在設定の基準','Текущая база'];
 catalog['计算路径对比']=['Engine comparison','計算経路比較','Сравнение реализаций'];
 catalog['线程数对比']=['Thread comparison','スレッド数比較','Сравнение потоков'];
 catalog['最佳并发复核']=['Concurrency recheck','並列数の再確認','Повторная проверка'];
 catalog['大页与核心分配']=['Large pages / CPU placement','ラージページ・コア配置','Большие страницы / ядра'];
 catalog['持续复测']=['Sustained recheck','継続測定','Длительная проверка'];
 catalog['已应用调优配置']=['Tuning profile applied','調整設定を適用済み','Настройки применены'];
 catalog['BNT 调优已取消']=['BNT tuning cancelled','BNT 調整を中止しました','Настройка BNT отменена'];
 catalog['完整算法校验']=['Full consensus verification','完全なアルゴリズム検証','Полная проверка алгоритма'];
 catalog["开启大页内存"]=["Enable large pages", "ラージページを有効化", "Включить большие страницы"];
 catalog["正在检测大页权限"]=["Checking large-page access", "権限を確認中", "Проверка прав"];
 catalog["大页未授权"]=["Large pages: not permitted", "ラージページ権限なし", "Нет разрешения на большие страницы"];
 catalog["需注销重登或重启电脑"]=["Sign out and back in, or restart Windows", "サインアウト・再ログインまたは再起動が必要", "Выйдите и войдите снова или перезагрузите ПК"];
 catalog["大页可分配"]=["Large-page allocation available", "ラージページ割り当て可能", "Большие страницы доступны"];
 catalog["已授权，当前大页分配失败"]=["Permitted; allocation currently failed", "権限あり・割り当て失敗", "Разрешено, но выделение не удалось"];
 catalog["大页状态读取失败"]=["Cannot read large-page status", "状態を取得できません", "Не удалось получить статус"];
 catalog["大页待生效"]=["Large pages: sign-in required", "再ログイン待ち", "Ожидается повторный вход"];
 catalog["大页已开启"]=["Large pages enabled", "ラージページ有効", "Большие страницы включены"];
 catalog["实际大页线程"]=["Workers using large pages", "実際のラージページ使用スレッド", "Потоки с большими страницами"];
 catalog["检测"]=["Check", "確認", "Проверить"];
 catalog["权限可用不代表全部内存分配成功；BNT 以实际大页线程数为准，ZCD 以内核日志为准。"]=["Permission does not guarantee allocation. Check actual BNT workers or ZCD miner logs.", "権限があっても割り当てを保証しません。BNT の実使用数または ZCD ログを確認してください。", "Разрешение не гарантирует выделение. Проверяйте число потоков BNT или журнал ZCD."];
 catalog["为当前 Windows 账户开启锁定内存页权限？"]=["Allow the current Windows account to lock pages in memory?", "現在の Windows アカウントにメモリ内ページのロックを許可しますか？", "Разрешить текущей учётной записи Windows блокировку страниц в памяти?"];
 catalog["将弹出管理员授权。只添加大页所需权限，不修改虚拟内存大小。成功后可能需要注销重登或重启电脑；不会自动重启。"]=["Windows will request administrator consent. Only the large-page right is added; paging-file size is unchanged. Sign out and back in or restart Windows if needed. No automatic restart.", "管理者の承認が必要です。ラージページ権限のみ追加し、仮想メモリのサイズは変更しません。必要に応じて再ログインまたは再起動してください。自動再起動はしません。", "Windows запросит разрешение администратора. Добавляется только право больших страниц; размер файла подкачки не меняется. Может потребоваться повторный вход или перезагрузка. Автоматической перезагрузки нет."];
 catalog["请先停止全部任务再设置大页"]=["Stop all tasks before configuring large pages", "全タスクを停止してください", "Сначала остановите все задачи"];
 catalog["大页权限已设置，请注销重登或重启电脑"]=["Permission saved; sign out and back in or restart Windows", "権限を設定しました。再ログインまたは再起動してください", "Право сохранено; войдите заново или перезагрузите ПК"];
 catalog["大页权限已设置；实际分配以挖矿日志为准"]=["Permission saved; check miner logs for actual allocation", "権限設定済み。実際の割り当てはログを確認してください", "Право сохранено; фактическое выделение смотрите в журнале"];
 catalog["已取消管理员授权"]=["Administrator consent cancelled", "管理者の承認をキャンセルしました", "Разрешение администратора отменено"];
 catalog["大页设置失败"]=["Large-page setup failed", "ラージページ設定失敗", "Ошибка настройки больших страниц"];
 catalog["继续"]=["Continue", "続行", "Продолжить"];
 return Object.freeze(catalog);
});
