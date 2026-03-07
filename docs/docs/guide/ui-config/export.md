# 导出配置

导出功能允许你将配置和资源打包导出，用于备份、迁移或静态部署。本指南将帮助你了解各种导出方式。

## 概念说明

### 导出用途

| 用途 | 说明 |
|------|------|
| 备份 | 定期导出配置，防止数据丢失 |
| 迁移 | 在不同环境间迁移配置 |
| 静态部署 | 导出为 Nginx 静态站点，独立部署 |
| 离线使用 | 客户端离线时使用本地配置 |

### 导出格式

系统支持以下导出格式：

1. **JSON 文件**：仅配置数据
2. **ZIP 包**：配置 + 资源文件
3. **静态站点**：可直接部署的 Nginx 静态包

## 快速导出

### 导出配置数据

**通过 UI**：
1. 进入 **配置管理** 页面
2. 选择环境和渠道
3. 点击 **导出** 按钮
4. 选择导出格式
5. 下载文件

**通过 API**：
```bash
# 导出 JSON 配置
curl "http://localhost:8080/rainbow-bridge/api/v1/runtime/config?environment_key=prod&pipeline_key=main" \
  -o config.json
```

### 导出完整包

**通过 API**：
```bash
# 导出 ZIP 包（包含配置和资源）
curl "http://localhost:8080/rainbow-bridge/api/v1/runtime/static?environment_key=prod&pipeline_key=main" \
  -o static.zip
```

**ZIP 包结构**：
```
static.zip
├── config.json          # 所有配置数据
├── assets/              # 关联的资源文件
│   ├── uuid-xxx/
│   │   └── banner.png
│   └── uuid-yyy/
│       └── logo.png
├── index.html           # 示例页面（可选）
└── manifest.json        # 清单文件
```

## 选择性导出

当只需要导出部分配置时，使用选择性导出功能。

### 通过 UI

1. 进入 **配置迁移** 页面
2. 点击 **导出选择** 标签
3. 展开环境和渠道树
4. 勾选需要导出的配置
5. 点击 **导出选中项**
6. 下载 ZIP 包

### 通过 API

```bash
# 1. 获取导出树
curl http://localhost:8080/rainbow-bridge/api/v1/transfer/export-tree

# 2. 选择性导出
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/transfer/export \
  -H "Content-Type: application/json" \
  -d '{
    "selections": [
      {
        "environment_key": "prod",
        "pipeline_key": "main",
        "resource_keys": ["uuid-1", "uuid-2"]
      }
    ]
  }' \
  -o export.zip
```

## 静态站点导出

静态站点导出生成可直接部署的 Nginx 静态包，适用于：

- 无需后端服务的纯前端部署
- CDN 分发
- 离线应用场景

### 导出步骤

1. 进入 **导出配置** 页面
2. 选择 **静态站点** 模式
3. 选择环境和渠道
4. 配置站点信息（可选）：
   - 站点标题
   - 自定义页面
5. 点击 **生成**
6. 下载 ZIP 包

### 部署静态站点

**Nginx 部署**：
```nginx
server {
    listen 80;
    server_name config.example.com;
    
    root /var/www/static-config;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    # 启用 gzip 压缩
    gzip on;
    gzip_types application/json;
}
```

**上传部署**：
```bash
# 解压并部署
unzip static.zip -d /var/www/static-config

# 重启 Nginx
nginx -s reload
```

## 导出计划

### 定期备份

建议定期导出配置进行备份：

| 环境 | 备份频率 | 保留期限 |
|------|---------|---------|
| 生产环境 | 每天 | 30 天 |
| 测试环境 | 每周 | 14 天 |
| 开发环境 | 按需 | 7 天 |

### 自动化脚本

```bash
#!/bin/bash
# backup.sh - 配置备份脚本

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/rainbow-bridge"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 导出生产环境配置
curl "http://localhost:8080/rainbow-bridge/api/v1/runtime/static?environment_key=prod&pipeline_key=main" \
  -o "$BACKUP_DIR/prod_main_$DATE.zip"

# 删除 30 天前的备份
find $BACKUP_DIR -name "*.zip" -mtime +30 -delete

echo "Backup completed: prod_main_$DATE.zip"
```

**Cron 定时任务**：
```bash
# 每天凌晨 2 点执行备份
0 2 * * * /path/to/backup.sh >> /var/log/backup.log 2>&1
```

## 导入配置

导出的配置包可以通过导入功能恢复或迁移。

### 导入预览

导入前可以先预览，查看配置差异：

```bash
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/transfer/import-preview \
  -F "file=@export.zip" \
  -F "environment_key=test" \
  -F "pipeline_key=main"
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "preview": {
      "new_configs": 5,
      "conflict_configs": 2,
      "same_configs": 8,
      "details": [
        {
          "name": "api_base_url",
          "status": "conflict",
          "source_content": "https://api.test.com",
          "target_content": "https://api.prod.com"
        }
      ]
    }
  }
}
```

### 执行导入

```bash
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/transfer/import-selective \
  -F "file=@export.zip" \
  -F "environment_key=test" \
  -F "pipeline_key=main" \
  -F "overwrite=true"
```

## 最佳实践

### 版本命名

导出文件使用有意义的命名：

```
# 推荐格式
prod_main_20240307.zip      # 环境_渠道_日期
backup_before_release.zip   # 变更说明
v2.1.0_config.zip          # 版本号
```

### 变更前备份

在进行重大配置变更前：

1. 导出当前配置作为备份
2. 执行配置变更
3. 验证变更结果
4. 如有问题，导入备份恢复

### 多环境备份

为所有环境建立备份策略：

```bash
# 批量备份脚本
for env in dev test staging prod; do
  curl "http://localhost:8080/rainbow-bridge/api/v1/runtime/static?environment_key=$env&pipeline_key=main" \
    -o "backup/${env}_main_$(date +%Y%m%d).zip"
done
```

## 常见问题

### Q: 导出的配置可以在其他系统使用吗？

A: 可以。导出的 JSON 格式是标准的，可以在任何支持 JSON 的系统中使用。

### Q: 静态站点支持热更新吗？

A: 不支持。静态站点是静态文件，更新后需要重新部署。如需实时更新，使用 API 接口。

### Q: 导出包中的资源链接如何处理？

A: 导出包中的资源引用会保留原始路径。部署后需要确保资源路径可访问，或修改为实际部署地址。

### Q: 导入时冲突如何处理？

A: 可以选择：
- 跳过冲突配置（保留目标配置）
- 覆盖冲突配置（使用源配置）

## 下一步

- [配置迁移](./migration) - 在环境间迁移配置
- [平台对接](../integration/frontend) - 集成到你的项目
