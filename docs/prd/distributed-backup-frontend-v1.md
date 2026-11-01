# 分布式维护备份：网页操作与状态交互 PRD

> **最新验收约定（2026-11-01）**：用户要求后续设计不再追加复杂故障测试。当前前端配合只核对基本网页主流程、必要构建及直接受影响的基础检查；不为补齐旧复杂故障/压力/灾备矩阵派发或拖延交付。旧未测如实登记，不虚称通过；实际已知功能问题仍处理。后端PRD首部同约定为共同依据。

> 最新部署约束（2026-11-01）：用户已选定“现有Pod加辅助容器＋临时Job”，不添加独立console/gateway Deployment/Service。后端依据distributed-maintenance-backup-v1.md §13实现兼容模式，前端仍沿用§8的maintenance_web/v1交互，配合范围见§10。旧独立部署通过证据不等于新模式已验收，正式入口尚未改动。

日期：2026-10-30，收尾登记更新于2026-11-01。状态：§8 maintenance_web前端实现与本地验证已完成，交付见§9.3—9.7；**当前续作以§10同Pod方案为准，契约检查已完成，真实同Pod联调等待后端§13环境就绪登记**。仓库：D:/kylin/rainbow_bridge。

> 用户已纠正交付目标：admin应通过网页完成备份、恢复与正常异常接续。§1—6的“本批不提供网页执行、仅说明CLI”不再是新模式交付终点；§7历史代码/验证/清理事实保留。旧maintenance_cli_only的兼容分支仍有效，新maintenance_web必须提供完整交互。共同接口合同在后端PRD §11.5。

## 1. 目标与现状

用户要求在后端手动维护备份完成核心验证后，规划并派发前端适配。后端依据为docs/prd/distributed-maintenance-backup-v1.md §10.3—10.4及docs/operations/distributed-maintenance-backup.md：已验证核心双Pod备份、候选恢复、部分中断接续与切换前回退，仍有未测故障项；正式环境未部署本批代码，实验环境已清理。不能写成全部验收通过或当前远程实例已启用。

本批只接现有HTTP契约：网页正确区分“网页本地备份”“由运维执行的维护备份”“网页能力不可用”，维护/连接中断与恢复后的会话失效提示正确。分布式CLI没有HTTP执行、索引、作业查询/进度接口，不新增网页开始/恢复/回退按钮，不调用shell、SSH、K8s或MinIO，不模拟任务进度，不添加定时/增量入口。

实际入口：vue/src/views/BackupsPage.vue、components/backup/presentation.ts、composables/useBackups.ts、composables/backupPersistence.ts、lib/api/{backup,http}.ts、stores/auth.ts及既有会话生命周期。现页面无视mode，supported=false时显示“当前部署暂不支持整实例备份”、第一版SQLite/关闭Redis要求，还显示不可用表单和SQLite保留数量说明；reason缺snapshot_storage_not_local，未知项裸露内部key。共享HTTP错误解析只读error/msg，不识别新维护响应的message字段。

## 2. 能力合同与显示分支

GET /api/v1/backup/capabilities沿用现有认证、BasePath及信封，不添加新后端字段。当前类型已有supported/reasons/limits/restore_requires_restart/mode/rollback_retention。

| 服务响应 | 页面行为与文案方向 |
| --- | --- |
| mode=maintenance_cli_only（当前supported=false） | 标识“运维维护备份”，主说明“由部署人员执行备份与恢复”；说明“操作期间全部应用停服，网页不提供执行入口。恢复到新数据库和新资源区，校验后切换；当前账号密码保留，旧会话失效。”不声称当前有备份/作业或正在维护 |
| mode=business_full且supported=true；兼容旧响应缺mode且supported=true | 保留现有SQLite网页备份、下载、上传预览、确认恢复、取消、删除和原请求幂等流程。原有任务阶段、重启和回退保留策略只在该模式显示 |
| mode=business_full或缺mode，supported=false | 标题改为“当前部署未开放网页备份与恢复”，用自然语言解释当前网页模式条件。可写“网页备份适用于 SQLite、本地资源和本地发布快照、Redis 关闭的单实例部署。其他部署请联系部署人员核对维护备份方案。”不能仅据PG/MinIO的reason判定CLI已配置可用 |
| 非空未知mode（含supported=true矛盾响应） | 显示“当前备份模式尚不能在网页操作，请联系部署人员核对”，不开放操作。maintenance_cli_only即便supported误为true也不得调用本地备份接口 |
| 首次加载/能力请求失败/刷新结果未确认 | 分别显示正在确认或服务暂不可用，不能当成“不支持”；能力尚未重新确认时不允许使用过期能力提交/下载，保留上次结果可标“上次确认”，不得伪造当前状态 |

CLI分支不渲染BackupList、RestorePanel、本地BackupJobs、恢复对话框、本地包大小/数量限制、“需部署人员重启”或“自动保留最近N次”说明。隐藏无作用内容，保留刷新能力与简短说明。详情折叠区最多补：全量/手动、停服、旧库旧桶由运维保留核对；不展示DSN、桶名、instance UUID、CLI plan指纹或内部阶段。不要生成含空占位的破坏性命令让普通用户复制。运维说明现为仓库本地文件，未核实发布网址，不写不存在的docs路由/本地D盘浏览器链接；本批可不加超链接，以“请联系部署人员，参阅《多 Pod 手动维护备份》”收口，技术交接中链接仓库文件。

支持原因集中映射：补齐biz/backup/paths.go、snapshot_inventory.go全部现有reason及目录/库存检查失败项；将“需关闭Redis”改为“网页本地备份模式要求 Redis 关闭”，数据库、资源、快照项同样限定网页模式。去掉“第一版”。maintenance_cli_only优先mode专用说明，不把后端中文reason包装成“部署条件未满足：中文句子”。未知reason用“还有未识别的部署条件，请联系部署人员核对”去重兜底，不把任意服务端字符串直接输出为主说明。诊断如确有必要仅放折叠技术详情，不输出机密；本批不需要堆reason码。

## 3. 操作门控、状态与兼容

由单一计算/纯函数解释能力，组件和composable共用同一判据；不能只在模板隐藏而sendPending/start/cancel/download/poll仍放行。刷新失效时暂停新提交；迟到的旧mode列表/状态/预览响应不能回填新模式，用已有请求序号/生命周期方式处理即可，不新增状态框架。

旧sessionStorage可能残留SQLite任务及pending原请求。切CLI/未知/不支持分支后不得自动重放，不请求list/status/preview/create/delete/download/cancel/execute。不得把旧任务显示成CLI进度；保留其原始意图，不默认清掉后宣称完成，可短提示“浏览器留有先前网页操作记录，当前模式无法核对，请联系部署人员确认”。原有同请求重试仍只在重新确认网页模式支持时由用户触发，不自动造新request_id。若能力刷新时原有对话框开启，禁止继续提交并关闭或展示模式已变化，保留原请求证据。

原有SQLite成功/失败/202异步、上传File重新选择、ZIP签名验证、预览过期、保留策略、Cookie/CSRF/Origin、request UUID HTTP兼容、会话代次防迟到响应全部保持。不要顺手改后端能力接口、IDL或生成代码。

## 4. 维护期间与恢复后

实际biz/middleware/distributed_maintenance.go在控制不可用、draining、代次不匹配、候选checking拦截时，返回HTTP503 application/json，内容为：

```json
{"message":"全局维护保护：控制状态不可用、正在维护或实例代次不匹配"}
```

