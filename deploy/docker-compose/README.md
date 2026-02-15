# Rainbow Bridge Docker Compose 部署方案

本目录提供了多种数据库和存储方案的 Docker Compose 部署配置。

## 📁 目录结构

```
deploy/docker-compose/
├── sqlite/                  # SQLite 方案（最简单）
│   ├── docker-compose.yaml
│   └── config.yaml
├── mysql/                   # MySQL 方案
│   ├── docker-compose.yaml
│   ├── config.yaml
│   └── init-mysql.sql
├── postgres/                # PostgreSQL 方案
│   ├── docker-compose.yaml
│   ├── config.yaml
│   └── init-postgres.sql
├── pgsql-minio/             # PostgreSQL + MinIO 单节点
│   ├── docker-compose.yaml
│   ├── config.yaml
│   └── init-postgres.sql
├── minio-cluster/           # MinIO 4节点集群 + PostgreSQL
│   ├── docker-compose.yaml
│   ├── config.yaml
│   └── nginx-minio.conf
├── docker-compose.yaml      # 默认配置（SQLite）
├── config.yaml              # 默认配置文件
└── README.md
```

## 📦 方案概览

### 数据库方案

| 方案 | 目录 | 数据库 | 特点 | 推荐场景 |
|------|------|--------|------|----------|
| **SQLite** | `sqlite/` | 内置 SQLite | 零依赖、单容器、轻量级 | 个人使用、测试环境、小规模部署 |
| **MySQL** | `mysql/` | MySQL 8.0 | 成熟稳定、生态丰富 | 中小型生产环境 |
| **PostgreSQL** | `postgres/` | PostgreSQL 16 | 功能强大、高性能 | 大型生产环境、复杂查询场景 |

### 对象存储方案

| 方案 | 目录 | 存储 | 特点 | 推荐场景 |
|------|------|------|------|----------|
| **MinIO 单节点** | `pgsql-minio/` | MinIO + PostgreSQL | S3 兼容、易部署 | 中型生产环境、云原生应用 |
| **MinIO 集群** | `minio-cluster/` | MinIO 4节点集群 + Nginx | 高可用、数据冗余、负载均衡 | 大型生产环境、企业级应用 |

---

## 🚀 快速开始

### 方案一：SQLite（推荐新手）

**特点：**
- ✅ 最简单，无需额外数据库容器
- ✅ 数据存储在本地文件中
- ✅ 适合个人使用和测试

**启动命令：**
```bash
cd deploy/docker-compose/sqlite
docker compose up -d
```

**停止命令：**
```bash
docker compose down
```

**数据备份：**
```bash
# 数据存储在 Docker volume 中
docker run --rm -v rainbow_bridge_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/rainbow-bridge-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
```

---

### 方案二：MySQL

**特点：**
- ✅ 适合中小型生产环境
- ✅ 成熟稳定，工具生态丰富
- ✅ 支持远程连接和管理

**启动命令：**
```bash
cd deploy/docker-compose/mysql
docker compose up -d
```

**停止命令：**
```bash
docker compose down
```

**查看日志：**
```bash
# 查看应用日志
docker compose logs -f rainbow-bridge

# 查看数据库日志
docker compose logs -f mysql
```

**连接数据库：**
```bash
# 使用 MySQL 客户端连接
mysql -h 127.0.0.1 -P 3306 -u rainbow_bridge -p
# 密码: rainbow_bridge_pass

# 或使用 Docker exec
docker exec -it rainbow-bridge-mysql mysql -u rainbow_bridge -prainbow_bridge_pass rainbow_bridge
```

**修改密码：**

编辑 `docker-compose.yaml` 和 `config.yaml` 中的密码：

1. `docker-compose.yaml`:
   ```yaml
   MYSQL_PASSWORD: 你的新密码
   ```

2. `config.yaml`:
   ```yaml
   dsn: "rainbow_bridge:你的新密码@tcp(mysql:3306)/..."
   ```

**数据备份：**
```bash
# 备份数据库
docker exec rainbow-bridge-mysql mysqldump -u rainbow_bridge -prainbow_bridge_pass rainbow_bridge > backup-$(date +%Y%m%d-%H%M%S).sql

# 恢复数据库
docker exec -i rainbow-bridge-mysql mysql -u rainbow_bridge -prainbow_bridge_pass rainbow_bridge < backup.sql
```

---

### 方案三：PostgreSQL

**特点：**
- ✅ 适合大型生产环境
- ✅ 功能强大，支持复杂查询
- ✅ 高性能、高可靠性

**启动命令：**
```bash
cd deploy/docker-compose/postgres
docker compose up -d
```

**停止命令：**
```bash
docker compose down
```

**查看日志：**
```bash
# 查看应用日志
docker compose logs -f rainbow-bridge

# 查看数据库日志
docker compose logs -f postgres
```

