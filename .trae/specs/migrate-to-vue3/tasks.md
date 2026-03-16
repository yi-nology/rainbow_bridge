# Tasks

## Phase 1: 项目初始化与基础设施

- [x] Task 1: 创建 Vue3 + Vite 项目基础结构
  - [x] SubTask 1.1: 使用 Vite 创建 Vue3 + TypeScript 项目
  - [x] SubTask 1.2: 配置项目目录结构 (views, components, composables, stores, lib, assets)
  - [x] SubTask 1.3: 配置 TypeScript 和 Vite 构建选项
  - [x] SubTask 1.4: 配置路径别名 (@/)

- [x] Task 2: 配置 Tailwind CSS 和样式系统
  - [x] SubTask 2.1: 安装 Tailwind CSS v4 及相关依赖
  - [x] SubTask 2.2: 迁移 globals.css 样式变量
  - [x] SubTask 2.3: 配置 Tailwind CSS 主题和插件

- [x] Task 3: 安装并配置 shadcn-vue 组件库
  - [x] SubTask 3.1: 安装 shadcn-vue 及 Radix Vue 依赖
  - [x] SubTask 3.2: 配置 components.json
  - [x] SubTask 3.3: 安装所需 UI 组件 (Button, Input, Card, Dialog, Select, Table, Badge, Switch, Label, Textarea 等)

## Phase 2: 核心基础设施迁移

- [x] Task 4: 迁移 API 客户端
  - [x] SubTask 4.1: 创建 API 请求工具函数 (lib/api/client.ts)
  - [x] SubTask 4.2: 创建 API 错误处理类
  - [x] SubTask 4.3: 实现 get/post/upload 请求封装

- [x] Task 5: 迁移 API 模块
  - [x] SubTask 5.1: 迁移 asset API (lib/api/asset.ts)
  - [x] SubTask 5.2: 迁移 config API (lib/api/config.ts)
  - [x] SubTask 5.3: 迁移 environment API (lib/api/environment.ts)
  - [x] SubTask 5.4: 迁移 pipeline API (lib/api/pipeline.ts)
  - [x] SubTask 5.5: 迁移 runtime API (lib/api/runtime.ts)
  - [x] SubTask 5.6: 迁移 transfer API (lib/api/transfer.ts)
  - [x] SubTask 5.7: 迁移 version API (lib/api/version.ts)
  - [x] SubTask 5.8: 迁移 transformers (lib/api/transformers.ts)
  - [x] SubTask 5.9: 迁移 types (lib/api/types.ts)

- [x] Task 6: 迁移类型定义
  - [x] SubTask 6.1: 迁移核心类型定义 (lib/types.ts)
  - [x] SubTask 6.2: 迁移工具函数 (lib/utils.ts)

- [x] Task 7: 创建 Pinia Stores
  - [x] SubTask 7.1: 创建环境管理 Store (stores/environment.ts)
  - [x] SubTask 7.2: 创建配置管理 Store (stores/config.ts)
  - [x] SubTask 7.3: 创建资源管理 Store (stores/asset.ts)
  - [x] SubTask 7.4: 创建版本管理 Store (stores/version.ts)
  - [x] SubTask 7.5: 创建迁移管理 Store (stores/transfer.ts)

## Phase 3: 组件迁移

- [x] Task 8: 迁移布局组件
  - [x] SubTask 8.1: 迁移 AppSidebar 侧边栏组件
  - [x] SubTask 8.2: 迁移 ThemeProvider 主题提供者组件

- [x] Task 9: 迁移公共组件
  - [x] SubTask 9.1: 迁移 ApiDocs API 文档组件
  - [x] SubTask 9.2: 迁移 ProjectIntro 项目介绍组件
  - [x] SubTask 9.3: 迁移 RuntimeConfig 运行时配置组件
  - [x] SubTask 9.4: 迁移 TransferTreeSelect 迁移树选择组件

## Phase 4: 页面迁移