此响应没有error_type，不能声称所有HTTP503均是备份中。共享http层对**可信虹桥API＋503＋上述确切message**做有界兼容，转成前端内部识别的全局维护阻止错误（仅内部使用，不冒充后端新增error_type），展示“服务处于维护保护状态，暂时无法操作。请稍后重试；持续不可用请联系部署人员。”它同时包含控制故障，不展示“正在备份/恢复XX%”。不要泛化信任任意message、不要把payload内部诊断全量输出。auth路径当前通用覆盖逻辑也应保留这个安全提示，不改成密码错误。

普通503/502/网络断开继续“服务暂不可用，请稍后重试”，不标维护、不标账号过期，不推断操作成功/失败，不自动重放写请求，不刷新整个页面清空输入。对未收到明确响应的既有pending必须继续保持结果不确定；对确切上述中间件拦截可按前置拒绝处理，保留用户输入/文件，重试由用户触发。文案不承诺所有页面有草稿持久保存。

已有登录页、AuthRecovery和页面内错误足够时优先复用，不为本批做全局维护仪表盘/长期轮询。维护503不得直接当401清会话/反复跳登录；首次会话恢复失败进入现有可重试状态合理。服务恢复后若真正收到AUTH_REQUIRED 401，继续现有清会话、清业务内存状态、安全redirect和重新登录；不能假设维护结束即恢复旧认证，也不能持久化密码/token。迟到旧请求不得覆盖新会话结果。页面不把“重新登录”按钮等同恢复成功。

## 5. 工作范围与风格

实施对象为“虹桥前端”local / 01a157e4-c1ae-7071-810a-a8a7c4489e8a。先读根/ vue AGENTS，以及 $engineering-quality-preserving-refactor（C:/Users/MalfuRisa/.codex/skills/engineering-quality-preserving-refactor/SKILL.md）。现有Vue3 SPA、Tailwind4、Radix Vue＋Spectrum语义token、明暗主题沿用，按vue规则使用refactoring-ui；不探索新视觉方向/不换框架，不做移动端重构。

仅修改上述前端、相关Playwright夹具/用例与本PRD；按职责拆分显示策略/错误识别，复用已有组件和小方法，不把逻辑挤进BackupsPage模板。当前工作区大量未提交后端实现、文档和用户改动需保护，不reset/覆盖/格式化全仓库，不更改Go产品代码。不引入新依赖/自动化任务。不提交推送/打tag/部署，构建产物不覆盖已提交的pkg/static/web。

## 6. 最小验证与交付

先实现能力分支与门控→维护错误与会话兼容→专项/回归/截图，连续实施，不扩展为后端所有故障实验。npm run build；复用tests/e2e/auth/backup-ui.spec.ts、backup-fixture.ts和requests/login相关受影响用例。新增/调整行为断言，不写只匹配私有函数/源码字符串的测试。

| 输入/触发 | 必须证明 |
| --- | --- |
| maintenance_cli_only，含真实中文reason | 正确说明/标识；无SQLite表单、伪任务/包大小/保留N次/第一版/关Redis指令；只请求capabilities，无任何本地备份接口调用 |
| 旧后端mode缺失与business_full支持 | SQLite既有创建、上传预览、确认恢复、取消/删除/下载、202轮询、原请求重试、保留策略相关用例回归 |
| 未启用远程环境同款reason、snapshot_storage_not_local、未知reason/未知mode | 不误报CLI已可用；原因通顺，未知key不裸露，未知mode即便supported=true仍零变更请求 |
| 首次/刷新能力失败、支持→CLI转换含迟到请求与开着的确认框 | 不沿用旧能力写入；旧数据/预览不冒充CLI；pending不自动清空/重放；刷新/卸载无残留轮询 |
| 旧sessionStorage jobs/pending进入CLI | 无status/list及写请求，原意图不丢失，不出现无法操作的重试按钮 |
| 确切维护503发生于保存/上传/备份及auth/me/login | 提示保护状态，不显示成功/密码错/会话过期，不自动重复POST；已有输入/文件不被本轮逻辑清空；明确拒绝与网络未知结果分开 |
| 普通503、HTML502、网络断开、任意message字段 | 通用不可用提示，不误识别为维护，不误清认证；不回显任意内部message |
| 恢复后真正401→重新登录→旧请求迟到 | 旧会话被拒绝，安全redirect/CSRF/会话状态正确，旧结果不能写回；无密码持久化 |

真实浏览器验证用本轮临时前端，1280/1440明暗主题各核对关键CLI/不可用/SQLite状态，沿用语义色与键盘可访问刷新、错误role/焦点。专项Mock和真实接口结果分别登记。正式远程仍v5.1.0未启用新模式，允许只读capabilities及既有账号登录/退出验证（若需要，运行前后核对会话清理）；**不在正式环境创建/恢复/删除备份、不改配置/启用模式、不复建后端已清理的集群实验**。可用真实响应shape夹具验证新mode与维护窗口，如未启动新后端实测必须写“契约Mock”，不冒充远程已验收。无需为页面适配重复多Pod停服恢复。真实写操作如SQLite回归须独占临时fixture，按现有测试工具收尾。

停止本轮自建Vite/Playwright/fixture进程，按PID/端口/资源归属清理，不影响他人。证据放.local-qa/distributed-backup-frontend/<run_id>/，脱敏截图不得含Cookie/密码/DSN。追加同一PRD：改动文件、能力/错误契约、实际构建与专项/相关回归结果、截图、Mock/真实边界、原环境无业务变更、清理结果及未验证项。不要扩大追查与本任务无关的历史scope重建偶发失败；出现时给对照/定位边界，不能隐瞒或因此无限拖延交付。

派发状态：2026-10-30已通过send_message_to_thread发送至“虹桥前端”（local / 01a157e4-c1ae-7071-810a-a8a7c4489e8a），工具确认送达。实施结果见下节。

## 7. 前端交付登记（2026-10-30）

### 7.1 已实现行为与文件

本轮共享目录 HEAD 为 `8fc8bb6f050b640effa93e486b97c139ecdc6640`，保留工作区既有后端候选改动与其他 PRD。按照 engineering-quality-preserving-refactor 分开模式解释、流程门控、错误适配与界面呈现；使用 refactoring-ui 的层级、空状态和既有 Spectrum 语义 token，没有新框架、依赖、视觉方向或移动端重构。

