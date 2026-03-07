# 渠道管理

渠道（Pipeline）是虹桥计划中用于在同一环境下管理不同功能分支或版本线的概念。本指南将帮助你创建和管理渠道。

## 概念说明

### 什么是渠道？

渠道用于在同一环境下进一步细分配置，适用于以下场景：

| 渠道标识 | 说明 | 典型用途 |
|---------|------|---------|
| `main` | 主渠道 | 正式发布的版本 |
| `hotfix` | 热修复渠道 | 紧急修复的版本 |
| `feature-xxx` | 功能渠道 | 特定功能的开发版本 |
| `experiment` | 实验渠道 | A/B 测试、灰度发布 |

### 渠道与配置的关系

渠道是配置的容器，每个配置都属于一个特定的环境+渠道组合：

```
prod (环境)
└── main (渠道)
    ├── api_base_url
    ├── theme_color
    └── feature_flags

prod (环境)
└── hotfix (渠道)
    ├── api_base_url      # 可以有不同的值
    ├── theme_color
    └── feature_flags
```

## 创建渠道

### 前置条件

创建渠道前，需要先创建所属的环境。参见 [环境管理](/guide/ui-config/environment)。

### 通过 UI 创建

1. 访问管理界面：`http://localhost:8080/rainbow-bridge`
2. 点击左侧导航栏的 **环境管理**
3. 找到目标环境，点击 **管理渠道** 按钮
4. 点击 **新建渠道** 按钮
5. 填写渠道信息：
   - **渠道标识**：唯一标识符，如 `main`
   - **渠道名称**：显示名称，如 `主渠道`
   - **备注**：可选，描述信息
6. 点击 **确定** 保存

### 通过 API 创建

```bash
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/pipeline/create \
  -H "Content-Type: application/json" \
  -d '{
    "environment_key": "prod",
    "pipeline_key": "hotfix",
    "pipeline_name": "热修复渠道",
    "remark": "生产环境热修复版本"
  }'
```

## 管理渠道

### 查看渠道列表

**通过 UI**：
1. 进入 **环境管理** 页面
2. 点击环境的 **管理渠道** 按钮

**通过 API**：
```bash
curl "http://localhost:8080/rainbow-bridge/api/v1/pipeline/list?environment_key=prod"
```

### 编辑渠道

1. 在渠道列表中找到目标渠道
2. 点击 **编辑** 按钮
3. 修改渠道名称或备注
4. 点击 **确定** 保存

::: warning 注意
渠道标识（pipeline_key）创建后不可修改，只能修改渠道名称和备注。
:::

### 删除渠道

1. 在渠道列表中找到目标渠道
2. 点击 **删除** 按钮
3. 确认删除操作

::: danger 警告
删除渠道将同时删除该渠道下的所有配置，此操作不可恢复！
:::

## 渠道切换

### 运行时切换

客户端通过请求头指定渠道：

```bash
# 获取 prod 环境下 main 渠道的配置
curl http://localhost:8080/rainbow-bridge/api/v1/runtime/config \
  -H "x-environment: prod" \
  -H "x-pipeline: main"

# 获取 prod 环境下 hotfix 渠道的配置
curl http://localhost:8080/rainbow-bridge/api/v1/runtime/config \
  -H "x-environment: prod" \
  -H "x-pipeline: hotfix"
```

### 客户端集成

```javascript
// 获取配置时指定渠道
const config = await fetch('/api/v1/runtime/config', {
  headers: {
    'x-environment': 'prod',
    'x-pipeline': 'hotfix'
  }
}).then(res => res.json());
```

## 最佳实践

### 渠道命名规范

```
# 推荐的命名方式
main          - 主渠道（正式发布）
hotfix        - 热修复渠道
feature-xxx   - 特定功能渠道
experiment    - 实验性功能渠道
beta          - 公测渠道
alpha         - 内测渠道
```

### 常见使用场景

#### 场景 1：热修复发布

```
生产环境配置出现问题，需要紧急修复：

1. 创建 hotfix 渠道
2. 在 hotfix 渠道中修复配置
3. 客户端切换到 hotfix 渠道
4. 问题解决后，同步到 main 渠道
```

#### 场景 2：灰度发布

```
新功能需要小范围测试：

1. 创建 experiment 渠道
2. 配置新功能的开关和参数
3. 部分用户切换到 experiment 渠道
4. 测试通过后，合并到 main 渠道
```

#### 场景 3：多版本共存

```
同时维护多个版本：

prod
├── v1 (旧版本渠道)
├── v2 (当前版本渠道)
└── v3 (新版本渠道)
```

### 配置继承建议

新渠道可以从现有渠道复制配置：

1. 使用 [配置迁移](/guide/ui-config/migration) 功能
2. 选择源渠道的配置复制到新渠道
3. 修改需要差异化的配置

## 常见问题

### Q: 渠道标识可以修改吗？

A: 不可以。渠道标识是系统的唯一标识，创建后不可修改。

### Q: 一个环境可以有多少个渠道？

A: 系统没有限制，但建议根据实际需要创建，通常不超过 5 个。

### Q: 不同渠道的配置可以不同吗？

A: 是的，这正是渠道的核心用途。同一配置在不同渠道可以有不同的值。

### Q: 如何实现渠道间的配置同步？

A: 使用 [配置迁移](/guide/ui-config/migration) 功能，可以选择性复制配置到其他渠道。

## 下一步

- [配置管理](/guide/ui-config/config) - 学习如何创建和管理配置
- [资源管理](/guide/ui-config/resource) - 了解静态资源的管理
- [配置迁移](/guide/ui-config/migration) - 在渠道间迁移配置
