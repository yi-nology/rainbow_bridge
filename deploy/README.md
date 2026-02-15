# Rainbow Bridge 部署指南

本目录提供了 Rainbow Bridge 的多种部署方式，支持从开发测试到生产环境的各种场景。

## 快速开始

```bash
# 交互式部署（推荐）
./deploy.sh

# 或指定命令
./deploy.sh deploy    # 部署
./deploy.sh destroy   # 销毁
./deploy.sh restart   # 重启
./deploy.sh status    # 查看状态
```

## 目录结构

```
deploy/
├── deploy.sh              # 统一部署脚本（交互式）
├── docker-compose/        # Docker Compose 部署方案
│   ├── sqlite/            # SQLite（最简单）
│   ├── mysql/             # MySQL
│   ├── postgres/          # PostgreSQL
│   ├── pgsql-minio/       # PostgreSQL + MinIO
│   └── minio-cluster/     # MinIO 分布式集群
├── kubernetes/            # Kubernetes 部署方案
│   ├── standalone/        # 单机版（SQLite）
│   └── pgsql-minio/       # PostgreSQL + MinIO
└── nginx/                 # Nginx 反向代理配置
```

## 部署方案对比

### Docker Compose 方案

| 方案 | 数据库 | 存储 | 适用场景 |
|------|--------|------|----------|
| `sqlite` | SQLite | 本地文件 | 个人使用、测试环境 |
| `mysql` | MySQL 8.0 | 本地文件 | 中小型生产环境 |
| `postgres` | PostgreSQL 16 | 本地文件 | 大型生产环境 |
| `pgsql-minio` | PostgreSQL 16 | MinIO | 云原生、多实例 |
| `minio-cluster` | PostgreSQL 16 | MinIO 4节点集群 | 企业级高可用 |

### Kubernetes 方案

| 方案 | 数据库 | 存储 | 适用场景 |
|------|--------|------|----------|
| `standalone` | SQLite | PV | 简单部署、测试 |
| `pgsql-minio` | PostgreSQL | MinIO | 生产环境、多副本 |

## 使用方式

### 方式一：统一脚本（推荐）

```bash
cd deploy
./deploy.sh
```

按提示选择部署平台和方案即可。

### 方式二：直接使用子目录脚本

**Docker Compose:**
```bash
cd deploy/docker-compose/sqlite
docker compose up -d
```

**Kubernetes:**
```bash
cd deploy/kubernetes/standalone
./deploy.sh -n my-namespace
```

## 端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| Rainbow Bridge | 8080 | Web 服务 |
| MySQL | 3306 | 数据库 |
| PostgreSQL | 5432 | 数据库 |
| MinIO API | 9000 | 对象存储 API |
| MinIO Console | 9001 | MinIO 控制台 |

## 默认账号

### MinIO
- 用户名: `minioadmin`
- 密码: `minioadmin123`

### 数据库
- 用户名: `rainbow_bridge`
- 密码: `rainbow_bridge_pass`

> ⚠️ **生产环境请务必修改默认密码！**

## 常用命令

### Docker Compose

```bash
# 进入对应方案目录
cd deploy/docker-compose/pgsql-minio

# 启动
docker compose up -d

# 停止
docker compose down

# 查看日志
docker compose logs -f

# 重启
docker compose restart

# 删除数据重建
docker compose down -v
docker compose up -d
```

### Kubernetes

```bash
# 进入对应方案目录
cd deploy/kubernetes/pgsql-minio

# 部署
./deploy.sh -n production

# 销毁
./destroy.sh -n production

# 重启
./restart.sh -n production

# 查看状态
kubectl get pods -n production -l app=rainbow-bridge
```

## 数据备份

### SQLite
```bash
docker run --rm -v rainbow_bridge_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/backup-$(date +%Y%m%d).tar.gz -C /data .
```

### PostgreSQL
```bash
docker exec rainbow-bridge-postgres pg_dump -U rainbow_bridge rainbow_bridge > backup.sql
```

### MinIO
```bash
docker run --rm -v minio_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/minio-backup-$(date +%Y%m%d).tar.gz -C /data .
```

## 更多文档

- [Docker Compose 详细文档](docker-compose/README.md)
- [项目主页](https://github.com/yi-nology/rainbow_bridge)