| 文件 | 实际行为 |
| --- | --- |
| `vue/src/lib/backup-capability.ts`（新增） | 单一纯函数区分 web / maintenance / unsupported / unknown。maintenance_cli_only 优先于 supported；未知非空模式永不开放网页操作；缺 mode 和空 mode 沿用旧 supported 语义 |
| `vue/src/composables/useBackups.ts` | mode/webReady 统一门控创建、上传、恢复执行/取消、删除、原请求确认、列表、状态轮询、预览与下载。刷新开始即撤销确认，能力失败不能继续用旧 supported；epoch＋session generation 阻止旧列表、任务、预览、写响应和下载回填。离开网页模式清除展示缓存但保留原 pending/tracked 身份；回到明确支持的网页模式后只由用户确认原请求，不自动重放。卸载停止轮询/计时，旧会话响应不能复活状态 |
| `vue/src/views/BackupsPage.vue`、`vue/src/styles/spectrum-backup.css` | CLI 模式是独立说明面板：谁执行、全部停服、校验后切换、账号保留与旧会话失效；仅保留刷新和折叠须知。隐藏本地表单/列表/作业/限制/保留数量。未开放、未知模式、加载中、能力确认失败分别显示；模式变化时关闭原对话框，保留 pending 证据。未添加网页执行 CLI、假进度、DSN、桶名、命令或未核实文档链接 |
| `vue/src/components/backup/presentation.ts` | 网页模式限定的中文 reason，覆盖 paths.go 和 snapshot_inventory.go 当前全部原因（含 snapshot_storage_not_local、历史远程快照、库存不可用、各控制目录原因）；未知 reason 去重为自然语言。去除“第一版”和要求当前部署改为关闭 Redis 的表述；保留数量说明也使用公共模式判据 |
| `vue/src/lib/api/backup.ts` | mode 标记为可选，表示旧服务实际可缺字段；请求、202/ZIP/CSRF 合同不变 |
| `vue/src/lib/api/maintenance.ts`（新增）、`vue/src/lib/api/http.ts` | 仅可信虹桥 API＋HTTP503＋精确中间件 message 匹配为维护保护提示。内部标识 FRONTEND_MAINTENANCE_PROTECTION 只是前端适配结果，不是后端新增 error_type；用专用错误实例识别，服务端同名字符串不能冒充。不保留该响应诊断 payload。auth/me/login 不覆盖为密码错误。普通503/HTML502/网络异常仍为通用不可用，不信任任意 message；保留既有明确业务错误映射和 AUTH_REQUIRED 会话处理 |
| `tests/e2e/distributed-backup-frontend/`（新增） | 22 项能力/维护专项、桌面截图、沿用现有真实 SQLite fixture 的进程托管入口；不增加 Go 产品测试或修改后端接口 |
| `tests/e2e/auth/backup-ui.spec.ts` | 仅更新旧“不支持”用例：文案限定网页模式，检查无作用表单隐藏而非禁用；原成功、失败、202、恢复、重试及保留策略测试继续保留 |

精确维护拦截是已知前置拒绝：保留备注/选择的文件，移除本次尚未受理的 pending，让用户自行重试；普通503/断网仍保留原始意图为“结果尚未确认”，确认时整份 payload 和 request_id 不变。模式不允许核对时保留记录提示，不发出查询或重放。

模式判断、请求代次比较是常量工作量；原因映射按原因数量线性去重，没有新增缓存系统、长期维护轮询或性能收益承诺。未改 stores/auth.ts、既有会话边界或 backupPersistence 的存储格式。

### 7.2 构建与契约 Mock 验证

证据根目录：`.local-qa/distributed-backup-frontend/run_20261030_5a59a5a5/`。本轮脚本、日志和截图不含真实会话、密码或部署连接信息。

| 检查 | 实际结果及证据 |
| --- | --- |
| Vue 类型与生产构建 | `cd vue; npm run build` 通过（vue-tsc -b＋Vite）；最终产物只在 vue/dist，未复制 pkg/static/web |
| 新专项 | **22/22 通过，27.7 秒**；specialist-final.log、mock-results/.last-run.json |
| 现有受影响回归 | **49/49 通过，约1.2分钟**；backup-ui.spec.ts、login.spec.ts、requests.spec.ts，regression.log、regression-results/.last-run.json。其后小幅完善离开模式缓存清理、卸载门控及提示减字，使用最终专项和构建验证，没有机械重跑无关历史 scope 用例 |
| 格式 | `git diff --check -- vue/src tests/e2e/auth/backup-ui.spec.ts` 通过；另有本机 Git LF/CRLF 提示 |

专项场景包含：CLI supported=false/true 矛盾响应均无本地操作；旧 jobs/pending 原文保留且仅请求 capabilities；未知模式即便 supported=true 也不放行（不仅测试模板隐藏，还调用公共 composable 操作方法核对零请求）；新/旧网页模式可创建、下载、删除；16 个已知 reason 与未知原因去重；首次能力失败、加载、刷新失败及显式成功重试；开着的弹窗与不明原请求跨模式切换；原请求深比较相等后确认；迟到列表/任务/预览/下载不得回填，切 CLI 后时钟快进一分钟无后续轮询；维护保护时备份/上传的文件和备注保留；配置保存保留输入、资源上传不报成功或自动重发；auth/me/login 安全提示；普通503、HTTP500相似message、HTML502、断网、任意诊断message和第三方API不误标维护；服务端同名前端内部标识仍保留不明原请求；维护后真正401安全跳转、重登后旧列表失效且无密码/CSRF落盘；键盘 Enter 刷新。

上述新增分布式模式、维护窗口、401/迟到响应与 UI 截图均为**真实 Chromium 页面＋精确契约 Mock API**，不是新分布式后端联调或正式环境验收。初轮用例中的 BasePath 存储键少斜杠、空内容触发表单校验、状态夹具返回无关 queued 任务已修正；这些失败不计产品通过，最终结果以 specialist-final.log 为准。

可复跑命令（先启动独占 3002 Vite，并把 DBF_EVIDENCE_DIR 指向本轮绝对证据目录）：

```powershell
cd D:/kylin/rainbow_bridge/tests/e2e
npx playwright test --config=distributed-backup-frontend/playwright.config.ts
$env:RAINBOW_AUTH_UI_URL='http://127.0.0.1:3002/rainbow-bridge/'
npx playwright test --config=playwright.auth.config.ts backup-ui.spec.ts login.spec.ts requests.spec.ts
```

### 7.3 真实独占 SQLite 验证

编译当前候选 Go 的 dev 应用，只为运行已有 SQLite fixture，不修改 Go 产品代码、不跑分布式恢复实验。成功独占实例为 `output/backup-ui-20261025/instance-61d6ae15`，仅监听 `127.0.0.1:18097/rainbow-bridge/`；认证为本轮生成的临时账号，密码只在进程环境传递。

沿用 `tests/e2e/backup/real.spec.ts`、`backup/instance.ps1`，新增 `distributed-backup-frontend/real-run.mjs` 管理启动/停止（Start/Stop 子进程不继承捕获管道）。执行 `node tests/e2e/distributed-backup-frontend/real-run.mjs`，结果 **1/1 通过，25.5秒**。证据 sqlite-managed.log、sqlite-summary.json、sqlite-frontend-evidence.json：

- 浏览器真实 UI 创建备份与 ZIP 下载成功；创建 HTTP202，下载 application/x-zip-compressed。
- 修改独占配置后上传校验备份，准备恢复可取消；连续两次显式确认、服务重启、重新登录，两个恢复作业均 succeeded。
- 原配置（含大整数原文）恢复，编辑 revision 改变，原资源 HTTP200；恢复前旧 Cookie 在恢复后 HTTP401，当前账号能重新登录。
- 网页仍按服务返回的托管策略展示保留3份，成功后无旧预览；ZIP校验、恢复确认与会话代次没有被本批模式适配破坏。

这里没有 API Mock；它验证的是默认关闭分布式维护时的旧 SQLite 网页功能，不代表 PostgreSQL/MinIO/Redis 或双Pod恢复重新验收。最终几个 CLI 专用缓存/卸载门控及文案小改由最终契约专项/构建覆盖，未重复执行已通过的 SQLite 恢复实验。

前置 `script/test-backup-ui.ps1` 曾有两次无效启动：第一次验证命令相对日志路径随脚本目录切换而失效，实例368e593f仅建立目录；第二次实例6c3709f6显示就绪后，外层 PowerShell 停留在原生子进程输出捕获，未进入 Playwright。核对精确 PID/可执行路径/启动时间后停止其独占服务和挂起验证父进程；这两次不计验收通过，也未通过改 Go 产品来处理。

### 7.4 桌面视觉与交互复核

按用户电脑端约定覆盖 **1280/1440 × light/dark × maintenance/unsupported/web，共12张截图**，路径 `screenshots/{maintenance|unsupported|web}-{light|dark}-{1280|1440}.png`；已逐张查看，无水平溢出。主次信息、分区间距、长中文换行、状态与刷新可读；沿用 Spectrum 面板、阴影、语义色、16/24/32 间距与现有图标。未将 CLI 说明做成“正在维护”的状态仪表盘，没有提供无意义禁用按钮或伪执行入口。

