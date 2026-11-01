# 同Pod辅助容器模式（候选实现，未正式接入）

原业务Deployment/Service/URL保留；业务容器PID1运行business-host，固定server子进程监听127.0.0.1:18080。一个management容器运行maintenance-helper，内部复用console与gateway，对外8080。备份/恢复由单次Job执行，只停止业务child，不缩Pod。v5.1.1不含这两个新入口，必须等待同版候选构建/验证；不得修改旧tag。

`pod-sidecar.example.yaml`是针对已核对正式拓扑的待审阅patch，不含Secret或数据库初始化；本轮不得直接应用。原独立服务模板中的console/gateway Deployment/Service不应用于本模式。

先按PRD §13准备独立控制库、唯一认证权威和原数据一致副本。延续§12的数据库/MinIO权限与认证保全步骤，但正式入口不改Service、不创建独立console/gateway。额外新增HOST运行证据身份及host-config/dsn、host-auth/key两份Secret；key至少32随机字节，只给host、helper与固定executor，不能写进前端或日志。

operator/maintenance.yaml增加 `execution_mode: pod_sidecar`、`host_key_file: /host-auth/key`；console.yaml和worker.yaml增加 `execution_mode: pod_sidecar`、`host_secret: host-auth`。三份配置必须一致，默认空值沿用deployment_stop。worker不携带AUTH凭据。HOST只能连接控制库，不能写控制instance/operation/backup/authority，不能管理业务数据库、桶或K8s。

初始化程序显式建立 `pkg/businesshost.Schema` 中的rb_business_run、RLS策略和rb_host_unresolved函数。由受控初始化身份授HOST：控制库CONNECT/public USAGE、rb_maintenance_instance SELECT、rb_business_run SELECT/INSERT/UPDATE、rb_host_unresolved函数EXECUTE；不授schema CREATE或控制状态写。RLS限定Pod UID/host boot；run先于exec登记，只有实际Wait之后才有退出结果。operator必须获`GRANT EXECUTE ON FUNCTION rb_host_unresolved_all(uuid) TO <OPERATOR>`，该可信函数以表owner身份读取全实例未停止run，避免RLS看不见行导致count=0的假证明；缺权限直接拒绝。函数必须由可信表owner持有，固定search_path；PUBLIC不能执行。helper的CONSOLE身份只读run汇总，不拥有HOST写权限。

执行器RBAC中GET业务检查走pods/proxy的get，POST生命周期命令需要pods/proxy的create；它不等于pods create，必须拆开两条资源规则。helper只挂载显式投射的console SA token，host不挂K8s token；Pod级SA不是容器安全边界。executor继续自己的SA和凭据，Job模板只额外挂host-auth密钥。

内部路径19090/v1/command经过K8s认证代理并验证HMAC(method/path/body/time)、实例/Pod UID及控制库当前operation/token；helper再转UDS，host复核。只允许status/stop/start固定动作。受签名保护的/v1/business仅GET ping/runtime用于候选检查，不是外部业务入口；8080明确拒绝内部路径。节点时钟需同步，超过30秒的签名拒绝；不能放宽校验掩盖节点时间问题。当前实验master与worker有约44秒偏差，正式执行器与host的时钟需部署前核对。

Secret必须完整目录挂载。host确认实际文件SHA等于Job指定的批准目标且控制identity匹配后才启动child；等待投射期间helper可用，不能固定sleep后用旧配置启动。IPC/运行配置emptyDir不作为持久证明。旧run未知、非零退出、host在未完成Wait前消失都保持维护；不能按心跳超时、Pod消失、HTTP503或PG连接数0单独清除义务。

首次接入仍需受控停服、保全PG与两个桶的一致副本、原账号一次性认证迁移。成功后当前admin密码保留、旧会话撤销、原业务副本数不变。回退时若认证权威已经生效，先停认证写并受控导出当前权威、撤销会话再统一切换，不能直接rollout undo复活旧密码；已开放新写后不能拿接入前全库备份覆盖。原库桶和控制记录均保留供核对，不自动清理。
