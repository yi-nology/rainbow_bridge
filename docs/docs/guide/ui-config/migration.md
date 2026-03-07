# 配置迁移

配置迁移功能用于在不同环境或渠道间复制配置，支持选择性迁移和冲突处理。本指南将帮助你高效管理配置迁移。

## 概念说明

### 什么是配置迁移？

配置迁移是指将配置从一个环境/渠道复制到另一个环境/渠道的过程，常用于：

| 场景 | 说明 |
|------|------|
| 环境升级 | 开发环境 → 测试环境 → 生产环境 |
| 渠道同步 | 主渠道配置 → 热修复渠道 |
| 配置复制 | 快速创建相似配置 |
| 灾难恢复 | 从备份环境恢复配置 |

### 迁移方式

系统支持两种迁移方式：

1. **直接迁移**：在线复制，无需下载
2. **导入迁移**：通过导出包导入

## 直接迁移

### 通过 UI 迁移

1. 进入 **配置迁移** 页面
2. 选择 **直接迁移** 模式
3. 配置迁移参数：
   - **源环境**：选择源环境
   - **源渠道**：选择源渠道
   - **目标环境**：选择目标环境
   - **目标渠道**：选择目标渠道
4. 选择要迁移的配置
5. 选择冲突处理方式：
   - 跳过已存在的配置
   - 覆盖已存在的配置
6. 点击 **开始迁移**
7. 查看迁移结果

### 通过 API 迁移

```bash
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/transfer/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "source_environment": "dev",
    "source_pipeline": "main",
    "target_environment": "test",
    "target_pipeline": "main",
    "resource_keys": ["uuid-1", "uuid-2", "uuid-3"],
    "overwrite": false
  }'
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "migrated": 3,
    "skipped": 1,
    "failed": 0,
    "details": [
      {
        "name": "api_base_url",
        "status": "migrated",
        "message": ""
      },
      {
        "name": "theme_color",
        "status": "skipped",
        "message": "已存在，跳过覆盖"
      }
    ]
  }
}
```

## 导入迁移

当需要跨实例迁移或从备份恢复时，使用导入迁移。

### 步骤 1：导出配置

从源环境导出配置包：

```bash
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/transfer/export \
  -H "Content-Type: application/json" \
  -d '{
    "selections": [
      {
        "environment_key": "dev",
        "pipeline_key": "main",
        "resource_keys": ["uuid-1", "uuid-2"]
      }
    ]
  }' \
  -o export.zip
```

### 步骤 2：预览导入

导入前预览，检查冲突：

```bash
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/transfer/import-preview \
  -F "file=@export.zip" \
  -F "environment_key=test" \
  -F "pipeline_key=main"
```

### 步骤 3：执行导入

```bash
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/transfer/import-selective \
  -F "file=@export.zip" \
  -F "environment_key=test" \
  -F "pipeline_key=main" \
  -F "resource_keys=uuid-1,uuid-2" \
  -F "overwrite=false"
```

## 迁移场景

### 场景 1：开发 → 测试 → 生产

标准的 CI/CD 流程中，配置随代码一起推进：

```
1. 开发环境配置
   ↓ 验证通过后迁移
2. 测试环境配置
   ↓ 测试通过后迁移
3. 生产环境配置
```

**迁移步骤**：
```bash
# 开发 → 测试
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/transfer/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "source_environment": "dev",
    "source_pipeline": "main",
    "target_environment": "test",
    "target_pipeline": "main",
    "overwrite": false
  }'

# 测试 → 生产
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/transfer/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "source_environment": "test",
    "source_pipeline": "main",
    "target_environment": "prod",
    "target_pipeline": "main",
    "overwrite": false
  }'
```

### 场景 2：主渠道 → 热修复渠道

生产环境出现问题，需要创建热修复渠道：

```
prod/main → prod/hotfix
```

**步骤**：
1. 创建 hotfix 渠道
2. 从 main 渠道迁移配置
3. 修改需要修复的配置
4. 客户端切换到 hotfix 渠道

```bash
# 创建 hotfix 渠道
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/pipeline/create \
  -H "Content-Type: application/json" \
  -d '{
    "environment_key": "prod",
    "pipeline_key": "hotfix",
    "pipeline_name": "热修复渠道"
  }'

# 迁移配置
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/transfer/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "source_environment": "prod",
    "source_pipeline": "main",
    "target_environment": "prod",
    "target_pipeline": "hotfix",
    "overwrite": true
  }'
```

### 场景 3：批量同步

将配置同步到多个目标：

```bash
#!/bin/bash
# sync.sh - 批量同步脚本

SOURCE_ENV="dev"
SOURCE_PIPELINE="main"
TARGETS=(
  "test:main"
  "staging:main"
)

for target in "${TARGETS[@]}"; do
  IFS=':' read -r env pipeline <<< "$target"
  
  echo "Migrating to $env/$pipeline..."
  
  curl -X POST http://localhost:8080/rainbow-bridge/api/v1/transfer/migrate \
    -H "Content-Type: application/json" \
    -d "{
      \"source_environment\": \"$SOURCE_ENV\",
      \"source_pipeline\": \"$SOURCE_PIPELINE\",
      \"target_environment\": \"$env\",
      \"target_pipeline\": \"$pipeline\",
      \"overwrite\": false
    }"
done

echo "Migration completed!"
```

## 冲突处理

### 冲突类型

| 状态 | 说明 |
|------|------|
| `new` | 目标不存在，将创建新配置 |
| `same` | 内容相同，无需处理 |
| `conflict` | 内容不同，需要决定处理方式 |

### 处理策略

1. **跳过（overwrite: false）**：保留目标配置，跳过冲突
2. **覆盖（overwrite: true）**：使用源配置覆盖目标

### 最佳实践

::: tip 建议
生产环境迁移时，建议先预览，确认冲突情况后再决定处理方式。
:::

```bash
# 先预览
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/transfer/import-preview \
  -F "file=@export.zip" \
  -F "environment_key=prod" \
  -F "pipeline_key=main"

# 根据预览结果决定是否覆盖
```

## 迁移最佳实践

### 迁移前检查清单

- [ ] 确认目标环境和渠道已创建
- [ ] 确认目标环境是否有同名配置
- [ ] 确认资源引用是否需要调整
- [ ] 备份目标环境现有配置

### 迁移后验证

1. **配置完整性**：检查所有配置是否正确迁移
2. **资源可用性**：确认关联资源可访问
3. **功能测试**：在目标环境进行功能验证
4. **回滚准备**：保留迁移前的备份

### 审计日志

建议记录迁移操作：

```
日期: 2024-03-07 14:30
操作: 配置迁移
源: dev/main
目标: test/main
配置数: 15
结果: 成功
操作人: admin
```

## 常见问题

### Q: 迁移会影响源环境配置吗？

A: 不会。迁移是复制操作，源环境配置保持不变。

### Q: 可以跨环境类型迁移吗？

A: 可以。例如从 SQLite 实例迁移到 MySQL 实例，通过导出/导入方式。

### Q: 资源文件会一起迁移吗？

A: 是的。迁移配置时，关联的资源文件会一并迁移。

### Q: 迁移失败如何处理？

A: 迁移是原子操作，失败的配置不会影响已成功的配置。可以重新执行迁移。

## 下一步

- [导出配置](./export) - 导出配置备份
- [平台对接](../integration/frontend) - 集成到你的项目
