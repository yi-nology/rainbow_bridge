# 虹桥计划 VuePress 文档

这是虹桥计划（Rainbow Bridge）项目的官方文档系统，基于 VuePress v2 构建。

## 📚 文档结构

```
docs/
├── docs/                      # 文档源文件
│   ├── .vuepress/            # VuePress 配置
│   │   ├── config.ts         # 主配置文件
│   │   └── dist/             # 构建产物（自动生成）
│   ├── index.md              # 首页
│   ├── guide/                # 使用指南
│   ├── status/               # 工程状态
│   ├── release/              # 发版本信息
│   └── api/                  # API 文档
├── package.json              # 依赖配置
└── README.md                 # 本文档说明
```

## 🚀 本地开发

### 安装依赖

```bash
cd docs
npm install
```

### 启动开发服务器

```bash
# 启动热更新服务
npm run docs:dev

# 访问 http://localhost:8080/rainbow_bridge/
```

### 构建生产版本

```bash
# 清理缓存
npm run docs:clean

# 构建静态站点
npm run docs:build

# 构建产物位于 docs/docs/.vuepress/dist/
```

## 📦 部署

### GitHub Pages 自动部署

项目已配置 GitHub Actions workflow（`.github/workflows/deploy-docs.yml`），当推送文档变更到 main 分支时会自动：

1. 安装 Node.js 和依赖
2. 构建 VuePress 站点
3. 部署到 GitHub Pages

**访问地址**: https://yi-nology.github.io/rainbow_bridge/

### 手动部署

```bash
# 构建
npm run docs:build

# 部署到任意静态服务器
cp -r docs/docs/.vuepress/dist/* /path/to/web/server/
```

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
    docsRepo: 'yi-nology/rainbow_bridge',
    docsDir: 'docs',
    docsBranch: 'main',
    // ... 更多配置
  }),
  
  plugins: [
    searchPlugin(),  // 搜索插件
    // ... 更多插件
  ],
})
```

### 导航栏配置

```typescript
navbar: [
  { text: '首页', link: '/' },
  { text: '使用指南', link: '/guide/' },
  { text: '工程状态', link: '/status/' },
  { text: '发版本', link: '/release/' },
  { text: 'API', link: '/api/' },
]
```

### 侧边栏配置

按模块组织文档：

```typescript
sidebar: {
  '/guide/': [
    {
      text: '快速开始',
      children: ['/guide/', '/guide/installation', '/guide/quick-start'],
    },
    // ...
  ],
  // ...
}
```

## 📝 编写文档

### Markdown 语法

支持标准 Markdown 语法，并扩展了以下特性：

#### 自定义容器

```markdown
::: tip 提示
这是一个提示框
:::

::: warning 警告
这是一个警告框
:::

::: danger 危险
这是一个危险框
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

#### 行内代码高亮

```markdown
使用 `npm install` 命令安装依赖
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

### 添加新章节

修改 `config.ts` 的 navbar 和 sidebar 配置。

## 🔧 主题定制

### 样式覆盖

创建 `.vuepress/styles/index.scss`：

```scss
:root {
  --vp-c-brand: #1677FF;
  --vp-c-brand-light: #4096ff;
  --vp-c-brand-dark: #0958d9;
}
```

### 布局组件

可以通过插槽自定义布局：

```vue
<!-- .vuepress/components/CustomLayout.vue -->
<template>
  <Layout>
    <template #page-top>
      <!-- 页面顶部内容 -->
    </template>
  </Layout>
</template>

<script setup>
import Layout from '@vuepress/theme-default/lib/client/layouts/Layout.vue'
</script>
```

## 📊 动态状态展示

文档中的构建和部署状态通过注释标记实现动态更新：

```markdown
<!-- build-status-start -->
| 构建类型 | 状态 |
|---------|------|
| Binary | 🟢 |
<!-- build-status-end -->
```

GitHub Actions 可以解析这些标记并更新状态表格。

## 🚨 故障排查

### 常见问题

#### 1. 构建失败

```bash
# 清理缓存
npm run docs:clean

# 重新安装依赖
rm -rf node_modules package-lock.json
npm install

# 重新构建
npm run docs:build
```

#### 2. 样式异常

检查：
- Tailwind CSS 是否正确加载
- 自定义样式是否冲突
- 浏览器缓存问题

#### 3. 路由 404

确认：
- `base` 路径配置正确
- 文件路径与路由匹配
- 侧边栏配置完整

### 开发调试

```bash
# 查看详细日志
DEBUG=vuepress* npm run docs:dev

# 检查构建产物
ls -la docs/docs/.vuepress/dist/
```

## 🤝 贡献指南

### 添加新文档

1. Fork 项目
2. 创建分支：`git checkout -b feature/docs-topic`
3. 编写文档：在对应目录添加 `.md` 文件
4. 更新配置：修改 `config.ts` 的 sidebar
5. 提交更改：`git commit -m "docs: 添加 XX 文档"`
6. 推送并创建 PR

### 文档规范

- **语言**：简体中文
- **格式**：使用统一的标题层级（# → ## → ###）
- **代码**：提供完整的示例和说明
- **图片**：放在 `/public/images/` 目录
- **链接**：使用相对路径

### 审核流程

1. CI 检查（构建验证）
2. 维护者 Review
3. 合并到 main 分支
4. 自动部署到 GitHub Pages

## 📈 性能优化

### 构建优化

- ✅ 按需加载组件
- ✅ 图片懒加载
- ✅ 压缩静态资源
- ✅ 代码分割

### SEO 优化

```typescript
head: [
  ['meta', { name: 'description', content: '文档描述' }],
  ['meta', { name: 'keywords', content: '关键词 1, 关键词 2' }],
  ['link', { rel: 'canonical', href: 'https://example.com' }],
]
```

## 🔗 相关链接

- [VuePress 官方文档](https://v2.vuepress.vuejs.org/)
- [默认主题](https://v2.vuepress.vuejs.org/zh/reference/default-theme/)
- [项目主页](https://github.com/yi-nology/rainbow_bridge)
- [GitHub Pages](https://yi-nology.github.io/rainbow_bridge/)

## 📄 开源协议

遵循项目的 Apache License 2.0 协议。
