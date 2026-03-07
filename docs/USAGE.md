# VuePress 文档系统使用指南

## 📦 项目结构

```
docs/
├── docs/                          # 文档源文件
│   ├── .vuepress/                 # VuePress 配置目录
│   │   ├── config.ts              # 主配置文件
│   │   ├── dist/                  # 构建产物（自动生成）
│   │   └── .cache/                # 缓存目录（可清理）
│   ├── public/                    # 静态资源目录
│   │   └── icon.svg               # 项目图标
│   ├── guide/                     # 使用指南
│   │   ├── index.md               # 指南首页
│   │   ├── installation.md        # 安装部署
│   │   └── quick-start.md         # 快速开始
│   ├── status/                    # 工程状态
│   │   └── index.md               # 状态概览
│   ├── release/                   # 发版本信息
│   │   └── index.md               # 版本历史
│   ├── api/                       # API 文档
│   │   └── index.md               # API 概览
│   └── index.md                   # 文档首页
├── package.json                   # 依赖配置
├── package-lock.json              # 锁定依赖版本
└── README.md                      # 本文档说明
```

## 🚀 快速开始

### 1. 安装依赖

首次使用需要安装依赖：

```bash
cd docs
npm install
```

这会安装：
- VuePress 2.0.0-rc.18
- 默认主题
- 搜索插件
- Vue 3.5+

### 2. 本地开发

启动开发服务器（支持热更新）：

```bash
npm run docs:dev
```

访问：http://localhost:8080/rainbow_bridge/

**特性**：
- ✅ 实时预览
- ✅ 热更新
- ✅ 源码错误提示

### 3. 构建生产版本

```bash
# 清理缓存（可选）
npm run docs:clean

# 构建静态站点
npm run docs:build
```

构建产物位于：`docs/docs/.vuepress/dist/`

## 📝 文档组织

### 核心模块

#### 1. 首页 (`index.md`)
- 项目简介和核心特性
- 实时构建和部署状态
- 快速链接和快速开始指南

#### 2. 使用指南 (`guide/`)
- **index.md**: 指南总览和学习路径
- **installation.md**: 详细安装步骤（Docker/K8s/本地）
- **quick-start.md**: 5 分钟快速体验

#### 3. 工程状态 (`status/`)
- **index.md**: 构建、部署、测试状态概览
- 详细的 CI/CD 流程说明
- 质量指标和监控信息

#### 4. 发版本信息 (`release/`)
- **index.md**: 版本历史、发版流程、变更日志
- 自动打 tag 说明
- GitHub Actions 集成

#### 5. API 文档 (`api/`)
- **index.md**: 完整的 REST API 参考
- 接口分类和示例
- 最佳实践

### 导航结构

**顶部导航栏**：
- 首页
- 使用指南
- 工程状态
- 发版本
- API

**侧边栏**（按模块分组）：
- 使用指南 → 快速开始、UI配置流程、平台对接
- 工程状态 → 构建状态、部署测试、测试覆盖
- 发版本 → 版本历史、发布流程、变更日志
- API → 各模块接口详情

## ⚙️ 配置说明

### 核心配置 (config.ts)

```typescript
export default defineUserConfig({
  lang: 'zh-CN',
  title: '虹桥计划',
  description: '虹桥计划技术文档',
  base: '/rainbow_bridge/',  // GitHub Pages 路径
  
  theme: defaultTheme({
    repo: 'yi-nology/rainbow_bridge',
    editLinkText: '在 GitHub 上编辑此页',
    lastUpdatedText: '上次更新',
    
    navbar: [/* 导航配置 */],
    sidebar: [/* 侧边栏配置 */],
  }),
  
  plugins: [
    searchPlugin(),  // 搜索功能
  ],
})
```

### 添加新页面

1. 在对应目录创建 `.md` 文件
2. 添加 Frontmatter：

```markdown
---
title: 页面标题
---

# 页面内容
```

3. 在 `config.ts` 的 sidebar 中添加路由

### 自定义样式

