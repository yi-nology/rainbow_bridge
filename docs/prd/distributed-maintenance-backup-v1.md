# PostgreSQL＋MinIO 多实例手动维护备份恢复 PRD

> **最新验收约定（2026-11-01，优先于本文各历史测试矩阵）**：用户明确要求“以后我们的设计也不再追加复杂故障测试，没有必要”。当前同Pod方案及后续虹桥任务只以基础主流程、必要构建和直接受影响的基础检查收口；不默认追加复杂故障注入、分区/崩溃组合、压力或灾备矩阵。不再为补齐§9、§11.6、§13.6等历史矩阵继续派发；未测项如实保留但不自动列为基础交付阻塞。已有结果不改写为本次通过，已知功能问题仍处理，数据保护设计保持；专项测试只有用户另行明确要求才开展。此约定不授予正式部署/推送权限。

日期：2026-10-30。状态：CLI核心实施见§10；**当前产品目标以§11网页完整闭环修订为准**，用户已授权分别实施，派发记录见文末。未部署正式环境。

> §1—9中“本批CLI-only、网页只说明”的终点被§11替代，保留为历史实施依据。停服、一致性、候选恢复及资源保护合同继续沿用。§10是原实现结果，不代表§11已完成。前端同步修订见distributed-backup-frontend-v1.md §8。

## 1. 用户目标与本批终点

用户明确选择：先实现手动维护备份恢复，验收后再讨论定时自动备份与增量备份。研发对象沿用“虹桥研发”（local / 01a1333a-342c-7903-8ca8-164b82392399）。架构师只读核对、制定合同和验收，研发自主实现/测试，不转派。

本批采用最保守的**全停服维护**：手动运维CLI发起，备份和最终恢复切换都允许停所有虹桥业务Pod，确认写者退出再处理。首次交付不要求业务读在线、不要求无停机，不假定维护几秒完成。一个CLI调用可按持久步骤连续完成，无需用户逐步骤审批；危险执行前必须先有具体plan和实例/备份/目标确认。恢复预览与候选准备可在停服前完成，最终切换前仍须重新核对源实例和当前账号/计数。

实现可复用库＋CLI，提供 plan、backup、verify、restore-plan、restore、status、resume、abort 等清晰入口（最终名称可按现有cmd习惯）。不在第一批接通网页的远程恢复执行、不让应用Pod持有cluster-admin。命令由受控运维身份调用K8s、PG和MinIO，账号权限写入配置要求；网页现有SQLite备份入口保持真实能力，不能把CLI已支持写成网页已支持。交付一次真正双Pod的备份→改数据→候选恢复→双Pod重新服务→数据/对象核对闭环及故障接续证据。

不做：cron/定时唤醒、调度服务、增量/WAL/PITR、在线热恢复、跨不同DB引擎转换、任意第三方SQL备份导入、通用多租户备份平台、自动清理旧恢复代。不可修改当前v5.1.0运行环境来实验，也不推送/打tag/发布/部署产品。后续动作需用户另行授权。

## 2. 代码与现状依据

仓库D:/kylin/rainbow_bridge，编写时main_v1 / 8fc8bb6f050b640effa93e486b97c139ecdc6640；工作区另有remote-release-cache-backend-v1.md部署登记，保护它，不reset/切主目录分支。不使用.local-qa旧release工作树当新入口。

