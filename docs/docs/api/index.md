# API 接口文档

虹桥计划提供完整的 RESTful API 接口，用于配置管理和资源分发。

## 📚 接口概览

### 基础信息

**Base URL**: `http://localhost:8080/rainbow-bridge/api/v1`

**请求头**：
```http
Content-Type: application/json
x-environment: prod      # 环境标识（部分接口需要）
x-pipeline: main         # 渠道标识（部分接口需要）
```

### 响应格式

所有接口返回统一的 JSON 格式：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

**状态码说明**：
- `0`: 成功
- `400`: 请求参数错误
- `404`: 资源不存在
- `500`: 服务器内部错误

## 🔌 接口详情

### 环境管理 API

#### 获取环境列表

```http
GET /api/v1/environment/list
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "environments": [
      {
        "environment_key": "prod",
        "environment_name": "生产环境",
        "remark": "线上生产环境",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z"
      }
    ]
  }
}
```

#### 创建环境

```http
POST /api/v1/environment/create
Content-Type: application/json

{
  "environment_key": "test",
  "environment_name": "测试环境",
  "remark": "功能测试环境"
}
```

#### 更新环境

```http
POST /api/v1/environment/update
Content-Type: application/json

{
  "environment_key": "test",
  "environment_name": "集成测试环境",
  "remark": "CI/CD集成测试环境"
}
```

#### 删除环境

```http
POST /api/v1/environment/delete
Content-Type: application/json

{
  "environment_key": "test"
}
```

### 渠道管理 API

#### 获取渠道列表

```http
GET /api/v1/pipeline/list?environment_key=prod
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "pipelines": [
      {
        "environment_key": "prod",
        "pipeline_key": "main",
        "pipeline_name": "主渠道",
        "remark": "生产发布渠道",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z"
      }
    ]
  }
}
```

#### 创建渠道

```http
POST /api/v1/pipeline/create
Content-Type: application/json

{
  "environment_key": "prod",
  "pipeline_key": "hotfix",
  "pipeline_name": "紧急修复渠道",
  "remark": "生产紧急修复渠道"
}
```

### 配置管理 API

#### 获取配置列表

```http
GET /api/v1/config/list?environment_key=prod&pipeline_key=main
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "configs": [
      {
        "resource_key": "uuid-xxx",
        "environment_key": "prod",
        "pipeline_key": "main",
        "name": "api_base_url",
        "alias": "API 地址",
        "content": "https://api.example.com",
        "type": "text",
        "remark": "后端 API 基础地址",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z"
      }
    ]
  }
}
```

#### 创建配置

```http
POST /api/v1/config/create
Content-Type: application/json

{
  "resource_key": "uuid-xxx",
  "environment_key": "prod",
  "pipeline_key": "main",
  "name": "feature_flag_new_ui",
  "alias": "新 UI 开关",
  "content": "true",
  "type": "boolean",
  "remark": "是否启用新 UI"
}
```

#### 更新配置

```http
POST /api/v1/config/update
Content-Type: application/json

{
  "resource_key": "uuid-xxx",
  "environment_key": "prod",
  "pipeline_key": "main",
  "name": "feature_flag_new_ui",
  "content": "false"
}
```

#### 删除配置

```http
POST /api/v1/config/delete
Content-Type: application/json

{
  "resource_key": "uuid-xxx",
  "environment_key": "prod",
  "pipeline_key": "main"
}
```

### 静态资源 API

#### 获取资源列表

```http
GET /api/v1/asset/list?environment_key=prod&pipeline_key=main
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "assets": [
      {
        "file_id": "uuid-xxx",
        "business_key": "marketing",
        "file_name": "banner.png",
        "content_type": "image/png",
        "file_size": 102400,
        "path": "data/uploads/uuid-xxx/banner.png",
        "url": "/api/v1/asset/file/uuid-xxx",
        "remark": "营销 Banner 图",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z"
      }
    ]
  }
}
```

#### 上传资源

```http
POST /api/v1/asset/upload
Content-Type: multipart/form-data

FormData:
- file: <binary>
- environment_key: prod
- pipeline_key: main
- business_key: marketing
- remark: 营销 Banner 图
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "file_id": "uuid-xxx",
    "url": "/api/v1/asset/file/uuid-xxx",
    "asset_ref": "asset://uuid-xxx"
  }
}
```

#### 下载资源

```http
GET /api/v1/asset/file/{file_id}
```

**响应**：
- Content-Type: 根据文件类型自动设置
- Content-Disposition: attachment; filename="xxx"

### 运行时配置 API

#### 获取运行时配置

```http
GET /api/v1/runtime/config
Headers:
  x-environment: prod
  x-pipeline: main
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "system_config": {
      "app_name": "虹桥计划",
      "version": "v3.1.3"
    },
    "business_configs": {
      "api_base_url": "https://api.example.com",
      "feature_flags": {
        "new_ui": true,
        "dark_mode": false
      }
    },
    "environment": {
      "environment_key": "prod",
      "pipeline_key": "main"
    }
  }
}
```

