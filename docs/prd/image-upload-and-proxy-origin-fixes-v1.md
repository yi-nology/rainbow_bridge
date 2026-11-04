# 前场图片上传与代理来源修复 PRD

日期：2026-11-04。状态：待研发实施。仓库：`D:/kylin/rainbow_bridge`。

## 1. 目标与分工

用户报告四项问题：麒麟系统图片选择器默认不显示图片；上传成功后配置预览破图；缺少拖拽图片上传；代理入口登录因 trusted_origins 拒绝。完成后，管理员可从直连及代理入口登录，在新增/编辑图片配置中点击或拖入图片，上传后、保存后及重新打开时均能预览。

| 编号 | 责任 | 交付 |
| --- | --- | --- |
| F1 | 虹桥前端 | 明确图片扩展名过滤，兼容麒麟文件选择器，保留 Windows/macOS 行为 |
| F2 | 虹桥前端主责，后端核查资源响应 | 修复生产 BasePath 下的图片 URL，覆盖新增、编辑、列表、详情及资源预览共用入口 |
| F3 | 虹桥前端 | 配置图片上传区支持点击和拖拽，复用相同校验、上传和状态管理 |
| B1 | 虹桥研发 | 更新远程实际运行的两处来源配置，必要重载后验证直连和代理登录 |
| B2 | 虹桥研发 | 仅在基本核查证实后端图片响应或麒麟 MIME 兼容缺陷时，修复对应环节 |

同一份 PRD 分工实施，各自只更新自己的交付登记，避免覆盖另一方记录。本轮不改备份恢复架构、发布快照语义、鉴权协议及数据库结构。

## 2. 已核实事实与待验证原因

- `vue/src/components/Config/ConfigDialog.vue` 的 `handleFileUpload` 动态创建文件输入，图片仅设 `accept='image/*'`；上传返回后保存 `result.url`，并剥离构建前缀。图片选择器差异与此有关是待验证假设，不能把浏览器/系统 MIME 原因写成已确诊。
- `vue/src/lib/utils.ts` 的 `resolveAssetUrl` 对 `asset://` 和 `/api/v1/asset/file/`，开发模式补 BasePath，生产且未指定 API 地址时直接返回根路径。这是已确认的代码缺口，与前场破图表现吻合；研发需登记实际失败图片 URL、状态、Content-Type，确认实际链路。
- `vue/src/lib/api/url.ts` 已有 `apiURL`，其默认语义是当前 Origin + 运行时 BasePath + API 路径。图片解析应与这条语义一致，并避免 utils 与 api/url 相互导入造成循环依赖。
- `vue/src/components/resources/Uploader.vue` 另有资源上传入口；图片过滤常量和解析规则可复用，保留此处已有 JSON/文本选择能力。本轮拖拽的必交范围是配置对话框图片上传区。
- 后端 `biz/handler/common.go` 允许 JPEG、PNG、GIF、WebP、SVG、BMP、TIFF、ICO、HEIC/HEIF 等 MIME；大小上限为 10 MiB。格式可上传不代表浏览器可预览，不额外承诺 TIFF/HEIC 转码。
- 后端 `biz/handler/asset/asset_service.go` 上传先校验声明 Content-Type；麒麟 File.type 为空或不同 MIME 可能形成后续兼容问题，尚无实测证据。后端按实际结果处理，不能直接放开任意 MIME。
- 2026-11-04 已由后端实测：直连 Origin 登录成功并退出；代理 Origin 经代理和直连接口均返回 HTTP 403 / `AUTH_ORIGIN_DENIED`，与密码无关。线上版本当次为 v5.1.2。
- 运行配置来自 Secret：`rainbow-bridge-app-config/config.yaml` 的 `auth.trusted_origins`，以及 `console-config/console.yaml` 的 `application.auth.trusted_origins`（实施时确认 Go 字段 App 的 YAML 标签为 application，已纠正初步诊断中的 app 路径）。以真实挂载为准，旧 `rainbow-bridge-config` ConfigMap 不作为当前运行依据。

## 3. 前端实施要求

### F1：文件选择与校验

