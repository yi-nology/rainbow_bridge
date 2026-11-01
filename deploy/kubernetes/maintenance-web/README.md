# 独立网页维护控制面

模板只作新部署/独占验证，含占位符，不可原样应用到现有正式namespace。正式入口切换需要另行授权。SQLite与旧CLI模式不启用web_enabled，不改变账号存储。

同版构建四个入口：根业务应用、`cmd/maintenance-console`、`cmd/maintenance-backup`、`cmd/maintenance-gateway`；console镜像包含同版Vue静态包，gateway保持同一外部URL/BasePath。默认模板使用固定digest正式构建产物；experimental_artifact_dir仅用于rb-web实验namespace挂载明确候选产物，生产留空。没有定时任务。

部署顺序：

1. 准备独占PG应用角色、维护角色、只读guard角色、独立control DB和三个MinIO桶，参见[CLI说明](../../../docs/operations/distributed-maintenance-backup.md)。预先显式bootstrap控制实例。
2. 分配下表角色与Secret，应用配置保留原distributed guard，并增加web_enabled=true和auth_dsn。全应用停服、专用应用PG角色NOLOGIN且零会话后，运行auth-init模板。source-config使用可读当前auth_users及pg_roles/pg_stat_activity的独立部署连接，不使用已被NOLOGIN的应用身份。迁移原账号/hash/disabled/version，清会话，控制marker同事务提交；存在不一致账号拒绝覆盖。日常登录不运行迁移。
3. 撤除init凭据，给运行身份下列最小授权；恢复专用应用角色LOGIN，安装同版业务Pod、console、executor RBAC及gateway模板。各Pod的/ping必须声明control-v1认证权威，旧认证Pod不可混用。业务Secret整目录挂载，不能subPath。
4. 先独立URL验证静态、登录、任务、两业务Pod停服与重新登录，再按审批更换正式入口。console/gateway不能属于引擎停服allowlist，不能共用业务selector。

| 身份 | 权限与隔离 |
| --- | --- |
| AUTH_OWNER（NOLOGIN，init SET ROLE使用） | 控制库auth_users/auth_sessions、rb_auth_authority及rb_web表的所有者；仅init身份可SET ROLE。需rb_maintenance_instance REFERENCES/SELECT；服务启动不持有该身份 |
| AUTH | auth_users SELECT/UPDATE，auth_sessions SELECT/INSERT/UPDATE/DELETE及其sequence USAGE；rb_auth_authority/rb_maintenance_instance SELECT；rb_web_task SELECT（仅用于改密与已受理任务互斥）。不能写operation/backup/authority，不能管理候选库/桶/K8s |
| CONSOLE | rb_web_task/outbox/preview/backup/event/result SELECT/INSERT/UPDATE，event sequence USAGE；rb_maintenance_instance/operation/backup只读；auth_users只读id/username/role/disabled/credential_version（不能读hash）；K8s固定namespace Job get/list/create与Pod get，无Deployment/Secret管理权限 |
| WORKER | rb_web_task SELECT/UPDATE、preview/event SELECT/INSERT、web_backup SELECT/INSERT/UPDATE、event sequence USAGE，独立只读控制索引；不含AUTH密码。Job另挂载维护身份Secret，不放入console |
| AUTH_READER | 只读auth_users及rb_auth_authority，供恢复时读取当前权威账号。放operator-config的auth_read_dsn，不复用AUTH会话写身份 |
| ENGINE_OPERATOR | 既有CLI专用权限，另授rb_auth_authority SELECT与UPDATE(session_epoch)，最终恢复事务内提升epoch；不需auth_users写入。K8s executor角色见模板 |
| BUSINESS_GUARD | 只读rb_maintenance_instance，保持原guard权限检查。业务Pod校验管理员用分离AUTH连接，不扩大guard写权限 |

控制DB为专用库；所有身份非超级用户，撤销public schema CREATE与公共DB CONNECT后逐角色授CONNECT/USAGE。角色名来自部署配置，不接受浏览器输入。PG角色隔离并不等于namespace Secret隔离：console进程确实持有AUTH和CONSOLE两份专用连接，但不持有engine credentials。K8s的Job create权限本质是namespace级，RBAC不能按label保证只创建某模板；应给console独占namespace，配合受控部署/审计，不能声称标签提供RBAC沙箱。

`console-config`含CONSOLE＋AUTH；`web-worker-config/worker.yaml`使用同样实例/固定Job字段但task-only WORKER连接，application.auth_dsn填非secret占位值（worker不创建认证服务）；`operator-config`含CLI凭据及AUTH_READER。Job Never/backoff0/parallelism1/completions1、无TTL，Downward API身份、2h deadline由服务固定生成，客户端不能传镜像/命令/挂载/DSN等。create响应丢失按确定Job名和归属核对，不盲建新Job。

持久受理/outbox仅负责已受理请求的对账；控制服务重启不取消Job或解除维护。任务GET安全投影不返回原Plan/Data、DSN、桶定位、Secret或原始日志。正常网页admin不需SSH；极端控制PG/K8s不可用仍需基础设施恢复，不承诺网页能修复基础设施。

结果Cookie为HttpOnly、同站点、任务路径限定，服务端再校验operation/账号/凭据版本，最多2h且终态15min，仅GET对应task；不能列表、resume/abort或登录。恢复提升独立epoch使正常/维护会话失效；登出撤销本会话的结果授权，改密/停用由当前权威版本即时拒绝。Cookie不能通过UUID匿名申请。

回退部署不能直接把认证切回旧业务表。必须另开受控停服窗口，禁止登录与所有认证写入，将**控制库当前**账号单向导出到目标旧表、逐字段核对hash/disabled/version、清空所有会话与结果授权，确认所有Pod和gateway统一切换后再开放。此流程需独立部署身份，不向网页提供“回退认证权威”按钮；本批未自动执行此类回滚。业务恢复的abort仍走引擎新代次切回原库，和部署认证回退不同。

实验资源保留到前端确认集成结束，再按namespace UID、instance标记、DB/角色注释、精确桶/attempt清单清理；不FLUSH共享Redis，不删除正式业务资源。清理结果和未测边界记录在PRD §11.7。
