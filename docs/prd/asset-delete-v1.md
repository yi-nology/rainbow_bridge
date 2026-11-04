# 资源管理单个删除 PRD

日期：2026-11-04。状态：待研发实施。
仓库：`D:/kylin/rainbow_bridge`。后端：虹桥研发；前端：虹桥前端。

## 1. 目标及当前事实

资源列表操作列增加“删除”，管理员可以清理误传、重复及不再使用的资源。完成确认、服务端删除、列表更新和错误反馈的闭环。

已只读核实：

- `vue/src/components/resources/ResourceList.vue` 只有预览和复制；`ResourcesPage.vue` 已有范围选择及冻结状态，但未传入删除交互。
- `idl/biz/asset.proto` 只声明 list/upload/file，没有删除接口。前端基类虽有通用 delete 方法，也不能视为已有可用接口。
- `biz/service/logic_asset.go` 的 `Logic.DeleteAsset` 调用 `AssetDAO.DeleteByFileID`；后者 `Unscoped().Delete` 是硬删元数据，没有范围身份、冻结和引用检查，不能直接暴露给页面。
- `model.Asset` 已有 `DeletedAt`。当前 GetAssetFile 对软删记录统一返回“范围已删除”，新增资源主动删除需要单独表达，同时保持原有范围删除语义。
- 写操作已有 `withWriteGate` 数据库协调及维护门控；`migration_references.go` 已有受管引用 token 扫描器，可作为复用依据，不能再用简单字符串 contains(file_id) 实现引用判断。

本批次仅单个删除；不增加批量删除、回收站、定时物理清理及新的存储服务。与图片上传修复是两项任务，优先完成已开始的图片任务再接续，保留彼此改动。

## 2. 产品与数据规则

1. 删除当前活动范围中的原始资源，必须是已登录管理员；沿用 Cookie、CSRF、可信来源及维护期写入保护。
2. 当前范围冻结时禁止删除，前端禁用并说明原因，后端独立强制检查。不得以隐藏按钮代替服务端校验。
3. 活动编辑区配置仍引用该资源时禁止删除，提示引用的环境、渠道、配置名称/别名，用户先修改或删除引用配置后再重试。不自动删配置、不强制解除引用。
4. 引用检查覆盖所有活动范围内未删除配置，而非仅资源所属范围，因为历史内容可能跨范围引用；已删除范围及已删除配置不阻止删除。只读扫描配置，不改动其内容或 edit_revision。
5. 历史已提交发布快照使用自己的资源副本，不作为原始资源删除的阻断项，删除原图后历史版本预览、下载和业务读取保持可用。若发现遗留版本实际依赖原图，登记证据并保护性阻止该资源删除，先明确兼容处理，不能直接损坏历史版本。
6. 首版采用逻辑删除：事务写入现有 DeletedAt，活动资源列表不再显示，原始资源接口停止提供该记录。原始文件暂留以兼容现有备份/审计，**不承诺立即释放磁盘或 MinIO 容量**，不调用底层硬删方法，不清理任何快照对象。
7. 成功删除后不允许通过新增/修改配置重新建立对该已删除资源的受管引用；导入/迁移等业务写入路径也不能恢复旧 file_id 的活动引用。重新上传得到新 file_id。整实例恢复沿用已有完整恢复语义，不在本任务中改造。
8. 未保存的浏览器草稿不算服务端引用；若草稿图片已被另一管理员删除，后续保存应提示资源已删除并要求重新选择，不生成悬空配置。

## 3. 接口契约（前后端共同依据）

新增 `POST /api/v1/asset/delete`，在既有 BasePath 下面注册，例如 `/rainbow-bridge/api/v1/asset/delete`。

请求 JSON：

```json
{"file_id":"资源ID","environment_key":"dev","pipeline_key":"default","expected_scope_id":"当前范围身份"}
```

四项均必填、去除首尾空白，不允许客户端提交存储 path、bucket 或任意删除路径。按既有规则校验参数、管理员、范围身份和冻结，再执行删除。

成功 HTTP 200：