| 设计诊断 | 规则与实施 | 复核 |
| --- | --- | --- |
| 旧 unsupported 分支同时显示不可操作表单，行动层级不清 | refactoring-ui §2.1、§8.4：先给确认的模式、执行人，再给必要风险；CLI/未知/未确认隐藏网页操作区 | 12张桌面图及零请求断言通过 |
| 重复条件说明与技术 reason 抢占主信息 | §2.3、§3.6：原因限定网页模式、未知原因去重；CLI以停服和重新登录为两块次级信息，技术说明折叠 | 未增加原始reason、DSN、桶名或本地文档链接 |
| 新面板需要与原工作台一致 | §6.1：复用现有不透明材质和明暗主题，无新配色系统；操作使用原 Button/折叠 details | 标题/分组/操作可读；刷新可聚焦并Enter触发，错误使用role=alert |

未做移动端验收，也未声称完成全站可访问性或重新量测全套颜色对比度。

### 7.5 清理与交付边界

所有本轮 Playwright/browser/context 均结束。成功 SQLite fixture 在 finally 调用既有 Stop；18097 无监听，owned-process.json 的 PID/可执行文件/启动时间核对表明无本轮实例进程。Vite 3002（含收尾边界测试时重新启动的独占 Vite）按端口与 vite --port 3002 --strictPort 命令行核对后停止，最终3002亦无监听。未停止其他本地服务，未操作正式后端/Redis/MinIO/K8s。

**目录清理未完成**：自动审批拒绝了递归删除本轮三个精确临时目录的操作，返回 `blocked by policy`，没有更具体原因；未换工具或脚本绕过。以下目录仍保留，均在已忽略的独占测试输出根目录，不是产品代码：

- `output/backup-ui-20261025/instance-368e593f`（首次未启动）
- `output/backup-ui-20261025/instance-6c3709f6`（已停止的挂起启动）
- `output/backup-ui-20261025/instance-61d6ae15`（通过的真实 SQLite fixture，含临时业务库/备份等）

只读审计见 fixture-cleanup.json：三个 owned_process_running 均false、port18097_closed=true、formal_environment_accessed=false。临时登录明文密码没有写入配置或结果，fixture数据库和ZIP依然是测试资料，不能把“进程停止”表述为“数据清理完成”。本地构建及截图/日志继续保留在忽略目录。

本轮没有访问正式实例；“正式仍v5.1.0、未部署后端本批”沿用架构交接事实，未自行重新检查远端版本或宣称新mode已上线。没有重建已清理的分布式集群，没有扩大后端 §10.3 未测故障项的验收结论。未提交、推送、打tag、部署、创建自动化或转派任务；没有复制前端到 pkg/static/web。前端功能与范围内验证可以交付评审，唯一收尾残留是上述被自动审批阻止的临时目录删除。

## 8. admin网页完整备份恢复修订（2026-10-30）

### 8.1 目标、依赖与现有成果复用

用户要求同一admin登录后能可视化完成全部正常备份恢复操作，不要求登录服务器运行命令。产品终点为创建/核验/查看备份、恢复预览与确认、真实任务跟踪、中断接续、允许阶段回退、完成后当前密码登录。内部维护引擎与集群资源不出现在普通用户流程。

后端新增独立console、统一控制库认证、稳定静态/登录/维护路由和异步HTTP，本修订**不能只靠前端打开按钮交付**。完整架构与接口以docs/prd/distributed-maintenance-backup-v1.md §11，尤其§11.5为单一依据；本节不再定义另一套字段。新mode=maintenance_web，业务停服不影响console/登录/静态页面。本轮已获分别实施及隔离验证授权，尚未交付；不以Mock声称真实接口已存在，不含正式部署。

沿用已完成的能力分流、中文reason、保守错误识别、SQLite兼容和会话迟到响应保护，旧maintenance_cli_only保持说明模式兼容。新增独立useMaintenanceBackups/API DTO/任务视图，不把所有分布式逻辑塞入旧useBackups；复用列表/统计/确认/错误等组件时先核对语义，不能把旧SQLite“等待重启/ZIP上传”套到新模式。

明确受影响边界包括lib/api/http.ts管理请求识别、lib/auth/session.ts身份scope、auth lifecycle、stores/auth及router/safeReturnTo；新增maintenance路由必须纳入可信管理API的Cookie/CSRF/迟到响应处理。仅为结果Cookie开放的GET使用独立只读调用路径，不能因业务会话已anonymous被共享fetch提前拒绝，也不能借此放行任何POST或其他operation。处理恢复后401时保留任务路由与只读结果状态，不能按全站统一失效回调立刻销毁结果页。

### 8.2 模式与操作入口

GET /api/v1/backup/capabilities只做发现：mode=maintenance_web且contract_version=1时请求固定同源/api/v1/maintenance/capabilities，按ready/actions显示入口。ready=false展示实际缺少的准备条件，允许刷新，不声称数据库不受支持/要求关闭Redis；不可把配置未完成说成admin权限不足。未知contract版本/未知mode保持禁止操作，给版本不匹配说明。没有新后端时旧模式界面继续工作，不自动切新入口。

| 页面状态 | 内容与主操作 |
| --- | --- |
| 无活动维护、准备就绪 | 标识“手动全量备份”，备份列表；主操作“创建备份”；可核验、查看详情、核对并恢复 |
| 无备份 | 简短说明＋“创建第一份备份”，不显示虚构恢复点或可上传本地PG包的入口 |
| 准备条件未完成/能力暂不可确认 | 区分服务不可达与未配置项；禁用写操作，保留刷新和已有任务查询，不写“系统不支持分布式” |
| 正在维护 | 当前任务为主，清楚标“业务已暂停/正在恢复服务”，真实阶段/进度；不禁用整个页面，不把503清为未登录 |
| 中断或阻塞 | 保留最后确认阶段、更新时间、业务是否可用与服务端原因；按allowed_actions提供“继续任务”“取消并恢复原服务” |
| 恢复成功 | 仅task/operation明确succeeded且business_available=true显示完成；当前密码保留，提示重新登录核对业务 |

原独立SQLite表单仍仅business_full支持时渲染；maintenance_web不请求旧backup list/status/upload/download/delete/restore接口。新模式包是控制索引中的MinIO备份，不显示“服务器最多10份ZIP/上传ZIP/人工重启服务/自动保留N次”旧说明。不新增定时、增量、删除备份/旧库按钮，不把尚未支持的动作承诺给用户。旧CLI说明仅对旧CLI模式显示，不能成为web模式主要页面。

### 8.3 创建备份和核验

“创建备份”先POST /plans(kind=backup)并追踪plan task，拿preview后展示目标实例名称、停服说明和已有warnings/issues。主要提示：“备份期间业务暂停，管理页面可继续查看进度；关闭页面不会取消任务。”备注可选，确认使用BACKUP_ALL_BUSINESS_DATA；禁止用户填桶/DSN/命令。

确认后POST /backups立即按202展示“已提交”，不能写备份完成。持久task进入停服→导出/复制→校验→恢复服务等公开阶段；只有available结果产生backup_id且服务恢复才显示成功。total未知时显示阶段和已处理数量/字节，不生成假百分比；已知总量可显示真实完成/总量，阶段不按固定秒数推进。

