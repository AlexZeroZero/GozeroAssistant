(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GozerTranslations=factory()})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 // Source phrase | English | Japanese | Russian. Technical IDs, input values and miner output are preserved.
 const rows=`
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
 for(const line of rows.trim().split('\n')){const [key,...values]=line.split('|');if(values.length!==3||values.some(v=>!v))throw Error('Invalid translation: '+key);if(catalog[key])throw Error('Duplicate translation: '+key);catalog[key]=values}
 return Object.freeze(catalog);
});
