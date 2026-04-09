# 安装部署

本文档详细介绍虹桥计划的安装和部署步骤。

## 📋 前置要求

### 系统要求
- **操作系统**: Linux / macOS / Windows
- **内存**: 最低 512MB，推荐 1GB+
- **存储**: 最低 100MB，根据资源使用情况而定
- **Go 版本**: Go 1.22+（仅开发需要）

### Docker 环境（推荐）
- Docker 20.10+
- Docker Compose 2.0+

### Kubernetes 环境（可选）
- Kubernetes 1.20+
- kubectl 命令行工具
- Helm 3.0+（可选）

## 🚀 部署方式

### 方式一：Docker Compose（推荐）

这是最简单快捷的部署方式，适合大多数场景。

#### 1. 克隆项目

```bash
git clone https://github.com/yi-nology/rainbow_bridge.git
cd rainbow_bridge/deploy
```

#### 2. 选择数据库配置

项目提供多种数据库配置：

**SQLite（默认，最简单）**
```bash
cd docker-compose/sqlite
docker compose up -d
```

**MySQL**
```bash
cd docker-compose/mysql
docker compose up -d
```

**PostgreSQL + MinIO（推荐生产环境）**
```bash
cd docker-compose/pgsql-minio
docker compose up -d
```

此方案包含：
- PostgreSQL 16 作为关系型数据库
- MinIO 对象存储用于静态资源
- 自动初始化 MinIO 存储桶

访问地址：
- 管理界面：http://localhost:8080/rainbow-bridge
- MinIO 控制台：http://localhost:9001（用户名: minioadmin, 密码: minioadmin123）

#### 3. 验证部署

```bash
# 查看容器状态
docker compose ps

# 查看日志
docker compose logs -f

# 测试健康检查
curl http://localhost:8080/rainbow-bridge/ping
```

#### 4. 访问管理界面

打开浏览器访问：http://localhost:8080/rainbow-bridge

### 方式二：Kubernetes 部署

适合生产环境的大规模部署。

#### 1. 准备集群

```bash
# 启动 Minikube（本地测试）
minikube start

# 或使用现有 K8s 集群
kubectl cluster-info
```

#### 2. 部署应用

**Standalone 模式（简单部署）**
```bash
cd deploy/kubernetes/standalone
kubectl apply -f configmap.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

**PostgreSQL + MinIO 模式（完整部署，推荐生产环境）**
```bash
cd deploy/kubernetes/pgsql-minio
./deploy.sh
```

或使用 kubectl 手动部署：
```bash
cd deploy/kubernetes/pgsql-minio
kubectl apply -f .
```

此方案包含：
- PostgreSQL 16 作为关系型数据库
- MinIO 对象存储用于静态资源
- 自动初始化 MinIO 存储桶的 Job
- Rainbow Bridge 应用（带 initContainer 等待 MinIO 就绪）

访问地址：
- 管理界面：http://localhost:8080/rainbow-bridge（需端口转发）
- MinIO 控制台：http://localhost:9001（需端口转发，用户名: minioadmin, 密码: minioadmin123）

#### 3. 验证部署

```bash
# 查看 Pod 状态
kubectl get pods -l app=rainbow-bridge

# 等待 Pod 就绪
kubectl wait --for=condition=ready pod -l app=rainbow-bridge-api --timeout=120s

# 端口转发并测试
kubectl port-forward svc/rainbow-bridge-service 8080:80
curl http://localhost:8080/rainbow-bridge/ping
```

### 方式三：本地运行（开发环境）

适合开发和调试。

#### 1. 克隆项目

```bash
git clone https://github.com/yi-nology/rainbow_bridge.git
cd rainbow_bridge
```

#### 2. 构建后端

**生产模式（默认）**
```bash
./build.sh
```

**开发模式（支持热更新）**
```bash
BUILD_MODE=dev ./build.sh
```

#### 3. 构建前端

```bash
cd react
npm install
npm run build
```

#### 4. 启动服务

```bash
# 使用默认配置
./output/bin/hertz_service

