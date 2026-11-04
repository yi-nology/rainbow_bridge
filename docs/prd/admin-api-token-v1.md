# 第三方管理接口接入：临时免鉴权（Token 方案暂缓）

日期：2026-11-04。状态：用户已明确所有管理接口暂时免鉴权，执行 §10；§1–9 Token 方案停止实施、仅作历史参考。仓库：`D:/kylin/rainbow_bridge`。
后端：虹桥研发；前端：虹桥前端。沿用现有工作区，基线含已发布 v5.1.3。

最新决定（2026-11-04）：用户要求“暂时屏蔽鉴权”，并明确选择“所有管理接口暂时免鉴权”。§10 为唯一当前实施依据，覆盖 §1–9 中与之冲突的 Token 设计/禁用部署约定。已通知两方停止 Token 实施，令牌表、迁移和页面不继续开发。执行可恢复的配置开关，最终在当前已授权联调实例关闭全部管理 API 鉴权；不自动切换业务生效版本。

最新实测（2026-11-04，虹桥研发）：直连 `10.60.226.43:31880` 与代理 `10.44.56.107:32376` 的 `/rainbow-bridge/api/v1/runtime/config`，仅带 `x-environment: dev`、`x-pipeline: default`，不带 Cookie/Authorization/CSRF/Origin，两者均 HTTP200、code200。运行版本均为 v5.1.3 / 130baa4。配置读取目标已经满足免鉴权，无需为这条链路关闭管理写接口；本次核查未改环境配置、管理员或生效版本。两方 Token 功能仅完成只读核查，尚未修改产品代码。

## 1. 用户目标与交付终点

管理员在虹桥网页创建一个有名称和有效期的令牌，交给第三方服务配置一次。第三方每次请求只加 `Authorization: Bearer <token>`，即可执行配置、资源、环境/渠道、迁移、发布、备份恢复等管理操作，无需登录接口、Cookie 或 CSRF。操作原本要求的 scope、revision、request_id、确认字段仍然需要。

本批次完成：令牌创建/列表/撤销网页、服务端令牌存储与统一鉴权、业务及维护控制台适配、必要迁移及对接说明、基础验证。首版只有完整管理权限，不另建权限平台、细粒度授权或第三方账号系统。

网页继续使用原 Cookie 会话。第三方服务保管令牌，产品网页不保存或自动附带管理员 API Token。v5.1.3 不含本功能；本任务不移动已发布 tag，也不自动发布新版本或升级远程环境。

## 2. 已核实的实现边界

- `biz/middleware/admin_session.go` 目前只读取 Cookie，经 `AdminIdentityForRequest` 注入可信 AdminIdentity；自报 role/User-ID 和旧管理 Bearer 无效。
- `biz/service/auth_repository.go` 的 `authenticationDB()`：普通模式用当前库；分布式网页模式用独立控制认证库，业务恢复不切换该库。认证权威故障须拒绝鉴权，不能回退业务库。
- `biz/maintenanceweb/http.go` 另有写请求 Origin 检查、Cookie/CSRF 鉴权和结果只读 Cookie 降级；仅改普通中间件不能满足备份恢复调用。
- `pkg/maintenanceconsole/console.go` 独立注册 auth/maintenance 路由；`pkg/maintenancegateway/gateway.go` 把 `/api/v1/auth/*` 和维护接口转给 console/helper，其他 API 转给业务进程。新令牌生命周期路由须在两种服务注册。
- `pkg/authauthority/migrate.go` 是已有账号从业务库迁往控制库的初始化流程，涉及应用停服、账号指纹及会话清理；不能把它当成新令牌表的日常升级脚本直接重跑。
- `pkg/config/auth.go`、`biz/middleware/cors.go` 已有精确 trusted_origins 和 Authorization 预检允许头；Cookie 登录及会话安全规则保持。
- `WorkspaceAccount.vue` 是账号入口；Vue 路由维护态目前仅允许备份页/任务页。新令牌页面属于认证管理，在维护态也应可访问。

## 3. 鉴权规则与权限边界

### 3.1 统一认证分支

所有受保护管理接口采用同一鉴权选择：

1. 未带 Authorization：完全沿用 Cookie、CSRF、Origin 和会话流程。
2. 带 Authorization：只接受规范的单个 Bearer API Token。使用新令牌校验器；非法、空值、多个凭证、过期或撤销均拒绝，**不能退回 Cookie 或维护结果 Cookie**。旧 JWT、任意 role 头不变成新令牌。
3. 校验成功后构造与当前管理员相同的可信 AdminIdentity，另外在服务端上下文区分认证方式/token_id，供生命周期限制和既有操作记录使用。不得相信调用方自报身份。
4. Bearer 校验成功的请求不依赖 Cookie、X-CSRF-Token，不签发浏览器会话或结果只读 Cookie。服务间请求无 Origin 可正常执行；带 Origin 时仍须满足精确 trusted_origins，浏览器跨域仍按现有 CORS 规则，不全局放开。

公开 runtime/资源 GET 仍保持公开，不因新增 Token 而要求登录。令牌不是绕过业务规则的开关：冻结、scope 身份、编辑/生效 revision、幂等 request_id、发布步骤、恢复确认及维护写门控全部保留。

### 3.2 覆盖范围

