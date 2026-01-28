# 虹桥计划 AI 辅助开发记录

本文档记录了虹桥计划（Rainbow Bridge）项目中 AI Agent（Qoder）的开发贡献、技术决策和实现细节。

## 目录

1. [AI Agent 角色](#ai-agent-角色)
2. [核心功能开发](#核心功能开发)
3. [技术架构演进](#技术架构演进)
4. [关键技术决策](#关键技术决策)
5. [开发方法论](#开发方法论)
6. [经验总结](#经验总结)

---

## AI Agent 角色

### 协作模式

AI Agent（Qoder）作为开发伙伴，与人类开发者采用 **Pair Programming**（结对编程）模式协作：

- **需求方**：人类开发者提出功能需求和问题反馈
- **实现方**：AI Agent 负责设计、编码、测试和修复
- **验证方**：人类开发者验证功能、提出改进意见

### 核心能力

1. **代码理解**：通过语义搜索快速定位相关代码，理解项目架构
2. **全栈开发**：同时处理后端（Go + Hertz + GORM）和前端（原生 JS）代码
3. **问题诊断**：根据错误日志快速定位问题并提供修复方案
4. **架构设计**：提出符合项目规范的技术架构和实现方案

---

## 核心功能开发

### 1. 环境与渠道

**需求背景**：
- 原系统按业务维度（business_key）管理配置
- 需要支持多环境（开发、测试、生产）和多渠道隔离

**实现过程**：

1. **数据模型设计**
   ```go
   // Environment 表
   type Environment struct {
       EnvironmentKey  string `gorm:"primaryKey"`
       EnvironmentName string
       Remark          string
       CreatedAt       time.Time
       UpdatedAt       time.Time
   }
   
   // Pipeline 表（按环境隔离）
   type Pipeline struct {
       EnvironmentKey string `gorm:"primaryKey"`
       PipelineKey    string `gorm:"primaryKey"`
       PipelineName   string
       Remark         string
       CreatedAt      time.Time
       UpdatedAt      time.Time
   }
   ```

2. **API 接口实现**
   - `GET /api/v1/environment/list` - 获取环境列表
   - `POST /api/v1/environment/create` - 创建环境
   - `GET /api/v1/pipeline/list?environment_key={key}` - 获取渠道列表（按环境）
   - `POST /api/v1/pipeline/create` - 创建渠道

3. **前端组件封装**
   ```javascript
   // components.js
   export async function initEnvSelector(apiBase, onEnvChange)
   export async function initPipelineSelector(apiBase, onPipelineChange)
   export function getCurrentEnvironment()
   export function getCurrentPipeline()
   ```

**关键决策**：
- Pipeline 必须关联 Environment，通过 `environment_key` 建立父子关系
- 所有配置（系统配置、业务配置）都必须同时指定环境和渠道
- 渠道 API 必须传递 `environment_key` 参数实现按环境过滤

### 2. 配置类型系统

**需求背景**：
- 支持多种数据类型（文本、数值、布尔、JSON、键值对、图片、颜色等）
- 前端根据类型提供不同的编辑和展示方式

**实现过程**：

1. **数据模型**
   ```go
   type Config struct {
       ID             uint   `gorm:"primaryKey"`
       ResourceKey    string `gorm:"uniqueIndex:idx_resource"`
       EnvironmentKey string `gorm:"uniqueIndex:idx_resource"`
       PipelineKey    string `gorm:"uniqueIndex:idx_resource"`
       Name           string `gorm:"uniqueIndex:idx_resource"`
       Alias          string
       Type           string `gorm:"type:varchar(20);default:'text'"`
       Content        string `gorm:"type:text"`
       Remark         string
       CreatedAt      time.Time
       UpdatedAt      time.Time
   }
   ```

2. **类型枚举系统**
   ```typescript
   // react/lib/types.ts
   export type ConfigType = 
     | 'text'        // 单行文本
     | 'textarea'    // 多行文本
     | 'richtext'    // 富文本
     | 'number'      // 整数
     | 'decimal'     // 小数
     | 'boolean'     // 布尔值
     | 'keyvalue'    // 键值对
     | 'object'      // JSON对象
     | 'color'       // 色彩标签
     | 'file'        // 文件
     | 'image'       // 图片
   
   export const CONFIG_TYPE_META: Record<ConfigType, { 
     label: string; 
     color: string; 
     description: string 
   }> = {
     text: { label: "文本", color: "...", description: "单行文本输入" },
     // ...
   };
   ```

3. **前端编辑器**
   - 根据配置类型动态渲染对应的输入组件
   - 键值对类型：提供动态添加/删除行功能
   - 图片类型：支持上传并预览
   - 颜色类型：提供颜色选择器
   - JSON 类型：提供格式化和语法校验

**关键决策**：
- 创建独立的 `types.ts` 统一管理类型定义，前后端类型严格映射
- 提供 `normalizeConfigType` 函数处理类型兼容性
- 配置类型与展示方式解耦，便于扩展新类型

### 3. 配置资源化管理

**需求背景**：
- 配置需要通过 `resource_key` 进行唯一标识和分组
- 支持跨环境、跨渠道的配置复用和迁移
- 名称（name）在同一资源下唯一

**实现过程**：

1. **资源键（Resource Key）设计**
   ```go
   type Config struct {
       ResourceKey    string `gorm:"uniqueIndex:idx_resource"`
       EnvironmentKey string `gorm:"uniqueIndex:idx_resource"`
       PipelineKey    string `gorm:"uniqueIndex:idx_resource"`
       Name           string `gorm:"uniqueIndex:idx_resource"` // 名称
       Alias          string // 别名/描述
       Type           string // 配置类型
       Content        string // 配置内容
       // ...
   }
   ```

2. **配置列表查询**
   ```javascript
   // 获取指定资源的配置列表
   async function fetchConfigs(environmentKey, pipelineKey, resourceKey) {
     const res = await fetch(
       `${apiBase}/api/v1/config/list?environment_key=${environmentKey}&pipeline_key=${pipelineKey}&resource_key=${resourceKey}`
     );
     return await res.json();
   }
   ```

3. **配置创建与更新**
   - 创建时指定 `resource_key`、`name`、`type`、`content`
   - 更新时通过 `(resource_key, environment_key, pipeline_key, name)` 定位
   - 支持配置迁移到不同环境/渠道

**关键决策**：
- `resource_key` 用于配置分组和逻辑隔离
- `name` 作为配置的业务标识，在同一资源下唯一
- 联合唯一索引保证配置不重复

### 4. 配置编辑器实现
     
     if (normalizedType === CONFIG_TYPES.KV) {
       populateKvEditor(content);  // 解析 JSON 并填充键值对编辑器
     } else if (normalizedType === "json") {
       elements.contentJsonInput.value = JSON.stringify(JSON.parse(content), null, 2);
     } else if (normalizedType === "text") {
       elements.contentTextInput.value = content;
     }
     // ... 其他类型
   }
   ```

**关键决策**：
- 系统配置 API 返回完整数据（包括 type 和 content），不仅仅是 key/value
- `applySystemKeySelection` 必须是异步函数，因为需要初始化编辑器
- 根据 config_type 自动选择并初始化对应的编辑器

### 4. 导出导入功能修复

**问题背景**：
- 导出和导入页面的渠道选择器显示为空
- 原因：未传递 `environment_key` 参数

**修复过程**：

1. **修改初始化流程**
   ```javascript
   // 原代码（错误）
   await Promise.all([fetchEnvironments(), fetchPipelines()]);
   
   // 修复后（正确）
   await fetchEnvironments();
   if (state.selectedEnv) {
     await fetchPipelines();
   }
   ```

2. **添加环境参数**
   ```javascript
   async function fetchPipelines() {
     if (!state.selectedEnv) {
       state.pipelines = [];
       return;
     }
     
     const res = await fetch(
       `${apiBase}/api/v1/pipeline/list?environment_key=${encodeURIComponent(state.selectedEnv)}`
     );
     // ...
   }
   ```

3. **环境切换联动**
   ```javascript
   function onEnvSelect(evt) {
     const tab = evt.target.closest(".selector-tab");
     if (!tab) return;
     state.selectedEnv = tab.dataset.key;
     renderEnvTabs();
     // 环境切换时重新加载渠道
     fetchPipelines();
   }
   ```

**修复文件**：
- `/Users/zhangyi/gitclone/rainbow_bridge/web/export.js`
- `/Users/zhangyi/gitclone/rainbow_bridge/web/import.js`

---

## 技术架构演进

### 阶段 1：单维度管理（business_key）

```
Config {
  business_key: "system" | "marketing" | ...
  alias: string
  content: string
}
```

**局限性**：
- 无法区分不同环境的配置
- 无法支持多分支/渠道并行开发

### 阶段 2：双维度隔离（environment + pipeline）

```
Config {
  resource_key: string          // 资源标识
  environment_key: "dev" | "prod" | ...
  pipeline_key: "main" | "feature-x" | ...
  name: string                  // 名称
  alias: string                 // 别名
  type: "text" | "number" | "boolean" | "object" | "image" | "color" | ...
  content: string               // 配置内容
}

Asset {
  environment_key: string
  pipeline_key: string
  file_name: string
  content_type: string
  url: string
}
```

**优势**：
- 配置按环境 + 渠道隔离，互不影响
- 支持多团队并行开发
- 通过 `resource_key` 实现配置分组和逻辑隔离

### 阶段 3：类型系统完善

引入类型枚举和专用编辑器：

1. **类型枚举** (`types.ts`)
   - 统一类型常量定义（ConfigType 联合类型）
   - 类型元数据映射（CONFIG_TYPE_META）
   - 向后兼容函数

2. **专用编辑器**
   - KeyValue Editor：动态键值对编辑
   - JSON/Object Editor：格式化 JSON 编辑
   - Image Editor：图片上传 + 预览
   - Color Picker：颜色选择器
   - RichText Editor：富文本编辑器

---

## 关键技术决策

### 1. Proto 定义与代码生成

**决策**：使用 CloudWeGo Hz 工具生成 API 代码

**原因**：
- 统一接口定义规范
- 自动生成路由和 Handler 骨架
- 保证前后端数据结构一致

**实践**：
```bash
# 创建 proto 文件
idl/biz/config.proto

# 生成代码
hz update -idl idl/biz/config.proto -I idl

# 生成位置
biz/model/config/config.pb.go
biz/handler/config/
```

### 2. 数据库联合唯一索引

**决策**：使用 `(resource_key, environment_key, pipeline_key, name)` 联合唯一索引

**原因**：
- 保证同一资源下，同一环境+渠道的名称唯一
- 支持不同资源、不同环境/渠道使用相同名称
- 避免数据冲突和覆盖

**实现**：
```go
type Config struct {
    ResourceKey    string `gorm:"uniqueIndex:idx_resource"`
    EnvironmentKey string `gorm:"uniqueIndex:idx_resource"`
    PipelineKey    string `gorm:"uniqueIndex:idx_resource"`
    Name           string `gorm:"uniqueIndex:idx_resource"`
}
```

### 3. 前端模块化设计

**决策**：使用 ES6 Module 组织前端代码

**原因**：
- 避免全局变量污染
- 代码复用和维护性更好
- 支持按需加载

**结构**：
```
web/
├── lib/
│   ├── types.js      # 类型枚举
│   ├── utils.js      # 工具函数
│   ├── api.js        # API 封装
│   └── toast.js      # 提示组件
├── components.js     # 通用组件
├── system.js         # 系统配置页面
├── config.js         # 业务配置页面
└── ...
```

### 4. 静态路由注册

**决策**：在 `main.go` 中显式注册所有静态资源路由

**原因**：
- Hertz 需要明确注册路由才能访问
- 便于统一管理静态资源
- 支持设置正确的 MIME 类型

**实现**：
```go
func registerStaticRoutes(h *server.Hertz, fsys fs.FS) {
    serve := func(path, file, contentType string) {
        h.GET(path, func(ctx context.Context, c *app.RequestContext) {
            // ...
        })
    }
    
    serve("/lib/types.js", "lib/types.js", "application/javascript")
    serve("/lib/utils.js", "lib/utils.js", "application/javascript")
    // ...
}
```

---

## 开发方法论

### 代码检索策略

AI Agent 使用以下工具定位代码：

1. **语义搜索** (`search_codebase`)
   - 用于理解功能实现位置
   - 示例："环境选择器组件"、"渠道 API 接口"

2. **符号搜索** (`search_symbol`)
   - 用于查找类、函数、接口定义
   - 示例：`initEnvSelector`、`Config`、`ResourceConfig`

3. **文件检索** (`search_file`)
   - 用于定位特定文件
   - 示例：`*environment*.go`、`config.js`

### 修改策略

**原则**：最小化修改，保证兼容性

1. **新增功能**：
   - 创建新文件/函数，不影响现有代码
   - 示例：`types.js` 独立文件

2. **修改现有功能**：
   - 使用 `search_replace` 精确替换
   - 保留原有逻辑，添加新分支
   - 示例：`setDataType` 添加 KV 类型支持

3. **向后兼容**：
   - 提供类型转换函数
   - 示例：`normalizeConfigType("config")` → `"json"`

### 测试验证流程

1. **编译检查**：修改后立即检查编译错误
2. **服务启动**：`go run .` 验证服务正常启动
3. **功能测试**：访问对应页面验证功能
4. **边界测试**：测试空数据、错误输入等场景

---

## 经验总结

### 成功经验

1. **增量开发**
   - 每次只改一个功能点
   - 立即测试，确保功能正常
   - 再进行下一个修改

2. **组件封装**
   - 通用组件（环境选择器）可在多页面复用
   - 工具函数（类型转换）统一放在 `lib/` 目录

3. **类型安全**
   - 使用枚举代替字符串硬编码
   - 提供类型转换和验证函数
   - 减少拼写错误和类型不一致

4. **错误处理**
   - 前端：友好的错误提示（Toast）
   - 后端：详细的错误日志
   - 边界情况保护（空值、空数组）

### 踩过的坑

1. **渠道 API 参数缺失**
   - 问题：未传递 `environment_key` 导致返回空列表
   - 解决：所有渠道 API 必须带环境参数
   - 教训：理解数据隔离的层级关系

2. **静态资源 404**
   - 问题：新创建的 `types.js` 无法访问
   - 解决：在 `main.go` 注册路由
   - 教训：Hertz 需要显式注册所有路由

3. **类型不一致**
   - 问题：前端使用 "keyvalue"，后端使用 "kv"
   - 解决：创建类型枚举系统统一管理
   - 教训：使用常量代替字符串

4. **异步初始化顺序**
   - 问题：渠道依赖环境，但并行加载导致失败
   - 解决：先加载环境，再加载渠道
   - 教训：理解数据依赖关系，按顺序初始化

### 最佳实践

1. **前后端一致性**
   - 数据结构：proto 定义保证一致
   - 字段命名：使用相同的 key 命名
   - 类型枚举：前后端共享类型定义

2. **代码可维护性**
   - 函数职责单一
   - 变量命名清晰
   - 添加必要注释

3. **用户体验**
   - 加载状态提示
   - 操作结果反馈
   - 错误信息明确

4. **扩展性设计**
   - 类型系统易于添加新类型
   - 编辑器组件独立封装
   - API 参数预留扩展字段

---

## 开发统计

### 代码贡献

- **后端文件**：约 20 个（proto、model、dao、service、handler）
- **前端文件**：约 15 个（页面、组件、工具库）
- **代码行数**：约 5000+ 行
- **功能模块**：6 个主要模块

### 功能清单

| 模块 | 功能 | 状态 |
|------|------|------|
| 环境管理 | CRUD + 列表 | ✅ |
| 渠道管理 | CRUD + 列表（按环境） | ✅ |
| 系统配置 | CRUD + 多类型支持 | ✅ |
| 业务配置 | CRUD + 系统配置引用 | ✅ |
| 导出功能 | ZIP + 静态包 | ✅ |
| 导入功能 | ZIP 解析 + 还原 | ✅ |
| 键值对编辑器 | 动态增删 + 验证 | ✅ |
| 类型系统 | 5 种类型 + 枚举 | ✅ |

---

## 致谢

感谢项目维护者 [@zhangyi](https://github.com/yi-nology) 的信任和配合，让 AI Agent 能够深度参与到项目开发中，共同打造出功能完善的虹桥计划配置管理系统。

---

**最后更新**：2026-01-18

**AI Agent**：Qoder (https://www.cursor.com/)
