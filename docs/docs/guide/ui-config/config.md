# 配置管理

配置管理是虹桥计划的核心功能。本指南将帮助你创建和管理各种类型的配置。

![配置管理页面](/images/config-page.png)

## 概念说明

### 什么是配置？

配置是系统中用于存储键值对、JSON对象、文本、图片等数据的实体。每个配置都属于一个特定的环境+渠道组合。

### 支持的配置类型

| 类型 | 说明 | 使用场景 |
|------|------|---------|
| 键值对 (KV) | JSON 对象 | 复杂配置、开关集合 |
| 纯文本 | 字符串文本 | 文案、URL、简单配置 |
| 图片 | 图片文件 | 启动图、Banner、图标 |
| 色彩标签 | 颜色值 | 主题色、品牌色 |
| JSON 对象 | JSON 数据 | 结构化配置数据 |

## 创建配置

### 前置条件

创建配置前，需要先创建所属的环境和渠道：
- [环境管理](/guide/ui-config/environment)
- [渠道管理](/guide/ui-config/channel)

### 通过 UI 创建

1. 访问管理界面：`http://localhost:8080/rainbow-bridge`
2. 点击左侧导航栏的 **配置管理**
3. 选择环境和渠道
4. 点击 **新建配置** 按钮
5. 选择配置类型并填写信息
6. 点击 **确定** 保存

### 通过 API 创建

```bash
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/config/create \
  -H "Content-Type: application/json" \
  -d '{
    "resource_key": "uuid-xxx",
    "environment_key": "prod",
    "pipeline_key": "main",
    "name": "api_config",
    "alias": "API配置",
    "content": "{\"timeout\": 5000, \"retries\": 3}",
    "type": "kv",
    "remark": "API请求配置"
  }'
```

## 配置类型详解

### 1. 键值对 (KV)

用于存储结构化的键值配置，内容为 JSON 格式。

**适用场景**：
- API 请求配置（超时、重试次数）
- 功能开关集合
- 多属性配置

**示例**：
```json
{
  "timeout": 5000,
  "max_retries": 3,
  "enable_cache": true,
  "cache_ttl": 300
}
```

**UI 操作**：
1. 选择配置类型：**键值对**
2. 填写配置名称和别名
3. 在编辑器中输入 JSON 内容
4. 保存配置

### 2. 纯文本

用于存储简单的文本字符串。

**适用场景**：
- API 基础地址
- 欢迎文案
- 版本说明
- 简单配置值

**示例**：
```
https://api.example.com/v1
```

或

```
欢迎使用虹桥计划！
```

**UI 操作**：
1. 选择配置类型：**纯文本**
2. 填写配置名称和别名
3. 输入文本内容
4. 保存配置

### 3. 图片

用于存储图片文件，支持多种图片格式。

**适用场景**：
- 启动页图片
- 营销 Banner
- 功能图标
- 背景图片

**支持格式**：
- PNG
- JPEG/JPG
- GIF
- WebP
- SVG

**UI 操作**：
1. 选择配置类型：**图片**
2. 填写配置名称和别名
3. 点击上传区域或拖拽图片
4. 预览确认后保存

**通过 API 上传**：
```bash
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/asset/upload \
  -F "file=@banner.png" \
  -F "environment_key=prod" \
  -F "pipeline_key=main" \
  -F "business_key=marketing" \
  -F "remark=营销Banner"
```

### 4. 色彩标签

用于存储颜色值，方便管理和使用品牌色、主题色等。

**适用场景**：
- 应用主题色
- 品牌色
- 状态颜色（成功/警告/错误）
- 渐变色配置

**格式**：
- 十六进制：`#1677FF`
- RGB：`rgb(22, 119, 255)`
- RGBA：`rgba(22, 119, 255, 0.8)`

**UI 操作**：
1. 选择配置类型：**色彩标签**
2. 填写配置名称和别名
3. 使用颜色选择器选择颜色
4. 或直接输入颜色值
5. 保存配置

### 5. JSON 对象

用于存储复杂的 JSON 结构数据。

**适用场景**：
- 复杂配置结构
- 嵌套数据
- 数组配置

**示例**：
```json
{
  "features": [
    {"name": "dark_mode", "enabled": true},
    {"name": "new_ui", "enabled": false}
  ],
  "settings": {
    "language": "zh-CN",
    "timezone": "Asia/Shanghai"
  }
}
```

## 管理配置

### 查看配置列表

**通过 UI**：
1. 进入 **配置管理** 页面
2. 选择环境和渠道
3. 查看配置列表

**通过 API**：
```bash
curl "http://localhost:8080/rainbow-bridge/api/v1/config/list?environment_key=prod&pipeline_key=main"
```

### 编辑配置

1. 在配置列表中找到目标配置
2. 点击 **编辑** 按钮
3. 修改配置内容
4. 点击 **确定** 保存

### 删除配置

1. 在配置列表中找到目标配置
2. 点击 **删除** 按钮
3. 确认删除操作

::: warning 注意
配置删除后无法恢复，建议删除前先导出备份。
:::

### 批量操作

系统支持批量操作：
- 批量删除
- 批量导出
- 批量迁移

## 获取运行时配置

### 通过 API 获取

```bash
curl http://localhost:8080/rainbow-bridge/api/v1/runtime/config \
  -H "x-environment: prod" \
  -H "x-pipeline: main"
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "api_config": {
      "timeout": 5000,
      "max_retries": 3
    },
    "api_base_url": "https://api.example.com/v1",
    "theme_color": "#1677FF",
    "welcome_message": "欢迎使用虹桥计划！"
  }
}
```

### 客户端集成示例

```javascript
// JavaScript/TypeScript
async function loadConfig() {
  const response = await fetch('/rainbow-bridge/api/v1/runtime/config', {
    headers: {
      'x-environment': 'prod',
      'x-pipeline': 'main'
    }
  });
  const { data } = await response.json();
  return data;
}

// 使用配置
const config = await loadConfig();
console.log(config.api_base_url);
console.log(config.theme_color);
```

## 最佳实践

### 配置命名规范

使用有意义、一致的命名：

```
# 推荐格式：模块_功能_属性
api_base_url           # API基础地址
api_timeout_config     # API超时配置
ui_theme_color         # UI主题色
feature_new_checkout   # 新功能开关
```

### 配置分类建议

按业务模块组织配置：

```
# API 相关
api_base_url
api_timeout
api_retry_config

# UI 相关
ui_theme_color
ui_logo_image
ui_welcome_text

# 功能开关
feature_dark_mode
feature_new_ui
feature_beta_api
```

### 敏感信息处理

::: warning 安全提示
不要在配置中存储敏感信息，如密码、密钥等。建议使用专业的密钥管理服务。
:::

### 版本控制

1. 定期导出配置备份
2. 重大变更前先导出
3. 使用配置迁移功能在不同环境间同步

## 常见问题

### Q: 配置更新后客户端何时生效？

A: 客户端每次请求都会获取最新配置。如需实时推送，可在客户端实现轮询或 WebSocket 监听。

### Q: 配置大小有限制吗？

A: 单个配置建议不超过 1MB，总配置量根据数据库存储决定。大型配置建议拆分。

### Q: 如何实现配置回滚？

A: 系统暂不支持自动版本历史。建议在重大变更前导出配置，需要时导入恢复。

## 下一步

- [资源管理](/guide/ui-config/resource) - 管理静态资源文件
- [导出配置](/guide/ui-config/export) - 导出配置包
- [配置迁移](/guide/ui-config/migration) - 环境间迁移配置
