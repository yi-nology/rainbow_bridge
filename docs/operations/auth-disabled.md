# 联调实例临时免鉴权

只有显式配置 `auth.enabled: false` 才关闭对外管理鉴权；缺省或 true 保持原管理员会话机制。发行示例不默认关闭。

关闭后第三方直接请求管理接口，不需 Cookie、Authorization、CSRF 或 Origin，也不需先调用 auth/me。错误旧凭据不影响请求。服务器记录操作者 `anonymous-admin`（ID 0），不新建账号。范围身份、冻结、编辑/生效 revision、request_id、发布及恢复确认、维护状态仍按原规则检查。内部 IPC、Kubernetes 和数据库权限保持。

```bash
curl "$RAINBOW_BASE/api/v1/environment/list"
```

`RAINBOW_BASE` 包含 `/rainbow-bridge` 等部署前缀，不含 `/api/v1`。写请求照常传 JSON 和业务参数。网页 auth/me 返回 auth_enabled=false、临时用户、session=null、空 csrf_token；维护态返回真实 access_scope/operation。登录/改密等凭据工具保留原密码语义，网页免鉴权模式隐藏这些入口。

同 Pod 部署两处都应修改：

| Secret / 键 | 字段 |
| --- | --- |
| rainbow-bridge-app-config / config.yaml | auth.enabled |
| console-config / console.yaml | application.auth.enabled |

保留其他字段、trusted_origins、账号、数据库/桶及数据身份。先无活动维护任务，安全备份当前配置和 Deployment，再按现有维护租约、host 实际退出证明及批准配置 SHA 的流程重载；镜像升级须先停止旧业务子进程并确认退出，不能直接强删 Pod。新镜像的 app 和 helper 均需识别此开关。

恢复鉴权：两处设回 true，按同样流程加载当前配置。原账号/密码和既有会话有效性不变，不重置控制库、session_epoch 或凭据。免鉴权期间没有生成持久会话，刷新网页后恢复原登录流程。回退仅改此字段和必要镜像版本，不整体覆盖后续变化的旧 Secret，不回退业务数据。
