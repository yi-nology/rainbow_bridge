# Docker Compose 部署指南

本目录提供了 Rainbow Bridge 的多种 Docker Compose 部署方案，适用于不同的场景和需求。

## 目录结构

```
docker-compose/
├── sqlite/            # SQLite 方案（最简单）
├── mysql/             # MySQL 方案
├── postgres/          # PostgreSQL 方案
├── pgsql-minio/       # PostgreSQL + MinIO 方案
└── minio-cluster/     # MinIO 分布式集群方案
```

## 部署方案对比

| 方案 | 数据库 | 存储 | 适用场景 |
|------|--------|------|----------|
| `sqlite` | SQLite | 本地文件 | 个人使用、测试环境 |
| `mysql` | MySQL 8.0 | 本地文件 | 中小型生产环境 |
| `postgres` | PostgreSQL 16 | 本地文件 | 大型生产环境 |
| `pgsql-minio` | PostgreSQL 16 | MinIO | 云原生、多实例 |
| `minio-cluster` | PostgreSQL 16 | MinIO 4节点集群 | 企业级高可用 |

## 快速开始

### 使用统一部署脚本（推荐）

```bash
# 回到 deploy 目录
cd ..

# 运行交互式部署脚本
./deploy.sh
```

### 直接使用特定方案

```bash
# 进入对应方案目录
cd sqlite

# 启动服务
docker compose up -d

# 查看日志
docker compose logs -f

# 停止服务
docker compose down

# 重启服务
docker compose restart

# 删除数据重建
docker compose down -v
docker compose up -d
```

## 配置说明

### 通用配置

所有方案都包含以下配置：

- **端口映射**：80 端口映射到容器的 8080 端口
- **数据持久化**：使用 Docker 卷或绑定挂载
- **健康检查**：自动检查服务状态
- **环境变量**：根据不同方案设置相应的环境变量

### 各方案特定配置

#### SQLite 方案

- **数据库**：SQLite 文件存储在 `./data` 目录
- **存储**：本地文件系统
- **优点**：简单易用，无需额外数据库服务

#### MySQL 方案

- **数据库**：MySQL 8.0
- **端口**：3306
- **默认账号**：
  - 用户名：`rainbow_bridge`
  - 密码：`rainbow_bridge_pass`
  - 数据库名：`rainbow_bridge`

#### PostgreSQL 方案

- **数据库**：PostgreSQL 16
- **端口**：5432
- **默认账号**：
  - 用户名：`rainbow_bridge`
  - 密码：`rainbow_bridge_pass`
  - 数据库名：`rainbow_bridge`

#### PostgreSQL + MinIO 方案

- **数据库**：PostgreSQL 16
- **存储**：MinIO 对象存储
- **MinIO 端口**：
  - API：9000
  - 控制台：9001
- **MinIO 默认账号**：
  - 用户名：`minioadmin`
  - 密码：`minioadmin123`
- **自动创建存储桶**：`rainbow-bridge`

#### MinIO 集群方案

- **数据库**：PostgreSQL 16
- **存储**：MinIO 4节点分布式集群
- **MinIO 端口**：
  - 节点1：9001 (API), 9011 (控制台)
  - 节点2：9002 (API), 9012 (控制台)
  - 节点3：9003 (API), 9013 (控制台)
  - 节点4：9004 (API), 9014 (控制台)
- **MinIO 默认账号**：
  - 用户名：`minioadmin`
  - 密码：`minioadmin123`
- **自动创建存储桶**：`rainbow-bridge`

## 环境变量

### 通用环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `GIN_MODE` | Gin 运行模式 | `release` |

### 数据库环境变量

| 变量名 | 描述 | SQLite | MySQL | PostgreSQL |
|--------|------|--------|-------|------------|
| `DATABASE_TYPE` | 数据库类型 | `sqlite` | `mysql` | `postgres` |
| `DATABASE_HOST` | 数据库主机 | - | `mysql` | `postgres` |
| `DATABASE_PORT` | 数据库端口 | - | `3306` | `5432` |
| `DATABASE_NAME` | 数据库名 | - | `rainbow_bridge` | `rainbow_bridge` |
| `DATABASE_USER` | 数据库用户 | - | `rainbow_bridge` | `rainbow_bridge` |
| `DATABASE_PASSWORD` | 数据库密码 | - | `rainbow_bridge_pass` | `rainbow_bridge_pass` |

### 存储环境变量

| 变量名 | 描述 | 本地存储 | MinIO |
|--------|------|----------|-------|
| `STORAGE_TYPE` | 存储类型 | `local` | `minio` |
| `MINIO_ENDPOINT` | MinIO 端点 | - | `minio:9000` |
| `MINIO_ACCESS_KEY` | MinIO 访问密钥 | - | `minioadmin` |
| `MINIO_SECRET_KEY` | MinIO 秘密密钥 | - | `minioadmin123` |
| `MINIO_BUCKET` | MinIO 存储桶 | - | `rainbow-bridge` |

## 访问方式

部署完成后，可以通过以下地址访问 Rainbow Bridge：

- **Web 界面**：`http://localhost/`
- **API 接口**：`http://localhost/api/`

### MinIO 访问

如果使用了包含 MinIO 的方案，可以通过以下地址访问：

- **MinIO 控制台**：`http://localhost:9001`
- **MinIO API**：`http://localhost:9000`

## 数据备份

### SQLite

```bash
docker run --rm -v rainbow_bridge_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/backup-$(date +%Y%m%d).tar.gz -C /data .
```

### MySQL

```bash
docker exec rainbow-bridge-mysql mysqldump -U rainbow_bridge rainbow_bridge > backup.sql
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

## 常见问题

### 端口冲突

如果遇到端口冲突，可以修改 `docker-compose.yaml` 文件中的端口映射：

```yaml
ports:
  - "8080:8080"  # 修改为其他端口，如 "8081:8080"
```

### 数据持久化

所有方案都使用了 Docker 卷或绑定挂载来持久化数据，确保容器重启后数据不会丢失。

### 性能优化

- **SQLite**：适用于低流量场景
- **MySQL/PostgreSQL**：适用于中等流量场景
- **MinIO**：适用于需要对象存储的场景
- **MinIO 集群**：适用于高可用、高流量场景

## 升级指南

1. **停止服务**：
   ```bash
   docker compose down
   ```

2. **备份数据**（参见数据备份部分）

3. **更新镜像**：
   ```bash
   docker compose pull
   ```

4. **启动服务**：
   ```bash
   docker compose up -d
   ```