| 接口 | API Token 行为 |
| --- | --- |
| 配置、资源、环境/渠道、迁移、导入导出、锁版、版本创建/切换/删除 | 与管理员会话相同的管理权限 |
| 备份能力发现、维护预览/计划、任务/备份列表、创建备份、恢复及继续/回退/取消 | 与管理员相同；仍检查原有部署能力、维护状态及确认合同 |
| 令牌创建/列表/撤销、网页登录/退出/改密和 `/auth/me` | 保持网页会话专用；Token 不用于签发新 Token、改密码或变成网页会话 |
| 内部 IPC、Kubernetes API、运维数据库连接或未对外开放端口 | 不新增任何权限或路由 |

生命周期接口仅接受已登录管理员的 Cookie 会话（写入仍要 CSRF+可信 Origin），不能用 Bearer 加 Cookie 混合绕过限制。带 Authorization 调这些会话专用接口返回 403 `AUTH_SESSION_REQUIRED`。这一边界不削减第三方的业务管理/备份恢复能力，网页显示“管理权限”即可，不展示冗长权限矩阵。

### 3.3 分布式及维护态

- app 与 console/helper 调用同一认证逻辑、同一权威令牌库，gateway 透传 Authorization，不将长期令牌传入 Job 参数、任务表或备份归档。
- 维护中 app 停服时，Token 仍能查询/处理维护任务；业务 API 仍按原机制暂停，不能绕过 business-ready/write gate。
- `maintenanceweb.HTTP.Serve` 须移除对 Bearer 分支不适用的 Cookie/CSRF 前置要求；Cookie 分支保持原要求。无效 Bearer 不得落入 result-only Cookie 降级，已有有效 result-only Cookie 只按原规则读取结果。
- Bearer 请求不调用 `issueResult`。已受理任务使用已确认操作者继续执行，不因为请求返回/令牌撤销而静默丢任务；撤销后的后续查询需要另一个有效凭据，不重放副作用。

## 4. 令牌数据与生命周期

### 4.1 存储

新增 `auth_api_tokens` 模型/DAO，落在 `authenticationDB()`，建议字段：

| 字段 | 约定 |
| --- | --- |
| token_id | 服务端生成 UUID，稳定对外标识，不能替代凭据 |
| name | 去空白后 1–64 字符，可重名，便于标识调用方 |
| token_hash | 唯一索引，SHA-256 摘要，仅数据库可见 |
| display_prefix | 只含非秘密识别部分，列表展示，不能重构 secret |
| user_id / credential_version | 创建时绑定真实管理员及其当前凭据版本 |
| instance_id | 分布式模式绑定当前部署实例；本地模式按明确的本地身份规则隔离，不能跨实例复用控制库令牌 |
| created_at / expires_at / revoked_at | UTC 时间，撤销时间可空；无需软删/物理清理任务 |

令牌采用明确专属前缀，例如 `rb_at_<UUID>.<random-secret>`；secret 由 crypto/rand 生成至少 32 字节，以安全编码输出。校验格式/长度有界，查询记录后对摘要常量时间比较；不做 JWT，不用密码/时间戳拼凑，不与会话凭证混用。

创建只返回一次完整 token；数据库、列表、详情、日志、错误、浏览器持久化都不保存/回显原文。创建响应 `Cache-Control: no-store`，不记响应体。请求日志对 Authorization 脱敏，错误不输出收到的令牌。token_id/前缀和已确认操作者可用于定位。

### 4.2 有效期及失效

- 默认有效期 90 天，API 允许整数 1–365 天；网页提供 30/90/365 天，默认 90，无永久令牌。本版不支持原地延长或取回密钥；轮换是新建后撤销旧令牌。
- 每次受保护请求从权威库核对 token、expires/revoked、绑定的 user 是否存在/启用/仍为 admin、credential_version 及实例身份。不缓存有效状态，保证撤销后下一次鉴权失效；在途已通过鉴权的请求不强行回滚。
- 用户禁用/改角色、改密及运维重置密码使旧令牌失效（凭据版本校验），网页登录退出不撤销 API Token。列表状态明确 active/expired/revoked/invalidated。
- 分布式完整业务恢复保留独立认证库中的当前令牌，不随 session_epoch 的切换失效，以便第三方继续查询/处理恢复任务；session_epoch 仍按原约定使网页会话失效。不能把 session hash 的 epoch 算法直接复用到长期 Token。
- 备份与恢复不能导出/导入此表或凭据。普通单库文件恢复需在重新对外服务前明确使所有 API Token 失效，避免历史副本复活已撤销令牌；只适配现有备份/恢复边界，不重做备份引擎。对外说明恢复后的这项差异。

### 4.3 认证表升级

普通模式在实际认证库执行幂等表迁移，兼容 SQLite/MySQL/PostgreSQL。分布式提供独立、可重复的认证 schema 增量迁移入口/脚本和最小角色授权（AUTH 对新表必要 SELECT/INSERT/UPDATE 权限及需要的 sequence；不扩大 operation/backup/K8s 权限）。已有初次初始化也纳入新表。

已有部署的增量升级不得重新导入管理员、清会话、重置密码、改 session_epoch 或要求重建控制库。用部署迁移身份执行 DDL，服务账号不获得 DDL 能力；新表未就绪时 Token 功能返回 503 `AUTH_TOKEN_NOT_READY`，既有 Cookie 功能尽可能保持，不回退到业务库签发 Token。迁移应在下一次实际升级前执行，本任务只交付代码/脚本和受控环境验证，不擅自迁移当前正式控制库。