1. 使用与当前后端图片支持范围对应的明确扩展名（至少 `.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.tif,.tiff,.ico,.heic,.heif`），结合明确 MIME/`image/*` 作为选择提示，复用统一常量。不能仅因 `File.type` 为空就拒绝合法扩展名图片；扩展名大小写不敏感。
2. accept 仅用于文件选择提示。点击与拖拽共用文件校验：非空、大小限制、受支持图片类型。文件类型/MIME 有疑义时与后端统一口径，不给任意文件伪造 image/png，不把扩展名当作服务端内容校验。
3. 麒麟原生选择器应默认显示 PNG/JPEG，不要求用户手动选“所有文件”。若没有麒麟设备，先完成代码及可运行浏览器验证，明确登记麒麟原生选择器待前场复核；不得用 Playwright setInputFiles 代替原生选择器实测。

### F2：资源地址与预览

1. 统一解析资源地址：`asset://ID`、`/api/v1/asset/file/ID` 在默认生产部署下解析为当前访问 Origin 的 `/rainbow-bridge/api/v1/asset/file/ID`；根部署无 BasePath 时仍正常。已带前缀路径不重复添加；显式 VITE_API_BASE_URL 沿用现有 API 根语义，不额外叠加前缀。保留完整 HTTP(S) 外链及历史发布资源 URL 的语义。
2. 默认部署不得生成固定冒烟机 IP、MinIO 内网地址，或代理站点根下的 `/api/v1/asset/file/ID`。资源取回走现有服务接口，无需改公开资源鉴权契约。
3. 上传后内容仍保存已有服务端支持的资源引用/路径，展示时解析；不要把 object URL、data URL 或当前代理域名写入业务内容。优先复用现有 response.reference / asset URL 契约；不为本修复引入新接口。
4. 采用修复后的公共解析器覆盖配置对话框、配置列表/详情、资源列表及大图预览。不要只用本地 object URL 遮住服务端地址错误；保存、刷新、重开后必须依然可读。
5. 区分上传成功与预览失败。预览失败显示可理解的占位和重试/重新选择入口，保留已上传引用，不能只剩破图或自动重复上传。不支持原生预览的格式明确提示，不把它误报为上传失败。

### F3：拖拽交互

1. 在现有图片上传区增加“点击或拖拽图片到此处”；拖入文件时高亮，有明确上传中、失败、已上传预览状态。保留键盘触发按钮和点击选择。
2. `dragover/drop` 对文件阻止浏览器默认导航，仅在相关上传区接收文件，不全局接管页面拖拽；不将网页 URL、HTML、目录当成上传文件。
3. 当前配置只承载一张图片：一次拖入多文件时整体拒绝并提示“一次只能上传一张图片”，不静默选第一张，不批量产生资源。
4. 点击与拖拽共用一个上传执行方法；保留现有环境、渠道、scope 身份、冻结、busy、会话/CSRF、`useDialogAttempt` 防旧请求回填的保护，作用域变化须使旧上传回填失效。上传中禁止重复触发和保存；失败保留原图及表单，恢复可重试状态。
5. 从图片预览区仍可重新选择/拖入替换；不要覆盖其他表单草稿。若使用临时 object URL，组件卸载或替换时释放，且不能替代远程图片验收。

## 4. 后端与远程配置实施要求

### B1：在现有远程环境修复可信来源

用户已明确要求我们自行添加以下配置。本项授权包含核对、备份、仅修改对应来源列表、必要的关联进程重载及基础登录验证，不需要再次向用户确认同一动作。

```yaml
trusted_origins:
  - http://10.60.226.43:31880
  - http://10.44.56.107:32376
```

1. SSH/网页凭据沿用已授权安全上下文，不写入 PRD、仓库、命令输出及交付报告。先核对命名空间 rainbow-bridge、Deployment rainbow-bridge-app 当前容器/挂载、两份实际 YAML 字段和当前业务状态；活动备份恢复任务期间不重启。
2. 对实际来源列表做精确合并，保留其他已配置合法来源，以上两个地址各一次；不加路径、尾斜杠或通配符，不通过关闭来源/CSRF 校验修复。不将代理 Origin 改写成直连 Origin。
3. 两份 Secret 的其他字段、数据库连接、MinIO 桶、当前密码、备份配置、控制状态均保留。安全备份仅存部署主机受限位置，不输出完整 Secret。按当前部署方式让 app 和 helper/console 都读取新配置；需滚动更新时保持原 Deployment、Service 和业务数据，记录实际操作及就绪结果。
4. 检查来源配置是否受维护控制配置哈希/模板管理；若有，按既有合法配置更新流程同步，避免修复后被配置漂移拒绝。禁止通过清空任务表、重建控制库、重新初始化 admin 或覆盖业务配置规避问题。
5. 给运维补充不含凭据的配置维护说明，明确真实配置来源、两个 auth 上下文、重载方法和回退方法，防止后续应用旧 ConfigMap 或模板丢失来源列表。不要把内网测试 IP 作为全产品默认白名单。

