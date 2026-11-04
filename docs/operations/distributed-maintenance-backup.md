# 多 Pod 手动维护备份

此模式供 PostgreSQL＋MinIO＋Redis 的 Kubernetes 部署使用。操作期间全部应用停服；网页不提供执行入口。默认关闭，不影响原 SQLite 备份。先在独立环境核验，不能直接将本轮实验配置用于生产。

## 准备

构建 `go build -o maintenance-backup ./cmd/maintenance-backup`。应用和工具必须配套使用当前候选代码，固定镜像 digest。配置使用完整 Secret 目录挂载，禁止 subPath；Secret 的 `config.yaml` 包含应用完整配置。所有写入者必须属于明确的 Deployment allowlist，暂停外部调谐器；无法证明没有其他写入者时不得执行。

独立控制 PostgreSQL 数据库中持久保存实例、作业和备份索引。固定 instance UUID；应用业务角色独占、非超级用户、无 CREATEDB/CREATEROLE/复制或其他角色继承；角色注释为 `rainbow-maintenance:<instance UUID>`。维护角色独占、非超级用户、有 CREATEDB/CREATEROLE、控制库所有权及管理应用角色的权限，同样加归属注释。应用另用只读角色，仅授控制库 CONNECT、public USAGE、`rb_maintenance_instance` SELECT；不得授表写入或 schema CREATE。

应用配置增加：

```yaml
backup:
  distributed:
    enabled: true
    control_dsn: "postgres://CONTROL_READER:SECRET@PG:5432/CONTROL_DB"
    instance_id: "FIXED_INSTANCE_UUID"
    generation: 1
    session_generation: 1
```

维护工具配置（独立 Secret，应用不可读取）：

```yaml
instance_id: "FIXED_INSTANCE_UUID"
control_dsn: "postgres://OPERATOR:SECRET@PG:5432/CONTROL_DB"
admin_dsn: "postgres://OPERATOR:SECRET@PG:5432/postgres"
application_role: rainbow_app
namespace: rainbow-lab
config_secret: app-config
config_secret_uid: "ACTUAL_SECRET_UID"
workloads:
  - name: rainbow-app
    uid: "ACTUAL_DEPLOYMENT_UID"
no_unmanaged_writers: true
backup_bucket: rainbow-backups
minio:
  endpoint: "MINIO:9000"
  access_key: "DEDICATED_OPERATOR_KEY"
  secret_key: "SECRET"
  use_ssl: false
stop_timeout: 5m
stream_timeout: 30m
start_timeout: 5m
```

MinIO 原始桶、快照桶、备份桶必须独立。应用只能访问业务桶；维护凭据允许读取原始/快照对象、读写备份桶及创建本 instance 的 `rb-r-<去横线UUID>-*` 候选桶。备份桶不得设生命周期删除策略。不得复用生产管理员或其他实例凭据。工具单对象限32MiB、单逻辑行8MiB、对象清单100000项，超限明确失败。

Kubernetes ServiceAccount 只授目标 namespace 的 Deployment get/update、ReplicaSet get、Pod get/list/watch、pods/proxy get、Secret get/create/update、Job/CronJob/HPA get/list；不需 cluster-admin。工具使用 ServiceAccount 默认 token/CA，也可通过 `kubernetes.server/token_file/ca_file` 指定可验证 HTTPS 连接。Job 设置 restartPolicy Never、backoffLimit 0、parallelism/completions 1，不设自动 TTL 删除。通过 Downward API 传 `RB_MAINTENANCE_POD=metadata.name`、`RB_MAINTENANCE_POD_UID=metadata.uid`。保留退出 Pod，接续须证明旧进程已退出。

## 执行

以下命令参数中的 UUID、指纹取真实输出；写命令在上述独占 Job 中运行。首次应用接入前，由维护身份显式运行一次 `--action bootstrap --app-config config.yaml --confirm INSTANCE_UUID` 建控制表，再授只读控制权限；不覆盖已有实例。

```sh
maintenance-backup --config maintenance.yaml --action plan
maintenance-backup --config maintenance.yaml --action backup --request-id REQUEST_UUID --confirm PLAN_FINGERPRINT
maintenance-backup --config maintenance.yaml --action verify --backup-id BACKUP_UUID
maintenance-backup --config maintenance.yaml --action restore-plan --backup-id BACKUP_UUID
maintenance-backup --config maintenance.yaml --action restore --backup-id BACKUP_UUID --request-id NEW_REQUEST_UUID --confirm RESTORE_PLAN_FINGERPRINT
maintenance-backup --config maintenance.yaml --action status --request-id REQUEST_UUID
maintenance-backup --config maintenance.yaml --action resume --request-id REQUEST_UUID --confirm ORIGINAL_PLAN_FINGERPRINT
maintenance-backup --config maintenance.yaml --action abort --request-id REQUEST_UUID --confirm ORIGINAL_PLAN_FINGERPRINT
```

同一操作保持 request-id 和确认指纹不变。CLI 超时/丢锁/被杀不会解除维护；先查看 status，证明旧 Job 已退出后用新 Job resume。Pod 失联、停止证明缺失、未知配置变化时保持维护，不能强删 Pod 来伪造安全停止。控制库不可用时应用拒绝写入与就绪。