列表用backup consistent_at作为恢复点时间，created_at为生成时间；大小和计数按十进制字符串格式化，禁止Number解析大整数丢精度。verification显示最后实际核验时间，未知则“尚未核验”，不拿页面刷新时间充数。点击“核验”触发独立verify任务，核验失败显示原因，不能点恢复直至后端restorable允许。备份pending/半包只出现在任务历史，不列成可恢复项。

### 8.4 恢复预览与确认

选择备份→POST /plans(kind=restore,backup_id,expected_sha256)→轮询task→GET preview。完整性验证可能较久，显示“正在核对备份”；不中途冻结当前业务，不把plan当恢复任务。preview失败可查看issues，过期/PLAN_STALE要求重新预览，不保留可点击的旧确认。

预览页展示恢复点、目标实例、配置/资源/版本等实际计数和warnings。明确说明：全部业务暂停；业务数据切换到备份状态；当前admin账号密码保留；旧会话会退出；原库/资源副本保留；开放新业务写入后不能直接撤销。一次正常风险勾选确认即可，不要求服务器root凭据/人工审批/手输CLI指纹。plan_fingerprint等协议字段内部保留，不作为用户要理解的技术术语。

POST /restores必须带原preview_id/plan_fingerprint/backup_id/manifest_sha256、固定confirmation和唯一request_id；提交期间禁重复点击。accepted≠成功，直接进入可独立刷新的任务页。restore/verify确认时能力或revision变化按服务端拒绝处理，重新预览；不换新UUID自动重试。

### 8.5 任务页、接续和回退

新增 /backups/tasks/:task_id 路由；同一task可刷新/复制页面地址/新开页面，URL只含公开ID，无token/密码。任务列表来自控制库，不只从sessionStorage恢复；待确认的request_id可本地有界保存，task_id/operation_id与原请求关联，不保存文件内容/CSRF/密码。旧SQLite pending与新maintenance pending分开存储，旧数据不当作新任务重放或清掉后声称已完成。

轮询GET /tasks/{id}，进行中约1.5秒、连续网络错误退避至10秒；后台tab可降频，组件卸载停止轮询但不发取消。恢复连接只读查状态，不重发创建。并行慢响应以task/request/revision及当前会话批次判旧，不能覆盖新代状态。显示最后确认时间；网络中断写“连接中断，任务可能仍在执行”，不能切成“任务失败/恢复成功”。先按by-request查受理，未确认时只允许原ID确认，不造新ID。

服务端allowed_actions驱动按钮，前端不凭phase猜“可回退”。“继续任务”对应resume；“取消并恢复原服务”对应abort，点后确认目标是恢复原服务、可能仍需等待。旧owner未停、状态冲突给具体阻塞并刷新，不提供“强制继续/跳过校验/强删Pod”。queued未启动可“取消排队”；已运行不能把cancel接口当停止Job。abort开放新写后不显示，若竞争导致409按当前状态说明不能直接撤回。按钮可用必须同时满足当前会话权限和服务端动作，结果Cookie不能触发任何变更。

整个界面区分任务动作与业务可用性：任务中断时业务可能仍停；console在线不等于业务在线；resume命令已提交不代表原恢复已完成。结果页提供阶段与脱敏原因，不展示原始Operation.Data、Plan、SQL或内部Secret。失败备份和恢复的业务状态按后端operation展示，不套统一“重试即可”提示。

### 8.6 登录、停服和最终结果的可达性

配合后端独立控制库认证，同一站点/login和/backups不依赖业务Pod。auth data增加access_scope/active_operation_id；缺字段兼容SQLite admin。maintenance会话进入维护任务/列表而不是普通配置页，导航禁用业务修改入口并说明维护状态；业务API也由后端保护。修改现有router.beforeEach/auth lifecycle时不能一律等待业务鉴权成功后才准进任务页，否则停服/恢复会产生重定向循环。

已有登录会话在维护期间保持管理访问；新浏览器或会话超时可用**同一当前admin密码**重新登录并查询/接续当前操作，不另设运维账号。普通业务503 MAINTENANCE_ACTIVE展示业务暂停，不清管理登录；CONTROL_UNAVAILABLE显示控制服务不可用，不伪装密码错误。登录真正401仍显示现有规则；禁止自动重复提交账号密码。

restore成功导致正常/maintenance会话epoch失效；结果页可用后端operation限定HttpOnly结果Cookie继续只读GET当前任务，不跳到登录后丢掉已完成结果。前端不读Cookie token，不转存localStorage。此Cookie不能获取列表、其他任务、resume/abort或建立新业务会话；auth过期后结果页降为只读，动作需重新登录。结果读取失败/过期提供“重新登录查看任务”，安全redirect仍限本站允许路由，扩展safeReturnTo白名单时限定task ID格式。

完成页明确“恢复完成，业务已恢复，请使用当前密码重新登录”。重新登录后清旧scope/config/asset/release/transfer缓存，重新获取业务身份；旧请求不能写回新会话，Cookie/CSRF仍内存与HttpOnly边界不变。backup成功无需强迫全站重新登录。维护中页面刷新/新tab、终态结果过渡都要有测试，不能仅证明已打开页内的DOM还在。

### 8.7 实施顺序、范围与验收

实施顺序：后端先冻结§11.5公开DTO并给精确fixture→前端建立独立API/composable与路由/模式分流→备份/恢复预览与任务页→登录/结果会话收口→契约专项/桌面视觉→一个共享独占双Pod真浏览器集成。接口未就绪可先Mock，交付声明必须区分；只读历史测试不能代替新网页真实恢复。

沿用Vue3/Tailwind4/Radix/Spectrum明暗token，使用refactoring-ui及engineering-quality-preserving-refactor，不重建视觉系统、不改生成Go代码/集群配置。备份列表主操作“创建备份”，危险恢复只在预览确认后出现；维护态任务信息优先，次级历史折叠，避免满屏技术步骤/误导禁用表单。1280/1440明暗主题检查新任务页/预览/blocked/终态，键盘焦点、role=alert/status可用。可以按职责新增视图和共享组件，不增加大而全useBackups分支。

| 验证项 | 完成判据 |
| --- | --- |
| 新旧mode/未知contract/依赖未ready | maintenance_web可操作，CLI旧说明/SQLite旧流程兼容，无串接口或只按supported放行 |
| 备份/核验/预览/恢复 | 使用精确请求字段，202不显示完成，半包/坏包不可恢复，过期预览拒绝，未知总量无假进度 |
| 两浏览器/重复点击/响应丢失 | 服务器仅一个命令/Job，原ID查回，不重发写入，revision冲突可解释 |
| 中断/blocked/继续/回退 | UI按allowed_actions处理，已开放新写不得直接回退，网络错不擅自判断任务失败 |
| 双Pod均停服时 | 真实HTTP重新加载/login与任务深链接、静态懒加载、新浏览器同密码登录仍成功，业务修改503不清管理认证 |
| console重启/页面关闭再打开 | 任务继续，状态从服务端恢复，停止页面轮询不取消执行 |
| 恢复终态旧会话失效 | 只读结果Cookie仅看本任务，不能越权；重新登录当前密码生效，旧密码/旧请求无效 |
| 旧SQLite回归 | 受影响的认证/路由/备份专项通过，旧ZIP/原请求语义不退化；无关历史偶发不无限追查 |

后端负责独占namespace/PG/MinIO/Redis和固定候选镜像/Job的实际搭建与故障注入，前端只用该环境真实浏览器触发操作；不各自再造集群、不改正式10.60.226.43现有业务服务。新环境验证后由归属方精确清理，前端收尾自建Vite/browser/fixture。当前§7.5审批拒绝的目录仍如实保留，不能换命令绕过。