- [x] Task 10: 配置 Vue Router
  - [x] SubTask 10.1: 创建路由配置文件
  - [x] SubTask 10.2: 配置所有页面路由

- [x] Task 11: 迁移首页
  - [x] SubTask 11.1: 创建首页视图 (views/HomePage.vue)
  - [x] SubTask 11.2: 集成首页组件

- [x] Task 12: 迁移配置管理页面
  - [x] SubTask 12.1: 创建配置管理视图 (views/ConfigPage.vue)
  - [x] SubTask 12.2: 实现配置列表展示
  - [x] SubTask 12.3: 实现配置新增/编辑/删除功能
  - [x] SubTask 12.4: 实现配置类型表单 (文本、多行文本、富文本、整数、小数、布尔值、键值对、JSON对象、颜色、文件、图片)

- [x] Task 13: 迁移环境管理页面
  - [x] SubTask 13.1: 创建环境管理视图 (views/EnvironmentsPage.vue)
  - [x] SubTask 13.2: 实现环境列表展示
  - [x] SubTask 13.3: 实现渠道管理功能
  - [x] SubTask 13.4: 实现环境/渠道新增/删除功能

- [x] Task 14: 迁移资源管理页面
  - [x] SubTask 14.1: 创建资源管理视图 (views/ResourcesPage.vue)
  - [x] SubTask 14.2: 实现资源列表展示
  - [x] SubTask 14.3: 实现资源上传功能
  - [x] SubTask 14.4: 实现资源预览和复制链接功能

- [x] Task 15: 迁移配置迁移页面
  - [x] SubTask 15.1: 创建配置迁移视图 (views/MigrationPage.vue)
  - [x] SubTask 15.2: 实现源/目标环境选择
  - [x] SubTask 15.3: 实现配置迁移功能

- [x] Task 16: 迁移导入导出页面
  - [x] SubTask 16.1: 创建导入导出视图 (views/ImportExportPage.vue)
  - [x] SubTask 16.2: 实现配置导出功能
  - [x] SubTask 16.3: 实现配置导入功能

## Phase 5: 应用入口与配置

- [x] Task 17: 创建应用入口
  - [x] SubTask 17.1: 创建 App.vue 根组件
  - [x] SubTask 17.2: 创建 main.ts 入口文件
  - [x] SubTask 17.3: 配置 Pinia 和 Vue Router 插件

- [x] Task 18: 配置构建和部署
  - [x] SubTask 18.1: 配置 Vite 构建输出目录
  - [x] SubTask 18.2: 配置环境变量
  - [x] SubTask 18.3: 更新 package.json 脚本

## Phase 6: 测试与验证

- [x] Task 19: 功能验证
  - [x] SubTask 19.1: 验证所有页面路由正常
  - [x] SubTask 19.2: 验证环境管理功能
  - [x] SubTask 19.3: 验证配置管理功能
  - [x] SubTask 19.4: 验证资源管理功能
  - [x] SubTask 19.5: 验证配置迁移功能
  - [x] SubTask 19.6: 验证导入导出功能

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 1]
- [Task 5] depends on [Task 4]
- [Task 6] depends on [Task 1]
- [Task 7] depends on [Task 5, Task 6]
- [Task 8] depends on [Task 3, Task 7]
- [Task 9] depends on [Task 3, Task 7]
- [Task 10] depends on [Task 1]
- [Task 11] depends on [Task 8, Task 9, Task 10]
- [Task 12] depends on [Task 7, Task 8, Task 10]
- [Task 13] depends on [Task 7, Task 8, Task 10]
- [Task 14] depends on [Task 7, Task 8, Task 10]
- [Task 15] depends on [Task 7, Task 8, Task 9, Task 10]
- [Task 16] depends on [Task 7, Task 8, Task 10]
- [Task 17] depends on [Task 7, Task 10]
- [Task 18] depends on [Task 17]
- [Task 19] depends on [Task 18]
