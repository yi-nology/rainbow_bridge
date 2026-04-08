# Kubernetes 部署指南

本目录提供了 Rainbow Bridge 的 Kubernetes 部署方案，适用于不同规模的生产环境。

## 目录结构

```
kubernetes/
├── standalone/        # 单机版（SQLite）
└── pgsql-minio/       # PostgreSQL + MinIO 版
```

## 部署方案对比

| 方案 | 数据库 | 存储 | 适用场景 |
|------|--------|------|----------|
| `standalone` | SQLite | PV | 简单部署、测试环境 |
| `pgsql-minio` | PostgreSQL | MinIO | 生产环境、多副本 |

## 前提条件

- Kubernetes 集群（1.19+）
- kubectl 命令行工具
- 集群中已配置存储类（StorageClass）

## 快速开始

### 使用统一部署脚本（推荐）

```bash
# 回到 deploy 目录
cd ..

# 运行交互式部署脚本
./deploy.sh
```

### 直接使用特定方案

#### Standalone 方案

```bash
# 进入 standalone 目录
cd standalone

# 部署到默认命名空间
./deploy.sh

# 部署到指定命名空间
./deploy.sh -n production

# 查看部署状态
kubectl get pods

# 访问服务（需要端口转发）
kubectl port-forward service/rainbow-bridge 80:80
```

#### PostgreSQL + MinIO 方案

```bash
# 进入 pgsql-minio 目录
cd pgsql-minio

# 部署到默认命名空间
./deploy.sh

# 部署到指定命名空间
./deploy.sh -n production

# 查看部署状态
kubectl get pods

# 访问服务（需要端口转发）
kubectl port-forward service/rainbow-bridge 80:80

# 访问 MinIO 控制台（需要端口转发）
kubectl port-forward service/minio 9001:9001
```

## 部署脚本说明

每个方案目录都包含以下脚本：

- `deploy.sh`：部署服务
- `destroy.sh`：销毁服务
- `restart.sh`：重启服务

### 脚本参数

```bash
# 部署到指定命名空间
./deploy.sh -n <namespace>

# 销毁指定命名空间中的服务
./destroy.sh -n <namespace>

# 重启指定命名空间中的服务
./restart.sh -n <namespace>
```

## 配置说明

### Standalone 方案

- **数据库**：SQLite，存储在持久卷中
- **存储**：使用 Kubernetes 持久卷（PV）
- **资源请求**：
  - CPU：100m
  - 内存：256Mi
- **资源限制**：
  - CPU：500m
  - 内存：512Mi

### PostgreSQL + MinIO 方案

- **数据库**：PostgreSQL 16
- **存储**：MinIO 对象存储
- **PostgreSQL 资源**：
  - CPU：100m
  - 内存：256Mi
- **MinIO 资源**：
  - CPU：100m
  - 内存：256Mi
- **Rainbow Bridge 资源**：
  - CPU：100m
  - 内存：256Mi

## 环境变量

### Standalone 方案

| 变量名 | 描述 | 值 |
|--------|------|-----|
| `GIN_MODE` | Gin 运行模式 | `release` |

### PostgreSQL + MinIO 方案

| 变量名 | 描述 | 值 |
|--------|------|-----|
| `GIN_MODE` | Gin 运行模式 | `release` |
| `DATABASE_TYPE` | 数据库类型 | `postgres` |
| `DATABASE_HOST` | 数据库主机 | `postgres` |
| `DATABASE_PORT` | 数据库端口 | `5432` |
| `DATABASE_NAME` | 数据库名 | `rainbow_bridge` |
| `DATABASE_USER` | 数据库用户 | `rainbow_bridge` |
| `DATABASE_PASSWORD` | 数据库密码 | `rainbow_bridge_pass` |
| `STORAGE_TYPE` | 存储类型 | `minio` |
| `MINIO_ENDPOINT` | MinIO 端点 | `minio:9000` |
| `MINIO_ACCESS_KEY` | MinIO 访问密钥 | `minioadmin` |
| `MINIO_SECRET_KEY` | MinIO 秘密密钥 | `minioadmin123` |
| `MINIO_BUCKET` | MinIO 存储桶 | `rainbow-bridge` |

## 访问方式

### 端口转发

```bash
# 访问 Rainbow Bridge
kubectl port-forward service/rainbow-bridge 80:80 -n <namespace>

# 访问 MinIO 控制台（仅 pgsql-minio 方案）
kubectl port-forward service/minio 9001:9001 -n <namespace>
```

### Ingress 配置

对于生产环境，建议配置 Ingress 资源：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rainbow-bridge-ingress
  namespace: <namespace>
spec:
  rules:
  - host: rainbow-bridge.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: rainbow-bridge
            port:
              number: 80
```

## 数据备份

### PostgreSQL

```bash
# 进入 PostgreSQL Pod
kubectl exec -it $(kubectl get pods -n <namespace> -l app=postgres -o name) -n <namespace> -- bash

# 执行备份
pg_dump -U rainbow_bridge rainbow_bridge > /tmp/backup.sql

# 复制备份文件到本地
kubectl cp $(kubectl get pods -n <namespace> -l app=postgres -o name) -n <namespace>:/tmp/backup.sql ./backup.sql
```

### MinIO

```bash
# 使用 mc 工具备份
kubectl run mc --image=minio/mc --rm -i --restart=Never -- \
  alias set minio http://minio.<namespace>.svc.cluster.local:9000 minioadmin minioadmin123 && \
  mc mirror minio/rainbow-bridge /tmp/backup && \
  tar czf /tmp/backup.tar.gz /tmp/backup

# 复制备份文件到本地
kubectl cp mc:/tmp/backup.tar.gz ./minio-backup.tar.gz
```

## 常见问题

### 持久卷创建失败

确保集群中已配置存储类（StorageClass），并在 `*-pvc.yaml` 文件中指定正确的存储类：

```yaml
spec:
  storageClassName: standard  # 修改为集群中可用的存储类
```

### 服务访问超时

检查 Pod 状态和日志：

```bash
# 查看 Pod 状态
kubectl get pods -n <namespace>

# 查看 Pod 日志
kubectl logs <pod-name> -n <namespace>

# 查看服务状态
kubectl get services -n <namespace>
```

### 资源不足

根据实际需求调整部署文件中的资源请求和限制：

```yaml
resources:
  requests:
    cpu: 200m
    memory: 512Mi
  limits:
    cpu: 1
    memory: 1Gi
```

## 高可用配置

### 多副本部署

修改 `rainbow-bridge-deployment.yaml` 文件中的副本数：

```yaml
spec:
  replicas: 3  # 增加副本数
```

### 水平自动缩放

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: rainbow-bridge-hpa
  namespace: <namespace>
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: rainbow-bridge
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## 升级指南

1. **备份数据**（参见数据备份部分）

2. **更新部署文件**：
   ```bash
   # 修改镜像版本或配置
   kubectl apply -f rainbow-bridge-deployment.yaml -n <namespace>
   ```

3. **查看升级状态**：
   ```bash
   kubectl rollout status deployment rainbow-bridge -n <namespace>
   ```

4. **回滚（如果需要）**：
   ```bash
   kubectl rollout undo deployment rainbow-bridge -n <namespace>
   ```
