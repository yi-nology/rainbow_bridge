# 资源管理

资源管理功能用于上传和管理静态资源文件。本指南将帮助你高效管理项目中的各类静态资源。

![资源管理页面](/images/resources-page.png)

## 概念说明

### 什么是资源？

资源是指项目中使用的静态文件，包括但不限于：

| 类型 | 格式 | 使用场景 |
|------|------|---------|
| 图片 | PNG, JPG, GIF, WebP, SVG | 启动图、Banner、图标 |
| 字体 | TTF, OTF, WOFF, WOFF2 | 自定义字体 |
| 文档 | PDF, DOC, XLS | 用户协议、帮助文档 |
| 音频 | MP3, WAV, AAC | 提示音、背景音乐 |
| 视频 | MP4, WebM | 教程视频、广告视频 |
| 其他 | JSON, XML, ZIP | 数据文件、配置包 |

### 资源与配置的关系

资源管理是配置管理的补充，主要用于：

1. **图片配置**：上传图片后在配置中引用
2. **独立资源**：存储不与配置关联的静态文件
3. **批量分发**：通过导出功能批量分发资源

## 上传资源

### 通过 UI 上传

1. 访问管理界面：`http://localhost:8080/rainbow-bridge`
2. 点击左侧导航栏的 **资源管理**
3. 选择环境和渠道
4. 点击 **上传资源** 按钮
5. 选择文件或拖拽上传
6. 填写资源信息：
   - **业务标识**：用于分类管理
   - **备注**：可选，描述信息
7. 点击 **确定** 上传

### 通过 API 上传

```bash
curl -X POST http://localhost:8080/rainbow-bridge/api/v1/asset/upload \
  -F "file=@banner.png" \
  -F "environment_key=prod" \
  -F "pipeline_key=main" \
  -F "business_key=marketing" \
  -F "remark=营销活动Banner"
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

### 批量上传

UI 支持同时选择多个文件上传：

1. 点击 **上传资源**
2. 选择多个文件
3. 统一设置业务标识和备注
4. 点击 **确定** 上传

## 管理资源

### 查看资源列表

**通过 UI**：
1. 进入 **资源管理** 页面
2. 选择环境和渠道
3. 查看资源列表

可以按以下方式筛选：
- 业务标识
- 文件类型
- 上传时间

**通过 API**：
```bash
curl "http://localhost:8080/rainbow-bridge/api/v1/asset/list?environment_key=prod&pipeline_key=main"
```

### 预览资源

对于图片、PDF等可预览的文件：

1. 在资源列表中找到目标资源
2. 点击 **预览** 按钮
3. 在弹窗中查看资源内容

### 下载资源

**通过 UI**：
1. 在资源列表中找到目标资源
2. 点击 **下载** 按钮

**通过 API**：
```bash
curl -O http://localhost:8080/rainbow-bridge/api/v1/asset/file/uuid-xxx
```

### 删除资源

1. 在资源列表中选择要删除的资源
2. 点击 **删除** 按钮
3. 确认删除操作

::: warning 注意
删除资源后，引用该资源的配置可能无法正常工作。建议删除前检查引用关系。
:::

## 资源引用

### 在配置中引用

上传资源后，可以在配置中通过 `asset://` 协议引用：

**图片配置**：
```json
{
  "logo": "asset://uuid-xxx",
  "banner": "asset://uuid-yyy"
}
```

**运行时解析**：

当获取运行时配置时，系统会自动解析资源引用：

```json
{
  "logo": "https://your-domain.com/api/v1/asset/file/uuid-xxx",
  "banner": "https://your-domain.com/api/v1/asset/file/uuid-yyy"
}
```

### 客户端使用

```javascript
// 获取配置后直接使用
const config = await loadConfig();

// 图片 URL 已解析为完整路径
document.getElementById('logo').src = config.logo;
```

## 业务标识

### 什么是业务标识？

业务标识（business_key）用于对资源进行分类管理，便于筛选和组织。

### 推荐分类

```
marketing     - 营销活动相关
ui            - UI界面相关
user          - 用户相关
system        - 系统相关
docs          - 文档类
```

### 使用场景

```
# 营销活动资源
marketing/spring-sale/banner.png
marketing/spring-sale/icon.png

# UI 资源
ui/logo.png
ui/splash.png

# 用户协议
docs/user-agreement.pdf
docs/privacy-policy.pdf
```

## 资源导出

### 导出单个资源

直接通过下载按钮或 API 下载。

### 批量导出

使用 [导出配置](/guide/ui-config/export) 功能，可以同时导出配置和关联的资源：

1. 进入 **导出配置** 页面
2. 选择环境和渠道
3. 勾选需要导出的配置和资源
4. 下载 ZIP 包

导出包结构：
```
export.zip
├── config.json          # 配置数据
├── assets/              # 资源文件
│   ├── uuid-xxx/
│   │   └── banner.png
│   └── uuid-yyy/
│       └── logo.png
└── manifest.json        # 清单文件
```

## 最佳实践

### 文件命名规范

```
# 推荐格式：模块_用途_尺寸.扩展名
home_banner_750x400.png
user_avatar_default.png
app_logo_1024.png
```

### 文件大小优化

1. **图片压缩**：上传前压缩图片，减少存储和传输成本
2. **格式选择**：
   - 照片类使用 JPG
   - 图标类使用 PNG 或 SVG
   - 动画使用 GIF 或 WebP
3. **尺寸适配**：根据实际使用场景准备合适尺寸

### 资源组织建议

```
# 按业务模块组织
marketing/
  ├── banners/
  ├── icons/
  └── backgrounds/

ui/
  ├── logo/
  ├── splash/
  └── icons/
```

### 版本管理

1. 更新资源时，建议上传新文件而非覆盖
2. 在配置中更新引用
3. 确认无误后删除旧资源

## 常见问题

### Q: 单个文件大小有限制吗？

A: 默认限制为 50MB，可通过服务器配置调整。

### Q: 支持哪些文件格式？

A: 支持常见的图片、文档、音视频格式。如有特殊格式需求，可联系管理员。

### Q: 资源存储在哪里？

A: 资源存储在服务器的 `data/uploads/` 目录，或配置的对象存储服务。

### Q: 如何实现资源CDN加速？

A: 可以配置 Nginx 或 CDN 对资源路径进行加速，或使用对象存储服务。

## 下一步

- [导出配置](/guide/ui-config/export) - 导出配置和资源包
- [配置迁移](/guide/ui-config/migration) - 迁移配置和资源到其他环境