恢复只导入编译时允许的业务表和对象，不执行备份 SQL。恢复到新库、新原始桶和新快照桶，检查态不 Ready、不开放写入；逐表逐列、对象大小/SHA、运行时与 ZIP 检查后才提交 active。保留目标当前管理员，清空会话，提升会话与缓存代次；版本编号取当前、备份和历史上界。

最终开放写入前可 abort，回原连接但 generation 继续递增；已完成恢复后拒绝自动退库。旧库、旧桶和中断候选均保留，工具不自动删除。当前批次不提供备份删除、旧代回收、定时或增量。人工清理必须对照控制记录的精确 DB、bucket、attempt prefix、原配置 Secret 归属和当前工作负载引用，确认没有运行作业及引用后逐项处理；不得按通配符删除、不得删原生产桶或 FLUSH Redis。控制记录和可用备份应独立留存。

## 同 Pod 部署的代理来源维护（2026-11-04）

本节对应正式实例 `rainbow-bridge/rainbow-bridge-app` 的 business-host + maintenance-helper 部署。可信来源是浏览器访问入口的协议、主机、端口，不含路径或尾斜杠；Nginx upstream 只定义上游，并不会把浏览器 Origin 改成上游地址。

### 实际配置来源

| 容器 / 挂载 | Secret 与键 | 来源字段 |
| --- | --- | --- |
| app，`/app-config/config.yaml` | `rainbow-bridge-app-config` / `config.yaml` | `auth.trusted_origins` |
| management，`/console/console.yaml` | `console-config` / `console.yaml` | **`application.auth.trusted_origins`** |

console 的 Go 字段名为 `App`，YAML 标签实际是 `application`；修改前应读取实际 YAML 确认，不能写成新增的 `app` 节点。旧 `rainbow-bridge-config` ConfigMap 已不是这两个进程的运行配置。当前配置以这两份 Secret 为准，后续更新部署材料时也要保留已合并的来源；接入时一次性使用的旧渲染脚本/旧 ConfigMap 不应覆盖当前 Secret。

此次两个列表均精确合并以下来源，其他既有来源和配置字段保留。这是本部署配置，不是产品默认白名单：

```yaml
trusted_origins:
  - http://10.60.226.43:31880
  - http://10.44.56.107:32376
```

代理页面入口是 `http://10.44.56.107:32376/rainbow-bridge/`；该主机根路径属于其他平台。

### 修改与重载

1. 核对实例、Deployment、Service、Secret UID 和挂载。控制实例应为 active，无活动网页任务、引擎作业或维护 Job；先在部署主机受限目录保存两份 Secret 和当前 Deployment/Service，文件 0600、目录 0700。完整配置只在受限主机处理。
2. 用 YAML 节点只合并来源列表，保留其他字段，并使用当前 resourceVersion 更新原 Secret，保持 UID。配置前后数据连接 fingerprint、generation、session generation 不变；账号与密码保持原值。
3. 来源虽然不影响数据 fingerprint，却会改变完整配置 SHA。business-host 运行中的子进程读取的是启动时的私有配置副本，单独更新 Secret 不会热更新鉴权。应通过维护租约及受认证 host 命令进入 draining，等待实际退出码 0 和 stopped 记录，再进入 checking、批准新配置 SHA；实际投射文件匹配后启动固定业务子进程，确认 running 和 SHA 一致才回 active，结束对应配置重载记录。
4. console/helper 在启动时加载来源，需要在其配置投射完成后向 **management 容器** PID 1 发送 SIGTERM，由现有重启策略重新启动。app 的 host、Pod、Service 和产品镜像可保持不变。等待 helper 与 app Ready，再以两个真实 Origin 分别登录，读取业务管理列表及 maintenance capabilities，最后退出。此流程无需执行备份或恢复。
5. 旧预览基于旧配置 SHA，更新后重新生成计划；历史作业的配置哈希和模板记录按原值保留。当前 CLI 没有通用的 `reload-config` 命令；本次使用受限运维辅助程序复用维护租约、fencing token 和 host 签名协议完成配置重载，未增加产品接口。不要用直接删除 Pod 的方式代替退出证明。

此次私密原始备份与重载 checkpoint 位于部署主机 `/root/rainbow-backups/origin-fix-20261104`；受限辅助程序为 `/root/rainbow-backups/deploy-v512-20261101/origin-fix`，用于此次已记录变更，不应重复执行 apply。完成时同一 Pod 两容器 Ready，app restart=0、management restart=1，业务配置 SHA 与 Secret 一致，控制实例 active，无活动任务。

### 回退方法

来源回退只恢复此前的来源列表：在无活动维护任务时，从受限备份提取原 `trusted_origins`，合并到**当前**配置节点，核对其他字段与当前数据身份仍相同，使用当前 resourceVersion 更新原 Secret；随后按上述受控停止、批准新 SHA、启动及 helper 重载流程生效。每次变更使用独立备份和重载操作标识。不要整体覆盖旧 Secret、回滚业务数据库、重置管理员或沿用旧操作 token。若身份/配置已被后续恢复改变，先重新核对当前配置，不套用此次原始快照。本次未执行回退。