```json
{"code":200,"msg":"OK","data":{"file_id":"资源ID","deleted":true,"already_deleted":false}}
```

同一活动 scope 身份下对已删除资源重复请求返回同结构，`already_deleted=true`，不重复产生副作用。服务端保留元数据以判定归属；不能把陌生 file_id 当成功，也不能凭 file_id 删除其他范围资源。旧范围已经删除/同名重建时沿用现有 SCOPE 身份错误，不能重放成功到新范围。

错误使用真实 HTTP 状态和现有信封 `code,msg,error,error_type`。本批次新增：

| HTTP / error_type | 语义 |
| --- | --- |
| 409 / ASSET_IN_USE | 活动配置仍引用；data 返回引用摘要，不能删除 |
| 404 / ASSET_NOT_FOUND | 当前范围内没有该 file_id；不泄露其他范围信息 |
| 410 / ASSET_DELETED | 活动范围中的资源已被删除；用于取文件及新建引用失败 |

已有 `SCOPE_*`、冻结、AUTH、维护及写协调不可用错误沿用原契约。范围本身已删除时 GetFile 继续返回原有 scope 删除错误；活动范围的单个软删资源返回 ASSET_DELETED，不能再错误提示为范围消失。

ASSET_IN_USE 的 data：

```json
{"reference_count":1,"references":[{"environment_key":"dev","pipeline_key":"default","scope_id":"范围身份","resource_key":"配置ID","name":"背景图","alias":"BACKGROUND"}],"references_truncated":false}
```

按配置去重计数，摘要最多 20 条，超出则 `references_truncated=true`，不返回完整配置内容。排序稳定。后端实际 IDL 和前端类型须一致，不另造第二套无文档响应。

## 4. 后端实现与引用保护

1. 新建独立资源删除 service/error/引用检查职责文件，handler 只绑定、调用、映射响应。按 IDL 正规生成模型及路由，禁止手改生成文件，不覆盖用户工作区的额外生成目录。
2. 在 `withWriteGate` 同一个事务中校验 `expected_scope_id`、资源真实归属、冻结、活动配置引用，再对确定 scope_id + file_id 写 DeletedAt。所有查询使用 txLogic/tx；不能先事务外查引用再另开事务删除。与配置新增/修改共同协调，解决检查和写入间的竞态。
3. 复用现有受管引用扫描语义：asset://ID、裸/带当前 BasePath 的 `/api/v1/asset/file/ID[/name]`，包括 query/fragment。覆盖 image/file、文本/富文本及 object/keyvalue 嵌套字符串值，不将相似 ID 或普通文本误认为精确引用。
4. 浏览器“复制链接”会得到绝对地址，来自当前已配置可信来源、且路径为本服务资源接口的 HTTP(S) 绝对 URL 也应识别；外部站点的同名路径不视为本服务资源。复用 URL/Origin 归一化，不硬编码测试 IP，不因字符串中出现相同 ID 误伤外部链接。
5. 不直接照搬迁移计划对内部 marker 的错误规则；本任务只提取原始资源引用。扫描某项结构化历史内容失败时不能当成“无引用”，应给出明确、可定位的校验失败且不删除；按现有错误机制返回，不伪装 ASSET_IN_USE 有明确引用。
6. 配置写入在相同写协调中，对拟提交内容引用的资源检查显式删除状态。复用公共方法覆盖新增、修改及相关导入/迁移写入，允许合法删除旧引用；不要把本任务扩大为清洗所有历史外链/缺失资源。后端需核对实际写入路径，不仅在前端检查。
7. GetFile 在读取存储前识别资源软删。列表默认过滤软删，必要缓存按现有机制失效；不改任何发布 head、版本号、快照对象或锁版记录。若复用现有审计能力则保留真实操作者，不为本需求新建一套审计系统。
8. 保留内部硬删除方法的既有调用语义，新增安全 service 入口；不要把现有失败回滚文件清理工具改成用户删除入口。

## 5. 前端交互