**连接数据库：**
```bash
# 使用 psql 客户端连接
psql -h 127.0.0.1 -p 5432 -U rainbow_bridge -d rainbow_bridge
# 密码: rainbow_bridge_pass

# 或使用 Docker exec
docker exec -it rainbow-bridge-postgres psql -U rainbow_bridge -d rainbow_bridge
```

**修改密码：**

编辑 `docker-compose.yaml` 和 `config.yaml` 中的密码：

1. `docker-compose.yaml`:
   ```yaml
   POSTGRES_PASSWORD: 你的新密码
   ```

2. `config.yaml`:
   ```yaml
   dsn: "host=postgres user=rainbow_bridge password=你的新密码 ..."
   ```

**数据备份：**
```bash
# 备份数据库
docker exec rainbow-bridge-postgres pg_dump -U rainbow_bridge rainbow_bridge > backup-$(date +%Y%m%d-%H%M%S).sql

# 恢复数据库
docker exec -i rainbow-bridge-postgres psql -U rainbow_bridge rainbow_bridge < backup.sql
```

---

### 方案四：PostgreSQL + MinIO 单节点（推荐云原生）

**特点：**
- ✅ S3 兼容对象存储
- ✅ 适合云原生应用
- ✅ 支持分布式存储
- ✅ Web 控制台管理

**启动命令：**
```bash
cd deploy/docker-compose/pgsql-minio
docker compose up -d
```

**停止命令：**
```bash
docker compose down
```

**访问 MinIO 控制台：**
```
URL: http://localhost:9001
用户名: minioadmin
密码: minioadmin123
```

**MinIO API 端点：**
```
http://localhost:9000
```

**修改密码：**

编辑 `docker-compose.yaml` 和 `config.yaml` 中的密码：

1. `docker-compose.yaml`:
   ```yaml
   # MinIO 服务
   MINIO_ROOT_USER: 你的用户名
   MINIO_ROOT_PASSWORD: 你的新密码
   
   # Rainbow Bridge 环境变量
   MINIO_ACCESS_KEY: 你的用户名
   MINIO_SECRET_KEY: 你的新密码
   ```

2. `config.yaml`:
   ```yaml
   storage:
     minio:
       access_key: "你的用户名"
       secret_key: "你的新密码"
   ```

**数据备份：**
```bash
# 备份 MinIO 数据
docker run --rm -v rainbow-bridge_minio_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/minio-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .

# 恢复 MinIO 数据
docker run --rm -v rainbow-bridge_minio_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/minio-backup-XXXXXX.tar.gz -C /data
```

---

### 方案五：MinIO 分布式集群（推荐企业级）

**特点：**
- ✅ 4 节点分布式集群
- ✅ 高可用性（容忍 1 节点故障）
- ✅ 数据冗余（Erasure Code）
- ✅ Nginx 负载均衡
- ✅ 适合生产环境

**启动命令：**
```bash
cd deploy/docker-compose/minio-cluster
docker compose up -d
```

**停止命令：**
```bash
docker compose down
```

**查看集群状态：**
```bash
# 查看所有容器状态
docker compose ps

# 查看单个节点日志
docker compose logs minio1

# 查看 Nginx 负载均衡器日志
docker compose logs nginx
```

**访问 MinIO 控制台：**
```
URL: http://localhost:9001
用户名: minioadmin
密码: minioadmin123
```

**集群信息：**
- 总存储节点：4 个
- 每节点磁盘：2 个
- 总磁盘数：8 个
- Erasure Set 大小：4 (最多允许 1 个节点故障)
- 负载均衡：Least Connections

**扩容说明：**

MinIO 集群启动后不能直接扩容。如需扩容：
1. 创建新的服务器集 (Server Pool)
2. 更新 docker-compose 添加更多节点
3. 使用 MinIO 的 Server Pool 功能

**数据备份：**
```bash
# 备份所有节点数据
for i in 1 2 3 4; do
  docker run --rm \
    -v rainbow-bridge_minio${i}_data1:/data1 \
    -v rainbow-bridge_minio${i}_data2:/data2 \
    -v $(pwd):/backup alpine \
    tar czf /backup/minio${i}-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C / data1 data2
done
```

---

## 🔧 配置说明

### 端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| Rainbow Bridge | 8080 | Web 服务端口 |
| MySQL | 3306 | MySQL 数据库端口（仅 MySQL 方案） |
| PostgreSQL | 5432 | PostgreSQL 数据库端口（仅 PostgreSQL/MinIO 方案） |
| MinIO API | 9000 | MinIO 对象存储 API（仅 MinIO 方案） |
| MinIO Console | 9001 | MinIO Web 控制台（仅 MinIO 方案） |

### 数据持久化

所有方案都使用 Docker Volume 进行数据持久化：