交付结果追加§8后：主要文件/契约与设计偏差、构建/专项/受影响回归、1280/1440截图、Mock与真实浏览器记录、停服刷新/登录/接续与最终会话证据、数据/进程/资源清理与剩余项。不以当前说明页已验过推定本修订通过。不推送/发布/正式部署，不新增定时/增量。

跨端连接与fixture以docs/prd/distributed-maintenance-backup-v1.md §11.7共享登记为准。前端可先按§11.5做契约Mock和实现，不在等后端时空转；接口/隔离环境就绪后继续真实集成。联调完成在本节后写结果，并在共享登记写是否可清理，不能私自清理后端集群或另建一套。

修订派发状态：2026-10-30已通过send_message_to_thread发送给“虹桥前端”（local / 01a157e4-c1ae-7071-810a-a8a7c4489e8a），工具确认送达；本轮网页完整交互尚未交付。

## 9. 后端交付后的前端收尾（2026-11-01）

架构只读核对：后端PRD §11.8已登记独立console/gateway、合同v1与真实浏览器备份/恢复/停服登录/resume/abort证据；后端没有修改Vue产品。当前前端已经有MaintenanceWorkspace、MaintenanceTaskPage、maintenance-backup API和相关composable，公开DTO基本对齐，无证据要求重做页面/重写接口。前端上次聊天中断，§8缺本人最终实现/验证登记；这次为原任务续作，不另建PRD。

### 9.1 具体补项

1. **维护提示样式与重复提示**：后端证据 `.local-qa/distributed-web/run_20261030_web01/real-pods-zero-login-task-1280.png` 底部出现两条无样式维护toast，已由架构实际查看；当前App直接使用vue-sonner Toaster。检查现有Sonner样式引入/构建和调用去重，沿用Spectrum明暗/定位，不重复显示同一维护状态、不挤到页脚正文、不遮挡确认按钮。不把业务维护503当账号失效，不清登录；正常失败提示仍可见，不直接全部关闭toast掩盖问题。
2. **以最终接口/最终前端构建做交接收口**：安全合同仍为后端§11.5，实际dto.go及docs/contracts/maintenance-web-v1/fixtures.json可核对。重点复核维护态scope、结果Cookie只读、历史reauth_required不会反复退出已重新登录用户、allowed_actions更新后的继续/回退可用性。backend/views.go已把EXECUTOR_NOT_STOPPED限制于interrupted/blocked且无可接管证据的任务；运行中无此reason为正常，不在前端硬编码制造阻塞。进度条仅表达资源字节/对象处理进度，已处理完但还在switching/checking时标题必须继续显示阶段，不暗示整次恢复完成。
3. **补本人最终交付**：复核已有web_05da2601/日志和后端浏览器证据，可信且对应未改行为的结果可直接复用，不重跑全故障矩阵。运行最终build及本轮改动影响的备份/认证HTTP/路由专项，检查1280/1440明暗截图中的维护提示/任务进度/终态。将§8实际文件/证据/未测/清理结果补齐，区分自己的新测试、旧日志和后端代做的真实浏览器证据，不把额度中断当实现未开始，也不能宣称前端本人此前已完成联调。

### 9.2 隔离联调与更新边界

原共享入口 `http://10.60.226.43:31981/rainbow-bridge/`、namespace rb-web-20261030-01及受限访问资料位置见后端§11.7—11.8。该登记是2026-10-30证据，**此次先检查当前健康、模式/版本、无活动任务及资源归属再复用，不保证两天后仍原状态**；不打印private文件内容，不恢复/覆盖未归属的当前数据。真实环境静态来自旧vue/dist快照，最终代码修改后必须与实验console提供的静态一致，不能只在本地Vite截图后称远程已更新。

前端仅负责Vue、相关测试与本文档，不直接操作K8s或Go。需要将最终dist同步到隔离console时，在后端§11.7追加build/产物路径和就绪请求，架构协调后端执行；不改正式31880入口，不复制pkg/static/web或发布镜像。可先用自建临时前端同源测试代理联调，明确其与远程静态部署的区别。保留现有共享环境，不另造整套集群，不为样式收尾重复破坏性恢复。

最低真实复核：登录和列表/任务详情、最终结果Cookie只读及当前密码重登录、样式修复的维护503路径（优先复用已有任务或用契约Mock覆盖拦截，需新的真实维护窗口时由后端协调一次）；如相关功能/认证逻辑实际修改，补受影响真实路径。后端已有完整恢复/resume/abort证据可按代码对应复用，无需为前端签字再次全部执行。缺环境或访问失效登记具体阻塞，继续独立构建/专项，不能以Mock替代真实结果。

前端完成后在本文档及后端§11.7标记“前端收尾完成/是否可清理”；共享集群由后端在架构确认双方不再需要后统一按本轮精确清单收尾。本轮不授权推送、正式部署、定时/增量或绕过已记录的自动审批拒绝；旧生成目录和fixture残留如实保留，不扩大清理权限。

续作派发：2026-11-01已通过send_message_to_thread发送至原“虹桥前端”（local / 01a157e4-c1ae-7071-810a-a8a7c4489e8a），工具确认送达。以下为前端本人实际交付登记；§8中的“尚未交付”为当时派发状态，以本节更新为准。

### 9.3 实际实现与本轮修正

网页主流程已在此前续作中实现，本轮复用并完成提示样式收尾，没有重写维护引擎或重新设计页面。

| 主要文件 | 已完成行为 |
| --- | --- |
| `vue/src/lib/api/maintenance-backup.ts`、`lib/backup-capability.ts` | 合同v1 DTO、十进制字符串、固定同源维护前缀；独立分流maintenance_web、CLI说明、旧SQLite和未知模式，不能只凭supported开放按钮 |
| `composables/useMaintenanceBackups.ts`、`useMaintenanceTask.ts`、`useMaintenanceCommand.ts` | 方案/备份/核验/恢复、服务端列表与任务、原请求确认、轮询与退避、继续/回退/取消；保留受理不确定性，旧会话和迟到响应不回填 |
| `components/backup/MaintenanceWorkspace.vue`、`MaintenanceCounts.vue`、`MaintenanceCommandNotice.vue`、`maintenance-presentation.ts`、`views/{BackupsPage,MaintenanceTaskPage}.vue` | 预览风险确认、阶段与真实计数、可刷新和复制的任务深链接；按钮同时受当前权限和allowed_actions约束，开放新写不允许回退。资源处理100%仍显示switching/checking阶段，恢复成功还需任务/operation成功及业务可用 |
| `lib/api/http.ts`、`lib/auth/{session,lifecycle,redirect}.ts`、`lib/maintenance-route.ts`、`router/index.ts`、`App.vue`及登录/布局适配 | maintenance身份与任务跳转、真正401处理、只读结果路径；结果读取豁免仅限可信GET当前任务，不放开列表、by-request、其他operation、POST或任意URL。历史reauth_required先核验当前会话，不直接清除已重新登录用户 |
| **本轮** `App.vue`、`styles/spectrum-notifications.css`、`lib/notifications.ts`及API错误层/环境/配置/资源/迁移store/runtime概览调用点 | 补引`vue-sonner/style.css`，使Toast恢复固定浮层；复用Spectrum语义色/材质/阴影/明暗主题，提供关闭与焦点状态。同一已知维护/控制服务状态用稳定ID合并，调用方显式ID优先，普通业务/校验错误仍显示 |
| **本轮** `tests/e2e/distributed-backup-frontend/{finish.spec.ts,finish-remote.mjs}` | 6项新增专项及受限真实API检查；浏览器静态替换验证最终dist，不接管集群、不创建新恢复任务 |