1. 资源列表操作列在预览、复制后新增删除图标/按钮，提供 `title` 与含文件名的 aria-label，使用已有危险动作样式；调整列宽，1280/1440 桌面可操作。
2. 复用现有配置删除 Dialog 风格或组件：标题“删除资源”，显示文件名与当前环境/渠道；说明“删除后原链接将无法访问，已发布快照不受影响”。“取消”为默认安全操作，“确认删除”为危险动作。
3. 点击确认才发送一次请求，提交期间显示“正在删除…”并阻止重复提交，禁止通过关闭弹窗丢掉在途状态；失败保留弹窗与目标，支持重试。
4. 冻结、范围未选定、scope 身份无效时禁用；把 ResourcesPage 的 scopeId、冻结状态传入必要组件。确认前绑定目标范围身份，不用当前选择的另一范围替换；范围或会话变化时使旧回调失效，关闭/清理旧目标，不能删除新列表同名文件。
5. ASSET_IN_USE 显示“该资源正在被配置使用，请先修改或删除引用配置”，展示返回的配置名称/别名和范围，可复用已有配置导航则提供定位入口；最多显示服务端摘要并提示其余数量。不提供强制删除。
6. 成功后仅在仍是原范围/会话时刷新列表、计数和搜索结果，保留搜索词；如删除的是当前打开的大图则关闭预览并清空引用。已被别人删除按成功处理并刷新。错误未知或响应丢失时提示刷新核对，不能先假装移除再吞错。
7. asset API/store 封装显式删除类型和 scope 断言，使用现有 apiClient 保持 Cookie/CSRF/BasePath；资源删除错误只显示一次，不重复 toast。引用摘要渲染在弹窗，不只给瞬时提示。

## 6. 编码、顺序与授权

- 读取并使用 `$engineering-quality-preserving-refactor`：`C:/Users/MalfuRisa/.codex/skills/engineering-quality-preserving-refactor/SKILL.md`。复用引用扫描和 scope 校验，小方法降低嵌套，避免向大文件追加所有逻辑。一次删除扫描活动配置约 O(内容总长度)，不引入后台服务或提前建设全局引用索引。
- 前端遵循 `vue/AGENTS.md` 和 `$refactoring-ui`，保持 Vue 3、Tailwind 4、Spectrum/Radix、深浅主题。沿用现有表格/弹窗，不另做视觉重构。
- 先完成各自正在进行的 `image-upload-and-proxy-origin-fixes-v1.md` 修复，再实施本需求；后端补接口/引用保护并在 §8.1 登记接口就绪，前端可按已定合同并行开发与 Mock，最终对实际后端联调。
- 当前未提交改动很多，开始前核对 git status，逐项保留用户接口文档、图片修复、测试文件及 `biz/model/biz/`，不整体还原/清理工作区；两方仅更新自己的交付登记小节。
- 本轮授权实现、必要构建、基础测试及受控环境联调；不自动提交推送、打 tag、替换正式镜像或删除现有业务资源。远程现有版本没有此新接口，不把 Mock 成功写成线上完成。

## 7. 基础验收

只做主流程、必要构建和直接受影响的行为检查，不追加复杂故障/压力/灾备矩阵。可复用已有覆盖，不要求每一行单独建测试。

| 场景 | 预期 |
| --- | --- |
| 未引用资源：取消→确认删除→刷新→重复请求 | 取消无请求；确认成功且列表/数量正确；刷新不恢复；原接口 ASSET_DELETED；重复请求幂等 |
| 活动配置引用资源 | 删除返回 ASSET_IN_USE，原图仍可读取；显示引用摘要；解除引用后可删 |
| 引用基本兼容 | asset 引用、带 BasePath 路径、嵌套 JSON、可信来源绝对链接可识别；相似 ID/外部站点不误判；复用旧扫描器测试 |
| 删除后保存旧草稿 | 拒绝引用已删除资源，提示重新选择；不会写入悬空配置 |
| 范围与门控 | 冻结拒绝；错误 scope/跨范围 file_id 不删除；会话失效沿用现有流程；前端切换范围不污染新列表 |
| 历史快照 | 在专属测试范围创建含图片快照，解除编辑区引用后删除原图，历史快照资源仍能读取且字节一致；不改变现有业务生效版本 |
| 存储与页面 | 元数据软删、本地/MinIO 原对象保留，快照未改；前端类型检查/构建及必要后端检查通过；截图或记录桌面深浅主题删除/引用阻断状态 |

