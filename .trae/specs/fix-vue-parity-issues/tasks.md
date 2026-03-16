# Tasks

## Phase 1: 高优先级问题修复

- [x] Task 1: 创建 TransferTreeSelect 组件
  - [x] SubTask 1.1: 创建 ExportTreeSelect 子组件（树形选择器）
  - [x] SubTask 1.2: 创建 ImportPreviewTree 子组件（导入预览树）
  - [x] SubTask 1.3: 实现环境→渠道→配置项三级树结构
  - [x] SubTask 1.4: 实现多选、全选、展开折叠功能
  - [x] SubTask 1.5: 实现状态标识（新增/已存在/冲突）

- [x] Task 2: 完善 RuntimeConfig 组件
  - [x] SubTask 2.1: 添加环境和渠道选择器
  - [x] SubTask 2.2: 实现配置列表表格展示
  - [x] SubTask 2.3: 添加刷新配置按钮
  - [x] SubTask 2.4: 实现导出静态资源功能（ZIP/JSON）

- [x] Task 3: 实现 keyvalue 类型表单
  - [x] SubTask 3.1: 创建动态键值对编辑器组件
  - [x] SubTask 3.2: 实现添加/删除键值对功能
  - [x] SubTask 3.3: 添加键值对验证
  - [x] SubTask 3.4: 集成到 ConfigPage 表单中

## Phase 2: API 层增强

- [x] Task 4: 增强 API 客户端错误处理
  - [x] SubTask 4.1: 添加 HTTP 状态码检查
  - [x] SubTask 4.2: 添加网络错误捕获
  - [x] SubTask 4.3: 集成 vue-sonner Toast 通知
  - [x] SubTask 4.4: 支持 operate_response 嵌套错误结构

- [x] Task 5: 补充状态管理缺失功能
  - [x] SubTask 5.1: 在 config store 中添加 fetchConfigDetail 方法
  - [x] SubTask 5.2: 在 config store 的 fetchConfigs 中添加类型过滤参数
  - [x] SubTask 5.3: 在 asset store 中暴露 getAssetUrl 函数

## Phase 3: UI 和体验优化

- [x] Task 6: 补充关键 UI 组件
  - [x] SubTask 6.1: 添加 checkbox 组件
  - [x] SubTask 6.2: 添加 alert 组件
  - [x] SubTask 6.3: 添加 tabs 组件
  - [x] SubTask 6.4: 添加 tooltip 组件

- [x] Task 7: 优化配置内容预览
  - [x] SubTask 7.1: 实现图片类型缩略图预览和放大功能
  - [x] SubTask 7.2: 实现颜色类型颜色方块预览
  - [x] SubTask 7.3: 实现对象类型键名列表预览
  - [x] SubTask 7.4: 实现键值对类型键名列表预览
  - [x] SubTask 7.5: 实现富文本类型 HTML 预览

- [x] Task 8: 补充其他缺失功能
  - [x] SubTask 8.1: 创建 useIsMobile composable
  - [x] SubTask 8.2: 在 globals.css 中添加 .line-clamp-2 工具类
  - [x] SubTask 8.3: 在资源管理页面添加图片错误处理

## Phase 4: 集成和测试

- [x] Task 9: 更新迁移和导入导出页面
  - [x] SubTask 9.1: 在 MigrationPage 中集成 TransferTreeSelect
  - [x] SubTask 9.2: 实现配置迁移预览功能
  - [x] SubTask 9.3: 在 ImportExportPage 中集成 TransferTreeSelect
  - [x] SubTask 9.4: 实现选择性导出功能
  - [x] SubTask 9.5: 实现导入预览功能
  - [x] SubTask 9.6: 实现选择性导入功能

- [x] Task 10: 自测验证
  - [x] SubTask 10.1: 测试 TransferTreeSelect 组件功能
  - [x] SubTask 10.2: 测试 RuntimeConfig 组件功能
  - [x] SubTask 10.3: 测试 keyvalue 类型表单
  - [x] SubTask 10.4: 测试 API 错误处理
  - [x] SubTask 10.5: 测试配置内容预览
  - [x] SubTask 10.6: 测试迁移和导入导出功能
  - [x] SubTask 10.7: 运行项目构建确保无错误

# Task Dependencies
- [Task 2] depends on [Task 6]
- [Task 3] depends on [Task 6]
- [Task 4] depends on [Task 6]
- [Task 5] depends on [Task 4]
- [Task 7] depends on [Task 6]
- [Task 9] depends on [Task 1, Task 4]
- [Task 10] depends on [Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9]