#### 导出静态包

```http
GET /api/v1/runtime/static?environment_key=prod&pipeline_key=main
```

**响应**：
- Content-Type: application/zip
- Content-Disposition: attachment; filename="static.zip"

**包含内容**：
```
static.zip
├── config.json          # 所有配置的 JSON
├── assets/              # 引用的静态资源
│   └── uuid-xxx/
│       └── banner.png
└── index.html          # 示例页面
```

### 配置迁移 API

#### 获取导出树

```http
GET /api/v1/transfer/export-tree
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "tree": [
      {
        "environment_key": "prod",
        "environment_name": "生产环境",
        "pipelines": [
          {
            "pipeline_key": "main",
            "pipeline_name": "主渠道",
            "config_count": 15
          }
        ]
      }
    ]
  }
}
```

#### 选择性导出

```http
POST /api/v1/transfer/export
Content-Type: application/json

{
  "selections": [
    {
      "environment_key": "prod",
      "pipeline_key": "main",
      "resource_keys": ["uuid-1", "uuid-2"]
    }
  ]
}
```

**响应**：
- Content-Type: application/zip
- Content-Disposition: attachment; filename="export.zip"

#### 导入预览

```http
POST /api/v1/transfer/import-preview
Content-Type: multipart/form-data

FormData:
- file: <export.zip>
- environment_key: test
- pipeline_key: main
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

#### 选择性导入

```http
POST /api/v1/transfer/import-selective
Content-Type: multipart/form-data

FormData:
- file: <export.zip>
- environment_key: test
- pipeline_key: main
- resource_keys: ["uuid-1", "uuid-2"]
- overwrite: false
```

#### 配置迁移

```http
POST /api/v1/transfer/migrate
Content-Type: application/json

{
  "source_environment": "dev",
  "source_pipeline": "main",
  "target_environment": "test",
  "target_pipeline": "main",
  "resource_keys": ["uuid-1", "uuid-2"],
  "overwrite": false
}
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "migrated": 5,
    "skipped": 2,
    "failed": 0,
    "details": [
      {
        "name": "api_base_url",
        "status": "migrated",
        "message": ""
      }
    ]
  }
}
```

### 版本管理 API

#### 获取版本信息

```http
GET /api/v1/version
```

**响应示例**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "version": "v3.1.3",
    "git_commit": "abc123",
    "build_time": "2026-03-07T10:00:00Z",
    "go_version": "go1.22"
  }
}
```

## 🔐 认证与授权

### 当前状态

当前版本暂未实现强制认证，建议在生产环境中通过以下方式保护 API：

1. **Nginx 认证**：使用 Nginx basic auth
2. **API 网关**：在 API 网关层实现 Token 验证
3. **防火墙规则**：限制访问 IP 范围

### 未来规划

- [ ] JWT Token 认证
- [ ] API Key 机制
- [ ] OAuth2 集成
- [ ] RBAC 权限控制

## 📊 限流与配额

### 推荐配置

生产环境建议实施限流：

```yaml
# Nginx 限流配置
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

location /api/ {
    limit_req zone=api_limit burst=20 nodelay;
}
```

## 🐛 错误处理

### 常见错误码

| 错误码 | 说明 | 解决方案 |
|--------|------|---------|
| 400 | 请求参数错误 | 检查请求体和参数 |
| 404 | 资源不存在 | 确认环境和渠道已创建 |
| 500 | 服务器错误 | 查看服务器日志 |

### 错误响应示例

```json
{
  "code": 400,
  "message": "invalid parameter: environment_key is required",
  "data": null
}
```

## 💡 最佳实践

### 1. 批量操作

使用批量接口减少请求次数：

```javascript
// ❌ 不推荐：多次请求
const configs = await Promise.all([
  fetch('/api/config/1'),
  fetch('/api/config/2'),
  fetch('/api/config/3'),
]);

// ✅ 推荐：一次请求
const configs = await fetch('/api/runtime/config', {
  headers: {
    'x-environment': 'prod',
    'x-pipeline': 'main'
  }
});
```

### 2. 缓存策略

客户端应缓存运行时配置：

```javascript
// 使用 localStorage 缓存
const cacheKey = 'runtime_config_prod_main';
const cached = localStorage.getItem(cacheKey);
const cachedTime = localStorage.getItem(cacheKey + '_time');

if (cached && Date.now() - cachedTime < 5 * 60 * 1000) {
  return JSON.parse(cached);
}

// 5 分钟后过期
```

### 3. 错误重试

实现指数退避重试：

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
}
```

## 🔗 相关链接

- [Postman 集合](../../tests/e2e/api-tests.json)
- [OpenAPI 规范](../../idl/biz/*.proto)
- [GitHub Issues](https://github.com/yi-nology/rainbow_bridge/issues)