真实联调仅在专属测试范围执行，记录本次生成的配置、资源、快照、范围标识；完成后按既有清理流程清理本次数据及会话。按合同保留软删/审计历史，不清共享桶，不改现有业务冻结/生效元数据。不能部署时分别写明代码、自检、Mock、真实联调各自完成状态。

## 8. 交付登记

2026-11-04 架构简单验收：已只读核对删除事务/引用保护/软删读取实现、前端确认及范围处理、基础构建与 Mock 日志、独占 SQLite 实际页面结果和历史快照验证登记，未发现阻塞本批次发布的问题。MinIO 新删除接口未远程实测、被策略拒绝删除的本地临时目录保留，均不冒充已完成。用户已授权提交推送及新 tag 镜像发布；由虹桥研发在现有发布链路执行，不包含部署升级或修改业务生效版本。

### 8.1 虹桥研发

2026-11-04：后端代码和基本接口契约检查已完成；尚未部署正式服务，真实前后端联调及历史快照验证结果见下列登记，不把代码完成等同于线上就绪。

- 接口：新增 `POST /api/v1/asset/delete`，四个字段按本 PRD；成功显式返回 deleted、already_deleted（false 也不省略）。`ASSET_IN_USE` 为真实 HTTP 409，摘要按配置去重、稳定排序、最多 20 项；资源归属不匹配/陌生 ID 为 404 `ASSET_NOT_FOUND`；活动范围内单个软删资源取文件或保存旧引用为 410 `ASSET_DELETED`。范围删除仍优先原 SCOPE 错误。
- IDL 在 `idl/biz/asset.proto` 增加请求、返回和引用摘要类型；模型及路由由 hz v0.9.7 / protoc v29.3 在隔离生成目录正规生成后归位，未手改生成文件。显式 go_package；file 路由 IDL 对齐原已注册的 wildcard，运行路径保持不变。未覆盖原额外 `biz/model/biz/`。
- 职责：`asset_delete.go` 编排同一 withWriteGate 事务中的管理员、scope、冻结、全部活动编辑区引用检查和软删；`asset_references.go` 复用现有 token 扫描器/JSON walker，识别本 BasePath 及可信 Origin 绝对链接；`asset_errors.go` 定义错误/数据，handler 公共映射保留真实状态。DAO 新增 scope+file_id 软删方法，保留原内部硬删方法语义，不删本地文件或 MinIO 对象。
- 写保护放在 `validateConfigContent` 共用入口，覆盖新增、修改、普通/归档导入以及迁移最终落库；与资源删除共用写协调，拒绝显式已删除 file_id，不把未知历史缺失资源扩为全量清洗。迁移项级失败沿用逐项结果，不生成悬空新引用。配置与 transfer handler 同步映射资源错误。
- 历史保护：正常快照使用自身 release-asset 资源副本；额外扫描现存未删快照 payload，若仍直接依赖原图则保护性阻止删除（409 `ASSET_SNAPSHOT_DEPENDENCY`）；无法解析的配置明确返回 400 `ASSET_REFERENCE_INVALID` 并带配置定位，不当作零引用。这两种保护性错误为本轮补充合同，不伪装 ASSET_IN_USE。
- 已通过 Windows 检查：`go test ./biz/service ./biz/handler/asset -run 'TestAssetDeleteLifecycle|TestAssetReferences|TestAssetDeleteReferenceSummary|TestAssetDeleteHTTP' -count=1`；覆盖未登录拒绝、错误 scope/跨范围、冻结、重复删除、列表隐藏、原文件保留、GET 410、新增/修改/导入旧引用拒绝、跨范围引用、JSON/富文本/BasePath/可信绝对链接、外部和相似 ID 排除、无效历史 JSON 阻断、21 条引用只返回 20 条摘要、生成路由的 HTTP 信封与显式布尔值。
- 已通过受影响的配置编辑/迁移引用/归档导入/JSON 既有检查，以及 `go test ./biz/handler/asset ./biz/handler/config ./biz/handler/transfer -count=1`；`go build -tags=dev -o .local-qa/asset-delete-server.exe .` 成功。
- 历史快照独立用例 `TestAssetDeleteKeepsSnapshotCopies` 在 Windows 创建快照的既有目录 rename 阶段报 The handle is invalid；改用现有 WSL KylinUbuntu 执行同一用例已通过（`GOMODCACHE=/mnt/c/Users/MalfuRisa/go/pkg/mod GOPROXY=off go test ./biz/service -run '^TestAssetDeleteKeepsSnapshotCopies$' -count=1`，0.909s）。验证专属范围创建快照、解除编辑区引用、删除原图、原接口 410、原文件保留且历史快照下载字节不变。未借此扩张修改快照存储实现。最初 WSL 联网下载依赖的重复检查不作为验收结果。
- 联调：新接口已在源码注册并经进程内真实 HTTP 请求验证，但没有可交付的独立运行地址。独立本地服务启动命令被自动审批拒绝，未给具体原因；未改方式绕过。正式 v5.1.2 服务未替换，不能向前端宣称线上已新增此接口。前端 Mock 及页面结果由 §8.2 登记。
- 清理与边界：目前所有本轮服务/HTTP 用例均用 t.TempDir 专属 SQLite/文件及测试身份，框架退出后清理；未删除正式业务资源、未改正式冻结或生效指针。未提交、推送、打 tag、替换正式镜像；保留图片修复、用户接口文档及其他聊天改动。MinIO 软删后对象保留的实际联调未执行（代码路径不调用对象删除）；未添加复杂故障或压力矩阵。