## 5. 前后端共享 API 合同

路由统一位于现有 BasePath 下，例如 `/rainbow-bridge/api/v1/auth/tokens/*`，单进程和 console/helper 都注册。生命周期接口遵循 §3.2 会话专用规则；不是公开路由。IDL 正规生成，禁止手改生成模型和路由。

### 创建：POST `/api/v1/auth/tokens/create`

```json
{"name":"前场配置同步服务","expires_in_days":90}
```

省略 expires_in_days 使用 90；非整数、越界及空 name 为 400 `AUTH_TOKEN_INVALID_REQUEST`。

HTTP 200：

```json
{"code":200,"msg":"OK","data":{"token":"仅本次返回的完整令牌","item":{"token_id":"UUID","name":"前场配置同步服务","display_prefix":"非秘密前缀","permission":"admin","status":"active","created_at":"2026-11-04T09:00:00Z","expires_at":"2027-02-02T09:00:00Z","revoked_at":null}}}
```

这里时间只是合同示例，以实际服务器 UTC 时间为准。创建结果未知时不自动重试创建；提示刷新列表核对，可撤销无法取回密钥的记录后重建。无需为保存可重放明文而设计密钥托管。

### 列表：GET `/api/v1/auth/tokens/list?page=1&page_size=20`

page 默认 1 且 >=1，page_size 默认 20、范围 1–100；按 created_at DESC、token_id 稳定排序；返回当前管理员的记录，包括失效记录。

```json
{"code":200,"msg":"OK","data":{"total":1,"list":[{"token_id":"UUID","name":"前场配置同步服务","display_prefix":"非秘密前缀","permission":"admin","status":"active","created_at":"2026-11-04T09:00:00Z","expires_at":"2027-02-02T09:00:00Z","revoked_at":null}]}}
```

列表及错误永远无 token/token_hash/secret。无须新增可取回密钥的详情接口。

### 撤销：POST `/api/v1/auth/tokens/revoke`

```json
{"token_id":"UUID"}
```

HTTP 200：`{"code":200,"msg":"OK","data":{"token_id":"UUID","revoked":true,"already_revoked":false}}`。重复撤销仍成功、already_revoked=true，已过期也可撤销；陌生/不属当前用户 ID 为404 `AUTH_TOKEN_NOT_FOUND`。撤销原子写库，状态更新失败不能声称成功。

### 管理请求失败

格式错误、未知、过期、撤销、账号失效/版本不匹配的 Bearer 统一返回 HTTP401 `AUTH_TOKEN_INVALID`，不回退其他认证；不泄露命中情况。认证库不可用返回503 `AUTH_UNAVAILABLE`，Token schema 未就绪为503 `AUTH_TOKEN_NOT_READY`。现有业务错误原样保持。Authorization 的 Bearer scheme 大小写按标准不敏感，凭据本身大小写敏感。

## 6. 前端功能及对接说明

1. 在账号区域增加“API 令牌”入口，路由 `/settings/api-tokens`，页面沿用 SpectrumLayout。业务维护态仍允许该页/账号入口访问；不会因此放开其他被暂停页面，Cookie 仍是网页唯一认证方式。
2. 列表显示名称、可识别前缀、管理权限、状态、创建/到期时间、撤销操作。明确空态、加载、失败重试、分页；已撤销/失效记录不能当作有效令牌复制或使用。
3. 创建仅名称+有效期；生成成功弹窗展示完整值、复制按钮及“只显示这一次，请保存到第三方服务”一句提示。Clipboard 在当前 HTTP 环境不可用时允许手动选择复制，不要求用户改浏览器设置。
4. 关闭、离开页面、会话变化时清掉明文与复制状态，不写 Pinia 持久化/localStorage/sessionStorage/URL，不输出到console/trace。关闭后只能看前缀；创建成功不因自动刷新而丢掉用户尚未保存的一次性明文。
5. 撤销二次确认，显示名称和后续请求将失效的说明；处理中禁重复，失败保留并可重试，成功更新列表。创建/撤销失败只显示一次错误，保留草稿；会话过期沿用原恢复机制，旧响应不回填新会话。
6. 添加简洁调用示例，使用占位符/环境变量，不将真实令牌写入示例或文档。网页请求生命周期 API 始终走原 apiClient Cookie/CSRF，不用刚生成的令牌给自己认证。
7. 后端在 `docs/operations/` 或现有 API 文档独立小节提供第三方对接：生成一次→第三方后端配置→每次加 Authorization；无需 Origin/Cookie/CSRF 的服务调用，浏览器带 Origin 的区别、失效重建、scope/revision/request_id仍必填。不要只写“加上管理员权限”或让对接方再封装网页登录。

示例（说明用途，不在真实业务范围执行删除/发布）：

```bash
curl "$RAINBOW_BASE/api/v1/environment/list" \
  -H "Authorization: Bearer $RAINBOW_API_TOKEN"
```

`RAINBOW_BASE` 包含部署前缀，不含 `/api/v1`。第三方只配置令牌和服务地址即可；业务参数仍按既有接口合同提供。

## 7. 分工、编码与执行顺序