Toast根因是Sonner独立CSS未引入，提示进入正文布局；请求层与store又重复报告同一维护失败。本轮分别修复布局和精确服务提示去重，没有全局关闭错误，也没有将维护503当作账号失效。按既有refactoring-ui规则复用光谱层级/明暗token，不新增设计系统、图标或依赖。本轮产品代码仅调整提示层，其余§8行为由既有实现和下述专项核对。

### 9.4 构建、专项与桌面截图

本轮证据根目录：`D:/kylin/rainbow_bridge/.local-qa/distributed-backup-frontend/finish_20261101_9b55aed1/`。最终`vue/dist`在本轮收尾阶段执行`npm run build`通过（vue-tsc＋Vite）；本次补登记没有再运行构建或已通过测试。

| 本轮实际运行 | 结果与证据 |
| --- | --- |
| `npx playwright test --config=distributed-backup-frontend/playwright.config.ts finish.spec.ts web.spec.ts` | **32项通过，56.6秒**；新增6项＋既有web26项，`finish-specialist.log`、`mock-results/.last-run.json` |
| `npx playwright test --config=playwright.auth.config.ts backup-ui.spec.ts login.spec.ts requests.spec.ts` | **49项通过，约1.4分钟**；`regression.log`、`regression/.last-run.json` |
| 最终产物核对 | `artifacts.json`记录70个JS/CSS的SHA-256；与`remote-client-final.json`的浏览器替换清单及当前dist逐项一致，差异均0。该清单只覆盖JS/CSS，不冒充全目录或远端部署校验 |
| 格式检查 | `git diff --check -- vue/src tests/e2e/distributed-backup-frontend`通过，仅有本机LF/CRLF提示 |

新增专项验证：多个数据层的维护503只有一条固定提示，普通错误继续可见且登录保留；资源100%但switching/checking不报整次成功、不虚构EXECUTOR_NOT_STOPPED；打开确认框后allowed_actions撤销立即禁止提交；登出后的旧响应不能复活会话；1280/1440明暗主题12张截图与无横向溢出断言。既有web26项覆盖DTO、确认/请求关联、未知总量、深链接、结果GET隔离、控制服务失败、历史重登及迟到响应等。

截图为`finish-screenshots/{notice,checking,readonly}-{light,dark}-{1280,1440}.png`，另有4张`remote-client-toast-{light,dark}-{1280,1440}.png`。已查看提示/检查中/只读终态代表截图，固定提示未落入页脚正文、未遮住任务确认区；现有面板、文字和阶段可读。截图属于真实Chromium＋契约Mock或下节注明的混合验证，不是本轮真实停服取证；不声称移动端或全站可访问性验收。

此前`web_05da2601/`中的45项阶段专项、最终26项web及49项回归日志属于旧证据；§7的22项CLI/旧模式与独立SQLite恢复结果按未改变行为复用，不叠加为本轮新增通过数。本次收尾没有重跑破坏性恢复。

### 9.5 真实API与浏览器静态替换的范围

2026-11-01 09:47:43、09:50:19（北京时间）读取31981独占入口，分别保存`remote-health.json`、`remote-client-final.json`。先核对访问资料中的预期namespace/instance和固定URL、公开合同及既有任务身份；认证只在内存，凭据/会话不写结果。实时发现为maintenance_web/v1，ready=true、业务可用、maintenance.active=false、41项历史任务中queued/running为0、4份available备份。版本接口仅返回dev/unknown，**没有独立重查K8s namespace UID，也不能由此证明后端提交或镜像哈希**；资源归属依赖后端共享登记及受限访问资料的一致性。

第一轮使用远端已有静态，真实登录→备份列表→既有恢复任务详情/刷新→仍可访问auth/me；历史任务仍带reauth_required=true，新有效登录未被反复注销。第二轮仅在测试浏览器将远端JS/CSS请求替换为本地最终dist，页面HTML和除下述两项外API仍来自同一隔离后端：**environment/list、runtime/overview的MAINTENANCE_ACTIVE 503由该浏览器局部模拟**，用于验证提示样式/去重，不曾让真实业务进入维护。结果toast_count=1、position=fixed；列表和历史任务依旧使用真实接口。两个会话均执行本人logout并关闭browser/context，业务变更数0；登录/登出属于认证会话变更，不包装成完全无写入。

已有恢复任务结束于2026-10-30，已超过结果Cookie的15分钟发放窗口，本轮服务未重新发放该Cookie。故本轮**未重新完成有效结果Cookie的真实越权矩阵**：不为延长窗口新建恢复，也不把当前admin可查任务当Cookie隔离通过；前端路径隔离由本轮Mock专项覆盖，服务端自身任务/列表/其他UUID/变更/过期/撤销边界复用后端§11.8的`final-checks.log`。早期脚本曾错误期待过期任务再发Cookie，及未覆盖概览请求而等待提示超时；最终脚本已修正，这两次不计通过。

### 9.6 复用的真实恢复证据与未验证项

后端2026-10-30证据在`D:/kylin/rainbow_bridge/.local-qa/distributed-web/run_20261030_web01/`：`browser-backup-final.log`、`browser-backup-result.json`为真实浏览器备份；`browser-restore.log`、`browser-restore-result.json`为恢复、当前密码、源变更回退与只读结果；`browser-window.log`、`clock-alignment.json`记录业务双Pod为0时的刷新及fresh登录和约42—43秒时钟校正；`browser-resume.log`、`browser-abort.log`及对应result记录网页继续/回退；`final-checks.log`覆盖真实服务端结果权限。它们由后端执行，**不是前端本人本轮重做**，也不是本轮最终Toast静态版本。仅按未改变的业务/认证路径复用，相关最终前端逻辑由§9.4—9.5补核。

没有新增全链真实恢复、停服、resume/abort、节点故障或磁盘故障试验；不扩展后端已明确的适配器验证为真实系统注入结论。不把客户端静态替换等同console已部署，不将Mock结果列为真实分布式验收。

### 9.7 清理、同步与结束条件

前端代码、范围内验证及本人交付登记完成，最终产物为`D:/kylin/rainbow_bridge/vue/dist`，清单见§9.4。仅剩最终静态由后端同步到独占31981 console及非破坏性复核登记；架构已告知后端正在协调，本节尚无该同步完成证据。前端不再需要新的备份/恢复试验，待后端确认同步资源与清单一致、列表/任务刷新正常后即可结束本轮集成；若无新的差异，无需重跑已过测试。需补核的仅为实际部署差异。

本轮自建Vite3002核对PID/命令行/启动时间后停止，端口已关闭；脚本的browser/context及本人会话已关闭/退出。`cleanup.json`记录清理与产物核对。§7.5被自动审批拒绝删除的fixture目录及后端重复生成目录仍保留，未换方法重试；本轮没有新建SQLite实例。未访问正式31880、未改Go/K8s、未复制pkg/static/web、未提交推送/打tag或正式部署。

**共享环境当前仍不可清理，等待后端最终静态同步与架构确认**。本轮没有持续联调或破坏性试验需求；同步完成且双方确认无其他用途后，由后端按本轮UID/instance/精确资源清单统一清理，不能把本地进程停止写成集群零残留。后端§11.7同步登记是下一步唯一交接入口。

## 10. 同Pod辅助容器模式的前端配合（2026-11-01）

用户已允许现有Pod增加辅助容器、执行时临时启动任务容器。后端PRD§13为新生命周期合同，**原Deployment/Service/URL和PG/MinIO/Redis保留**，备份时停止业务子进程而非缩容整个Pod。先由后端实现与隔离验证，不执行旧§12独立console/gateway正式接入方案。