### 8.2 虹桥前端

2026-11-04：前端候选实现、构建、基础Mock及独占SQLite真实页面联调完成。**未部署到正式入口，未提交推送/打tag/替换镜像或复制静态**；保留图片修复和所有其他工作区改动。本节只登记前端结果，后端整体完成/存储及历史快照验证由§8.1登记。

**实际实现**

- `vue/src/components/resources/ResourceList.vue`：在预览/复制之后加入单项删除图标，含文件名的aria-label和title；操作列增宽，冻结、未确认范围/身份或目标scope不符时禁用。
- 新增`components/resources/DeleteAssetDialog.vue`：复用Spectrum/Radix配置删除风格，先显示文件名、范围及原链接失效/已发布快照不受影响的说明；初始焦点为取消。确认才提交，处理中禁重复、取消/关闭和Escape。错误留在弹窗，不发重复错误Toast；未知结果提示刷新核对。
- `lib/api/asset.ts`新增显式`removeInScope`，通过原apiClient POST四个必填字段，不调用无scope的通用delete；提交前后assertScope，校验返回file_id/deleted/already_deleted，保留原Cookie/CSRF/BasePath与会话批次。store暴露同一方法，不额外包装第二次错误提示。
- 新增`lib/api/asset-delete.ts`定义删除成功和引用摘要类型，仅从ASSET_IN_USE的data读取合法摘要，最多20条；显示配置名称、别名、环境/渠道及配置页导航，截断时显示总数/已显示数。不提供强制删除或自动解除引用。`api/messages.ts`增加资源已删除/未找到/引用与历史依赖的中文提示；已删除资源用于旧草稿保存时提示重新选择。
- `ResourcesPage.vue`绑定确认时的原scope、文件和冻结状态；scope/会话变化关闭旧目标，useDialogAttempt使旧回调失效。成功后只刷新仍是原范围的列表/数量，保留搜索词；若删除当前预览资源则关闭并清空预览，清除该资源复制状态。冻结说明包含不可删除；不做乐观移除，也不把已提交请求取消当成后端未执行。
- 按engineering-quality-preserving-refactor分开API、摘要解析、弹窗与页面协调；沿用refactoring-ui的主次、危险确认、明暗语义色及现有图标。页面没有新增批量/回收站/物理清理或容量释放承诺。列表原有按名称线性筛选保留，没有新缓存或性能提升承诺。