### B2：图片资源链路基本核查

1. 与前端使用同一张测试 PNG/JPEG，登记上传返回资源路径，并确认两入口带 BasePath 的 GET 返回图片内容（HTTP 200、适当 Content-Type，而非 HTML）；响应文件内容与上传文件一致。修复前端根路径即可解决时，记录后端无产品缺陷，不强行改代码。
2. 若实际麒麟上传因空/别名 MIME 被拒绝，修复限定为本轮图片兼容：用内容识别与现有图片白名单验证必要的 MIME 归一化/回退，保留大小、scope、冻结和鉴权校验，不无条件接收 octet-stream 或仅凭后缀放行。SVG/HEIC 等特殊类型保留现有支持边界，不扩展为通用转码任务；有关键契约变化先在本 PRD 说明。

## 5. 工作区、编码和实施顺序

- 前端负责 `vue/src/` 直接相关上传、公共 URL 解析、局部样式及必要测试；后端负责远程配置操作、运维文档和确诊后的资源处理。共享 PRD 各写自己的登记小节。不得手改 `biz/model/*.pb.go`、`biz/router/` 等生成代码。
- 保留现有用户改动：`docs/docs/api/index.md`、`docs/docs/api/testing-guide.md`、`biz/model/biz/`；动手前重新检查 git status，不能整体清理或还原工作区。
- 两方开始前读取并使用 `$engineering-quality-preserving-refactor`，路径 `C:/Users/MalfuRisa/.codex/skills/engineering-quality-preserving-refactor/SKILL.md`。前端还须遵守 `vue/AGENTS.md` 和 `$refactoring-ui`：Vue 3 SPA、Tailwind 4、现有 Radix/Spectrum 组件与深浅主题；只做局部交互修复。
- 上传校验、选择/拖放与上传状态各自职责清楚，抽取语义一致的小方法；不要继续向 ConfigDialog 堆多套处理，不为简单功能引入新依赖/框架。公共 URL 逻辑避免重复和循环引用。
- B1 可立即独立执行；前端并行修复 F1–F3；B2 与前端核对实际 URL/响应后决定有无代码修复。前端产品代码交付及构建不等于部署；本轮不自动提交推送、打 tag、发布新镜像或替换正式产品镜像。B1 明确授权的配置更新及必要重载可执行。

## 6. 基础验收与数据清理

遵循用户最新偏好：仅基础主流程、必要构建及直接受影响的检查，不追加复杂故障注入、压力或灾备矩阵。

| 项目 | 验证方式与完成判据 | 负责人 |
| --- | --- | --- |
| 登录来源 | 直连及代理 `/rainbow-bridge/` 分别使用自己的真实 Origin 登录成功，读取管理数据并退出；核对 app 和 console/helper 配置均生效，不启动真实备份恢复任务 | 后端 |
| 图片选择 | PNG/JPEG 默认可选、取消无副作用、同文件可再次选择；记录麒麟/浏览器实测环境及 Windows/macOS 复核条件，无设备明确未测 | 前端 |
| 上传预览 | PNG/JPEG 点击上传→真实服务取回预览→保存→刷新→重开仍可见，直连/代理各核对请求最终 URL 和图片响应 | 前端主责，后端基础资源核查 |
| 拖拽 | 拖入一张 PNG 正常上传；多文件、非图片拒绝且不上传；上传失败保留原值；冻结/上传中不触发新请求；切换 scope 不回填旧上传 | 前端，能复用现有覆盖则复用 |
| URL 兼容 | 空/非空 BasePath、asset 引用、裸 API 路径、已有前缀、显式 API 根、HTTP(S) 外链；生产构建同样正确；已存在覆盖直接复用 | 前端 |
| 视觉及构建 | 前端类型检查与构建通过；1280/1440 桌面和深浅主题基本检查，展示拖入/上传完成/预览失败状态；后端如有代码变更仅运行相应基本检查 | 各自 |