| 责任 | 主要位置 | 完成判据 |
| --- | --- | --- |
| 后端：Token 领域 | auth model/DAO/service、authenticationDB、迁移 | 可签发一次、列出元数据、撤销、过期/账号状态校验 |
| 后端：HTTP 鉴权 | AdminSession、维护 HTTP、auth 路由/IDL、console/helper注册 | 同一 Bearer 能管理业务与维护 API，无 Cookie/CSRF，错误不降级 |
| 后端：认证升级/恢复 | authauthority 增量脚本/现有初始化、备份表边界、运维说明 | 不重置账号，不把令牌纳入业务备份或在恢复时复活 |
| 前端 | WorkspaceAccount、settings页面/局部组件、API封装、router | 创建/一次性复制/列表/撤销完整闭环，维护态可管理令牌 |

沿用 `$architect-developer-handoff` 的职责分工；两方实现前读取 `$engineering-quality-preserving-refactor`（`C:/Users/MalfuRisa/.codex/skills/engineering-quality-preserving-refactor/SKILL.md`）。前端遵守 `vue/AGENTS.md`、`$refactoring-ui`，Vue 3/Tailwind4/Radix/Spectrum及深浅主题，不另起设计系统。

鉴权选择、凭证校验、领域生命周期与 HTTP 映射分责，提取小方法复用 app/console 鉴权，不给大型 auth_login.go 直接堆全功能，不引入 OAuth/新中间件/全局权限框架。新凭证上下文不破坏现有 AdminIdentity 的调用合同。

后端先落实共享 API/错误类型与迁移边界，前端据合同并行开发/Mock，最终用真实候选服务联调。无需等待架构师逐函数审批；关键架构偏差写明后再协调。

保护工作区现有 `docs/docs/api/index.md`、`docs/docs/api/testing-guide.md` 及 `biz/model/biz/`，不得还原/整体纳入无关改动。生成代码只正规再生。本轮不提交推送/tag/镜像发布，不升级现有 K8s 或迁移正式认证库；后续验收后按用户指示发布。

## 8. 基础验收

遵循用户偏好：主流程、必要构建、直接受影响的认证行为检查；不追加复杂故障注入、压力或灾备矩阵。

| 检查 | 预期/责任 |
| --- | --- |
| 网页生命周期 | 创建有期限Token→一次性展示/复制→关闭后列表仅前缀→撤销→列表更新；前端实际候选服务联调，明确不是Mock |
| 第三方直接操作 | 无Cookie/CSRF/Origin，仅Bearer读取管理数据、在专属范围新增/修改配置或上传资源；业务参数及冻结仍有效；后端 |
| 失效与优先级 | 过期/撤销/错误/多凭证401；错误Bearer＋有效Cookie也拒绝；账号凭据版本变化失效；Token不能调用生命周期/改密；直接受影响基本用例 |
| 会话兼容 | 无Authorization的网页登录、CSRF写、结果只读Cookie及公开runtime读取保持；必要现有覆盖复用 |
| app/console一致 | 同令牌经过两入口鉴权；临时双进程/受控现有集成夹具验证即可。维护态可查任务/能力，令牌不签发结果Cookie，不用在正式环境执行恢复 |
| 增量schema | 已有认证数据下新增schema/重复执行不改账号密码、会话和epoch；AUTH最小角色有新表权限，未就绪不回退；受控PostgreSQL验证并记录实际结果 |
| 备份边界 | 检查本表未导出/导入；普通单库恢复后旧令牌失效、分布式当前令牌不随业务恢复/会话epoch改变而复活或失效；按受影响代码补最小行为检查，无需重跑完整灾备演练 |
| 前端构建与视觉 | 类型检查/生产构建通过；1280/1440深浅主题基本查看，含一次性密钥与失效状态；敏感值不录入截图/trace |

测试使用唯一专属账号/实例/范围，禁止改正式admin密码/disabled/epoch，不操作当前业务生效版本。令牌测试结束全部撤销（不只网页登录退出），清理本次业务数据、会话及自建服务；令牌原文不写报告。真实远程不能验证的项标明，不以Mock冒充上线；可利用远程受控环境，不要求本地安装PG/MinIO/Redis。

## 9. 研发交付登记

### 9.1 虹桥研发

待填写：真实API和错误合同、鉴权复用与覆盖、Token存储/迁移/恢复边界、实际基本验证/受控联调、最小升级操作、清理、未测项。不回填任何真实令牌。

### 9.2 虹桥前端

待填写：账号入口/维护态路由、页面及API文件、一次性明文生命周期、构建/Mock/真实联调、脱敏截图、清理和未测项。只修改本小节，避免覆盖后端登记。

## 10. 当前执行方案：所有管理接口临时免鉴权

**简单验收及发布授权（2026-11-04）**：架构已只读核对当前后端鉴权/维护分支、前端模式识别与请求处理、生产构建、real-disabled/real-default/cleanup 及最终基础检查记录，未发现本轮阻塞。默认模式 Cookie 断言假失败已由最终真实完整请求头检查澄清，通过结果见§10.7。用户最新要求外网环境下简单验收后推送远程并打tag，故当前授权提交/推送本轮代码、必要发布说明及新tag（先核实远端，预计v5.1.4），确认远端引用及流水线触发；仍不连接内网、不改Secret、不部署。远程双进程/存储验证未执行，保持如实说明，不追加全量或复杂测试。

