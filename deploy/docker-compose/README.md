# Rainbow Bridge Docker Compose 部署方案

本目录提供了三种数据库方案的 Docker Compose 部署配置：

## 📦 方案概览

| 方案 | 文件 | 数据库 | 特点 | 推荐场景 |
|------|------|--------|------|---------|
| **SQLite** | `docker-compose.sqlite.yaml` | 内置 SQLite | 零依赖、单容器、轻量级 | 个人使用、测试环境、小规模部署 |
| **MySQL** | `docker-compose.mysql.yaml` | MySQL 8.0 | 成熟稳定、生态丰富 | 中小型生产环境 |
| **PostgreSQL** | `docker-compose.postgres.yaml` | PostgreSQL 16 | 功能强大、高性能 | 大型生产环境、复杂查询场景 |

---

## 🚀 快速开始

### 方案一：SQLite（推荐新手）

**特点：**
- ✅ 最简单，无需额外数据库容器
- ✅ 数据存储在本地文件中
- ✅ 适合个人使用和测试

**启动命令：**
```bash
cd deploy/docker-compose
docker compose -f docker-compose.sqlite.yaml up -d
```

**停止命令：**
```bash
docker compose -f docker-compose.sqlite.yaml down
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
cd deploy/docker-compose
docker compose -f docker-compose.mysql.yaml up -d
```

**停止命令：**
```bash
docker compose -f docker-compose.mysql.yaml down
```

**查看日志：**
```bash
# 查看应用日志
docker compose -f docker-compose.mysql.yaml logs -f rainbow-bridge

# 查看数据库日志
docker compose -f docker-compose.mysql.yaml logs -f mysql
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

编辑 `docker-compose.mysql.yaml` 和 `config.mysql.yaml` 中的密码：

1. `docker-compose.mysql.yaml`:
   ```yaml
   MYSQL_PASSWORD: 你的新密码
   ```

2. `config.mysql.yaml`:
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
cd deploy/docker-compose
docker compose -f docker-compose.postgres.yaml up -d
```

**停止命令：**
```bash
docker compose -f docker-compose.postgres.yaml down
```

**查看日志：**
```bash
# 查看应用日志
docker compose -f docker-compose.postgres.yaml logs -f rainbow-bridge

# 查看数据库日志
docker compose -f docker-compose.postgres.yaml logs -f postgres
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

编辑 `docker-compose.postgres.yaml` 和 `config.postgres.yaml` 中的密码：

1. `docker-compose.postgres.yaml`:
   ```yaml
   POSTGRES_PASSWORD: 你的新密码
   ```

2. `config.postgres.yaml`:
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

## 🔧 配置说明

### 文件结构

```
deploy/docker-compose/
├── docker-compose.sqlite.yaml    # SQLite 方案
├── docker-compose.mysql.yaml     # MySQL 方案
├── docker-compose.postgres.yaml  # PostgreSQL 方案
├── config.sqlite.yaml            # SQLite 配置
├── config.mysql.yaml             # MySQL 配置
├── config.postgres.yaml          # PostgreSQL 配置
├── init-mysql.sql                # MySQL 初始化脚本
├── init-postgres.sql             # PostgreSQL 初始化脚本
└── README.md                     # 本文档
```

### 端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| Rainbow Bridge | 8080 | Web 服务端口 |
| MySQL | 3306 | MySQL 数据库端口（仅 MySQL 方案） |
| PostgreSQL | 5432 | PostgreSQL 数据库端口（仅 PostgreSQL 方案） |

### 数据持久化

所有方案都使用 Docker Volume 进行数据持久化：

- **SQLite**: `rainbow_bridge_data` - 存储数据库文件和上传文件
- **MySQL**: `mysql_data` + `rainbow_bridge_uploads` - 分别存储数据库和上传文件
- **PostgreSQL**: `postgres_data` + `rainbow_bridge_uploads` - 分别存储数据库和上传文件

---

## 🔄 方案迁移

### 从 SQLite 迁移到 MySQL/PostgreSQL

1. **导出 SQLite 数据**（手动迁移）
2. **启动新数据库方案**
3. **导入数据到新数据库**

> ⚠️ 注意：SQLite 到 MySQL/PostgreSQL 的迁移需要手动处理，建议使用数据迁移工具或脚本。

### 在不同方案间切换

```bash
# 停止当前方案
docker compose -f docker-compose.sqlite.yaml down

# 启动新方案
docker compose -f docker-compose.mysql.yaml up -d
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
docker compose -f docker-compose.mysql.yaml ps
```

### 查看容器日志

```bash
# 查看所有日志
docker compose -f docker-compose.mysql.yaml logs

# 实时查看日志
docker compose -f docker-compose.mysql.yaml logs -f

# 查看特定服务日志
docker compose -f docker-compose.mysql.yaml logs rainbow-bridge
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
# 停止容器
docker compose -f docker-compose.mysql.yaml down

# 删除 volumes（⚠️ 会删除所有数据）
docker compose -f docker-compose.mysql.yaml down -v

# 重新启动
docker compose -f docker-compose.mysql.yaml up -d
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