# 或指定配置文件
./output/bin/hertz_service --config config.yaml
```

#### 5. 访问服务

- 管理界面：http://localhost:8080/rainbow-bridge
- API 接口：http://localhost:8080/rainbow-bridge/api/v1
- 健康检查：http://localhost:8080/rainbow-bridge/ping

## ⚙️ 配置说明

### 配置文件

主配置文件 `config.yaml` 包含以下关键配置：

```yaml
server:
  address: ":8080"
  base_path: "/rainbow-bridge"  # 访问前缀
  
database:
  driver: "postgres"  # sqlite, mysql, postgres
  postgres:
    dsn: "host=postgres user=rainbow_bridge password=rainbow_bridge_pass dbname=rainbow_bridge port=5432 sslmode=disable TimeZone=UTC"
  
storage:
  type: "minio"  # local 或 minio
  minio:
    endpoint: "minio:9000"
    access_key: "minioadmin"
    secret_key: "minioadmin123"
    use_ssl: false
    bucket: "rainbow-bridge"
    region: "us-east-1"
```

### 环境变量

可以通过环境变量覆盖配置：

```bash
# 数据库配置
export DATABASE_DRIVER=mysql
export DATABASE_DSN="user:pass@tcp(localhost:3306)/rainbow_bridge?charset=utf8mb4&parseTime=True&loc=Local"

# 服务地址
export SERVER_ADDRESS=":80"
export SERVER_BASE_PATH="/rainbow-bridge"
```

## 🔧 自定义配置

### 修改端口

编辑 `deploy/docker-compose/config.yaml`：

```yaml
server:
  address: ":9090"  # 修改为 9090 端口
```

然后重启服务：

```bash
docker compose down
docker compose up -d
```

### 数据持久化

Docker Compose 已配置命名卷，数据会自动持久化：

```bash
# 查看数据卷
docker volume ls | grep rainbow_bridge

# 备份数据
docker run --rm \
  -v rainbow_bridge_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/rainbow_bridge_backup.tar.gz /data
```

### HTTPS 配置

使用 Nginx 反向代理实现 HTTPS：

```bash
# 使用提供的 Nginx 配置
cd deploy/nginx
# 修改 frontend.conf 中的域名和证书配置
docker compose -f docker-compose.yaml -f docker-compose.nginx.yml up -d
```

## 🐛 故障排查

### 常见问题

#### 1. 容器启动失败

```bash
# 查看详细日志
docker compose logs api

# 常见原因：
# - 端口被占用
# - 数据库初始化失败
# - 配置文件错误
```

#### 2. 无法访问管理界面

```bash
# 检查容器状态
docker compose ps

# 检查端口映射
docker compose port api 8080

# 测试 API
curl http://localhost:8080/rainbow-bridge/ping
```

#### 3. 数据库连接失败

```bash
# MySQL 等待时间不足
sleep 30 && docker compose up -d

# 检查数据库日志
docker compose logs db
```

### 获取帮助

- 查看 [Issue 列表](https://github.com/yi-nology/rainbow_bridge/issues)
- 阅读 [技术设计文档](https://github.com/yi-nology/rainbow_bridge/blob/main/README.md)
- 参考 [测试指南](https://github.com/yi-nology/rainbow_bridge/blob/main/TESTING.md)

## 📊 部署验证

部署完成后，请验证以下功能：

- ✅ 健康检查接口响应正常 (`/ping`)
- ✅ 管理界面可以访问
- ✅ API 接口正常工作 (`/api/v1/version`)
- ✅ 可以创建环境和渠道
- ✅ 可以上传和下载资源
- ✅ 容器日志无严重错误

## 🔗 下一步

完成安装后，请继续学习：

- [快速开始](./quick-start) - 体验基本功能
- [环境管理](./ui-config/environment) - 学习环境管理
- [渠道管理](./ui-config/channel) - 学习渠道管理
- [配置管理](./ui-config/config) - 学习配置管理
- [平台对接](./integration/frontend) - 集成到你的项目