**最新执行范围覆盖（2026-11-04）**：用户在虹桥研发聊天明确“我们脱离了内网环境，仅做外网本地测试”。当前仅实现和本地基础验证，不再连接内网、不提交推送/打tag/发布镜像或部署；本节以下远程发布部署步骤留作后续参考，不作为本轮执行要求。内网先前SSH超时/502符合网络不可达情况，不据此认定远程服务故障。研发交付以§10.6/§10.7真实登记为准。

2026-11-04 用户后续明确：“我们脱离了内网环境，仅做外网本地测试”。此最新执行范围优先：继续完成本地代码及候选验证，本轮不再访问内网、不推送/tag/发布镜像或部署。以下远程发布部署要求保留为原计划，不能据此宣称当前已执行；恢复远程工作以用户后续指示为准。

本节来自用户对范围问题的明确回答，不再请求同一确认。目标：第三方不登录、不带 Cookie/Authorization/CSRF/Origin 也能使用全部业务管理及备份恢复 HTTP 接口。网页同样可直接进入工作台。通过配置恢复原会话鉴权，保留原管理员与密码。

### 10.1 配置与恢复

```yaml
auth:
  enabled: false
```

- 新增可区分缺省值的 `auth.enabled`，**缺省/true 均保持既有鉴权**，只有显式 false 启用免鉴权。不是代码永久删除鉴权，不使用短路条件写死。
- 当前同 Pod 部署需同时更新：业务 Secret `rainbow-bridge-app-config/config.yaml` 的 `auth.enabled`，以及 `console-config/console.yaml` 的 `application.auth.enabled`。重新核对当前真实挂载，保留所有其他配置和 trusted_origins；维护配置指纹/宿主期望 SHA 按现有合法配置更新流程同步。
- 设回 true 并让 app 与 helper/console 读取新配置即可恢复，无需重设密码/新建用户/重建认证库。此前合法网页会话沿用原有效性；免鉴权期间不伪造持久会话。
- 免鉴权不要求初始化新管理员密码；如认证用户已存在完整保留。启用鉴权时仍按原 bootstrap 规则检查，不能因免鉴权启动覆盖旧用户。

### 10.2 后端实现要求

1. `AuthConfig`、初始化及两种服务的 `AuthSettings` 明确传递启用状态，复用一个权限模式判断。`AdminSession` 的 false 分支不读取/验证会话、Token、CSRF、来源；请求带过期 Cookie 或无效 Authorization 也不影响临时免鉴权。true 分支保持现有行为。
2. false 分支由服务器注入固定临时身份：`UserID=0, Username="anonymous-admin", Role="admin"`，并明确标记来源为免鉴权。所有原先 `requireAdminIdentity` 的 service 入口仍取得可信的服务器上下文，不接受调用方自报 User-ID/role，不删业务层校验。该身份不写入 auth_users、不伪装成真实 admin 登录；操作/任务记录诚实标注 anonymous-admin。
3. 普通管理中间件、`biz/maintenanceweb.HTTP.Serve` 中显式 Origin/CSRF/Cookie 检查，以及其他管理入口统一遵循开关；不能只开放配置接口。维护请求无需 Origin/CSRF；不签发/依赖 result-only Cookie，读任务按完整免鉴权管理身份处理。true 模式原结果只读机制不变。
4. `requireAdminIdentity` 检查、任务 actor_id 字段和幂等指纹需接受服务器生成的 ID0 临时身份。现有任务表 actor_id 无 FK，本轮不改表；若其他路径需要数据库用户，改用明确的权限模式分支，不临时创建假账户或改正式账号状态。
5. 冻结状态、scope 身份、expected revision、request_id、数据校验、版本创建/确认/切换、备份恢复 preview/confirmation、维护状态与写门控均保留。关闭鉴权不等于业务暂停期间允许写入，也不自动发布 dev/default。
6. 免鉴权时管理请求的 Origin 不作为拒绝条件；管理 CORS 使用部署配置的普通跨域规则，支持 Authorization、Content-Type、X-CSRF-Token 等原有头。此环境若使用允许任意来源则返回 `*` 且不要求 Cookie credentials，不能出现 `*` + credentials=true 的浏览器无效组合。鉴权开启时维持现有精确来源及 Cookie CORS。不动内部 IPC、Kubernetes 或数据库权限。
7. 账户登录/退出/改密等凭据工具保留既有密码语义，不因为免鉴权而更改账号密码。网页入口隐藏登录/退出/改密；`/auth/me` 按下文提供模式发现，第三方业务调用不需要先请求它。无需继续任何 Token 路由、表或生成工作。

### 10.3 `/auth/me` 与前端合同

扩展既有响应：`data.auth_enabled` 可选布尔值，缺省视为 true。true 模式仍返回真实 user/session/csrf 与原有 access_scope。

false 模式匿名 GET `/api/v1/auth/me` 返回200/code0：

```json
{"code":0,"msg":"success","data":{"auth_enabled":false,"user":{"id":"0","username":"anonymous-admin","role":"admin"},"session":null,"csrf_token":"","access_scope":"admin","active_operation_id":null}}
```

维护态 access_scope 继续返回 maintenance 和实际 operation_id，避免把暂停的业务页面当作可操作；认证库/控制服务异常仍允许返回真实控制错误，不伪造业务就绪。普通业务状态下无需读取会话即可发现免鉴权模式。