**实际检查与证据**

证据根：`D:/kylin/rainbow_bridge/.local-qa/asset-delete-20261104/`。

| 检查 | 结果 |
| --- | --- |
| Vue类型与最终生产构建 | `cd vue; npm run build`通过，`build-final.log`；产物在vue/dist，不复制到后端或远端 |
| 契约Mock基本交互 | `asset-delete.spec.ts` **3项通过，23.3秒**，`mock.log`、`mock-results/.last-run.json`；取消零请求、确认精确scope/CSRF、提交中禁止重复/关闭、成功列表和数量刷新/搜索保留；引用摘要/截断/无错误Toast/无强制按钮、already_deleted；冻结与切scope迟到响应 |
| 桌面视觉 | `screenshots/{confirm,in-use}-{light,dark}-{1280,1440}.png`共8张、无水平溢出断言；已实际查看浅色确认/深色引用阻断代表图。真实引用阻断截图`real-in-use.png`亦已查看 |
| 实际后端浏览器联调 | 本地候选dev Go服务＋最终生产Vue产物，`http://127.0.0.1:18107/rainbow-bridge/`，无API Mock。`playwright.asset-delete.config.ts`、`asset-delete/real.spec.ts` **1项通过，11.2秒**；`real.log`、`real-result.json` |
| 格式 | `git diff --check`针对Vue和新增测试通过，仅本机LF/CRLF提示 |

真实主流程为：临时账号登录→创建唯一测试范围→页面上传PNG→建立引用配置→页面确认删除返回409 ASSET_IN_USE并显示真实配置名/别名/范围→API删除这条测试引用配置→同一弹窗重试删除200→刷新资源列表0项→重复请求already_deleted=true→原图410 ASSET_DELETED→旧草稿新建图片配置410 ASSET_DELETED。真实结果file_id=`105e5bbd-d44f-4ccf-9998-2e6fdf04e3e5`，范围`qa_asset_delete_1793778778590/default`，没有修改已有生效版本。

原后端在本轮并行开发，前端只构建当前候选作为受控测试服务，未修改Go/IDL/生成代码。脚本首轮ES模块加载和第二轮本地Secure Cookie配置有误，均在测试托管脚本中修正，不改产品鉴权；失败尝试不计通过。最终结果以上述1项真实检查为准。

**清理、复用与未测项**

- 真实测试finally按expected_environment_id删除测试范围及关联测试配置/资源，测试会话退出；`real-result.json`的cleanup、logged_out、original_scope_data_unchanged均true，原范围身份/配置/冻结/生效数据哈希一致。仅验证SQLite本地存储和该主流程，不能当作MinIO或正式两入口新删除接口上线证据；前端本轮未重复创建历史快照或扩大故障/压力矩阵，相关后端验证以§8.1实际结果为准。
- 独占服务由`asset-delete/real.ps1`按exe/PID/启动时间核对停止，3002 Vite同样核对命令行后停止；`real-process.json`及`cleanup.json`记录18107/3002均无监听，浏览器已关闭。没有动共享集群或正式资源。
- **本地目录删除未完成**：自动审批拒绝清理命令，返回`blocked by policy`且无更具体原因，未改工具/方式重试。以下三个已停止的独占目录保留于忽略QA根：`instance-ef589be6`、`instance-4d79bb76`、`instance-44eb8aa7`；其中前两次为测试准备失败，第三个为通过的临时库。不能把API业务清理/进程停止写成临时数据库目录已删除。日志/截图、候选二进制和构建产物继续保留。
- 此次构建在同一vue/dist包含之前F1–F3图片修复。图片任务的两入口真接口验证已在其原PRD§7.1独立登记，本删除任务不将图片任务的远程验证计作新接口已部署。
