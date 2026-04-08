# 虹桥计划设计规范

## 1. 概述

虹桥计划的设计规范旨在确保前端开发团队能够创建一致、美观且易于维护的用户界面。本规范覆盖了色彩系统、字体系统、布局系统、组件样式和交互规范等方面，为开发团队提供清晰的设计指南。

## 2. 色彩系统

### 2.1 色彩模型

虹桥计划使用 OKLCH 色彩模型，这种模型在不同设备和背景下提供更一致的色彩表现，同时更好地支持无障碍设计。

### 2.2 浅色模式色彩

| 变量名 | OKLCH 值 | 用途 |
|--------|----------|------|
| --background | oklch(1 0 0) | 页面背景 |
| --foreground | oklch(0.145 0 0) | 文本颜色 |
| --card | oklch(1 0 0) | 卡片背景 |
| --card-foreground | oklch(0.145 0 0) | 卡片文本 |
| --popover | oklch(1 0 0) | 弹出层背景 |
| --popover-foreground | oklch(0.145 0 0) | 弹出层文本 |
| --primary | oklch(0.205 0 0) | 主要按钮、链接 |
| --primary-foreground | oklch(0.985 0 0) | 主要元素文本 |
| --secondary | oklch(0.97 0 0) | 次要按钮 |
| --secondary-foreground | oklch(0.205 0 0) | 次要元素文本 |
| --muted | oklch(0.97 0 0) | 静音背景 |
| --muted-foreground | oklch(0.556 0 0) | 静音文本 |
| --accent | oklch(0.97 0 0) | 强调背景 |
| --accent-foreground | oklch(0.205 0 0) | 强调文本 |
| --destructive | oklch(0.577 0.245 27.325) | 危险操作 |
| --destructive-foreground | oklch(0.577 0.245 27.325) | 危险文本 |
| --border | oklch(0.922 0 0) | 边框 |
| --input | oklch(0.922 0 0) | 输入框 |
| --ring | oklch(0.708 0 0) | 聚焦环 |
| --chart-1 | oklch(0.646 0.222 41.116) | 图表颜色1 |
| --chart-2 | oklch(0.6 0.118 184.704) | 图表颜色2 |
| --chart-3 | oklch(0.398 0.07 227.392) | 图表颜色3 |
| --chart-4 | oklch(0.828 0.189 84.429) | 图表颜色4 |
| --chart-5 | oklch(0.769 0.188 70.08) | 图表颜色5 |
| --sidebar | oklch(0.985 0 0) | 侧边栏背景 |
| --sidebar-foreground | oklch(0.145 0 0) | 侧边栏文本 |
| --sidebar-primary | oklch(0.205 0 0) | 侧边栏主要 |
| --sidebar-primary-foreground | oklch(0.985 0 0) | 侧边栏主要文本 |
| --sidebar-accent | oklch(0.97 0 0) | 侧边栏强调 |
| --sidebar-accent-foreground | oklch(0.205 0 0) | 侧边栏强调文本 |
| --sidebar-border | oklch(0.922 0 0) | 侧边栏边框 |
| --sidebar-ring | oklch(0.708 0 0) | 侧边栏聚焦环 |

### 2.3 深色模式色彩

| 变量名 | OKLCH 值 | 用途 |
|--------|----------|------|
| --background | oklch(0.145 0 0) | 页面背景 |
| --foreground | oklch(0.985 0 0) | 文本颜色 |
| --card | oklch(0.145 0 0) | 卡片背景 |
| --card-foreground | oklch(0.985 0 0) | 卡片文本 |
| --popover | oklch(0.145 0 0) | 弹出层背景 |
| --popover-foreground | oklch(0.985 0 0) | 弹出层文本 |
| --primary | oklch(0.985 0 0) | 主要按钮、链接 |
| --primary-foreground | oklch(0.205 0 0) | 主要元素文本 |
| --secondary | oklch(0.269 0 0) | 次要按钮 |
| --secondary-foreground | oklch(0.985 0 0) | 次要元素文本 |
| --muted | oklch(0.269 0 0) | 静音背景 |
| --muted-foreground | oklch(0.708 0 0) | 静音文本 |
| --accent | oklch(0.269 0 0) | 强调背景 |
| --accent-foreground | oklch(0.985 0 0) | 强调文本 |
| --destructive | oklch(0.396 0.141 25.723) | 危险操作 |
| --destructive-foreground | oklch(0.637 0.237 25.331) | 危险文本 |
| --border | oklch(0.269 0 0) | 边框 |
| --input | oklch(0.269 0 0) | 输入框 |
| --ring | oklch(0.439 0 0) | 聚焦环 |
| --chart-1 | oklch(0.488 0.243 264.376) | 图表颜色1 |
| --chart-2 | oklch(0.696 0.17 162.48) | 图表颜色2 |
| --chart-3 | oklch(0.769 0.188 70.08) | 图表颜色3 |
| --chart-4 | oklch(0.627 0.265 303.9) | 图表颜色4 |
| --chart-5 | oklch(0.645 0.246 16.439) | 图表颜色5 |
| --sidebar | oklch(0.205 0 0) | 侧边栏背景 |
| --sidebar-foreground | oklch(0.985 0 0) | 侧边栏文本 |
| --sidebar-primary | oklch(0.488 0.243 264.376) | 侧边栏主要 |
| --sidebar-primary-foreground | oklch(0.985 0 0) | 侧边栏主要文本 |
| --sidebar-accent | oklch(0.269 0 0) | 侧边栏强调 |
| --sidebar-accent-foreground | oklch(0.985 0 0) | 侧边栏强调文本 |
| --sidebar-border | oklch(0.269 0 0) | 侧边栏边框 |
| --sidebar-ring | oklch(0.439 0 0) | 侧边栏聚焦环 |