对应 IDL 若需变更正规再生（包括 optional bool，以免 false 被省略），同时更新手写 auth JSON，不能只改生成字段。`session:null` 只在明确 false 模式接受，true/缺省模式仍严格校验真实会话字段。

前端工作：

1. 修改 AuthIdentity/acceptSession/store，识别 `auth_enabled:false`、ID0及无 CSRF/会话，无需伪造一个固定 CSRF 字符串或未来到期时间。现有 guarded 页面将模式识别为具有管理访问能力；直接刷新/深链不跳登录。
2. apiClient/fetchApi 在已知 false 模式不因匿名、缺 CSRF 而本地拒绝，不附带旧会话/Token；按当前 Origin/BasePath 发请求。true 模式保持原 Cookie/CSRF/sessionGeneration 防旧回调规则。
3. 账号区显示简短“免鉴权模式”，不显示成真实 admin 登录，不提供会反复回到免鉴权的登录/退出按钮。登录页访问在模式确定后跳工作台；维护态路由仍遵守备份/任务分流。
4. 原 SessionNotice/到期提示/会话恢复在 false 模式不凭空报会话过期；恢复 true 后刷新能进入原登录流程。控制服务503、冻结、冲突等正常错误照常展示，不因为免鉴权吞错。
5. 不继续 Token 页面，本次不新增导航系统/大范围视觉改造，沿用现有界面。

### 10.4 实施与交付顺序

两方按本节自主实现并继续基础验证，使用 `$engineering-quality-preserving-refactor`；前端继续遵守 `vue/AGENTS.md`/`$refactoring-ui`。后端负责开关/鉴权/维护接口及配置文档，前端负责模式发现/请求层/网页路由和账号展示。新增判断集中复用，不把每个 handler 都复制一套开关。

本次用户已明确要求在现有联调服务临时关闭全部管理鉴权，执行终点包括该环境可直接调用。两方先在受控候选实例完成必要检查；前端在 §10.7 登记可发布状态后，由虹桥研发作为唯一执行者接续完成必要的新版本构建发布、现有联调实例配置与镜像更新及验证，无需重复请求同一范围批准。复用 v5.1.3 既有发布流程，先查新 tag 未占用，预计下一版本 v5.1.4，不覆盖旧 tag。不能仅改 Secret 却继续运行不认识新开关的旧二进制。

保持原 Deployment/Service/URL/Pod架构，必要更新 app 与 helper/console 所用镜像，保留 PostgreSQL/MinIO/Redis/现有卷和管理员记录。先检查无活动备份恢复任务并安全备份当前配置，按已有配置指纹流程更新；不重置控制数据，不借关闭鉴权删除业务资源。`auth.enabled:false` 只在该联调实例生效，产品默认及发行示例缺省保持 true。

无需为了本次临时开关发起新的备份恢复任务或修改现有业务发布状态。若构建发布/部署遇到直接范围内问题可自主修复并重跑相关检查；不能交付时写清真实阻塞，不宣称线上已关闭。

### 10.5 基础验收与清理

不增加复杂故障测试或全量接口复测。只做下列直接受影响基本检查，已有业务测试可复用：

- 缺省/true：无 Cookie 的管理读取仍401，原有正常登录与带CSRF写入可用；false：无任何凭据的管理读取、新增/修改/删除测试配置可用，错误/过期Cookie不会触发登录拒绝。
- 专属范围内验证冻结仍拒绝写、缺少 scope/revision/确认参数仍按业务错误返回；不为通过免鉴权测试取消原业务校验。
- console/helper 的备份能力/任务列表、计划接口无Cookie/Origin鉴权拦截；用已有受控夹具验证写请求能进入业务校验即可，不在正式环境运行恢复。
- 浏览器无登录打开/刷新配置、资源、发布、备份页可进入；接口请求层不因空CSRF拒绝；免鉴权标识和维护态基本正确；必要类型检查/构建通过。
- 当前远程两个入口以无凭据请求读取环境/配置列表及维护能力；仅在唯一专属范围创建/修改/删除测试配置，验证结束删除该范围并核对旧范围身份、冻结、生效指针未变。读取不得在报告打印真实业务配置内容。
- 回退开关验证在受控实例做一次 true/缺省即可，当前联调环境最终保持 false；发行镜像含最终前端和新开关。记录版本、镜像digest、两个配置字段及无凭据请求结果，不包含Secret或密码。

### 10.6 虹桥研发实施登记

发布前复核：§10.7 已澄清此前默认模式的请求头断言假失败；最终真实默认实例匿名读取401、登录后3次写入均有Cookie/CSRF、页面刷新和退出通过，cleanup=true。以下早期“待复核”描述为过程记录，不再是未完成项。用户后续明确授权外网环境下简单验收后推送和新tag；本轮发布不包含任何内网部署。

2026-11-04：后端实现及本地基础检查完成。按用户最新“仅做外网本地测试”要求，未提交推送、未创建新 tag/镜像、未修改内网 Secret/Deployment。API Token 表/迁移/路由未实施，§1–9 停止。