先读根AGENTS；研发应使用 $engineering-quality-preserving-refactor，读取 C:/Users/MalfuRisa/.codex/skills/engineering-quality-preserving-refactor/SKILL.md。只按职责拆分/复用小方法/提前返回，不为本任务引入Python。变更API需改IDL再hz生成，不手改biz/model/*.pb.go或biz/router/。

已核对：biz/backup/maintenance.go维护开关为sync.Mutex与进程内writers计数；manager.go/ jobs.go工作和请求状态落本机控制目录。backup/switch.go在启动时替换SQLite业务根。service.go中备份manager缺失则beginBusinessWrite直接放行；freeze_guard.go虽有跨连接DB写门控，但没有全局持久维护态。release_storage_attempt.go在门控前登记attempt，上传/导入/迁移/恢复/初始化各入口必须纳入停写审计，不能只拦HTTP配置保存。

参考现有备份manifest/校验/账号保留/编号上界与tests，MinIO原始和快照定位、release-storage运维工具，以及docs/docs/api/{backup,scope-identity,runtime}.md。已部署v5.1.0在10.60.226.43上，现场4scope、原始桶rainbow-bridge、快照桶rainbow-bridge-snapshots是受保护业务资产；本任务仅允许必要只读取拓扑，实验使用新独占资源。

## 3. 选定架构与边界

| 部分 | 本批决定 |
| --- | --- |
| 数据范围 | 虹桥业务数据库中明确allowlist表＋原始资源字节＋已发布快照及完整性清单；范围/锁版/发布/审核/删除历史保留 |
| 原始与快照 | 本批仅支持二者均MinIO，全部已提交locator均可读；发现local或未知backend明确拒绝，不漏备后标成功 |
| 备份存储 | 独立私有备份bucket，每backup UUID独占前缀，真实复制字节而非原桶引用；连接可同MinIO，不冒充异地灾备 |
| 协调控制 | 固定instance UUID、operation/phase、maintenance状态、generation、部署归属、备份索引与恢复指针在独立控制PG数据库；不随业务备份/恢复覆盖 |
| 执行者 | 外部CLI/独占运维进程，不依赖被停掉的app后台goroutine；作业状态/幂等由控制DB持久保存，CLI退出能接续 |
| 恢复目标 | 新候选PG数据库＋新原始/快照bucket，全部校验后改受控Workload配置，旧库旧桶保留；不原地清空现有业务库/桶 |
| Redis | 缓存不备份、锁不恢复；业务缓存按非回退generation命名空间隔离，禁止FLUSHDB/FLUSHALL |
| 应用集成 | 所有参与Pod启用同一控制实例及generation检查；第一批明确workload allowlist，无自动发现后任意停服务 |

新增配置采取独立维护模式块（如backup.distributed），默认关闭，显式control_dsn/instance_id、备份bucket、允许的namespace/deployments、维护工具权限引用和限额。业务配置不保存运维超级权限，应用对控制状态只获必要权限；连接/账号密码不写备份，不在输出展示DSN。控制DB与业务候选DB可以同PG集群，不再安装一套中间件；控制DB不在restore范围。既有SQLite backup.enabled/布局语义保持，不能把新配置默认打开。

PG能力第一批按实际PG16实验；其他版本仅声明实际支持组合，不声称MySQL和SQLite都能用这一远程新模式。没有专用应用DB角色或控制连接、目标建库/建桶权限、可靠K8s停服能力时plan明确blocked，不能靠共享postgres超级账号降级到不安全模式。

## 4. 全局停服与防旧实例继续写

### 4.1 持久状态与并发所有权

控制DB中每实例只允许一个活动维护操作。采用PG session advisory lock（专用固定连接）＋持久状态CAS/fencing token；不是依赖Redis TTL、进程mutex或某个Pod local文件。命令/Pod状态变更/切换前都验证仍持所有权。锁丢失不得继续外部副作用，持久维护态不因断线、进程退出或租约到期自动清除；继任执行者取得新token后按实况对账，而非简单重复上个命令。外部动作可能已成功而记录丢失，恢复步骤必须读K8s/PG/对象实际状态核对。K8s更新使用UID/resourceVersion条件，不能无条件覆盖。MinIO不支持本项目数值fence，写入用owner attempt独占不可复用前缀；旧上传只能成为孤儿，不能覆盖正式包或另一执行代。不能仅靠“检查token后发请求”宣称跨系统原子性：破坏性接续前必须确认上一执行进程/Job已退出及在途外部动作结束，不能证明则保持维护，不接管执行。

操作记录至少含instance/job/request/backup ID、不可回退generation、owner token、phase、期望与已应用workload配置指纹/副本数、源/候选资源身份和结果摘要。持久写阶段先于破坏性/不可逆动作，输出中敏感连接用引用代替。重复同request+相同指纹返回同operation，变更参数409/CLI冲突，不能并发产生两次恢复。

### 4.2 停服证明

1. 控制DB置maintenance/draining，拒绝新业务写和新的维护/迁移/补清任务；所有新模式Pod启动、后台任务、运维写入口必须查控制状态及配置generation。不认识协议或连不上控制DB的实例不得正常提供业务服务，不自动降级绕过。只读诊断/status/维护提示可用，业务写默认拒绝。
2. 保存明确allowlist Workload的配置、UID/resourceVersion、replicas和管理归属，受控缩容为0，等待实际Pod退出、现有请求/对象上传及业务DB事务结束。对NotReady/网络分区/卡Terminating不能force-delete后假定进程消失；无法证明停止则超时失败且保留维护，不能备份/切换。
3. 审核HPA/GitOps/Job/CronJob或外部直写者；第一批未有受控暂停/互斥协议的自动写者或reconciler，plan拒绝执行，不擅自修改集群全局控制器。只管理本实例显式指定的workload。
4. 为防旧进程/旧DSN意外重连，使用虹桥**独占应用登录角色**的数据库fence：短期禁止该角色新登录，并在明确本业务DB+该角色范围内处理连接；维护工具使用独立维护角色/控制连接，不受自己fence影响。必须先证明角色不供其他项目使用，角色权限变更和终止连接严格限定本任务。没有独占角色则blocked，禁止禁用共享账号。全部Pod退出后仍要检查应用角色PG连接数为0及无在途写事务。
5. 取到数据库门控/事务结束与Pod停止证据后，冻结状态成立；在此之前不得开始一致备份或最终恢复切换。备份期间所有业务服务停止，停机时长受DB/资源量影响，前端不能写“业务读取始终可用”。

启动检查要在AutoMigrate、seed、资产路径重写和普通业务DB写之前建立；stale generation或维护中不得启动这些写动作。应用新增实例只读取控制DB不能自行改变active generation。CLI也必须使用同一维护协议，不能让release-storage reconcile/migrate绕过备份窗口。

## 5. 全量备份协议

### 5.1 可移植业务数据与对象清单

创建独占backup ID，control记录pending，先执行§4停服证明。全量对象复制和DB导出完成前不恢复业务写，第一批不优化停写时长。不得用pg_dump本身的一致性承诺代替PG与MinIO跨存储一致性。

本批包采用新的**rainbow-maintenance-backup-v1**，与SQLite schema4 ZIP明确区分。建议业务数据为应用定义的逐表有界流数据（如带字段类型的NDJSON/等价逻辑格式），对照现有businessTables扩成PG专用严格allowlist；候选结构由可信应用迁移创建，导入只写allowlist表和列。保持大整数/decimal/timestamp/byte/string/null的精确类型，不通过float64中转，不用全部数据载入内存。

第一批不接受上传任意SQL或任意第三方pg_dump到共享PG执行。若研发选择复用原生pg_dump/pg_restore作为内部传输，须先上报其受控恢复模型（匹配工具版本、可信源、专用候选权限、TOC/SQL对象allowlist等）；仅列出TOC或加--no-owner不等于能安全导入任意SQL。不能为省实现把包含认证表/配置/控制库的整库dump直接当可下载业务备份。

包含：环境/渠道与UUID、编辑配置和edit_revision、资源元数据与字节、冻结状态/备注/历史、发布版本/payload/清单/locator/active/head revision/编号上界/审核与删除历史。排除：auth_users密码/账号内容、auth_sessions、部署DSN/Secret、运行中锁、控制作业与维护态、未提交release attempt运行状态、Redis缓存。已提交MinIO定位对应的attempt在候选中按正式引用重建为committed或等效不可清理状态，不能把历史pending当活任务恢复。

对象按业务清单确定精确key；原始区与快照区逐对象复制到备份专属前缀，记录源身份（必要versionID）、原路径、用途、字节数、SHA256与业务引用。覆盖所有合同要求保留的历史资源，特别是逻辑删除版本和已删scope历史；缺对象/损坏不能忽略后声称全量完成，不从当前原始资源重建历史副本。未提交孤儿/临时multipart单独盘点，不并入可恢复业务数据，不在本任务自动GC。

同一个MinIO备份桶中分别data/objects/manifest，不与原始/快照桶共享。备份采用唯一前缀、private策略，不配置误删已完成备份的TTL。现有MinIO异常ListIncompleteUploads曾漏列，不能把空列表当已无分片；本流程优先已有限额单PUT/已知uploadID清理，跨失败保留精确ID和归属，不让外部漏洞被测试断言掩盖。

### 5.2 可用备份提交与退出维护

每个数据分片/对象先写入，再实际GET计算大小/SHA；完成manifest列明格式/schema、producer、稳定instance UUID、backup ID、业务表/对象精确集合、总数、摘要和完成时间。所有资源及逻辑引用校验成功，最后写不可变完成清单，再在控制DB把backup标available。半包/清单缺项不可见为可恢复备份，不通过备份bucket.list猜available。

复制失败：备份不得available，本轮精确前缀和multipart可有界补清；原业务不变。若确认没有restore切换，可按原配置解除应用DB fence、恢复原副本、核对generation和所有Pod，再退出maintenance，记录失败及服务恢复。状态不明、丢锁或外部Pod归属变化时保留维护并给resume指令，不以超时自动放行。

可用备份必须包含独立字节副本；原库后续写入、原始对象覆盖/删除、旧快照对象不可用都不能影响已有backup。暂不做备份删除/轮换自动化，可提供plan和显式删除单个未被恢复引用的backup；若不实现删除入口必须提供明确运维清理边界，不能误删生产原桶。

## 6. 候选恢复与切换

### 6.1 预览与候选准备

restore-plan只读校验受控backup ID、完整性manifest/全部对象、格式与schema兼容、目标固定instance UUID；给表/对象计数、预计存储、停机范围、拟建候选DB/桶、当前generation和风险。execute必须同时绑定backup ID+manifest SHA+目标instance+plan指纹/request ID以及明确恢复确认语义。plan后实例generation或备份内容变化需重新预览，不复用陈旧确认。

第一批同实例恢复，不自动异实例克隆。候选PG数据库、新原始/快照bucket使用restore UUID命名，不覆盖已有同名资源，建立归属清单。逻辑数据导入候选，按对象映射改原始/快照bucket定位，保留snapshot/asset/scope UUID、配置内容、原始对象路径与历史摘要，重新核对完整性清单和引用。必要的定位改变不修改业务payload/审核历史；备份原副本不被当作可写候选。

完整验证至少含业务表结构/行数/唯一性/关联、payload与manifest摘要、scope隔离、全部对象size/SHA、active指针可用、版本编号上界；故障前不切业务连接。不得把restore API返回200、导入成功退出码或单条ping当恢复正确。

### 6.2 停服、保留当前账号与切换

进入§4全停服并重新确认plan；候选可以预先准备，但切换前重新捕获当前管理员记录及编号上界。同scope恢复后的版本计数取备份、当前及历史最大值，不能因恢复旧包复用已提交版本号，复用现有mergeReleaseNumberBounds语义。

管理员保留当前目标库的账号/密码hash/disabled/credential_version，不从备份导入，不能改回默认admin密码。候选会话为空，并提升独立控制session generation，旧Cookie/CSRF在任一Pod都不能复活；后台鉴权缓存也必须换代。原密码hash只在受限临时内存/候选DB流转，不进入可下载备份、日志或PRD。

本批选**候选DB/桶＋工作负载连接配置切换**，不清原库、不给原库rename/drop、不在共享PG实例重启。切换是可恢复状态机而非假装分布式事务：

1. 控制DB持久写prepared及旧/新部署指纹和资源归属；保存旧配置受限副本，原DB与两原桶保留。
2. 全Pod已停与应用角色fence成立后，更新allowlist workload的业务DSN/原始bucket配置；快照行已在候选内映射新桶。pending generation先登记，不能先允许新写。
3. 按显式新generation允许候选实例启动为维护检查态，启动不得对旧代数据库AutoMigrate或seed；读取独立控制状态，只有已批准pending generation可检查，不对外Ready。应用角色恢复登录的时机必须受状态/generation保护，不能让旧配置Pod趁间隙重连服务。任何旧配置实例启动拒绝，不用一个可能恢复倒退的业务revision作为fence。
4. 原副本数各Pod都确认新DSN/两个bucket/generation，实际匿名runtime/资源/ZIP和管理只读检查通过，旧业务DSN连接无存活写者。Redis业务缓存键全按新非回退generation生成（所有相关读写/失效一致），不能继续命中恢复前值；共享Redis无FLUSH，不恢复旧锁。
5. 最后CAS提交控制active generation并解除maintenance开放服务，持续确认Ready。候选只在最终resume后允许写。重放、resume必须以控制阶段和外部实际状态一致为前提，不重复导入或重复切换。

### 6.3 失败、接续与回退

工具在停服、上传、候选校验、配置已更新/控制未提交、部分Pod启动、最终提交/响应丢失等任意阶段被杀，均可用status＋resume检查继续。独占advisory锁释放不等于maintenance取消，继任不会把其他恢复代或正常backup判成自身残留。

最终开放业务写前可abort回旧配置/库/桶，先撤销候选服务、确认无候选写入，再以新的更大generation指向旧数据恢复原副本；fence/session/缓存generation均不倒退。记录所有半完成步骤。**开放新写后不能自动退旧库丢弃新数据**，失败只能维护并由运维决定后续，不把恢复前副本当任意时点自动回退保证。不自动drop旧DB/桶，不引入自动轮换旧恢复代。

旧代存活或某Pod无法确认归属、网络分区、校验缺失、控制DB不可用、owner token变化，保持维护/不Ready并输出具体阻塞；不通过强删Pod、放宽校验或重复重启伪造全局停写。

## 7. 代码组织、配置与产品说明

建议新增独立distributed backup包和cmd/maintenance-backup（最终命名由研发决定），复用原backup的校验、类型、hash/限额、账号保留和编号规则；不要把PG/K8s对象逻辑塞进SQLite manager。拆为控制状态与锁、workload维护适配、业务流导出导入、对象拷贝验证、restore切换、CLI。所有命令用结构化参数/库调用，不通过拼接不可信shell/SQL；数据库名/bucket/namespace/ID验证边界。

应用Service/Initialize加入新模式的启动/维护/generation保护，write gate保留原事务语义，普通模式不凭空依赖控制库。所有DB连接、对象流、临时文件、K8s client请求有明确有界ctx和释放；失败逐项可恢复，不给所有阶段同一个60秒总期限。依据实测数据量合理设置停服等待、DB流、对象复制、候选启动和总作业deadline并记录耗时/字节数，不连续缩数据绕过失败。操作状态不保存在会被清掉的/tmp或业务库中。

旧SQLite backup/schema4、旧包1/2/3升级、既有API Cookie/CSRF/Origin及错误语义不退化；不把新格式伪装旧ZIP上传。第一批网页不触发cluster restore，capabilities明确区分网页现有支持和运维CLI新模式；更新文档与所有新增reason中文说明建议，不输出snapshot_storage_not_local这种裸key，也不声称应用页面已可用。前端视觉/交互改造不由后端顺手承担；如确有契约变更先在PRD登记并向架构师给出交接需求，本批不向前端自行派发。

权限与准备说明须包括：同instance的控制DB/专用应用角色/维护角色分权、限定K8s Workload操作、镜像固定digest与候选配置要求、备份bucket与对象最小权限及无TTL策略、目标建库/建桶、工具运行位置、恢复期间停服可见性、失败resume/abort命令。没有必要权限不自动申请cluster-admin或修改共享服务角色；实验权限仅创建本轮独占角色/库/桶。

参考事实：PG16 pg_dump只能保证数据库自身一致快照（https://www.postgresql.org/docs/16/app-pgdump.html）；PG advisory lock需应用主动遵守、session锁随连接结束（https://www.postgresql.org/docs/16/explicit-locking.html）；pg_restore可执行源库定义的代码，单纯选择部分表不消除任意dump风险（https://www.postgresql.org/docs/16/app-pgrestore.html）。这些不能替代本项目的对象一致性和运维控制协议。

## 8. 分阶段实施与实验环境

1. 先读所有入口及PG/MinIO locator，登记最终模式、精确业务表allowlist、控制模型/阶段、维护fence与配置切换方案。关键合同不可实现时给证据/最小偏差后请架构师决定；正常私有实现无需逐项审批。
2. 实现控制CLI＋双Pod停服/fence/恢复服务的空操作闭环，证明所有在途/新写被隔离及进程死后状态仍可恢复。再实现全量数据与对象备份/验证。
3. 实现候选恢复、账号/编号、数据generation切换/缓存隔离；补每个危险边界的故障重放。
4. 完成受影响Go构建/测试/旧SQLite回归，真实远程双Pod全链与中断接续，收尾清理，回填同PRD。

真实实验只能在远程**独占测试namespace和数据库/角色/原始桶/快照桶/备份桶/控制DB/Redis空间**，使用已授权SSH通道和中间件，不在本地安装三件套。可以建立本轮临时两个候选应用Pod及CLI Job；共用PG/MinIO服务但不得使用现有虹桥业务DB、生产桶、真实Deployment或现有账号改NOLOGIN。Pod同时运行而非顺序重启伪装双Pod；为避免ghcr.io DNS现状，用已核验镜像/临时构建产物经已有安全传输放实验节点containerd，禁止改全局DNS/registry/防火墙。候选产物与真实v5.1.0镜像明确区分，不发新正式镜像。

运行前记录实验namespace/角色/库/桶/node/进程/端口/镜像归属与资源预算；无创建权限先给具体阻塞和已完成实现，继续可独立单测，不回退使用生产库。后台进程隐藏窗口；recursive删除须验证绝对路径严格位于本轮目录，K8s/DB资源删除需绑定本轮唯一前缀和真实UID/归属，不能仅用模糊通配符清理。

原正式环境只读保存必要基线，实验结束后核对原业务范围identity/freeze/active元数据未变，生产Pod/配置/imageID未因实验变更。严禁以恢复旧库、清共享Redis、删生产对象作为清理。实验失败也要finally收尾本轮Pod/Job/HPA（若实验自建）/角色连接/候选DB/控制DB/所有桶和临时文件；清理前确认无在用/无正式引用。报告精确清理失败项，不声称零残留。

## 9. 验收矩阵

| 场景 | 判据与证据 |
| --- | --- |
| 双Pod与多入口停服 | A/B初始同时可服务；手动backup从外部CLI发起，两个Pod均停止，连接清零；新Pod/旧代/另一个CLI任务在维护时不能写，冻结/发布/导入/资源上传/迁移/补清均覆盖 |
| 在途长写/上传 | 正常等待结束；超时/分区/Pod卡住不开始一致备份、不开放恢复写，原库/对象不被切换；不能把force-delete成功当停写成功 |
| 全量完整性 | 多scope、多配置类型/大整数、10张图、active/非active/删除版本、锁版/备注/审核都可核对；每表/对象精确计数及逐字节SHA，半备份不可恢复 |
| 备份独立性 | 在实验源库/原始区/快照区后续改变或删除对象后，available备份仍可恢复，manifest不只是原桶路径引用 |
| 候选恢复 | 从备份恢复新DB/新桶，确认active/fixed、图片/文件、静态ZIP、transfer active/version归档、scope隔离、删除历史及大整数一致；旧DB/桶未改 |
| 当前账号与编号 | 备份后修改实验管理员密码和新增版本；恢复后当前密码有效、旧会话全失效，编号上界不退，不覆盖管理员为包内/默认账号 |
| Redis污染 | 备份后预热两个Pod旧内容缓存，恢复新generation后无旧数据；放置外部独占对照键，确认未FLUSH/误删，旧锁不复活 |
| 进程与控制故障 | 停服后、拷贝中、prepared、配置更新后、部分Pod启动、控制提交/响应丢失逐点杀实验CLI/断开控制连接；继任status/resume正确，旧owner失权不继续，维护不自动消失 |
| 同请求/竞争 | 并发两个CLI一个被拒绝，同request重放不重复备份或恢复，变更参数拒绝，已被restore引用的backup不能删 |
| 故障备份/候选 | 资源缺失/摘要坏/空间不足/权限拒绝/未知schema/坏类型/缺字段等明确失败；备份失败可恢复原服务，候选失败不改当前连接 |
| 混代与回退 | 启动错误DSN/旧generation的Pod被挡；最终开放写前abort可回旧代；开放新写后自动回退拒绝，不丢新数据 |
| 兼容与权限 | SQLite现有功能回归通过；非受控DB格式拒绝；操作者无集群全局权限，所有临时资源有归属、清理复查，正式环境基线一致 |

真实PG+MinIO+双Pod运行/停止/重启及业务恢复为必须证据，Mock仅补确定性故障。实际数据规模、DB/对象字节数、停机起止与各阶段时间回传，不先设无依据性能承诺。验收输出精确passed/failed/blocked/未测，不因大套件退出0而把跳过项写通过。

## 10. 交付登记

在本PRD追加：最终架构与契约、代码/配置/DDL/CLI使用方式、实际命令/版本/实验规模、备份恢复一致性对照、故障与恢复状态机、权限和未验证边界、旧SQLite回归、原环境基线、精确资源清理与待处理项。证据放.local-qa/distributed-backup/<run_id>/，凭据/私有DSN/数据库正文/账号hash不入库或聊天。本批不提交推送/发布/更新真实服务、不新增自动化任务；定时和增量在本批验收后再规划，不提前藏实现。

派发状态：2026-10-30已通过send_message_to_thread发送给“虹桥研发”（local / 01a1333a-342c-7903-8ca8-164b82392399），工具确认送达。当前无本批实施/实验结果。

### 10.1 实施设计登记（进行中，非验收结论）

研发采用 `pkg/maintcontrol`（应用只读控制协议）、`biz/maintenance`（控制/PG逻辑流/对象/K8s/切换）和 `cmd/maintenance-backup`。业务 allowlist 复用 SQLite schema4 的冻结表列清单，通过 PostgreSQL text representation＋类型目录＋NDJSON 导出，恢复仅对可信 Go 模型创建的候选表执行固定 COPY CSV；不执行包内 SQL。单行8MiB、分片目标16MiB、单对象32MiB、对象清单100000项、完成清单32MiB，超过明确拒绝，不截断。此限额为首批有界实现，未声称覆盖任意规模。

控制表为独立库 `rb_maintenance_instance/operation/backup`，应用凭据只授 instance SELECT。每实例 session advisory lock＋单调 token；阶段写入先于外部操作。首批**写命令限定独占 Kubernetes Job**，通过 Downward API 的 Pod UID 和保留的终态容器记录证明旧执行者退出；不能证明不接管。读 plan/status/verify 可在外部运行。中断对象写使用新 attempt 前缀；中断候选准备保留旧候选，接续创建新的独占资源，不原地清空未知候选。

只操作显式 Deployment UID 与配置 Secret UID，使用 resourceVersion CAS；原配置保存到带 operation 归属的 immutable Secret。停服前建立 Pod watch，记录实际容器终态；Pod 消失本身不计为停止证明。独占应用 PG 登录角色必须有 `rainbow-maintenance:<instance UUID>` 归属标记且无超级/建库/建角色/复制权限和继承成员身份；维护身份独立。候选检查态不迁移、不 seed、不 Ready，核实全部 Pod 的连接身份后才 CAS 开放服务。Redis 缓存和 Lua 锁一同按 instance/generation 前缀隔离；会话摘要加入独立 session generation。网页仍不提供远程恢复执行。

实验预留 namespace `rb-maint-20261030-01`、证据 `.local-qa/distributed-backup/run_20261030_maint01/`；计划使用 worker02 缓存的已核验 v5.1.0 digest 作为运行基础，挂载本轮临时 ARM64 候选二进制，明确区别于正式镜像。新建业务/控制DB、应用/维护/控制只读角色、三个独占桶与独占 Redis Pod。准备前只读检查确认正式 Deployment UID `3b7ae5cc-8c73-45f8-a2b6-685ad083de5f`、副本1及原 digest、Pod重启0；未更改正式环境。

当前仅已完成主体代码编写与部分构建，**尚未完成真实双Pod和故障验收**。Windows 回归遇到多项原有目录/文件 rename `The handle is invalid`，需对照和 Linux 回归定位，不能记通过。权限收窄、危险阶段接续与资源清理仍在实施核验中。

### 10.2 中途核验登记（用户催办时的真实状态，尚未整体验收）

已完成一次真实双Pod全停服备份及新库新桶恢复，instance `0c3c6629-3080-46a8-b383-e2209939c815`，namespace UID `75b1aed9-996b-4a18-9d15-0a5dbf85fa08`。备份 `abd0321b-2f23-4a4b-8904-ca4061719486`，manifest SHA `0fe3a96ee8e403408fcd0387a8e5485173feadcccb7554778e52ace49527ef60`。包含两个业务scope、13配置、10PNG、active/非active/逻辑删除三个版本；备份后改密码、生成v4、预热双Pod缓存并删除两个实验源对象，仍成功恢复新DB/桶、generation=2。当前密码、active/fixed、大整数原文、旧/新ZIP CRC、编辑区恢复和Redis对照键验证通过，下一自动v5通过。证据 fixture-retry、mutate、restore-observe、verify-restored.log。

**不计为通过的缺口**：首轮Cookie脚本按根URL取Cookie，实际未带会话，不能证明旧会话失效；已修成应用路径取Cookie且要求恢复前双Pod实际200，待补测。完整Linux service/backup回归各有一处跨平台问题（Unix不能模拟Windows禁止删除打开文件、Linux未识别ZIP Windows盘符），已分别限定Windows用例、修盘符判断，最终回归待重跑。最新逐字段候选对照、停服在途请求计数、正常退出证据和更多超时保护尚待真实再验；崩溃接续/abort矩阵、最终清理及正式基线复核未完成。

已创建本instance独立MinIO app/operator IAM用户与限定桶及instance前缀的策略，app拒绝备份/生产桶和建桶、operator拒绝生产桶，已装入实验Secret，未更改原用户/策略。最新控制诊断改为现有 `/ping` 响应头，不新增公共API/IDL路由；checking返回503、不Ready。证据 iam-create、install-iam.log；后者末尾因滚动时一个Terminating旧Pod被脚本计入而返回错误，后续需等待/排除该Pod重新核验。

本批代码未提交推送，正式环境未更新；临时独占资源仍保留供收尾，不能声称零残留。用户已明确要求向“虹桥架构”求助，研发已发送当前证据与未完事项，请其只读核对阻止交付的逻辑和最小补验集合，不转交实现。

### 10.3 研发交付与最终验证登记（2026-10-30）

§10.1—10.2为中途记录，以本节后续证据为准。应用控制接入、独立CLI、逻辑流与对象备份、候选恢复和可续作切换已实现；使用方法、权限、配置、停服说明和人工清理边界见 `docs/operations/distributed-maintenance-backup.md`。没有提交、推送、发镜像、打tag或更新正式服务。

架构复核后修复：abort不再清空原Pod停止证明；切换前持久记录允许的Secret摘要，避免Secret已更新而控制记录滞后的断点无法接续；Secret UID校验先于相同内容的幂等判断；abort方向与维护状态同事务登记；写命令要求restartPolicy Never。新增逐表逐列对照发现旧迁移会改写恢复数据的environment.updated_at，已将该迁移移到空候选建表后、导入前执行，真实故障恢复再验通过。

实验使用PG16、共享MinIO服务上的独占桶与独占IAM、独立Redis Pod，namespace `rb-maint-20261030-01`，应用初始及每次恢复后均为两个同时服务的Pod。运行基础为§10.1所列固定digest，实际执行本轮ARM64候选二进制，非已发布镜像。业务/控制库、三个角色和全部候选资源均独占，不对现有虹桥库执行fence。数据规模：两个业务scope加默认scope、13配置、10张随机PNG、三个备份时版本（含非active和逻辑删除）、11张业务表、43个独立备份对象，逻辑流和对象合计2,664,970字节。首轮backup Job 13秒、restore Job 15秒；后续单次故障恢复验证含故障注入/Job等待/业务核验约23—31秒，不作为生产停机承诺。每操作PhaseTimes和Pod退出时间保留在作业输出中。

| 验证 | 实际结果与证据 |
| --- | --- |
| 全停服备份→改数据/删源对象→新库新桶恢复→双Pod服务 | passed；首轮backup/restore日志及final-evidence.log，所有已记录原Pod正常exit 0后继续；旧库/原桶不被覆盖 |
| 完整性与精度 | passed；每表行/列/类型、每对象size/SHA、候选逐字段对照；真实PG bigint边界、decimal小数位、微秒timestamp、bytea、NULL与越界原子拒绝见precision-result.log |
| 当前账号和会话 | passed；修正Cookie路径后，恢复前同一真实Cookie双Pod均HTTP200，恢复后均401；当前密码有效、备份时密码无效，不用首轮空Cookie作为证据 |
| 业务结果与缓存 | passed；双Pod active/fixed大整数原文、旧/新静态ZIP和CRC、编辑区恢复12项、Redis外部对照键保留；自动版本连续到v12，没有回用已提交编号 |
| 配置更新前后中断 | passed；configuration_switching resume、configuration_switched resume/abort，进程被杀后维护仍draining；replay-extra.log、minimal-fault-suite.log、final-evidence.log |
| 存活旧owner失锁与接管 | passed；实验CLI作为容器内子进程SIGSTOP，断开其PG锁连接，新Job拒绝接管且token未变；SIGKILL并确认旧Job终态后接续成功，token13→14，generation9；fault-tail.log。首轮直接暂停PID1的脚本无效，不计该首轮为通过 |
| 候选启动和最终提交前中断 | passed；starting、control_commit阶段杀CLI，维护保持checking，新owner接续完成，token15→16、17→18，generation10、11；fault-tail.log |
| 完成响应丢失后的重放/开放写后回退 | passed；已完成请求再次resume和restore保持相同operation/token/generation/candidate；abort明确拒绝；replay-extra.log。不是声称模拟了TCP响应包丢失 |
| Linux兼容回归 | passed；service完整测试76秒、backup完整测试13秒，含旧SQLite schema1/2/3/4与WAL；regression-service-final.log、regression-backup-final.log。只跳过明确需要外部fixture或Windows语义的用例，不声称Windows全套通过 |
| 本地构建与受影响检查 | passed；ARM64 dev应用/CLI编译；go test maintenance、maintcontrol、redis、config、middleware；go vet对应新增控制/CLI包；git diff --check |
| 最小权限 | passed；应用控制用户只读、专用PG角色、namespace内operator SA；独立MinIO app拒绝备份/生产桶/建桶、operator拒绝生产桶，未修改生产IAM；iam-create/install-iam日志 |
| 正式基线 | passed；baseline-before.json与baseline-after.json精确一致：配置SHA、Deployment UID/完整spec、各scope identity/freeze/revision/active/head revision |

**尚未完成，不计通过**：真实大对象传输中途杀进程（已有阶段中断不能冒充字节流中断）；持续长写/上传超时与节点网络分区；MinIO/PG磁盘耗尽；人为修改备份摘要/未知schema的完整远程拒绝矩阵；每一种管理写入口在维护态逐条HTTP验证；transfer active/version归档独立现场断言。现有单测的坏类型、缺字段、取消和超限拒绝不替代上述所有现场场景。§9完整验收仍需补这些项，当前不能宣布整份PRD全部验收通过。

证据根目录 `.local-qa/distributed-backup/run_20261030_maint01/`，包含脚本、测试日志、脱敏作业状态、阶段与请求ID。凭据、完整配置、账号hash和真实会话仅在远端0700/0600私有临时文件，未写入本PRD或版本库。清理结果另附下节。

### 10.4 实验清理与剩余边界

`cleanup.log`确认删除独占namespace（含双Pod/Redis/CLI与回归Jobs、Secrets、SA/RBAC）、源与全部登记候选/控制DB、三个PG角色、原始/快照/备份及全部登记候选桶；删除两个独占IAM用户和策略。随后 `cleanup-audit.log` 独立查询确认namespace不存在、本instance数据库/角色/新候选桶及rbm01桶数量均零。清理只使用归属表、namespace UID、DB/角色注释与精确资源清单，没有触及正式库/桶/Redis。

worker02独占hostPath目录内临时文件已删除并确认空目录，**空目录 `/var/tmp/rb-maint-run_20261030_maint01` 仍保留**，未为删除一个空目录扩张宿主机挂载权限。master同名私有目录在核对realpath、非符号链接后已完整删除，内含临时凭据亦删除。本地 `.local-qa` 测试产物与脱敏证据保留，不入Git。不能声称所有主机目录零残留。

清理后正式Pod仍为 `rainbow-bridge-app-69958bb488-d9msf`，UID `e4cdd2f7-6fdc-4380-a2d5-6606af885842`，restartCount=0，imageID仍为固定 `55301c0c…1448b88` digest；完整配置/Deployment/scope元数据基线再次输出在cleanup.log，未更新正式应用。本批可供代码评审和核心流程复核；§10.3未测事项意味着尚未达到§9全部验收终点，不能据此直接上线。

## 11. 网页完整闭环修订：前后端共同合同（2026-10-30）

> 新部署约束（2026-11-01）：用户已明确允许“加辅助容器，执行备份时临时启动一个任务容器”。选定§13同Pod辅助容器＋临时Job模式，授权按原研发分工实现和隔离验证；不新增独立console/gateway Deployment或Service。§11独立控制面作为已实现兼容模式保留，§12独立服务正式接入方案不执行。新模式不是现v5.1.1开关，正式认证迁移/入口切换尚未执行。

> §13选定模式摘要：保留原Deployment/Service/URL及PG/MinIO/Redis，现有每Pod增加一个管理辅助容器，业务容器增加守护入口；维护仅停止业务子进程，不缩容Pod。临时单次Job沿用现有执行者归属协议，前端沿用maintenance_web/v1。以下§11.1—11.8不是该新生命周期已验证的证明。

> 正式接入诊断（2026-11-01）：用户升级v5.1.1后在K8s原入口仍看到“当前部署未开放网页备份与恢复”。架构已只读核对：31880 /version 为v5.1.1 / 0e1d962；namespace rainbow-bridge的Service仍直接选择app=rainbow-bridge-app，运行该业务Deployment，未运行独立console/gateway。该Pod的/app/config.yaml未出现backup根配置；镜像内maintenance-console/gateway/backup三个可执行文件均存在。独占rb-web-20261030-01仍有业务2副本、console和gateway，对外31981。故当前是**正式入口未完成控制面/认证/配置接入**，不是K8s或PG/MinIO/Redis本身不受支持，也不是只升级前端/强开supported即可修好。用户截图的旧本地模式原因与该部署形态吻合；本次未读取用户Cookie或更改正式配置/账号/数据。
>
> 后续先由后端形成可审阅的原入口接入方案：原业务/控制账号和数据备份、独占角色/控制DB/备份桶、现有账号一次性迁移、固定digest的console/gateway/Job及权限、同URL路由切换和受控回退、前置检查和停机范围。沿用现有PG/MinIO/Redis，不靠关闭Redis/改SQLite绕过。不能把测试31981导流到正式数据、不能以新空实例代替现有业务、不能用默认账号覆盖原admin。此诊断续作仅授权只读检查和方案准备；实际正式停服/认证迁移/路由变更尚未执行，须以用户明确部署要求为准。

### 11.1 用户目标与范围

用户纠正：登录系统admin后，应通过网页完成全部正常备份恢复工作。本批终点改为**同站点登录→创建/查看/核验全量备份→预览和确认恢复→停服期间持续查看状态→中断后继续或切换前回退→恢复后用当前密码重新登录**。普通操作不要求SSH或CLI；现有CLI作为后台引擎入口与极端故障应急工具。只交付按钮或“联系运维”说明不算完成。

admin有本产品全部操作权限，服务端仍验证状态和完整性，不能跳过校验或开放写后自动退旧库丢新数据。保留原全停服与新库/新桶设计，原数据库/对象不覆盖。定时、增量、跨实例导入、备份删除/旧恢复代GC不在本修订，不引入通用灾备平台。

后端承担独立控制服务、认证与状态接口、任务编排及部署模板；前端承担§8网页流程。用户已要求分别派发，授权按本修订实现与隔离验证，**不含推送或正式部署**；旧实现不得按“网页最终方案”继续宣传。仍由现有虹桥研发、虹桥前端完成，不新建研发代理。

### 11.2 业务停服不影响管理入口

新增独立maintenance-console Go入口/Deployment/Service，与业务Deployment分离且不进入停服allowlist。提供控制HTTP、登录HTTP及同版Vue静态资源；不调用业务Initialize/AutoMigrate/seed，不随业务DSN切换。复用Hertz、密码算法、静态构建与biz/maintenance引擎，任务在独占K8s Job运行，不在handler同步备份几分钟。

稳定gateway使用独立Nginx或现有等价路由，不强制安装特定Ingress：

| BasePath下请求 | 分布式web部署目的地 |
| --- | --- |
| 静态JS/CSS、/login、/backups、SPA深链接回退 | console/独立静态服务，业务Pod=0仍可刷新、新开页面 |
| /api/v1/auth/*、/api/v1/maintenance/* | console，不能先经过已停业务Pod |
| /api/v1/backup/capabilities | console的安全模式发现响应；旧SQLite保持原路径/路由 |
| 其他业务与runtime API | 原业务Service；维护期间gateway返回结构化503 MAINTENANCE_ACTIVE |

保持同一域名、BasePath和用户入口URL。console/gateway与业务Service不能共selector，不能实时依赖业务Pod拉静态文件/登录资料/作业详情。正常业务Pod缩0时管理仍Ready；管理Ready不代表业务可用。当前只交付部署模板/隔离验证，正式NodePort/Service改接属于将来部署，不在本任务直接更换。

console或浏览器退出不取消Job/解除维护，重启后从控制DB恢复索引与命令。首批console可1副本，须持久化且可重启；并发请求协议不能依赖进程mutex。控制PG/K8s本身不可用时报告阻塞，不承诺整个基础设施失效时网页还能恢复。

### 11.3 同一admin账号，认证不随业务库回退

为避免业务Pod停服后无法登录，**仅在新distributed web模式将账号/密码hash/role/disabled/credential_version和会话的权威存储迁至独立控制DB**。不是同步两套可各自改密码的admin；SQLite和旧CLI模式保持原认证行为。首次接入部署迁移在受控窗口从原业务auth表一次性导入并核对hash/版本，标记authority及schema；不重置密码/生成默认账号，不覆盖已存在但不一致的控制账号。撤销旧会话后原密码重新登录。迁移可由部署包一次性init Job执行，不是日常用户手敲初始化命令。

新模式auth/login、me、password、logout在console直接读控制DB；业务Pod通过抽出的认证repository访问同一权威，不能查候选业务auth表决定身份。复用既有Argon2、Cookie、Origin/CSRF、限流和密码规则；密码变更只写唯一权威并撤销全部对应会话。业务库auth表若为兼容保留，则不能seed、反向同步覆盖控制账号。账号/会话/控制作业不进入业务备份。新模式retainAuthAndBounds若需要填兼容auth行，从控制权威读当前值，不再从旧业务副本取密码。

认证repository、身份迁移、引擎控制权限分别建连接/最小授权：业务Pod不能因校验管理员而获得控制作业写权限，console认证身份不能因改密码获得候选库/桶或K8s管理权限；认证需要写会话的路径由专用身份承担。复用当前实例只读维护guard，不将它放宽成控制库全写。authority切换必须同时验证入口路由和所有Pod，混用旧业务认证的Pod不准接入新web部署；迁移中断保持旧权威或维护，不形成双写。回退部署不能直接切回旧业务认证表接受过时密码，须有受控单向导出当前权威和完整会话撤销步骤。

普通会话scope=admin；维护期间的新登录scope=maintenance，可访问维护页面及当前操作的查询/续作/回退，业务请求服务端阻止。auth data增加可选access_scope=admin|maintenance、active_operation_id，旧SQLite缺字段按admin兼容。维护期间改密等非任务变更返回STATE_CONFLICT；页面仍允许同一admin密码登录和完成任务，不另建运维账号。

最终restore提交提升控制库auth/session epoch，恢复前所有正常/维护登录会话失效，不能为了查结果保留全权Cookie。任务页另可获**operation限定的HttpOnly结果Cookie**：只读该操作，不可创建/续作/回退；进行中最长2h且不超过作业deadline，终态后最多15min。只能由有效admin会话为已授权operation领取，不凭UUID领取；前端不持久化token。刷新可看最终结果，需要动作须有效admin/maintenance会话，恢复后重新登录才能恢复正常业务访问。停用/改密/登出按权威撤销相应权限；backup成功无需全站退出。控制DB认证迁移要有显式检查点，不能每次启动隐式同步。

### 11.4 持久任务编排与安全投影

新增控制请求/预览/outbox/事件记录，保存actor、request_id、参数fingerprint、原引擎request/operation ID、preview、task状态/阶段/revision、allowed_actions、Job name/UID/固定模板digest、错误与安全统计。**不得将原Operation.Data或Plan直接序列化到HTTP**，其中含内部库/桶/Secret定位。

HTTP受理先事务登记请求/outbox，再返回202；后台有界reconcile创建固定模板/固定image digest Job，记录实际UID。console被杀、创建Job成功响应丢失、重复POST都对账同task与Job，不产生并行恢复。后台对账不是定时备份，不新增CronJob。Job仍Never/backoff0/parallelism1/completions1、保留终态，原owner未确认退出禁止接管；Job失败/消失不能自动解冻。

console SA仅本namespace编排固定Job/读状态，executor SA执行既有allowlist Workload操作；不授cluster-admin。RBAC不能单凭标签限制所有Job创建，须如实说明namespace权限。客户端禁止传image/command/env/挂载/SA/namespace/DSN/SQL/桶名，所有资源来自受控配置与Secret引用。

复用Run/Acquire/Stop/Switch。每个HTTP续作/回退命令有独立action request_id，指向原operation及原引擎request_id/计划；不能重建当前库计划。每operation只有一个执行者，revision变化需重读，旧owner存活返回409。terminal、维护active、业务available、是否已开放写分别记录，不用Job exit0代替完成。已启动任务的“取消”实际走安全abort，不能强杀Job/删任务记录假装结束；queued且未运行命令可cancel。

### 11.5 公开HTTP合同（本节为前后端单一依据）

前缀BasePath+/api/v1/maintenance。新增IDL后hz生成，手写handler/DTO映射，不手改生成model/router。200={code:200,msg:"OK",data:...}；202={code:202,msg:"ACCEPTED",data:{task}}；错误HTTP对应状态={code,msg,error_type,data?:{task_id,operation_id,current_revision}}。ID字符串、UUID字符串；revision/generation/bytes/数量一律十进制字符串；时间RFC3339 UTC；未知值null、空集合[]；不返回密码/hash/DSN/对象地址/完整执行日志。

| 接口 | 合同 |
| --- | --- |
| GET /capabilities | {mode:"maintenance_web",contract_version:1,supported,ready,reasons:[{code,message}],actions:{plan,create,verify,restore,resume,abort,cancel},maintenance:{active,business_available,operation_id},limits:{plan_ttl_seconds:600,task_deadline_seconds:7200}}；supported为模式，ready/actions取实际配置/权限/依赖状态 |
| POST /plans | {request_id,kind:backup或restore,backup_id?,expected_sha256?}→202 task(kind=plan)，只读验证，不停服；restore核验全部备份字节/引用完成后产生preview_id |
| GET /plans/{preview_id} | {preview_id,state:valid或invalid或expired,kind,expires_at,target_label,backup_id?,manifest_sha256?,counts?,bytes?,warnings[],issues[],plan_fingerprint,revision}；10min过期，执行时配置/实例/包变化拒绝 |
| POST /backups | {request_id,preview_id,plan_fingerprint,confirmation:"BACKUP_ALL_BUSINESS_DATA",reason?}→202 task(kind=backup) |
| GET /backups | ?limit=20&cursor=（最大100）→{items:[backup],next_cursor,has_more}；仅available备份，半包归任务视图 |
| POST /backups/{backup_id}/verify | {request_id,expected_sha256}→202 task(kind=verify)，结果持久；失败不能恢复直至再次核验通过 |
| POST /restores | {request_id,preview_id,plan_fingerprint,backup_id,manifest_sha256,confirmation:"RESTORE_ALL_BUSINESS_DATA",reason?}→202 task(kind=restore) |
| GET /tasks | ?limit=20&cursor=→{items:[task],next_cursor,has_more}，当前任务优先，不依赖浏览器本地缓存 |
| GET /tasks/by-request/{request_id} | 查提交是否已受理；404不允许自动造新ID，未知时保持原请求可重试 |
| GET /tasks/{task_id} | {task,operation?}；有界轮询，非逐次重新校验全量对象 |
| POST /operations/{operation_id}/resume 或 /abort | {request_id,expected_revision,confirmation:"RESUME_OPERATION"或"ABORT_BEFORE_COMMIT"}→202 command task关联原operation；开放写后abort拒绝 |
| POST /tasks/{task_id}/cancel | {request_id,expected_revision}→202 task；只取消尚未启动命令，执行中409并返回正确allowed_actions |

task={task_id,request_id,kind,state,phase,revision,operation_id?,created_at,updated_at,started_at?,finished_at?,actor,reason,parent_task_id?,result?,error?,allowed_actions[],progress}。state=queued/running/succeeded/failed/interrupted/blocked/cancelled；phase为公开枚举planned/queued/draining/exporting/copying/verifying/preparing/switching/checking/resuming/aborting/completed，映射现有内部步骤；error={code,message,retryable}；result={backup_id?,preview_id?,business_available?,reauth_required?}；progress={completed_objects?,total_objects?,completed_bytes?,total_bytes?}字符串或null，节流写入，未知总量不虚构百分比。plan完成前result.preview_id=null，前端查task获ID后读取preview。

operation={operation_id,kind,state,revision,maintenance_active,business_available,writes_opened,allowed_actions,blocking_reasons}。task成功但business_available=false不能宣称恢复完成，应给阻塞诊断。backup={backup_id,created_at,consistent_at,manifest_sha256,size_bytes,counts,reason,actor,verification:{state:unknown/running/passed/failed,checked_at?,message?},restorable}；最后核验时间不能用刷新时间代替。

reason最长500字符；limit范围1—100，cursor为不透明值且校验归属。warnings/issues/reasons/blocking_reasons统一{code,message}安全条目数组；unknown消息由前端安全兜底，不含内部定位。counts按现有BackupCounts语义包含environments/pipelines/configs/assets/versions/deleted_versions/freeze_events/release_events/configs_deleted/assets_deleted，各值十进制字符串或未知null，字段不适用时不虚构0。target_label来自本实例受控展示名称，不允许输入任意目标URL。

发现入口仍GET /api/v1/backup/capabilities：完整web部署返回mode=maintenance_web、supported=true、新增maintenance_api_prefix=/api/v1/maintenance、contract_version=1；随后独立/capabilities决定ready/actions。前端仅接受固定同源prefix，不随任意外链发送Cookie。旧maintenance_cli_only/business_full响应原样兼容；不能只改supported=true打开旧SQLite按钮。web模式不使用旧ZIP上传/下载/删除接口，本批备份来自受控MinIO索引，不接受任意PG/维护包上传。

新增错误至少：MAINTENANCE_NOT_READY 503、MAINTENANCE_ACTIVE 503、TASK_BUSY 409、PLAN_STALE 409、PLAN_EXPIRED 410、REQUEST_CONFLICT 409、STATE_CONFLICT 409、BACKUP_INVALID 422、EXECUTOR_NOT_STOPPED 409、CONTROL_UNAVAILABLE 503；AUTH_*沿用。变更请求检查有效admin、Origin、CSRF；只读结果Cookie仅GET匹配operation，不能查询其他列表/任务。业务维护503不能清管理登录；登录401与结果Cookie权限分开处理。网络中断保留受理不确定，明确前置拒绝不可冒充执行成功。

### 11.6 实施与验收收口

1. 后端先完成认证repository/控制迁移、IDL安全视图、console/gateway静态深链接/登录，给前端脱敏响应fixture；默认不开新模式，不改现有部署。
2. 持久受理/outbox→Job编排→任务/进度/allowed_actions→预览/备份/验证/恢复/续作/abort；复用既有引擎与精确资源归属，不重写完整备份平台。
3. 前端先契约Mock，再与后端共用一个独占实验窗口做浏览器全链；后端提供连接、测试账号和资源归属，前端不改集群，验证后清理，不各建一套实验。

必须真实通过：浏览器admin登录→备份→改源业务/密码/预热双Pod缓存→预览确认恢复→业务两Pod为0时刷新页面及新浏览器同密码登录→跟踪恢复→数据/资源/active/fixed/ZIP/编号/缓存核对→旧会话失效→当前密码重新登录。控制库账号不被备份或旧业务表覆盖。console重启、浏览器关闭不影响Job；K8s create成功console崩溃只创建一个Job；同request重放、两个浏览器竞争、旧owner存活拒接管；配置切换断点网页resume与abort均有证据，开放新写后回退服务端拒绝。登录过期/跨站/无CSRF、结果Cookie越权、未知operation、账号撤销及迟到响应须补行为覆盖。

§10.3剩余故障按本次风险收口：真实对象流中途杀执行者、长写/上传超时至少一个代表场景必须补齐，证明半包未available/不切换且维护保留；损坏manifest/对象及未知schema在真实PG/MinIO夹具拒绝。节点分区/磁盘耗尽可先用可控适配器故障测试验证拒绝和不切换，如未做真实系统注入明确未测，不称真实通过；不扩成通用灾备平台。旧SQLite/CLI只重跑受本次认证/路由改动影响检查，未受影响证据可复用。

交付console/gateway/Job/SA-RBAC/Secret引用/认证迁移及回滚模板与运维说明，admin不需操作内部资源；正式基线、实验独占与精确清理合同沿用，§7.5前端历史审批拒绝的目录保留如实登记，不绕过。编码沿用engineering-quality-preserving-refactor，按认证存储、HTTP映射、受理、Job适配、任务投影拆职责，复用工具链，不引入Python。结果追加本节后，保留§10历史事实。未授正式部署/推送权限。

参考：[Kubernetes路由](https://kubernetes.io/docs/concepts/services-networking/ingress/)、[Job执行语义](https://kubernetes.io/docs/concepts/workloads/controllers/job/)、[OWASP服务端会话失效与Cookie边界](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)。独立控制面与唯一认证权威是本项目设计决定，非框架自动保证。

### 11.7 跨端交接登记与派发

后端在此追加公开契约就绪状态、IDL/DTO及脱敏fixture绝对路径、共享实验URL/BasePath/契约版本、资源归属与有效期、已验阶段和当前阻塞。测试凭据通过本轮受限私有配置交付，正文不写密码/DSN。前端读取本节与原§11.5，不另猜接口；Mock可先行，真实集成等待此处环境就绪。后端保留本轮独占环境到双方完成集成，再统一清理，不提前清场或重复搭建；临时服务结束/清理同样回填此处。只需共享文件与各自聊天回传，不要求研发互发消息。

修订派发状态：2026-10-30已通过send_message_to_thread发送给“虹桥研发”（local / 01a1333a-342c-7903-8ca8-164b82392399），工具确认送达；maintenance_web本轮尚无交付/集成结果。

后端交接更新（2026-10-30实施中）：公开合同v1安全DTO：`D:/kylin/rainbow_bridge/biz/maintenanceweb/dto.go`；IDL：`D:/kylin/rainbow_bridge/idl/biz/maintenance.proto`；hz已生成有效model/router。合成脱敏fixture：`D:/kylin/rainbow_bridge/docs/contracts/maintenance-web-v1/fixtures.json`，可供前端Mock，不是真实运行证据。发现接口为同源 `/api/v1/backup/capabilities`，维护API为 `/api/v1/maintenance`；认证增加access_scope和active_operation_id。console、认证repository、outbox及固定Job主体已编译，权限/幂等/结果Cookie行为测试在补齐。共享环境将使用新namespace，URL与私有凭据位置待部署登记，前端可先Mock，无需另建集群。错误hz参数产生的 `biz/model/biz/` 重复目录删除被自动审批拒绝，保留且不绕过；有效代码使用正确路径。

共享环境登记（实施中，尚未全链通过）：`http://10.60.226.43:31981/rainbow-bridge/`，BasePath `/rainbow-bridge`，contract_version=1。namespace `rb-web-20261030-01` UID `abd9b16b-c7bc-416c-bbe2-18829489b9f1`，instance `aaa4c049-987c-4751-9559-4b3626369950`；独立business/control DB与rbw01角色/桶、独立Redis、console及gateway，业务双Pod不包含console/gateway。测试访问资料受限保存在本地 `D:/kylin/rainbow_bridge/.local-qa/distributed-web/run_20261030_web01/frontend-access.private.json`，不打印、不入Git。静态为本地现有vue/dist快照，前端最终build需协调更新。已真实登录、发现能力及HTTP202受理；固定Job的K8s默认字段校验问题正在修复和补测，尚不能称备份恢复联调就绪。环境保留至双方完成集成，当前禁止清理；无正式服务修改。

共享环境后端阶段更新：固定Job模板校验已修复（允许K8s自动补fieldRef.apiVersion，同时仍核对所有客户端执行字段），通过行为回归。真实HTTP已完成plan→全量backup（重复同request返回同task）→修改源数据/当前密码/双Pod缓存并删实验源对象→restore-plan→restore；业务两个Pod确实为0时，fresh同密码登录成功、access_scope=maintenance、任务查询、/login与任务SPA深链接HTTP200，业务POST503没有清管理认证。恢复后旧普通会话/auth/me401，结果Cookie仅当前task200、列表401；当前密码重登录、双Pod active/fixed大整数/旧新ZIP CRC/编辑区12项/Redis对照键及自动v5通过。证据 `.local-qa/distributed-web/run_20261030_web01/full-backup.log`、`full-restore.log`。这是后端真实HTTP验收，**未冒充真实浏览器完整交互**；浏览器与网页resume/abort/故障等还需补齐。密码已在实验中变更，私有access文件将刷新为当前值；环境继续保留供前端联调。

前端静态同步请求（2026-11-01，追加于共享交接）：本地 `D:/kylin/rainbow_bridge/vue/dist` 已完成本轮最终 build（含 Sonner CSS 引入、Spectrum Toast 与维护提示去重）。JS/CSS SHA-256 清单：`D:/kylin/rainbow_bridge/.local-qa/distributed-backup-frontend/finish_20261101_9b55aed1/artifacts.json`。本轮已实时只读确认31981为maintenance_web/v1、无queued/running任务；最终dist已用独立浏览器静态替换＋真实API透传核对（维护503仅浏览器内模拟），**尚未同步到远端console**。请架构协调后端仅更新本独占namespace的console静态快照，再做非破坏性的列表/任务刷新与提示检查；不要改正式31880、不要新建/恢复业务任务。前端不操作K8s、共享集群暂标**不可清理（待静态同步确认）**，双方确认后由后端统一清理。详细证据、结果Cookie过期边界及本人交付见前端PRD §9.3以后。

前端收尾登记（2026-11-01）：本人实现、32项专项/49项回归、桌面截图、真实API与浏览器静态替换边界、结果Cookie过期及复用证据、进程清理已补入 `docs/prd/distributed-backup-frontend-v1.md` §9.3—9.7。70个JS/CSS与当前dist及浏览器验证清单哈希一致；Vite3002已停。本地前端交付完成，未重新执行恢复；后续仅待本节登记最终console静态同步和非破坏性核对。前端无新增破坏性联调用途；共享环境仍待同步/架构确认后由后端统一收尾，不能先行标可清理。

最终静态同步完成（2026-11-01）：§11.7的静态同步请求已处理。仅更新独占namespace `rb-web-20261030-01` 内console使用的 `/lab/web` 静态快照，URL仍为31981；最终70个JS/CSS均与前端 `finish_20261101_9b55aed1/artifacts.json` 和实际HTTP响应SHA-256一致。真实浏览器登录、备份列表刷新、已有完成任务深链接及刷新通过；未触发备份/恢复/改密或其他业务写。旧快照保留，可供核对。后端本轮无新增联调需求，等待架构统一确认共享环境清理，当前仍保留，未宣称零残留。完整证据与hash见§11.8末尾的2026-11-01登记。

### 11.8 后端交付结论（2026-10-30）

本轮后端实现及现有前端构建的真实浏览器主链已完成。用户要求立即收口，本节为最终交付记录，不再追加无关测试。代码保留在当前本地主目录，未提交推送、未打tag、未发布镜像、未改正式服务。测试入口：`http://10.60.226.43:31981/rainbow-bridge/`；账号访问资料仍在§11.7所列本地私有文件，已更新为浏览器改密后的当前值。

主要产物：`cmd/maintenance-console` 独立认证/HTTP/静态服务，`cmd/maintenance-gateway` 稳定同源路由；`biz/maintenanceweb` 安全DTO、持久请求/outbox/任务与阶段事件、固定单次Job、进度/动作/结果Cookie；`pkg/authauthority` 显式一次性身份迁移，`biz/service/auth_repository.go` 唯一认证存储；复用原维护引擎，补控制epoch、完成后实际Pod/runtime验证、对象进度及失败适配器。IDL经hz生成，未手改生成model/router；模板与权限/初始化/认证回退边界位于 `deploy/kubernetes/maintenance-web/`，CLI说明保留于 `docs/operations/distributed-maintenance-backup.md`。

| 验证层次 | 实际结果与证据 |
| --- | --- |
| 真实浏览器备份 | passed：同站点登录、列表、方案、勾选确认、创建、完成及刷新；browser-backup-final.log、browser-backup-result.json |
| 真实浏览器恢复 | passed：浏览器登录后创建源配置变更、通过同会话HTTP修改当前密码、重新登录、页面选择恢复/预览/确认；停服中刷新及新浏览器当前密码登录、业务503不清管理认证；最终只读结果与重新登录、源变更消失；browser-restore.log、browser-restore-result.json。源变更/改密使用浏览器会话HTTP夹具，未声称逐个点击配置/改密表单 |
| 停服窗口证据 | 集群观测两业务Pod确为0（browser-window.log）；浏览器刷新和fresh登录时间记录在result.json。Windows与服务器时钟有约42—43秒偏差，clock-alignment.json保留请求前后时间；校正后两动作均落在该约10秒窗口，不直接混用两端原始时间戳 |
| 浏览器继续与回退 | passed：真实杀掉配置已切换阶段的执行者后，打开任务页，点击继续/取消恢复原服务、对话框确认，命令完成并刷新；browser-resume.log、browser-abort.log及对应result/screenshot |
| 真实HTTP数据核对 | passed：备份后改密码、改源/删两个源对象、预热双Pod缓存，恢复新库新桶；当前密码、旧会话双Pod401、active/fixed大整数、旧新ZIP CRC、scope、删除历史、编辑区与Redis对照键、版本上界；full-backup.log、full-restore.log、web-faults-retry.log |
| 真正流中断/长写超时 | passed：真实MinIO GET已交付字节后杀executor，半包pending、维护保留，HTTP resume使用第二attempt前缀完成（stream.log）；真实管理配置写入在PG中延迟，短停服预算失败，未发布备份/未切候选，保留实际exit0证据后HTTP abort恢复（longwrite.log）。测试finalizer仅保留容器终态，不伪造停止证明 |
| 坏包拒绝 | passed：独占PG/MinIO的损坏manifest摘要、未知备份格式、对象字节损坏均核验失败/restorable=false，修复后重新核验通过；bad.log。未知字段/类型与精度的旧引擎证据继续复用 |
| 持久受理与竞争 | real PG passed：12并发同请求一个task，参数冲突与第二请求拒绝；K8s create成功但响应丢失由确定性TLS适配器模拟，第二次仅认领同Job，POST计数1；final-checks.log。未声称现场网络设备丢包 |
| 结果Cookie权限 | real PG/HTTP passed：仅自身task可读，列表/其他UUID/所有变更拒绝，过期/登出/停用/credential_version撤销生效；final-checks.log。测试凭据版本只递增，测试完账号正常启用 |
| 网络/空间失败边界 | 适配器单测passed：真实HTTP截断响应和scratch writer ENOSPC均在目标PUT/发布前拒绝；object_failure_test.go。真实节点分区、真实磁盘耗尽未做系统注入，不能写现场通过 |
| 构建与兼容 | Go dev全仓构建、受影响Go测试及vet通过；认证/中间件/handler回归通过，旧SQLite/Linux证据按未受影响范围复用。前端聊天既有45项专项、26项最终web专项、49项认证/请求回归日志可复核；它因额度中断，未由前端本人完成本轮最终回传，研发未修改Vue产品或其专项测试 |

真实浏览器截图：real-list-light-1440.png、real-backup-completed-1440.png、real-pods-zero-login-task-1280.png、real-restore-result-readonly-1440.png、real-resume/abort-{interrupted,completed}-1280.png，均在 `.local-qa/distributed-web/run_20261030_web01/`。首轮浏览器备份脚本把role=status的标题按heading定位导致假失败，已修正断言，最终通过。维护503的全局提示在截图底部有未统一样式的toast，作为前端视觉收尾项登记；功能阻断/登录保护有效，研发不越界改Vue。正常执行者仍存活时的接管阻塞提示已收紧为仅中断/阻塞任务显示。

正式环境基线：本轮prepare.log内初始JSON与baseline-after.json精确一致（配置SHA、Deployment UID/spec、四scope identity/freeze/active/head）；原Pod UID e4cdd2f7-6fdc-4380-a2d5-6606af885842、restartCount=0、imageID仍为原v5.1.0 digest。

共享环境按交接约定继续保留，不能记零残留、不能提前清理：当前业务2/2、console/gateway/Redis就绪，active_tasks=0、control_mode=active；8个独占PG库、8个专用角色、15个登记桶、4个available备份及1个未发布pending备份，另有独立IAM、终态Jobs、测试proxy/file Pod、worker/master候选与私有凭据目录。精确清单见inventory.log及远端本轮归属日志；待前端协调收尾后统一按UID/instance/DB注释/精确桶清单清理，不能复用旧§10清场脚本直接声称本轮清理完成。测试proxy未加减速标记，不影响正常任务；不设置自动备份或定时清理。

本地残留：错误hz参数产生的 `biz/model/biz/` 重复生成目录，自动审批拒绝删除，已保留且未绕过；有效代码引用正确model路径，全仓dev构建通过。此目录与历史前端审批拒绝目录须由有权限的收尾方处理，不隐瞒为零残留。

#### 2026-11-01 最终前端静态同步与非破坏性收尾

本登记更新此前“toast待前端收尾、未最终回传”的历史状态：前端已完成最终实现、32项专项及49项回归并在其PRD §9.3—9.7登记。后端仅接续最终静态同步和非破坏性核对，没有重跑已通过的完整恢复/故障矩阵，没有修改Vue、前端PRD、二进制、业务配置或正式31880，没有推送和发布。

同步前核对namespace UID仍为 `abd9b16b-c7bc-416c-bbe2-18829489b9f1`、instance仍为 `aaa4c049-987c-4751-9559-4b3626369950`，业务2/2、console/gateway各1/1、active_tasks=0、control_mode=active。70个本地JS/CSS与前端清单逐个SHA-256匹配后，将现成 `vue/dist` 打包并上传到本轮私有目录；使用本namespace、固定worker02及同一hostPath的临时文件Pod解包到旁路目录，再保留原目录并切换为 `/lab/web`，没有重启应用或console。未删除任何旧文件或审批拒绝目录。

| 产物/范围 | 实际值与结果 |
| --- | --- |
| 本地上传包 | `.local-qa/distributed-web/run_20261030_web01/web-final-20261101.tar`，SHA-256 `0febcc3524d8444264fb0422ace38cd75d89c1a53d2afc18ffc25e1be1e0f1bd` |
| 最终index.html | 本地、远端 `/lab/web/index.html`、31981真实HTTP响应均为 `8b5adcf417b87b6c3864949b7d74b642e814f349de449fb71f438ffb142f980a` |
| 最终JS/CSS | 70个实际HTTP响应逐个匹配前端artifacts.json；包括index-CsDFbXqz.js、index-C6Aw4oQG.css、MaintenanceTaskPage-QDHyhNLO.js；完整hash以清单及验证日志为准 |
| 保留旧快照 | worker02本轮hostPath内 `web-before-final-20261101/`；旧index SHA-256 `8c1caf55106d2cd1d00fa2cf753415894c7091a93f9d4618cb698c78bd765904`；新旧完整文件hash另保存在同目录的 `web-final-20261101.sha256`、`web-before-final-20261101.sha256` |
| 临时文件Pod | `static-sync-20261101`，UID `03bc1530-a9f9-427d-b400-5d7e8348eac8`，无ServiceAccount token，仅挂载已归属的本轮目录；sleep600秒、activeDeadline900秒；资源保留待统一清理，不声称已删除 |
| 真实浏览器 | Chromium同站点登录通过；备份列表刷新、已有任务 `66472b31-0197-46c3-b754-0959ab0db769` 深链接及刷新通过，页面显示完成，pageerror=0；本轮不创建任务、不改业务、不改密码 |
| 提示验证边界 | 本次没有真实停服，也未重做浏览器503注入；最终提示样式/去重复用前端已登记专项与浏览器内503模拟证据，不能冒充本次真实停服验证。旧真实恢复/停服证据继续以本节上表为准 |
| 同步后状态 | 业务2/2、console/gateway各1/1，active_tasks仍0、mode仍active、epoch仍7；8库/8角色/15桶、4 available及1 pending备份数量未变；正式Pod UID、restartCount=0和原镜像digest均未变 |

证据：`.local-qa/distributed-web/run_20261030_web01/static-final-{preflight,sync,after}.log`、`static-final-browser.log`、`static-final-browser-result.json`、`static-final-list.png`、`static-final-task.png`。浏览器完成记录为2026-11-01 09:59:37北京时间。凭据只从受限文件读取，没有打印。后端本轮收尾完成，无额外联调用途；共享集群、旧静态与私有文件仍按跨端约定保留，待架构确认后统一清理，本次不擅自清场。

## 12. 正式31880接入计划（2026-11-01，仅只读诊断与待执行方案）

### 12.1 交付缺口与现状证据

v5.1.1的代码和隔离网页闭环已经交付，但**正式实例接入没有执行**。镜像升级只替换了业务程序，不能代替控制库初始化、唯一认证权威迁移、Secret挂载与入口路由部署。此前交付应更清楚区分“代码已发布”和“正式网页备份可用”。本节不将接口supported强改为true，不关闭Redis，不换SQLite，不引用31981的业务库或测试账号替代正式数据。

后端本轮只读证据在 `.local-qa/distributed-web/run_20261030_web01/production-readonly.log`、`production-topology.log`；PG查询使用READ ONLY事务，K8s只get，没有执行迁移/DDL/fence/停服/正式配置修改。诊断程序上传到已有测试私有目录，不进入正式Pod或镜像；未输出DSN、密码、用户hash或Secret正文。

| 项目 | 实际核对结果 |
| --- | --- |
| namespace | rainbow-bridge，UID `ea6a71be-a68b-4bf0-98c7-c6155fdda528` |
| 对外入口 | Service rainbow-bridge，UID `17640c71-a7c2-40cc-b805-2239a136a715`，ClusterIP 10.43.112.41，80→8080，NodePort31880；selector app=rainbow-bridge-app |
| 正在服务 | Deployment rainbow-bridge-app，UID `3b7ae5cc-8c73-45f8-a2b6-685ad083de5f`，1副本；Pod rainbow-bridge-app-6b79d9458c-2rr5q |
| 当前镜像内容 | v5.1.1/0e1d962；运行时digest `sha256:412bc877b0f04dcbe860b55e73de83fb02f89dd6f18ac70306e814f2343cbd04`。这是当前节点的已安装镜像digest，实施前核对目标节点架构及manifest；所有新增组件固定同一已验证digest，不能混用测试二进制 |
| 配置 | ConfigMap rainbow-bridge-config的config.yaml，通过subPath挂到/app/config.yaml；SHA-256 `b1c6ea3edcd966004762443af9803310cdc9b9aa8808e58c4a2d4d59bff1271a`；distributed.enabled/web_enabled均false |
| PG | postgres ExternalName→postgres.insights-catalog.svc.cluster.local；16.15；业务库/owner/登录角色均rainbow_bridge，15张public表归该角色。非superuser、无CREATEDB/CREATEROLE/replication、无角色继承，但没有实例归属注释。当前此角色连接仅见rainbow_bridge库；这不代替对其他客户端/定时任务的独占审核 |
| 对象/缓存 | MinIO 10.60.226.47:9000；原始桶rainbow-bridge，快照桶rainbow-bridge-snapshots；Redis仍启用redis:6379。保留这些服务、桶和业务内容 |
| 认证 | 1个用户、1个启用admin；HTTP可信来源http://10.60.226.43:31880，当前显式allow_insecure_remote=true、cookie_secure=false；不重置密码，不引入admin/admin |
| 其他写入者 | legacy rainbow-bridge-api与frontend Deployment各0副本；当前namespace无HPA/CronJob/Job，只有default SA，无维护Role/RoleBinding。必须保持legacy API=0并审核外部GitOps/直写者，不能只靠本次快照宣称永久独占 |

MinIO管理员IAM策略、共享PG管理员可授予权限、PG/MinIO容量、外部写者和独占角色归属还需部署前核对；本次没有用新建桶/写对象/改角色来试权限，也没有读取不相关服务Secret。现有业务连接仅有普通业务权限，**不能拿它创建控制库或当维护身份**。如同名拟建资源已存在，先核对owner/注释/引用，不默认收编或覆盖。

### 12.2 拟建资源与权限清单

保留正式namespace，避免跨namespace改现有业务归属。生成一个全新的生产固定UUID并登记在受限部署归属文件；不得复用测试instance aaa4c049-987c-4751-9559-4b3626369950。UUID须贯穿角色注释、控制记录、Secret、console及Job。下面名称是本实例拟定值，执行前检查冲突。

| 资源 | 新建/调整及边界 |
| --- | --- |
| PG控制库 | 新建rbp_control，owner rbp_operator；原rainbow_bridge业务库及owner不换、不覆盖。控制库撤销PUBLIC CONNECT/TEMP与public schema CREATE；只向列明角色授CONNECT/USAGE |
| 原业务角色 | rainbow_bridge保留原密码与权限；确认独占后加`rainbow-maintenance:<生产UUID>`注释；仅迁移窗口NOLOGIN，结束恢复LOGIN；不得对共享角色执行此步骤 |
| 7个永久新PG角色 | rbp_operator、rbp_guard、rbp_auth_owner、rbp_auth、rbp_console、rbp_worker、rbp_auth_reader；均非superuser/replication；除operator外不得CREATEDB/CREATEROLE，不授无关角色继承 |
| operator | 独占LOGIN，CREATEDB/CREATEROLE、控制库owner；DBA执行`GRANT rainbow_bridge TO rbp_operator WITH ADMIN OPTION`以允许fence/建候选并归属业务角色。此权限可影响PG角色，不能声称普通只读或完全限于一个DB；凭据只挂载executor，不挂console/业务 |
| guard | 控制库仅rb_maintenance_instance SELECT；业务Pod单独连接，不给其作业写权限 |
| auth owner/init | rbp_auth_owner拥有auth_users/auth_sessions/rb_auth_authority和web表结构初始化所需权限；平时NOLOGIN。临时LOGIN凭据只给初始化Job；schema CREATE及rb_maintenance_instance REFERENCES/SELECT用于建表。完成后NOLOGIN并撤销不再需要的CREATE。新表owner按实际初始化身份核对 |
| AUTH | rbp_auth：auth_users SELECT/UPDATE；auth_sessions SELECT/INSERT/UPDATE/DELETE及其sequence USAGE；rb_auth_authority、rb_maintenance_instance、rb_web_task SELECT。禁止维护operation/backup/authority写和schema CREATE |
| CONSOLE | rbp_console：rb_web_task/outbox/preview/backup/event/result SELECT/INSERT/UPDATE，event sequence USAGE；rb_maintenance_instance/operation/backup及rb_auth_authority SELECT；auth_users仅(id,username,role,disabled,credential_version) SELECT，不可读hash |
| WORKER | rbp_worker：rb_web_task SELECT/UPDATE、preview/event SELECT/INSERT、web_backup SELECT/INSERT/UPDATE，event sequence USAGE；控制instance/operation/backup/authority SELECT；没有AUTH会话/密码写权限 |
| AUTH_READER | rbp_auth_reader：auth_users与rb_auth_authority SELECT；executor保留当前账号时使用。由auth owner向operator另授rb_auth_authority SELECT、UPDATE(session_epoch) |
| 临时源读取身份 | rbp_auth_source只CONNECT原业务库、USAGE public、SELECT auth_users；初始化源连接不能用已NOLOGIN的rainbow_bridge。初始化完成即NOLOGIN、撤销读权，凭据不留在常驻Pod |
| MinIO | 新建私有rbp-backups桶，无自动生命周期删除；原两业务桶保留。新建本实例APP和OPERATOR两个IAM用户及独立策略；不重设共享root/旧IAM |
| APP IAM | 对rainbow-bridge、rainbow-bridge-snapshots及本UUID的rb-r-<UUID去横线>-*候选桶：ListBucket/GetBucketLocation及对象Get/Put/Delete和必要multipart权限；禁止建桶、访问备份桶/其他实例桶。APP必须能访问恢复后的候选桶，而非只原两桶 |
| OPERATOR IAM | 原两桶仅列举/读取；rbp-backups读写对象与列举；本UUID候选桶CreateBucket/List/GetLocation及对象读写/失败处理所需multipart权限；不给其他实例桶或IAM管理。无日常自动清理/删旧桶授权需求。实施时以引擎动作清单核对策略并禁止全局s3:*资源通配 |
| Redis | 沿用现有endpoint/DB/凭据，不FLUSH、不新建共享服务。记录现有namespace配置；维护代次与缓存命名按程序工作，不能把测试Redis引用复制过来 |
| Secret | rainbow-bridge-app-config/config.yaml完整业务配置；console-config/console.yaml；web-worker-config/worker.yaml；operator-config/maintenance.yaml；auth-source-read-config/config.yaml；auth-init-credentials的control_dsn/source_role。后两份只供初始化，不挂常驻服务 |
| K8s | maintenance-console与maintenance-executor SA/Role/RoleBinding；maintenance-console/gateway Deployment各1副本及ClusterIP Service；新增business Service选择原app。使用现有console.example.yaml、executor-rbac.example.yaml替换namespace/image/selector，保留资源限制与安全上下文 |

准确数据库GRANT列表以§11.3及 `deploy/kubernetes/maintenance-web/README.md` 为基础，上表是本部署对应角色。RBAC沿用现有模板，无cluster-admin：console Job get/list/create、Pod get；executor Deployment get/list/update、RS get/list、Pod get/list/watch/proxy、Secret get/create/update、Job/CronJob/HPA get/list。可用resourceNames约束的get/update项应拆开限制到明确对象，但Job动态名/list/create不能以label变成权限沙箱；本namespace内console create Job意味着可创建挂载namespace Secret的Pod，必须把这里视为虹桥实例信任边界，不能把IAM/DB管理员凭据留在常驻Secret。初始化凭据用完撤销并在确认无引用后清理。

### 12.3 必需配置与可审阅模板

新增 `deploy/kubernetes/maintenance-web/production-v5.1.1.configs.yaml.example`：包含完整配置的增量片段、console配置与operator配置；明确worker应复制同一固定模板但换WORKER连接、移除AUTH凭据。模板只有占位符，**不是可以直接kubectl apply的Secret文件**。实际Secret在部署主机0700私有目录按角色分别生成，用`kubectl create secret generic NAME --from-file=KEY=PRIVATE_FILE --dry-run=client -o yaml | kubectl apply -f -`写入，不把结果打印/写入Git。数据库密码独立随机生成，不使用默认管理员密码。

应用完整配置从现有配置的受限副本合并，只替换MinIO APP凭据、增加distributed块，保留原业务PG、原始桶、快照桶、Redis、BasePath和现有认证设置。console复制现有cookie名、idle/absolute timeout、trusted_origins，不擅自套用模板中的2h/8h。HTTP31880沿用已显式允许的cookie策略；若改HTTPS必须另行同步来源和cookie，不在本次暗改。

业务Deployment改为完整Secret目录挂载，示意变更如下（需合并进现有spec，不替换其他无关字段）：

```yaml
# rainbow-bridge-app spec.template.spec
containers:
  - name: app
    image: ghcr.io/yi-nology/rainbow_bridge-app@sha256:412bc877b0f04dcbe860b55e73de83fb02f89dd6f18ac70306e814f2343cbd04
    args: [--config, /app-config/config.yaml]
    volumeMounts:
      - {name: config, mountPath: /app-config, readOnly: true}
volumes:
  - name: config
    secret: {secretName: rainbow-bridge-app-config, defaultMode: 0440}
# 保留/设置Pod fsGroup=10001以便非root读0440 Secret；禁止subPath。
```

operator配置中的config_secret_uid必须是新建Secret的实际UID，workloads只允许既有rainbow-bridge-app及其已记录UID；console/gateway/Redis不可进入停服allowlist。原legacy API保持0、不接新Secret、不允许自动启动。production不能填写experimental_artifact_dir/node_name，不挂/lab或测试hostPath。三份组件与执行Job固定同一v5.1.1 digest，Job模板参数不得由网页提供。

新增business ClusterIP Service：selector app=rainbow-bridge-app，port8080→8080；gateway固定参数：`--address :8082 --base-path /rainbow-bridge --console http://maintenance-console:8081 --business http://business:8080`。管理静态/auth/maintenance走console；其他业务走business。**只改正式Service的selector还不够，targetPort必须同时从8080改8082**。Service保留UID/ClusterIP/80/NodePort31880，不能删除重建来“碰巧占回”端口。

### 12.4 分阶段执行顺序与停服窗口（本轮未执行）

1. **授权与前置核对**：核对以上UID、当前配置hash、imageID、DB角色属性、所有写者、GitOps/HPA/外部脚本；记录原Service完整spec、Deployment/ConfigMap受限副本、admin完整hash字段的受限校验摘要、业务scope/release元数据与对象清单。确认生产UUID/拟建名称无冲突、原两桶可读、PG/MinIO备份与候选可用空间、Service路由无其他公开旧管理入口。新源读取角色/DBA/MinIO管理身份的实际权限不足则停止，不能临时改用应用凭据冒充。
2. **停服前准备**：DBA按§12.2创建新控制库/专用角色和归属，不动原业务表/owner/password；新建备份桶和两套IAM策略/用户；私下生成配置、Secrets与RBAC/业务Service/console-gateway模板，核对UID与digest。构建产物已存在，不在停服窗口等待CI。console/gateway可预建但未初始化前保持0或未对外，不启动默认账号。使用服务端dry-run核对API/准入/RBAC与Secret读取权限；这不替代实际连接检查。
3. **进入唯一停服窗口**：暂停外部写者/调谐器，停止接收新业务请求；对原业务Deployment缩0并等待实际容器退出、所有业务连接清零。无其他写者证明之前不fence。临时设置原独占业务角色NOLOGIN，记录原LOGIN状态；不能杀未知共享连接或把失联Pod当退出。原31880此时允许暂不可用，不能宣传首次接入无停机。
4. **保全现有数据**：用独立备份身份执行PG16工具的一致逻辑备份（包含业务/auth/sequence/schema及必要角色定义），并复制原始/快照桶的对象、版本与校验清单到本次受限回退存储；写者已停才构成一致副本。备份文件0700目录/0600权限，不使用新系统的网页备份冒充首次接入保险。校验备份可读、大小/hash与对象清单后再继续；原库原桶仍保留不覆盖。
5. **控制bootstrap**：用已生成最终业务配置计算初始identity：instance新UUID、generation/session_generation=1。专用初始化Job运行 `/app/maintenance-backup --config /operator/maintenance.yaml --action bootstrap --app-config /app-config/config.yaml --confirm <生产UUID>`，operator连接控制库，app-config挂载新Secret；bootstrap只建控制结构/实例，不执行备份或恢复。记录Job UID/状态；重复初始化报已存在时先核对记录，禁止删表重来。再授guard与auth owner所需权限。
6. **一次性认证迁移**：以独立临时源只读角色连接原业务库，以临时auth owner连接控制库；用auth-init.example.yaml固定镜像、设置RB_AUTH_SOURCE_ROLE=rainbow_bridge、RB_AUTH_INIT_DSN为初始化身份的控制库连接，执行`maintenance-console --initialize`。代码要求原角色NOLOGIN、无连接、归属注释匹配；原全部账号ID/密码hash/role/disabled/credential_version及时间字段逐项复制核对，控制authority/schema标记完成，清会话并建web表。已有不一致控制账号必须拒绝，不能覆盖。随后完成运行角色GRANT，撤销临时登录/源读权；不把临时DSN留在console。
7. **应用与控制服务启动**：业务Deployment在副本0时合并新Secret挂载和固定image，恢复原业务角色LOGIN，业务恢复**原1副本**；不借接入扩为双副本。控制guard、独立AUTH权限、原业务连接与新authority必须全部成功；核对每Pod /ping控制identity/epoch与control-v1。启动console/gateway各1并等待Ready。原Service切换前用私有port-forward访问gateway做登录和只读核对（可信Origin仍保持31880，可设置浏览器本地映射或由HTTP客户端明确原Origin，不新增对外测试端口）。若失败，按12.5处理，不带病切入口。
8. **保留原URL切路由**：在校验Service UID与旧selector/targetPort后，以一个JSON Patch同时test并replace：selector→app=maintenance-gateway，ports[0].targetPort→8082。port80、NodePort31880、ClusterIP和Service UID保持不变。执行前确认ports[0]仍是原80/31880单端口，不机械依赖数组索引。业务后端Service绝不能指回gateway导致循环。
9. **结束窗口**：31880浏览器以原管理员当前密码登录，能力接口mode=maintenance_web、supported/ready=true，列表可刷新；业务runtime/active/fixed/对象只读检查与接入前快照相符，admin数量和hash未变，所有旧会话拒绝，控制Job创建权限通过SelfSubjectAccessReview。允许一次只读plan Job核对PG16、IAM、allowlist与归属，需用户执行授权包含此部署核对；不在正式环境擅自启动backup/restore、删源数据、改密或注入故障。确认无queued/running操作、mode=active后开放普通业务写，记录实际停服起止。

停服预算建议预留30分钟作为人工接入窗口，**不是已测耗时承诺**：账号迁移数据很少，但首次一致副本耗时取决于正式库和两个桶容量，本轮没有实测；容量盘点后在执行单登记具体预算。超预算不跳校验，按当前检查点保留停服或受控回退。后续每次全量备份/恢复同样会暂停业务，console/gateway保持可用；不能把本次接入与日常备份都说成无停服。

### 12.5 回退决策与数据/认证保护

- **authority提交前失败**：保持外部写者暂停，确认所有初始化Job终态与控制未生效；原库账号仍唯一。恢复原业务LOGIN、原Deployment挂载/spec及原Service selector/targetPort，清原会话使重新登录，再开放原业务；新控制资源只隔离留存，不自动删库删桶。若authority提交状态不明，按已提交处理，不能猜未提交。
- **authority已提交但业务未开放新写**：优先修复独立控制配置后继续接入；若必须恢复旧部署，停止console、业务及所有AUTH写入/Job，核对无活动作业、mode=active、业务连接仍为原DB/桶，才可由专用部署身份把**控制库当前**auth_users逐列单向导回原业务auth_users（含ID/hash/role/disabled/version/时间），设置sequence到有效上界、清两边auth_sessions并撤销rb_web_result、递增控制session_epoch，核对全字段摘要后统一恢复旧认证与旧路由。需要此回退时生成独立受审阅事务脚本，不拿旧备份hash覆盖可能更新的控制账号；无法核对则保持停服，不能直接kubectl rollout undo。
- **已开放新写后失败**：不得恢复接入前全库备份或直接切旧候选，否则丢新数据。gateway自身故障且业务/控制身份均健康、mode=active且无活动任务时，可把入口临时路由回**当前新模式业务Pod**（保留AUTH连接），这只恢复业务与登录，网页维护暂不可用；如果维护中不能绕gateway直接开放业务。认证或业务异常另开受控修复窗口，按当前状态处置，不能以镜像降级替代数据回退。
- Service路由原值为selector app=rainbow-bridge-app、targetPort8080；回退前先test实际UID/当前selector=maintenance-gateway/targetPort8082，保持Service本体不重建。任何已有backup/restore运行时禁止按此接入回退单直接缩console或改业务配置，须先走持久操作的status/resume/abort规则。
- 新建角色/库/桶与旧资源的最终清理由实际归属记录、当前引用和用户指示决定；本轮未创建这些正式资源，也未清理31981。不得用通配符、DROP原库、删除原两桶或FLUSH Redis来回退。

### 12.6 执行前仍须确认及本轮结论

当前代码适配的PG16.15已匹配；普通业务角色也不是超级用户，具备收紧为独占角色的基础。**尚未证实/执行**：DBA/MinIO管理身份授权、桶容量与完整一致副本、无外部直写者、正式UUID及名称无冲突、MinIO新策略运行核对、初始化与新路由后的实际Ready；故不能把此方案登记成“正式已部署/网页已可备份”。所有正式创建/授权/停服/迁移/入口修改均等待用户明确正式接入指令，当前只完成只读诊断和可审阅方案。后端不推送、不发新tag、不改业务代码、不重跑功能矩阵。

## 13. 同Pod辅助容器＋临时Job兼容模式（2026-11-01选定）

### 13.1 授权、终点与资源边界

用户明确允许“加辅助容器，执行备份时临时启动一个任务容器”，选定原评估A路线。目标是现有虹桥Deployment/Service/URL即可让admin网页备份恢复，不再要求独立console/gateway常驻Deployment或新增外部端口。每个业务Pod增加一个管理辅助容器，维护操作用单次Job，原业务容器改由守护入口运行。单容器完全内置路线B不实施；§12独立服务正式接入方案不执行。

使用现有PG/MinIO/Redis服务，仍按§11需要独立控制/认证逻辑存储、最小角色、备份桶/候选对象副本和必要Secret/RBAC，不另外安装中间件。它们属于完整性和持久状态资源，不能放入被恢复覆盖的业务表或复用原图引用代替副本。权限不足列出具体缺项，不自动扩大到共享超级身份。新模式需实现并验证，不给v5.1.1默默加开关绕过现有拒绝。

原有虹桥研发负责后端/生命周期/模板及隔离验证；虹桥前端只配合原v1接口交互/提示与验收。本轮允许候选构建、独占双Pod测试、必要测试逻辑资源；不推送/新tag/发布镜像，不直接对正式31880执行停服、认证迁移或镜像更新。先给可审阅的同Pod正式接入patch与数据保全/回退步骤，再处理实际接入；用户允许辅助容器不能被解释成允许删原数据或借用测试数据库替代原业务。

### 13.2 选定运行拓扑

| 组件 | 位置与职责 |
| --- | --- |
| business-host守护入口 | 原业务容器PID1，管理固定业务子进程的启动/排空/停止/检查启动；本身在维护窗口存活，不是shell后台并发启动脚本 |
| 管理辅助容器 | 同一个Pod，组合复用console及gateway（优先同一入口管理两个listener），提供原Service targetPort8080的网页/认证/维护API与同Pod业务反代；不新建控制Service |
| 业务子进程 | 固定/app/server等候选内可信命令，监听另一个本地端口（建议127.0.0.1:18080）；客户端不能绕过入口直接管理候选/旧代 |
| 临时维护Job | 原有固定digest/模板/单次Never/backoff0执行器，独立于被暂停业务进程；持久请求/outbox、K8s owner终态证明不变，不改成Web请求goroutine |

现有Service selector、port、NodePort和BasePath保持；targetPort8080由辅助容器承接，业务端口仅内部使用，禁止端口冲突或反代回原Service造成循环。两个容器不启用privileged/shareProcessNamespace/hostPID/hostNetwork，不以sidecar跨容器kill PID实现停服。

守护入口与辅助容器通过专属emptyDir的Unix socket通信，固定生命周期命令，不提供任意shell/文件读写。emptyDir仅放IPC/可重建缓存，正式状态、退出证据和目标generation在控制库持久保存。Job到每Pod的生命周期通道由后端选定受认证的内部端口或K8s认证代理，必须验证instance/Pod UID/当前operation/token/批准目标指纹，外部8080明确拒绝内部控制路由；不能只靠端口隐藏或能猜到的Pod IP/operation UUID。

K8s ServiceAccount属于Pod级，不是容器级：业务容器不自动挂载Job编排token/engine凭据，使用显式投射挂载仅给辅助容器所需身份；Job单独SA，维护角色/对象运维密钥只给执行器。辅助容器只读或任务受理权限沿用§11；恢复执行须原独占角色fence权限。同Pod是同一信任域，不宣称sidecar等同独立服务故障/安全隔离。

### 13.3 引擎适配和停写证明

为现有维护引擎抽出小的workload lifecycle适配，显式选择旧deployment_stop或新pod_sidecar；选择值属于部署端固定配置，不允许浏览器参数覆盖。保持数据流/对象验证/候选/控制锁逻辑，禁止处处散落if sidecar或整套复制Run/Stop/Switch。业务初始化与host能力协商增加版本，旧Pod未接协议时plan拒绝，不能混合缩0/停子进程。

1. 持久登记operation、mode=draining和成员集合（Deployment UID、Pod UID、容器启动身份、host boot UUID、业务run UUID、generation）。冻结新业务启动许可，所有在途写入口/上传/后台任务纳入排空。现阶段仍拒绝未纳入协议的HPA/GitOps/Job/直写者，不扩成通用伸缩管理。
2. Job逐Pod要求host排空并正常停止业务子进程。host必须实际wait进程退出，校验inflight为0、无遗留写者/上传任务，记录绑定本次operation/token及run UUID的证据到控制库后才确认。HTTP503、一个活跃计数0、PG事务0或心跳过期均不能单独当作停止证明；host/业务超时或SIGKILL/未知退出保持维护，不跳过。
3. 对全部已登记成员核对证据，重读K8s成员列表处理新增/重启；新Pod的host在业务DB打开、迁移/seed前读取控制状态，不因自己刚启动就放行业务。未知旧run不能因Pod消失/重新Ready被忽略。再执行独占应用角色NOLOGIN、排空源/候选连接和在途维护SQL；确认之前不导出一致包/不切换。
4. 不改变Deployment replicas，不删除业务Pod，不触发模板generation注解rollout，不使辅助容器因业务暂停而退出。多Pod管理HTTP均从控制库读作业/认证，任一请求可落到任一辅助容器，不依赖sticky session。

Job的旧executor存活/终态检查和接续仍复用既有K8s证明；**业务run退出证据则新实现**，不能冒充整Pod终态。sidecar重启时host仍保持停止；host重启/Pod替换时控制状态默认阻止业务启动。旧run无法证明退出时允许网页查看明确阻塞，禁止自动解除维护或破坏性接管。新协议按Pod/run/operation精确归属且持久，不把旧任务的exit0复用为本轮证明。

### 13.4 候选切换、配置和探针

候选新库/新桶、当前admin权威、编号/epoch、对象完整性校验与原资源保留沿用。批准目标配置/指纹先持久，再更新受控配置Secret及host目标；Secret整目录挂载、不用subPath，不rollout整个Pod应用新配置。host等待**实际文件内容SHA匹配**后启动固定业务子进程，不能固定sleep假定Secret已刷新。也可由受认证控制通道提供已签定配置的安全引用，但不得把DSN传浏览器或无凭据写配置。

辅助容器自身控制/认证配置独立于业务目标，不因业务配置换代被重启或误连候选业务库。候选业务启动为checking，拒绝普通业务写；辅助容器继续提供管理/静态/登录，内部检查真实子进程identity/generation、runtime/ZIP和全部成员就绪后才最终提交/open writes。中断后按持久阶段/实际hash/业务run对账，不重建当前计划。

探针必须区分管理入口与业务可用性：两个容器的K8s liveness/readiness检测各自管理循环/IPC/入口能服务，不以有意暂停的业务child为失败；避免所有Pod从Service端点移除或业务child被自动拉起。管理健康成功不代表business_available=true，运行时业务路径暂停时仍明确503，无成功空数据。控制DB不可用时页面可达并报真实错误、业务写fail closed。整个Pod/节点不可用不承诺网页零中断，幸存Pod或重启后仍依据控制状态提供接续。

abort在开放写前可恢复原配置并重启原业务child，generation不倒退，原库/桶不覆盖；最终开放写后拒绝自动退库。host自动崩溃重启业务仅允许控制active且当前批准generation，不与Job的draining/checking打架。修改配置/控制结果丢失等边界沿用先记意图、再副作用、再核对的规则。

### 13.5 兼容、打包与实施顺序

网页维持maintenance_web/v1及§11.5接口。新配置允许明确execution_mode=pod_sidecar（最终字段位置按现有config职责），默认旧模式，不把supported改true掩盖缺host/sidecar。capabilities只有全部运行条件确认后ready=true，缺协议/权限/成员证明用安全reason说明；前端无需用户理解sidecar/Job。保留SQLite和独立服务部署兼容。

新增host/管理组合入口及同版构建产物、镜像/发行包脚本、同PodDeployment patch/Job/RBAC/Secret/探针模板；需要新构建，不修改已发布v5.1.1标签或digest。优先复用console初始化/HTTP注册库与gateway，不在同进程启动两个冲突的handler单例/全局SetService；若复用现有单例会串服务，应先在手写代码中明确隔离。遵守生成代码边界及engineering-quality-preserving-refactor，生命周期适配、host、IPC/认证、配置对账、HTTP视图各按职责拆分。

实施依赖：host与内部协议→同Pod静态/登录＋临时Job空维护闭环→停写证明/候选启动适配→备份恢复/中断与回退→前端同合同检查与实际浏览器→同Pod正式接入patch和数据保全/回退交付。正常步骤自主连续进行，不额外审批每次构建；权限/安全关键偏差提供最小证据升级，不能偷偷换回独立常驻服务。

### 13.6 最小验收和收尾

专属新实验namespace、两业务Pod**每Pod仅原业务容器＋一个辅助容器**、一个原Service/入口；复用远程PG/MinIO/Redis服务的独占逻辑资源。不得把旧rb-web环境独立console/gateway继续顶在前面伪装新模式通过；旧测试资源/未完成清理另外登记，禁止挪用正式库/桶。

必须实际证明：普通业务正常→网页备份/恢复时replicas始终2、Pod UID保持、业务child退出而helper仍存活、临时Job存在→两个Pod随机分流的同一URL刷新/新浏览器登录/状态查询持续正常→候选检查/最终恢复与原数据/资源/active/fixed/编号/缓存/账号核对。HTTP202、Pod Ready、进度100%均不能代替数据与业务恢复证据。

历史故障测试候选（已按2026-11-01用户最新要求取消必测，不继续扩展）：长上传/停止超时、sidecar重启、新Pod维护态加入、host/run异常退出、Job杀进程接续/abort、Secret延迟、多helper并发等组合。相关保护仍是实现合同，但不默认以新增复杂试验作为本轮交付条件；已有结果可保留，未测如实记录。基础验收保留同Pod正常备份恢复、管理可达、当前账号/数据核对和直接受影响检查。

完成后同PRD追加代码/协议/实际镜像与命令/资源规模/耗时、所有Pod/run证明与最终hash、浏览器记录、旧模式受影响回归、失败/未测与精确清理。前端只补契约有变化/受影响路径；后端维护共享实验窗口与归属，确认结束后统一清理，保留被审批拒绝的已登记残留，不绕过。不更改正式31880或发布新版本直到有具体可审阅交付和用户接入指令。

派发状态：2026-11-01已通过send_message_to_thread续派给原虹桥研发（local / 01a1333a-342c-7903-8ca8-164b82392399），工具确认送达；无该新模式交付/验证结果。

### 13.7 同Pod实施与共享交接登记（2026-11-01，进行中）

本模式尚未交付验收，下面仅登记已实施和真实进度。新增 `pkg/businesshost`、`cmd/business-host`，固定server child＋UDS/HMAC内部命令；`cmd/maintenance-helper`组合复用抽出的 `pkg/maintenanceconsole` 与gateway。新增生命周期adapter显式选择deployment_stop/pod_sidecar，默认沿用旧模式；持久run在exec前登记，wait后的exit0与operation/token绑定；未知旧run保持阻塞。Job使用自己的SA，经K8s pods/proxy和HMAC到各Pod19090，再由辅助容器转UDS；对外8080拒绝内部路由。密钥只读Secret显式挂载，业务host没有K8s token，helper的投射token只挂helper；运行配置内容SHA匹配且control checking批准后才启动loopback18080 child，不scale0/rollout整个Pod切业务代次。内部协议版本pod-sidecar-v1；公开maintenance_web/v1保持。持久表、最小HOST角色/RLS及初始化正在真实验证，不能把代码编译通过当最终安全证明。

独占新环境已建立：namespace `rb-sidecar-20261101-01`，UID `f24a9bae-cb83-4373-9047-7fba2c1eaf8a`，instance `7e09a8ec-e2e1-43bb-9bbf-074aac5e7bfb`，单入口 `http://10.60.226.43:31982/rainbow-bridge/`。只有lab-app一个业务Deployment，2副本，每Pod business＋management两个容器；rainbow-bridge一个NodePort Service。没有创建独立console/gateway Deployment或Service，没有新建Redis中间件；复用远程PG16、MinIO和现有Redis服务的独占库/角色/桶及实例缓存前缀。初始化夹具曾运行单容器业务Pod建独占schema/账号，认证迁移后已替换为同Pod拓扑；这不是用旧独立服务伪装最终模式。

当前为固定旧基础镜像digest `55301c0c…1448b88`＋本轮ARM64候选程序的只读hostPath挂载，非发布镜像。候选根目录：`.local-qa/distributed-sidecar/run_20261101_sidecar01/`、远端0700 `/var/tmp/rb-maint-run_20261101_sidecar01`；归属state在任何资源创建前私下登记。准备日志prepare.log记录初始正式基线、资源归属、13配置/10PNG/3版本夹具及最终2/2拓扑。新增打包程序与模板仍在本地未提交，无新tag，无正式部署。后续必须补真实空维护/backup/restore、故障及浏览器证据后才能宣布ready；前端暂不依此进行破坏性操作，共享资源先保留。

### 13.8 基础交付登记（按用户最新要求收紧验证范围）

用户最新明确“不做过多测试、验证，只做最基础的情况”。本轮以代码构建、基本备份恢复及已有网页操作证据收口，不再扩展§13.6的完整危险边界矩阵，不能把未执行项写成通过。当前代码未提交/推送，未改v5.1.1标签或镜像，也没有正式停服/认证迁移。§12独立Deployment/Service路线不执行。

已完成代码：`pkg/businesshost`（固定子进程、UDS/HMAC、实际Wait退出证明、控制状态与配置SHA校验、持久run/RLS），`cmd/business-host`，`cmd/maintenance-helper`；console注册复用到`pkg/maintenanceconsole`，单进程只注册一次handler，保留原独立console命令兼容；引擎`lifecycle.go`统一Stop/Start，显式deployment_stop与pod_sidecar模式，旧默认不变。新模式不scale/rollout业务Pod应用配置，使用受认证内部通道检查runtime/ZIP；固定Job仅增加host-auth引用。新增两个程序的发行包与镜像构建入口已补齐，尚未发版。

| 基础验证 | 实际结果与证据（均为本次独占同Pod环境） |
| --- | --- |
| 编译/受影响检查 | `go build ./...`通过；businesshost、maintenance、maintenanceweb、gateway等受影响测试及新增包vet已通过；git diff --check通过。没有重跑全仓E2E或全部故障矩阵 |
| HTTP备份 | backup.log：plan Job→backup Job成功，同request重放返回同task；备份7fd038d3-5204-4b7c-a17b-f51dee19a68d。子进程实际exit0后才继续，两个业务Pod保持 |
| HTTP恢复与业务结果 | restore-retry.log：先改独占源配置/密码/版本、预热两Pod缓存并删两个独占对象，再新库新桶恢复成功；两个child停止且两个Pod仍存活时，fresh登录、maintenance scope、task及SPA深链接可用，业务POST503不清管理认证；旧普通会话401、结果Cookie仅任务200/列表401、当前密码可重登；两Pod active/fixed大整数、旧新ZIP CRC、编辑区12项、缓存对照键及自动v5通过 |
| Pod身份保持 | 正常备份/恢复前后两Pod UID保持48678218-a3a9-4b21-9e13-9137ebd091d4、7c3caaed-8273-4645-8c41-d88e7235ca7f；没有通过缩0冒充同Pod模式 |
| 真实浏览器 | browser-backup.log/result：登录→列表→核对方案→确认创建→完成→刷新通过；browser-resume/abort.log/result：对真实中断任务点击继续/取消恢复原服务、确认、完成及刷新通过。完整恢复数据检查来自上述真实HTTP链，本轮未声称新增了完整浏览器恢复交互矩阵 |
| 中断后接续 | fenced前日志提交断点杀executor，操作持久保持draining，网页resume完成；配置已切换断点杀executor，网页abort恢复原服务完成。分别见prepare-restart.log/browser-resume.log、prepare-abort.log/browser-abort.log；不是把强杀业务child当正常退出 |
| 已做的重启/新成员观察 | restart.log：业务已经停稳后重启host/helper，host新boot保持idle、不自动拉业务，管理继续提供任务；join.log：维护态新增第3个测试Pod保持idle无business run，再恢复2副本。该人为测试扩缩与维护引擎正常执行不改replicas须区分；不是生产操作，也不代表已覆盖所有分区/重启情况 |
| 最终正常状态 | final-basic.log：仅lab-app Deployment、2副本/每Pod两容器，单Service31982；active_tasks=0、mode=active、epoch=4；2 available备份、0 pending；5独占PG库、9角色、9桶。当前保留给双方检查，不宣称清理完成 |
| 正式保护 | 正式Deployment UID仍3b7ae5cc-8c73-45f8-a2b6-685ad083de5f/1副本/v5.1.1，Service UID仍17640c71-a7c2-40cc-b805-2239a136a715，原selector、31880和targetPort8080均未改变；本轮未对正式库桶/账号写入 |

真实验证期间发现并修正/记录：Job通过pods/proxy发送POST生命周期请求还需create动词，已拆分为pods get/list/watch及pods/proxy get/create，未扩大为pods create。首次plan因缺此权限失败，补权限后成功；失败Job保留供核对。master与worker时钟相差约44秒，内部HMAC限30秒不放宽，执行Job与业务host同worker时间正常；master诊断专用脚本只按已测偏差签名，不能把它当正式时间同步。首轮源变更脚本漏带共享Redis密码导致中途退出，随后仅在独占控制账号执行受控重置、更新私有凭据并续做夹具；恢复验证使用修正后证据，不把首轮失败当通过。新run全实例查询改为显式授权的可信函数，防止RLS空结果误判为全部已停。

测试入口仍为 `http://10.60.226.43:31982/rainbow-bridge/`；受限访问文件 `.local-qa/distributed-sidecar/run_20261101_sidecar01/frontend-access.private.json`，不打印密码。候选文件实测SHA：server `4b1b0b3d850a9c9218128d4d7d08326946051be671ce6d76fae584979523e352`；business-host `77df1d66c84b256b55932b621b1b082caff9f6be344ba1d0e0dc76b9289738e4`；maintenance-helper `be436f05a779d7872b0e8f6ea9df72cec0dadd2e0868d1b3daa192d41a2b9b33`；maintenance-backup `48375f1275f5c61292cb9d9740ee4770a96cc0b35a6eeac361a919e5b024fcbb`。这些是final-basic.log中隔离环境文件hash；此后本地补充健康命令、run运行观察更新及客户端方法整理通过构建，未为这些非主链补充重新部署/重跑整套验证，不混称现场二进制与最终源码完全同hash。

正式接入交付：`deploy/kubernetes/maintenance-web/pod-sidecar.example.yaml`（保留原Deployment/Service/URL的可审阅patch）、`pod-sidecar.md`（新配置/权限/内部通道/保全和回退说明）。首次接入仍须受控停服及当前账号迁移；数据一致副本、原密码保留、唯一认证、旧会话撤销沿用§12，路由步骤改为同Pod8080承接，**不创建独立console/gateway Deployment或Service，不改正式Service**。要真正使用这两个新入口需将来同版候选镜像，不能用现v5.1.1直接套patch。模板未在正式应用。

**未测且本轮不再追加**：真实长上传/业务停止超时、活跃child未知退出/host故障后的完整阻塞矩阵、Secret人为延迟注入、跨节点分区、同request多helper并发压力，以及§13.6其余组合。已有Secret正常传播等待和恢复不等于延迟故障注入；历史独立模式测试不冒充新模式通过。基础交付可审阅，不能声称§13全部故障验收完成或可直接无窗口上线。共享新旧环境、终态Job及测试私有文件暂保留，原已被自动审批拒绝的重复生成目录不清除、不绕过；统一清场需后续协调。

### 13.9 v5.1.2发布与正式同Pod接入（2026-11-01，已执行）

用户明确授权“推送代码。打包5.1.2镜像。在k8s部署新的服务”，本节更新此前尚未推送/未正式部署状态。功能代码已提交 `dd62e2dd5583c94505a7568eee7e430bdb8c9846` 并推送上游main；附注tag v5.1.2指向该提交，没有移动旧tag。Release流水线 `https://github.com/yi-nology/rainbow_bridge/actions/runs/41288978357` 全部成功，五平台应用包、前端包、说明及校验和已发布。镜像 `ghcr.io/yi-nology/rainbow_bridge-app:v5.1.2` 的OCI index digest为 `sha256:5dead4d48b2a8081df2331ce7b363dd9f7f6f5a2fdbf4462edc582f552bc3b24`，含linux/amd64、linux/arm64；正式两个容器及固定任务模板均使用此digest，不使用/lab候选或测试hostPath。

正式接入结果：保留namespace rainbow-bridge、Deployment rainbow-bridge-app UID `3b7ae5cc-8c73-45f8-a2b6-685ad083de5f`、原副本数1；新Pod UID `7655d596-34d3-4d2f-8894-bd4e91bba677`，app运行business-host、management运行maintenance-helper，两个容器Ready且restartCount均0。Service rainbow-bridge UID `17640c71-a7c2-40cc-b805-2239a136a715`、selector app=rainbow-bridge-app、targetPort8080、NodePort31880保持，没有新增独立console/gateway Deployment或Service。访问地址仍为 `http://10.60.226.43:31880/rainbow-bridge/`。

正式新instance `4f9bbe43-1633-4908-b951-8e350c04b405`；使用现有PG16/MinIO/Redis服务，新增专用控制库rbp512_control、9个角色（operator/guard/auth_owner/auth/console/worker/auth_reader/host/auth_source），以及rbp512-backups与rbp512-preserve两个私有桶和两套独立IAM。原rainbow_bridge库、rainbow-bridge原始桶、rainbow-bridge-snapshots快照桶保留。业务角色在确认连接清零后临时NOLOGIN，初始化结束已恢复LOGIN；auth_owner和auth_source临时角色已NOLOGIN。inspect日志中的fenced=true表示本轮曾完成fence的检查点，不代表当前角色仍禁止登录；当前mode=active、active_tasks=0。

先完成镜像拉取及所需程序存在性检查，再停原业务并保全一致副本：PG16 custom dump及schema、5项对象/版本（382831字节）复制到独占保全桶并回读SHA核对；没有覆盖原库桶。现有账号经显式maintenance-auth-init-v512单次Job迁入控制权威，完整账号属性、密码hash及时间字段与停服前指纹一致，没有重置密码。业务数据表与一致副本核对：除environment/pipeline的updated_at外内容一致；这两表与dump逐字段对照，39条environment、61条pipeline仅updated_at被既有启动迁移更新，身份/内容无变化，不宣称整库字节完全未变。该历史迁移行为没有在本次发版临时扩修。

基础验收仅做：镜像与组件启动、实际管理员登录、备份页展示、maintenance_web/v1 supported/ready=true、只读备份plan Job成功、方案页显示后离开未确认、最终无活动任务。plan task `a2fd461e-aa88-4ea0-9f42-fb85da7b1327`。真实浏览器截图production-backups.png、production-backup-plan.png与browser-result.json在 `.local-qa/deploy-v5.1.2/`。空列表按钮实际文案为“创建第一份备份”，方案为任务页内确认区，没有取消按钮；脚本修正为离开方案页，不点击确认，不将首轮定位错误当功能失败。**本次未在正式触发全量backup/restore、改业务内容或做故障测试**；新模式备份/恢复主链沿用§13.8隔离证据。

部署辅助程序曾在master使用集群内短DNS连接控制库失败，已修正为部署主机可达的PG Service IP后从已保全检查点继续；没有重建或覆盖业务库。账号初始化、应用启动与后续基础核对均成功。正式部署记录的stage=complete，原入口已提供新功能。

配置和回退材料仅在远端0700 `/root/rainbow-backups/deploy-v512-20261101`，文件0600；包含原Deployment/Service/ConfigMap、原配置、一致dump/对象清单、角色归属、实际patch、部署检查点和受控回退辅助程序。含凭据的配置/完整错误详情不入Git、不打印。后端部署证据本地 `.local-qa/deploy-v5.1.2/{provision,iam,configure,cutover,continue,finish,browser-plan,final}.log`；正式只读plan的终态Job保留供核对，初始化Job/Secret引用与旧实验资源未盲删，不声称零残留。

恢复旧部署须停全部相关进程，使用控制库当前账号单向导回并撤销会话、核对Service/Deployment归属后恢复原spec；不能直接rollout undo复活旧密码。已开放新写后不恢复接入前整库副本覆盖新数据。此次没有执行回退，原数据保全材料继续保留。按用户长期要求不再追加复杂故障矩阵。