### 2.4 色彩使用规范

- **主要色彩**：用于主要按钮、链接和重要的交互元素
- **次要色彩**：用于次要按钮和辅助元素
- **静音色彩**：用于背景、分割线和次要信息
- **危险色彩**：用于删除、取消等危险操作
- **图表色彩**：用于数据可视化和图表展示

## 3. 字体系统

### 3.1 字体家族

- **主要字体**：Inter，无衬线字体，现代、清晰、易读
- **代码字体**：Geist Mono，等宽字体，用于代码和技术内容

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'Geist Mono', 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', Consolas, 'Courier New', monospace;
```

### 3.2 字体大小

| 变量名 | 大小 | 用途 |
|--------|------|------|
| --text-xs | 0.75rem | 超小文本，如标签、提示 |
| --text-sm | 0.875rem | 小文本，如表单标签、辅助信息 |
| --text-base | 1rem | 基础文本，如正文、按钮 |
| --text-lg | 1.125rem | 大文本，如标题、强调文本 |
| --text-xl | 1.25rem | 较大文本，如章节标题 |
| --text-2xl | 1.5rem | 大标题，如页面标题 |
| --text-3xl | 1.875rem | 特大标题，如主页标题 |
| --text-4xl | 2.25rem | 超大标题 |
| --text-5xl | 3rem | 巨标题 |
| --text-6xl | 3.75rem | 最大标题 |

### 3.3 字体粗细

| 变量名 | 粗细 | 用途 |
|--------|------|------|
| --font-light | 300 | 轻量级文本 |
| --font-normal | 400 | 普通文本 |
| --font-medium | 500 | 中等粗细，如按钮、标签 |
| --font-semibold | 600 | 半粗体，如小标题 |
| --font-bold | 700 | 粗体，如大标题 |

### 3.4 标题层级

| 级别 | 大小 | 粗细 | 跟踪 |
|------|------|------|------|
| h1 | text-3xl | font-bold | tracking-tight |
| h2 | text-2xl | font-bold | tracking-tight |
| h3 | text-xl | font-semibold | tracking-tight |
| h4 | text-lg | font-semibold | tracking-tight |
| h5 | text-base | font-semibold | tracking-tight |
| h6 | text-sm | font-semibold | tracking-tight |

## 4. 布局系统

### 4.1 响应式断点

| 断点 | 尺寸 | 描述 |
|------|------|------|
| sm | 640px | 小屏幕，如手机 |
| md | 768px | 中等屏幕，如平板 |
| lg | 1024px | 大屏幕，如笔记本 |
| xl | 1280px | 超大屏幕，如桌面 |
| 2xl | 1536px | 特大屏幕 |

### 4.2 间距系统

使用 Tailwind CSS 的间距系统，基于 4px 的基础单位：

- 0: 0px
- 1: 4px
- 2: 8px
- 3: 12px
- 4: 16px
- 5: 20px
- 6: 24px
- 8: 32px
- 10: 40px
- 12: 48px
- 16: 64px
- 20: 80px
- 24: 96px
- 32: 128px

### 4.3 容器布局

- **固定宽度容器**：在大屏幕上使用固定宽度，确保内容不会过于拉伸
- **流体布局**：在小屏幕上使用流体布局，适应不同屏幕尺寸
- **网格系统**：使用 Tailwind CSS 的网格系统，实现灵活的布局结构

### 4.4 侧边栏布局

- **桌面端**：固定宽度的侧边栏，与主内容区域并排
- **移动端**：可折叠的侧边栏，默认隐藏，通过菜单按钮打开

## 5. 组件样式

### 5.1 按钮

按钮支持多种变体和尺寸：

#### 变体
- default：默认按钮，使用主要色彩
- destructive：危险按钮，使用危险色彩
- outline：轮廓按钮，透明背景带边框
- secondary：次要按钮，使用次要色彩
- ghost：幽灵按钮，无背景
- link：链接按钮，表现为链接样式

#### 尺寸
- default：默认尺寸
- sm：小尺寸
- lg：大尺寸
- icon：图标尺寸

### 5.2 卡片

卡片支持多种变体和尺寸：

#### 变体
- default：默认卡片，带阴影
- elevated：高海拔卡片，带大阴影
- outline：轮廓卡片，只有边框
- plain：纯卡片，无样式

#### 尺寸
- default：默认尺寸
- sm：小尺寸
- md：中等尺寸
- lg：大尺寸

### 5.3 输入框

- 支持常规输入框和文本域
- 包含聚焦状态、错误状态和禁用状态
- 与标签和帮助文本配合使用

### 5.4 其他组件

- **对话框**：模态对话框，支持标题、内容和操作按钮
- **标签页**：可切换的标签页，支持多种样式
- **表格**：响应式表格，支持排序和分页
- **选择器**：下拉选择器，支持搜索和多选
- **开关**：切换开关，用于布尔值选择
- **徽章**：小型标签，用于显示状态或计数
- **警告**：信息、警告、错误和成功提示

## 6. 交互规范

### 6.1 过渡效果

- **颜色过渡**：200ms 过渡时间
- **大小过渡**：200ms 过渡时间
- **位置过渡**：200ms 过渡时间
- **透明度过渡**：200ms 过渡时间

### 6.2 交互状态

- **悬停状态**：轻微的背景色变化和阴影增强
- **点击状态**：按下效果，通常是颜色变暗和轻微的缩放
- **聚焦状态**：聚焦环效果，使用 --ring 变量
- **禁用状态**：降低透明度，禁用指针事件

### 6.3 反馈机制

- **按钮反馈**：点击时的视觉反馈
- **表单反馈**：输入错误时的提示信息
- **加载状态**：加载中的动画效果
- **成功/失败反馈**：操作结果的视觉反馈

### 6.4 无障碍设计

- **键盘导航**：支持键盘操作，包括 Tab 键导航和 Enter/Space 键操作
- **屏幕阅读器**：添加适当的 ARIA 属性，确保屏幕阅读器能够正确解读内容
- **颜色对比度**：确保文本和背景的对比度符合 WCAG 标准
- **焦点指示器**：清晰的焦点状态，帮助键盘用户导航

## 7. 开发指南

### 7.1 样式使用

- 使用 Tailwind CSS 类进行样式定义
- 优先使用设计系统中定义的变量和类
- 避免使用内联样式，除非绝对必要
- 对于复杂组件，使用组件库中的预设样式

### 7.2 组件使用

- 优先使用项目中已有的 UI 组件
- 遵循组件的 API 文档，正确传递 props
- 保持组件的一致性，避免自定义样式覆盖默认样式
- 对于需要定制的组件，通过 props 进行配置，而不是直接修改组件代码

### 7.3 响应式设计

- 使用 Tailwind CSS 的响应式前缀（sm:, md:, lg:等）
- 确保在所有屏幕尺寸下的良好表现
- 测试不同设备和屏幕尺寸的显示效果

### 7.4 性能优化

- 避免不必要的 DOM 操作
- 使用虚拟滚动处理长列表
- 优化图片和资源加载
- 合理使用缓存策略

## 8. 工具和资源

- **设计工具**：Figma、Sketch 等
- **开发工具**：VS Code、TypeScript、Vue 3
- **样式工具**：Tailwind CSS、PostCSS
- **组件库**：项目自定义组件库

## 9. 版本控制

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0.0 | 2026-04-08 | 初始版本 |

## 10. 结语

虹桥计划的设计规范旨在为开发团队提供清晰、一致的设计指南，确保产品的视觉一致性和用户体验。通过遵循这些规范，开发团队可以更高效地构建美观、易用的用户界面，同时减少设计和开发之间的沟通成本。

设计规范是一个不断演进的文档，随着产品的发展和用户需求的变化，我们会定期更新和完善这些规范。