- 配置：新增 `AuthConfig.Enabled *bool`，缺省/true 原鉴权、显式 false 免鉴权；`config.AuthEnabled` 与 `Service.AuthenticationEnabled` 集中判断，通过 app/console 的 AuthSettings 传递。发行默认未关闭，没有 schema 变化。
- 身份与普通接口：`AdminIdentityForRequest` 的免鉴权分支不校验会话/CSRF/来源，返回服务器身份 UserID=0、Username=anonymous-admin、Role=admin、AuthenticationSource=disabled；AdminSession 沿用可信上下文注入，业务 service 的身份和 scope/revision/冻结等检查保持。没有创建假管理员、持久会话或修改原密码。普通免鉴权启动不要求新建管理员密码。
- 维护接口：`maintenanceweb.HTTP` 同步跳过免鉴权模式下的 Origin 前置拒绝，不降级到 result-only Cookie、不签发结果 Cookie；维护任务继续接受原 request_id/confirmation、mode/部署能力等约束。控制认证/维护状态异常仍可返回真实错误。actor_id=0 沿用现有无 FK 字段，操作者标注 anonymous-admin，未改任务表。
- 模式发现：GET auth/me 在 false 模式返回 HTTP200/code0，显式 auth_enabled=false、临时用户、session=null、空 csrf_token 和真实 access_scope/operation；手写 JSON 与 IDL optional bool 一致，auth 模型由 hz/protoc 在隔离目录正规再生。true/缺省的登录/会话返回兼容，凭据工具保留原密码语义。
- CORS：免鉴权管理接口使用普通部署跨域配置；通配来源时强制 credentials=false 并明确允许原管理请求头，不以 trusted_origins 拒绝身份。开启时保持原精确来源及 Cookie CORS；内部 IPC/gateway/K8s 权限未改。
- 已通过 `go test ./biz/service ./biz/middleware ./biz/handler/auth ./biz/maintenanceweb ./pkg/config ./pkg/maintenanceconsole -run 'TestAuthenticationMode|TestDisabled|TestMeDisabled|TestAuth|TestSession|TestPublic|TestUnknown|TestCORS' -count=1`。覆盖默认保护、关闭后旧凭据/来源不拦截、真实匿名身份、恢复 true 后原会话可写、不新建账号、me 合同、CORS、维护无凭据读和写进入业务格式校验、不发 Cookie，以及匿名 CRUD、scope/revision/冻结仍有效。相关原认证基础用例复用，不扩大故障矩阵。
- `go build -tags=dev -o .local-qa/auth-disabled-server.exe .` 成功；前端的生产 Vue + 本地独占 SQLite 实际页面结果位于 `.local-qa/auth-disabled-20261104/{real-disabled.json,real-default.json}`，前者匿名读取 HTTP200、三次配置写请求均无 Cookie/CSRF/Authorization、页面刷新通过且 cleanup=true；当前后者记录匿名读取401、成功登录并完成3次CRUD，但请求头策略断言报 UI credential policy mismatch，不能登记整个默认模式页面用例通过，最终复核由 §10.7 登记。服务层默认/true恢复与原会话写入检查已通过。无需真实 PG/MinIO/Redis 或内网实例完成这轮本地检查。
- 清理：服务测试使用 t.TempDir 专属库和文件自动清理；页面夹具按身份删除专属范围并结束测试进程。未操作既有业务范围、冻结或生效指针；候选日志/截图/临时目录按既有约定保留，不重试此前被策略拒绝的目录删除。
- 未完成/未执行：内网 console/helper 的真实双进程任务列表/计划验证、远程镜像和配置重载均未执行。此前只读连接因离开内网出现 SSH 超时/HTTP502，没有进行正式变更；不当作产品故障，也不继续轮询。远程联调实例尚未由本轮改为 false，不宣称其已开放。
- 恢复方式：本地/未来远程两份真实配置分别将 auth.enabled、application.auth.enabled 设回 true 并加载即可，保留原账号密码和会话规则。运维说明在 `docs/operations/auth-disabled.md`；远程如后续获准升级，应先确认无活动维护任务、备份原配置，按现有 host 实际退出证明和配置 SHA 流程切换 app/helper，不重置数据库/epoch/密码。本轮不执行该步骤。

### 10.7 虹桥前端实施登记

2026-11-04：**前端本地候选实现与基础验证完成，可供后续评审打包；按最新“脱离内网、仅本地测试”范围，本轮不发布/tag/部署。** 没有继续§1–9的Token页面/接口，不访问内网或修改现有环境。本节仅登记前端；后端§10.6及用户接口文档/额外生成目录保持。

**合同和实际适配**