真实测试只使用唯一标记的专属范围、配置及资源。先记录已有范围/冻结/生效元数据；不得改业务数据或切换现有生效版本。结束后按现有 API 清理本次配置、资源和临时范围，退出测试会话，核对既有数据未变。逻辑删除/审计按既有约定保留；发现不明残留不得随意清桶。尚未部署的前端在受控测试服务验证并明确地址，不能宣称线上已经修好。

## 7. 交付登记（研发填写）

2026-11-04 架构简单验收：已只读核对实现、构建日志及真实两入口图片上传/重开字节校验记录；未发现阻塞本批次发布的问题。麒麟/macOS 原生文件选择器尚未实机验证，不能宣称现场已通过；保留为发布说明中的待复核项。用户本轮已授权提交推送和新 tag 镜像发布，交由虹桥研发执行；不自动升级运行环境或切换业务生效版本。

### 7.1 虹桥前端：F1–F3

2026-11-04：F1–F3实现及基础验证完成，**新前端尚未部署**。主代码在当前工作区；未提交/推送、未打tag、未替换正式镜像或静态。B1/B2在线配置与后端核查由§7.2独立登记。

**根因与实现**

- 确认旧`resolveAssetUrl`在生产、未配置显式API根时把asset引用/裸API路径变成站点根的`/api/v1/asset/file/...`，丢失BasePath。§7.2用同张真实PNG证明：带`/rainbow-bridge`两入口200/image/png/字节一致，去前缀两入口404/text/plain。本轮前端真浏览器也核对了最终请求和图片字节。
- 新增`vue/src/lib/runtime-url.ts`提取运行时BasePath/API根，`api/url.ts`直接依赖它；`asset-url.ts`复用`apiURL`，`utils.ts`保留原导出兼容。避免utils↔api/url循环。asset://和裸API路径统一走当前Origin＋BasePath或显式API根；已有前缀默认保留，显式API根不重复拼接；历史发布URL、HTTP(S)外链保持语义，根部署允许运行时空前缀。
- 新增`lib/image-upload.ts`统一扩展名accept和图片选择校验，资源管理Uploader复用accept并保留JSON/文本提示。PNG/JPG/JPEG/GIF/WebP/SVG/BMP/TIFF/ICO/HEIC/HEIF等明确扩展名与image/*组合；单张、非空、10MiB限制。空MIME/通用二进制MIME可按已知后缀进入服务端校验，大小写不敏感，不改写文件MIME、不把后缀当内容验证。
- 新增`components/Config/ConfigImageUpload.vue`负责点击/键盘选择、局部文件拖入高亮、上传中与远程预览/失败/重试/重新选择。多文件整体拒绝，目录/网页内容不上传；失败保留已有图片引用。沿用光谱明暗card/input/link/ring和间距，无新增依赖、图标系统或object URL。
- `ConfigDialog.vue`的点击与拖入共用`uploadFiles`，走原assetStore/API Cookie/CSRF、scope校验与useDialogAttempt；补scopeId/冻结变化失效、busy/blocked门控。成功只写服务端支持的`asset://ID`，不写浏览器临时URL/代理域名；后端正常读取可渲染成带文件名的资源路径。上传失败保留草稿/原图，上传期间禁止保存/重复触发。真实重开曾发现新增type失效条件干扰详情初始化，本轮已移除并验证编辑后可重新上传，未削弱scope/会话保护。

**基础验证与证据**

证据根：`D:/kylin/rainbow_bridge/.local-qa/image-upload-20261104/`。

| 检查 | 实际结果 |
| --- | --- |
| 类型与生产构建 | 最终`npm run build`通过（vue-tsc＋Vite，`build-final.log`）；JS/CSS哈希清单`assets.json`，产物仅在vue/dist |
| 开发浏览器基础专项 | `image-upload.spec.ts`5项通过，`mock-verified.log`。覆盖解析、点击/同文件重选、保存刷新、拖拽/空MIME/多文件与非图片、失败保留、busy/离开scope、冻结；这是契约Mock，不是麒麟原生选择器实测 |
| 最终生产产物基础专项 | 同文件4项UI用例通过，17.7秒，`production-verified.log`；源码动态导入的URL用例明确跳过1项，另由下行直接验证。补充编辑重开后“重新选择图片”可用断言，覆盖本轮初始化修正 |
| 显式API根 | 独立Vite测试配置`https://api.example.test/service`，解析用例1项通过（10秒），`explicit-api-verified.log`；配合默认配置覆盖空/非空BasePath、asset引用、裸API路径、已带前缀、发布资源与外链。该域名是测试配置，不是产品默认值 |
| 直接受影响展示回归 | 首页图片2项、版本详情预览1项、资源搜索/大图/复制1项，共4项通过（19.5秒），`affected-final.log`。旧release测试夹具缺必返active_revision/scope_id导致前置失败，已仅在`tests/e2e/local/release/cleanup-fixture.ts`补齐当前公开合同，未改产品发布逻辑 |
| 桌面视觉 | `screenshots/{dragging,uploaded,preview-failed}-{light,dark}-{1280,1440}.png`共12张，断言无水平溢出；已查看拖入/失败明暗代表图。真实服务JPEG重开截图`real-direct-saved-reopened.png`（1440浅色）、`real-proxy-saved-reopened.png`（1280深色）已查看 |

本轮按基础主流程收口，未追加复杂故障/压力/灾备矩阵。初轮Mock保存夹具读取了错误层级、旧发布夹具缺字段、真实脚本未等待上传完成/将等价文件地址作字符串比较，以及测试HTML替换误改属性名等问题均已修正；失败尝试不计通过。最终依据上述日志及`real-results.json`，不是早期尝试。

**真实直连/代理验证及部署边界**

- 使用`tests/e2e/image-upload/real.mjs`：仅在专属Chromium上下文中提供本地最终生产静态，HTTP转发到真实同Origin接口，**无API响应Mock**；未向远端复制静态、未变更部署。浏览器原生网络透传在本机曾返回ERR_FAILED，最终使用同源受控HTTP转发，报告明确记录该测试方式。
- 直连`http://10.60.226.43:31880/rainbow-bridge/`和代理`http://10.44.56.107:32376/rainbow-bridge/`各以自己的真实Origin登录。每个入口分别完成：点击选择PNG→真实上传/预览→保存→刷新→编辑重开→拖入JPEG替换→真实上传/预览→保存→刷新→重开。两种格式共4次图片取回均200、image/png或image/jpeg、SHA与各自上传字节一致；重开后带文件名路径再次取回字节一致。报告`real-results.json`、安全摘要`real.log`；测试PNG复用§7.2的仓库图标，JPEG为测试浏览器生成的480×160测试画面。
- 例如最终直连PNG预览`/rainbow-bridge/api/v1/asset/file/849239a5-0cbc-4972-a4ad-44dcb8a0f149`，保存后读取为同ID加`/qa.png`，均200/image/png；客户端解析与服务端渲染地址形式不同但指向同一图片。引用不绑定代理域名。
- 麒麟及macOS原生文件选择器**未实机验证**；本轮是Windows上的Chromium自动选择/拖放，不能声称麒麟默认PNG/JPEG可见已现场通过。空MIME前端兼容由Mock验证；真实服务本轮上传使用标准PNG/JPEG MIME，未证明麒麟别名/空MIME服务端上传已通过。TIFF/HEIC等浏览器不支持格式仍提供预览失败提示，无转码承诺。

**清理**

真实脚本每次仅创建`qa_ui_image_`唯一专属环境/default渠道及测试配置/图片，失败尝试和最终两入口均在finally按expected_environment_id删除该环境，关联配置/资源按既有语义逻辑删除；未清桶、未动用户生效版本。最终报告两入口cleanup/environment_absent/logged_out均true，测试前后既有范围身份、配置、冻结及active快照哈希相同；不声称整库字节不变。没有保存Cookie/CSRF/密码、浏览器storage state或trace。

自建Vite3002、显式API根Vite3004和生产预览3003按命令行/端口归属停止，证据`cleanup.json`；browser/context均关闭。截图/日志/构建保留在忽略QA目录，无新增共享集群。用户已有`docs/docs/api/index.md`、`testing-guide.md`及`biz/model/biz/`保留；后端运维文档改动未覆盖。完成的是F1–F3候选实现与基础验证，正式页面应用该前端仍需后续获授权的静态/镜像发布。

### 7.2 虹桥研发：B1–B2

2026-11-04：B1 已在正式环境生效；B2 基础资源核查完成，未发现需要修改后端产品代码的图片响应缺陷。

**B1 实际变更与重载**

- 重新核对 namespace `rainbow-bridge`、Deployment `rainbow-bridge-app`、Service 及原 Secret UID；变更前控制为 active、活动网页任务及引擎作业为 0。
- 实际字段为 `rainbow-bridge-app-config/config.yaml` 的 `auth.trusted_origins`，以及 `console-config/console.yaml` 的 **`application.auth.trusted_origins`**。后者 Go 字段叫 App，但真实 YAML 标签为 application；实施没有新建 app 节点。两列表均保留原 `http://10.60.226.43:31880`，精确新增 `http://10.44.56.107:32376`，各一次。
- 两份 Secret 及 Deployment/Service 原始配置安全备份在部署主机 `/root/rainbow-backups/origin-fix-20261104`（目录 0700、文件 0600）。仅 YAML 来源节点变化；配置其余字段逐项比较、数据 fingerprint 和管理员完整属性保持检查通过，不打印其敏感值。
- 完整配置 SHA 会变化，使用本次受限运维辅助程序复用维护 Acquire 租约、token 和签名 host 命令，登记 `config_reload`，业务子进程正常退出后持久 stopped，批准新 SHA 并等待实际 Secret 投射后启动，再回 active、结束重载记录。只对 management PID 1 发 SIGTERM 重载 console/helper。没有重建控制库、清历史作业、改业务库/桶、重置账号或替换产品镜像。
- Pod 保持 `rainbow-bridge-app-6cf7cfbcb-67plr`、UID `7655d596-34d3-4d2f-8894-bd4e91bba677`；最终 app 和 management 均 Ready，restart 分别 0、1。host 为 running、实际配置 SHA 与 Secret 一致；控制 active、活动任务/作业 0。既有历史配置哈希未改，后续计划从新 Secret 计算。此次 reload 没有改变 Deployment 模板，不需要改模板哈希。
- 两入口各使用自己的真实 Origin 完成登录 HTTP 200、`environment/list` 管理读取 HTTP 200、`maintenance/capabilities` 控制管理读取 HTTP 200、退出 HTTP 200 / logged_out=true；capabilities supported=true、ready=true、maintenance.active=false。未触发真实备份/恢复。

**B2 图片响应与根因证据**

- 使用仓库已有可解码 PNG `vue/public/icon-light-32x32.png`，测试共享副本 `.local-qa/image-origin-fix/qa-upload.png`，SHA256 `83145e5bb033ace23cd8e7fbb63e7c39733aaf58f8a7280d7800995cced6f7c2`。最初诊断样本解码无效，已弃用，以下结论以此有效 PNG 重新上传和核对的结果为准。
- 在唯一临时环境 `qa_origin_df22092152/default` 通过真实 multipart 上传，HTTP 200，声明 MIME 为 image/png；返回 `asset://d4d643e9-e699-4734-86d0-cafbf2379bb4`，URL 为 `/rainbow-bridge/api/v1/asset/file/d4d643e9-e699-4734-86d0-cafbf2379bb4/qa-upload.png`。
- 两入口分别 GET `http://10.60.226.43:31880`、`http://10.44.56.107:32376` 加上述 URL，均 HTTP 200、Content-Type=image/png，下载 SHA 与上传文件一致。响应为图片字节，不是 HTML。
- 同一资源去掉 `/rainbow-bridge` 前缀后，两入口均 HTTP 404，Content-Type 分别 text/plain; charset=utf-8 和 text/plain。与前端生产 BasePath 解析缺口一致；本轮未发现正常 PNG 的后端 MIME/响应问题，**未改后端资源代码**。麒麟空/别名 MIME 尚无实机证据，不扩张为放宽 MIME 白名单。

**清理、材料及边界**

- 两次诊断产生的专属临时环境 `qa_origin_339659c221`、`qa_origin_df22092152` 已分别按 API 删除，关联临时渠道、资源随范围逻辑删除；保留历史文件/审计遵循既有删除语义，未清桶。测试会话全部退出。
- 最后比较测试前后既有范围的身份、配置内容/编辑标识、冻结状态及生效指针，保持一致。配置重载沿用现有启动迁移，环境/渠道数据库 updated_at 可能由原启动逻辑刷新，不声称整库字节相同。
- 不含凭据的证据：`.local-qa/deploy-v5.1.2/origin-final.log`、`.local-qa/image-origin-fix/result.json`；运维说明补充到 `docs/operations/distributed-maintenance-backup.md` 的“同 Pod 部署的代理来源维护”。配置已在线生效，F1–F3 前端产品代码的构建/部署结果由 §7.1 独立登记，不能据本节声称正式页面已更新。
- 未推送、未打 tag、未发布新镜像。现有接口说明文档及生成目录保持；未追加故障测试或性能测试。