创建 `.vuepress/styles/index.scss`：

```scss
:root {
  --vp-c-brand: #1677FF;  // 主题色
}
```

## 🔧 开发技巧

### Markdown 扩展

#### 自定义容器

```markdown
::: tip 提示
这是提示框
:::

::: warning 警告
这是警告框
:::

::: danger 危险
这是危险框
:::
```

#### 代码块语法高亮

````markdown
```javascript
import { ref } from 'vue'

export default {
  setup() {
    const count = ref(0)
    return { count }
  }
}
```
````

#### 表格

```markdown
| 列 1 | 列 2 | 列 3 |
|------|------|------|
| 内容 1 | 内容 2 | 内容 3 |
```

### 组件使用

VuePress 支持 Vue 组件：

```vue
<ScriptSetup>
import { ref } from 'vue'
const count = ref(0)
</ScriptSetup>

<button @click="count++">计数：{{ count }}</button>
```

## 🌐 部署

### GitHub Pages 自动部署

已配置 GitHub Actions workflow：

**触发条件**：
- Push 到 main 分支（`docs/**` 变更）
- PR 到 main 分支
- 手动触发（workflow_dispatch）

**部署流程**：
1. 检出代码
2. 安装 Node.js 20
3. 安装依赖（npm ci）
4. 构建 VuePress 站点
5. 上传到 GitHub Pages

**访问地址**：
```
https://yi-nology.github.io/rainbow_bridge/
```

### 手动部署

```bash
# 构建
npm run docs:build

# 使用 gh-pages 包部署
npm install --save-dev gh-pages
npx gh-pages -d docs/.vuepress/dist
```

## 🐛 故障排查

### 常见问题

#### 1. 依赖安装失败

```bash
# 清理缓存
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

#### 2. 构建失败

```bash
# 清理缓存
npm run docs:clean

# 查看详细日志
DEBUG=vuepress* npm run docs:build
```

#### 3. 样式异常

检查：
- `.vuepress/config.ts` 配置正确
- 自定义样式无冲突
- 浏览器缓存已清理

### 性能优化

**构建优化**：
- ✅ 按需加载组件
- ✅ 图片懒加载
- ✅ 代码分割

**SEO 优化**：

```typescript
head: [
  ['meta', { name: 'description', content: '文档描述' }],
  ['meta', { name: 'keywords', content: '关键词' }],
  ['link', { rel: 'canonical', href: 'https://example.com' }],
]
```

## 🤝 贡献指南

### 添加新文档

1. Fork 项目
2. 创建分支：`git checkout -b feature/docs-topic`
3. 编写文档
4. 更新配置（config.ts）
5. 提交：`git commit -m "docs: 添加 XX 文档"`
6. 推送并创建 PR

### 文档规范

- **语言**：简体中文
- **格式**：统一标题层级
- **代码**：提供完整示例
- **图片**：放在 `/public/images/`
- **链接**：使用相对路径

### Commit Message 规范

```
docs(module): 简短描述

详细说明（可选）

Closes #issue-number
```

例如：
```
docs(guide): 添加 Kubernetes 部署指南

- 详细说明 K8s 部署步骤
- 添加验证清单
- 补充故障排查说明
```

## 📊 状态标记

文档中的动态状态通过注释标记实现：

```markdown
<!-- build-status-start -->
| 构建类型 | 状态 |
|---------|------|
| Binary | 🟢 |
<!-- build-status-end -->
```

GitHub Actions 可以解析并更新这些区域。

## 🔗 相关资源

- [VuePress 官方文档](https://v2.vuepress.vuejs.org/)
- [默认主题配置](https://v2.vuepress.vuejs.org/zh/reference/default-theme/)
- [项目 GitHub](https://github.com/yi-nology/rainbow_bridge)
- [GitHub Pages](https://yi-nology.github.io/rainbow_bridge/)

## 📄 开源协议

遵循项目的 Apache License 2.0 协议。

---

**最后更新**: 2026-03-07  
**维护者**: yi-nology 团队