- `vue/src/lib/auth/session.ts`：AuthIdentity新增可选`auth_enabled`并允许session为null。只有明确布尔false且服务端匿名身份ID字符串0、anonymous-admin/admin、session:null、csrf空串及有效access_scope才接受免鉴权；缺省/true继续要求真实session时间字段和非空CSRF，字符串false/不完整响应不当成免鉴权。`authenticationDisabled`为集中判断，身份仅内存，不制造未来session/固定CSRF，不持久化开关。模式变化会使旧请求/业务缓存失效。
- `stores/auth.ts`：复用现有管理访问状态支撑路由/操作门控，新增独立authDisabled供展示与请求使用；内部authenticated表示已确认可访问，不代表伪造了admin登录。明确false后不执行login/logout，账号由`components/auth/WorkspaceAccount.vue`只显示“免鉴权模式”，隐藏用户名、登录/退出操作；原模式保持已有行为。没有新增改密或Token入口。
- `lib/api/http.ts`：已确认false的可信API请求使用`credentials:omit`，显式移除Authorization、Cookie、X-CSRF-Token，不因匿名本地状态/空CSRF阻断；JSON、FormData、下载继续共用该入口与当前Origin/BasePath。true/缺省保持原Cookie/CSRF与会话批次检查。初次模式未知的auth/me仍沿用原发现流程（允许已有合法会话恢复），发现false后的后续API请求不携带旧Cookie；不通过清Cookie破坏原会话。
- 原router/LoginPage已用“访问已确认”及maintenanceSession分流，因而无需另写一套免登录路由；明确false可直接刷新业务页，访问login也转工作台。maintenance的真实access_scope仍限制到备份/任务，不开放暂停业务页。控制503、冻结、scope/revision等业务错误继续走原错误处理，不能视作成功。
- `components/auth/SessionNotice.vue`在false时不显示虚构会话提示；`composables/useMaintenanceTask.ts`不因历史reauth_required反复要求免鉴权用户重登，`views/MaintenanceTaskPage.vue`对应隐藏重登结果提示。`SpectrumLayout.vue`维护说明改为“业务维护中，可查看备份恢复与处理任务”，避免伪称真实登录。沿用Vue3/Tailwind4/Radix与光谱明暗样式，无视觉重构或新依赖。

**实际基础验证**

证据目录：`D:/kylin/rainbow_bridge/.local-qa/auth-disabled-20261104/`。

| 检查 | 实际结果与范围 |
| --- | --- |
| 类型/最终生产构建 | `cd vue; npm run build`通过，`build-final.log`；最终产物vue/dist，JS/CSS清单`artifacts.json`。未复制到pkg/static/web或远端 |
| 新契约/页面Mock | `tests/e2e/auth/auth-disabled.spec.ts`覆盖5项基础行为。初轮`mock.log`5项通过；最终调整后`mock-final.log`4项通过、1项内部状态读取断言失败，该失败不计通过。该项已改为实际页面填写→提交冻结返回→草稿保留/请求无凭据的行为检查，仅重跑受影响1项，`frozen-check.log`1项通过（10.9秒）。最终五项覆盖均有通过证据，不声称mock-final整轮全绿 |
| 原模式直接受影响回归 | `login.spec.ts`的恢复503/退出失败重试，`requests.spec.ts`的JSON/上传/导入/ZIP共享CSRF，共3项通过（13.5秒），`regression.log`；不做旧全套重测 |
| 真实false候选 | `tests/e2e/auth-mode/real.ps1`托管独占SQLite dev服务＋最终生产Vue，固定本地`http://127.0.0.1:18108/rainbow-bridge/`。`real-disabled.json`：匿名管理读取200、合法false/null/空CSRF身份；网页新建/修改/删除专属测试配置3次均成功，网络记录Cookie/CSRF/Authorization均false；配置/资源/发布/备份页访问与刷新及login返回资源页通过 |
| 真实缺省候选 | 同一受控脚本的独立默认开启实例，`real-default.json`及`real-default.log`最终passed：无凭据读取401，真实账号登录后同样3次页面配置写成功，请求Cookie/CSRF均true且无Authorization，4页访问/刷新正常并退出。未改正式账号或密码 |
| 维护/错误 | 本轮Mock覆盖明确false＋maintenance只进入备份/任务、终态无虚构重登；true/缺省及非法合同不旁路，控制503有真实提示；冻结写入保留草稿。实际console/helper任务写验证由后端基础用例/§10.6登记，本轮未在任何环境执行恢复 |
| 桌面视觉/格式 | `screenshots/auth-disabled-{light,dark}-{1280,1440}.png`共4张，无横向溢出断言；已实际查看1280深色及真实生产候选浅色`real-no-auth.png`。标识不挤占主要操作；`git diff --check`通过，仅本机LF/CRLF提示 |

真实测试脚本使用Playwright完整`request.allHeaders()`核对Cookie。最初使用省略敏感头的`request.headers()`导致默认模式“UI credential policy mismatch”测试假失败，已修正并仅续跑该默认基本检查；最终记录Cookie和CSRF确实携带。曾有一次候选静态检查未稳定完成，最终同一默认路径复核通过。没有为测试修复而关闭产品Cookie/CSRF。Mock内部模块读取在一次验证中未取得页面身份，已替换成用户实际表单行为断言，避免用实现内部状态代替接口/页面事实。

**清理与交付边界**

- 两种模式均只创建唯一`qa_auth_mode_`临时环境/default渠道和测试配置，脚本finally按expected_environment_id删除环境；`real-disabled.json`、`real-default.json`的cleanup=true，默认模式测试会话已logout。免鉴权模式没有可退出的会话，也未创建Token。未操作已有范围冻结、生效指针或旧版本。
- 18108独占候选由脚本按exe/PID/启动时间核对停止；3002 Vite按命令行归属停止，`processes*.json`与`cleanup.json`登记。浏览器/context关闭、无持续测试服务。QA截图/日志和4个本轮独占实例目录保留在忽略目录，不重试此前被自动审批拒绝的递归清理；不宣称临时库文件已经删除。
- 本次没有访问内网、发布/推送/tag、远程镜像/Secret/管理员变更，未部署前端，不能声称两个现有入口已免鉴权。后续是否发布部署由用户最新安排决定，本地交付无此阻塞；不再追加复杂故障或全量接口矩阵。原Token方案仍停止。