前端不重做页面，不新增技术模式选择器，不展示Pod/sidecar/Job给普通用户；继续maintenance_web/v1与§8交互。主次提示保持“业务已暂停，管理页面仍可查看和处理任务”，不能根据Pod仍Ready推断业务可用或恢复完成，仍按服务端operation/business_available/allowed_actions判断。缺辅助协议/权限时展示服务端安全原因，不能回旧SQLite建议关Redis，也不能一律宣称整个系统不可用。

前端本阶段先核对公开合同与现有交互，只有实际兼容缺口才修改；不空转等待、不自行搭建集群/修改K8s。后端同Pod协议与实验就绪在后端§13追加URL、BasePath、契约/产物版本、资源归属与连接资料位置；就绪后前端用同一隔离环境真实浏览器验证：备份/恢复暂停业务时原URL刷新/新登录/任务详情仍可达、多个Pod随机分流不丢状态、继续/回退动作受状态约束、最终旧登录失效与当前密码登录。Pod数量/UID/child退出的证据由后端提供，不由浏览器Ready标签猜测。

只重跑受改动影响的专项；旧独立模式32/49项及原浏览器数据正确性证据可以复用为基线，但不能冒充新同Pod生命周期已通过。新增行为证据放新的忽略QA目录，不复用旧run名称造成混淆。后端负责集群资源统一归属和清理，前端收尾本轮browser/临时代理；正式31880在有可审阅候选交付前保持不变，不发布推送/修改v5.1.1标签、不再做定时/增量。

交付：在本节追加是否需要代码修改、实际变更/检查、后端就绪登记与最终构建对应、真实同入口维护窗口验证及明确未测项。本轮不是重新设计视觉或复测全套灾备；如公开HTTP需关键变更先给具体证据，由架构更新共同合同。

派发状态：2026-11-01已通过send_message_to_thread续派给原虹桥前端（local / 01a157e4-c1ae-7071-810a-a8a7c4489e8a），工具确认送达；新同Pod模式尚无前端联调结果。

### 10.1 前端契约与代码检查（2026-11-01）

本次读取后端§13.1—13.6及前端公开API、模式分流、工作区、任务视图、命令提交、认证路由/生命周期代码。依照engineering-quality-preserving-refactor保持业务不变量，按refactoring-ui沿用现有Vue3 SPA/Tailwind4/Radix与光谱明暗token；没有新视觉需求，未重做页面。**目前没有发现因同Pod生命周期方案而必需的前端代码或HTTP合同修改**，没有新增模式选择器、拓扑判断或内部控制调用。

| 检查项 | 当前代码依据与结论 |
| --- | --- |
| 新模式沿用v1 | `lib/backup-capability.ts`仅接受maintenance_web＋contract_version=1＋固定maintenance前缀；`lib/api/maintenance-backup.ts`仅访问固定同源路径。execution_mode属于部署端，浏览器无该入参，不依赖独立console/gateway地址 |
| 未准备好不降级 | `BackupsPage.vue`先按发现模式进入MaintenanceWorkspace；`MaintenanceWorkspace.vue`按capabilities.ready/actions禁用提交并显示安全reasons，仍保留任务入口。新模式ready=false不会落回旧SQLite表单/CLI分支，也不会展示关闭Redis的建议 |
| 暂停业务与完成判断 | `MaintenanceTaskPage.vue`读取operation.business_available，任务结果为后备来源；成功提示要求task成功、业务可用及存在的operation成功。无Pod Ready/探针/replicas判断；100%仅资源进度，switching/checking仍显示执行阶段 |
| 继续/回退/取消 | 同视图allowed函数和`intentAllowed`结合认证、ready、capabilities.actions、operation.allowed_actions和writes_opened；取消排队限定queued＋task.allowed_actions。打开确认后仍实时校验，不凭child停止或Pod存在猜测可接管 |
| 同入口登录与任务深链接 | `router/index.ts`、`LoginPage.vue`与`lib/auth/{redirect,lifecycle}.ts`保留maintenance会话分流和task深链接；只读任务路由不要求普通业务会话恢复成功。auth调用同源原BasePath，无粘性Pod或客户端实例缓存 |
| 受理、状态与会话 | `useMaintenanceCommand.ts`以原request_id查回，不在挂载/刷新自动重放；`useMaintenanceTask.ts`拒绝旧revision/会话迟到响应，历史reauth_required先核验新会话。HTTP只读结果豁免限定可信当前task GET，其他读写维持鉴权/CSRF；真实跨helper一致性和epoch仍需新环境证明 |
| 用户文案 | 工作区与预览说明业务暂停、管理可查看进度；缺准备条件与控制服务失效分别提示。页面不展示sidecar/Job/host，不以管理入口健康代表业务可用；检索到console仅在开发注释中，无用户技术模式操作 |

这是一轮**静态契约/调用链复核**，不是新同Pod运行验收。没有修改Vue产品代码或测试、没有新增构建、没有重跑§9中的32/49项；已有dist和哈希仅作为原前端产物基线，后端候选所携带静态须在新环境另行核对。不据此承诺随机分流、host协议或新生命周期已经通过。

### 10.2 新环境待联调清单与当前边界

检查时后端§13末尾仍为“无该新模式交付/验证结果”，尚未登记新实验URL、资源身份、受限凭据位置或就绪产物。因此本轮未访问新环境、未创建恢复/备份、未将旧31981独立console环境当成同Pod候选，也没有启动代理、Vite或另搭集群。§9.7关于旧实验静态同步/清理是当时交接快照，不能作为本轮新部署方案的就绪依据；旧资源仍由后端/架构决定保留或清理。

后端§13登记就绪后，前端仅使用同一专属环境，按以下受影响路径继续：

1. 先核对URL/BasePath、namespace UID/instance及资源归属、公开maintenance_web/v1、候选版本/静态产物、当前任务与账号；凭据只从受限资料读取，不入日志。不得直接复用`finish-remote.mjs`中绑定旧rb-web namespace/31981的访问资料；届时按新登记建立独立忽略QA目录，保留归属核对，不删除旧保护条件来碰正式入口。
2. 与后端协调同一维护窗口，在真实网页触发备份/恢复；业务child停止时原URL刷新、任务深链接、懒加载和新浏览器同密码登录仍可达，maintenance会话正确分流。多次独立连接的任务状态不能回退或丢失；是否确实覆盖两个helper由后端脱敏路由观测佐证，不能仅靠浏览器反复刷新声称覆盖双Pod。
3. 后端准备可安全接续/回退的中断状态后，网页按allowed_actions执行继续及开放写前回退；未停止执行者/缺证据/权限变化不能强行提交，不能由前端制造host停止证据。业务child退出、replicas保持2、Pod UID与run/generation/批准hash由后端取证，前端只记录对应任务与浏览器行为。
4. 恢复完成后的原会话epoch失效、operation限定结果Cookie只读、当前密码重登与历史reauth_required不重复退出；区分真正401、业务维护503和控制不可用。若需有效结果Cookie窗口，在该次自然恢复终态及时验证，不为补截图另做恢复。
5. 若公开合同与本次核对相同，仅登记真实集成结果，不重复旧全套专项；若发现局部兼容缺陷，范围内修复并运行受影响检查。关键HTTP变化先提供具体请求/安全响应证据交架构，不自行扩大协议或部署权限。

**当前结论：前端契约准备完成；同Pod真实集成未开始、整体仍待联调。** 没有新增本地进程或需要清理的新前端实例，不存在前端自行清理共享环境的动作。本阶段不修改Go/K8s、不复制静态、不推送/发布/改tag、不访问正式31880。新实验环境的结束/可清理结论须在真实联调后追加，不能沿用旧模式完成记录提前结束。
