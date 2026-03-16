# 前端 Vue3 重构规格文档

## Why
当前项目使用 Next.js (React 19) 作为前端框架，需要将其重构为 Vue3 以满足团队技术栈统一的需求。后端 API 和样式设计保持不变。

## What Changes
- 将前端框架从 Next.js (React 19) 迁移到 Vue3 + Vite
- 使用 Vue3 Composition API 重写所有组件
- 使用 Pinia 替代 TanStack Query 进行状态管理
- 使用 Vue Router 替代 Next.js 路由
- 保持 Tailwind CSS 样式系统不变
- 保持 shadcn/ui 风格的组件库（使用 shadcn-vue）
- 保持所有 API 调用逻辑和接口不变

## Impact
- Affected specs: 前端架构
- Affected code: `/react/` 目录下的所有文件将迁移到新的 `/vue/` 目录

## ADDED Requirements

### Requirement: Vue3 项目初始化
系统 SHALL 创建一个基于 Vite + Vue3 + TypeScript 的前端项目。

#### Scenario: 项目结构创建
- **WHEN** 初始化 Vue3 项目
- **THEN** 应创建标准的项目结构，包含 src/views、src/components、src/composables、src/stores 等目录

### Requirement: UI 组件库迁移
系统 SHALL 使用 shadcn-vue 组件库保持与原 React 版本一致的 UI 风格。

#### Scenario: 组件迁移
- **WHEN** 迁移 UI 组件
- **THEN** 所有 Radix UI 组件应替换为对应的 Radix Vue / shadcn-vue 组件

### Requirement: 路由系统迁移
系统 SHALL 使用 Vue Router 实现页面路由。

#### Scenario: 路由配置
- **WHEN** 配置路由
- **THEN** 应实现与原 Next.js 相同的路由结构：首页、配置管理、环境管理、资源管理、配置迁移、导入导出

### Requirement: 状态管理迁移
系统 SHALL 使用 Pinia 进行状态管理。

#### Scenario: API 状态管理
- **WHEN** 调用 API
- **THEN** 应使用 Pinia store 管理数据状态，实现与 React Query 相同的缓存和刷新机制

### Requirement: API 客户端迁移
系统 SHALL 保持与后端 API 的完全兼容。

#### Scenario: API 调用
- **WHEN** 前端调用后端 API
- **THEN** 请求格式、响应处理应与原 React 版本完全一致

### Requirement: 样式系统保持
系统 SHALL 保持 Tailwind CSS 样式系统不变。

#### Scenario: 样式迁移
- **WHEN** 迁移组件样式
- **THEN** 所有 Tailwind CSS 类名应保持不变，CSS 变量定义应保持一致

## MODIFIED Requirements
无

## REMOVED Requirements
无