- **SQLite**: `rainbow_bridge_data` - 存储数据库文件和上传文件
- **MySQL**: `mysql_data` + `rainbow_bridge_uploads` - 分别存储数据库和上传文件
- **PostgreSQL**: `postgres_data` + `rainbow_bridge_uploads` - 分别存储数据库和上传文件
- **MinIO 单节点**: `minio_data` + `postgres_data` - MinIO 存储和 PostgreSQL 数据库
- **MinIO 集群**: `minio{1..4}_data{1,2}` + `postgres_data` - 8个 MinIO 数据卷 + PostgreSQL 数据库

---

## 🔄 方案迁移

### 从 SQLite 迁移到 MySQL/PostgreSQL

1. **导出 SQLite 数据**（手动迁移）
2. **启动新数据库方案**
3. **导入数据到新数据库**

> ⚠️ 注意：SQLite 到 MySQL/PostgreSQL 的迁移需要手动处理，建议使用数据迁移工具或脚本。

### 在不同方案间切换

```bash
# 停止当前方案（在对应目录下）
docker compose down

# 切换到其他方案目录
cd ../mysql  # 或 ../postgres, ../pgsql-minio 等
docker compose up -d
```

---

## 🛡️ 安全建议

### 生产环境部署

1. **修改默认密码**
   - MySQL: 修改 `MYSQL_PASSWORD` 和 `MYSQL_ROOT_PASSWORD`
   - PostgreSQL: 修改 `POSTGRES_PASSWORD`

2. **限制端口暴露**
   ```yaml
   # 仅在本地监听，不对外暴露数据库端口
   ports:
     - "127.0.0.1:3306:3306"  # MySQL
     - "127.0.0.1:5432:5432"  # PostgreSQL
   ```

3. **使用环境变量**
   ```bash
   # 创建 .env 文件
   echo "DB_PASSWORD=your_secure_password" > .env
   
   # 在 docker-compose.yaml 中引用
   MYSQL_PASSWORD: ${DB_PASSWORD}
   ```

4. **启用 SSL/TLS**（生产环境推荐）

5. **定期备份数据**

---

## 📊 性能优化

### MySQL 优化

编辑 `docker-compose.mysql.yaml`，添加性能参数：

```yaml
command:
  - --character-set-server=utf8mb4
  - --collation-server=utf8mb4_unicode_ci
  - --max_connections=500
  - --innodb_buffer_pool_size=1G
  - --innodb_log_file_size=256M
```

### PostgreSQL 优化

编辑 `docker-compose.postgres.yaml`，添加性能参数：

```yaml
command:
  - postgres
  - -c
  - shared_buffers=256MB
  - -c
  - max_connections=200
  - -c
  - work_mem=8MB
```

---

## 🐛 故障排查

### 检查容器状态

```bash
# 进入对应方案目录
cd deploy/docker-compose/mysql  # 或其他方案目录
docker compose ps
```

### 查看容器日志

```bash
# 查看所有日志
docker compose logs

# 实时查看日志
docker compose logs -f

# 查看特定服务日志
docker compose logs rainbow-bridge
```

### 健康检查

```bash
# 检查 Rainbow Bridge 健康状态
curl http://localhost:8080/rainbow-bridge/api/v1/ping

# 检查 MySQL 连接
docker exec rainbow-bridge-mysql mysqladmin ping -h localhost -u root -prainbow_bridge_root_pass

# 检查 PostgreSQL 连接
docker exec rainbow-bridge-postgres pg_isready -U rainbow_bridge
```

### 常见问题

**Q: 容器启动失败，提示端口已被占用**
```bash
A: 检查端口是否被占用
# macOS/Linux
lsof -i :8080
# Windows
netstat -ano | findstr :8080

# 修改 docker-compose.yaml 中的端口映射
ports:
  - "8081:8080"  # 改为其他端口
```

**Q: 数据库连接失败**
```bash
A: 检查数据库是否已就绪
# MySQL
docker exec rainbow-bridge-mysql mysqladmin ping -h localhost -u root -prainbow_bridge_root_pass

# PostgreSQL
docker exec rainbow-bridge-postgres pg_isready -U rainbow_bridge

# 查看数据库日志
docker compose -f docker-compose.mysql.yaml logs mysql
```

**Q: 如何清空数据重新开始**
```bash
A: 删除 volumes
# 进入对应方案目录
cd deploy/docker-compose/mysql  # 或其他方案目录

# 停止容器
docker compose down

# 删除 volumes（⚠️ 会删除所有数据）
docker compose down -v

# 重新启动
docker compose up -d
```

---

## 📚 更多资源

- [Rainbow Bridge 主仓库](https://github.com/yi-nology/rainbow_bridge)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [MySQL 官方文档](https://dev.mysql.com/doc/)
- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)

---

## 💬 支持

如有问题，请提交 [Issue](https://github.com/yi-nology/rainbow_bridge/issues)。
