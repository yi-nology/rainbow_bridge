# Vue 与 React 功能等价性修复规格文档

## Why
Vue3 重构版本已完成基础功能迁移，但验证发现存在多个功能缺失和差异问题，需要修复以达到与 React 版本的功能等价。

## What Changes
- 创建缺失的 TransferTreeSelect 组件
- 完善 RuntimeConfig 组件功能
- 实现 keyvalue 类型表单
- 增强 API 客户端错误处理
- 补充关键 UI 组件
- 优化配置内容预览
- 添加缺失的工具类和功能

## Impact
- Affected specs: migrate-to-vue3, verify-vue-react-parity
- Affected code: `/vue/src/` 目录下的多个文件

## ADDED Requirements

### Requirement: TransferTreeSelect 组件
系统 SHALL 提供树形选择组件用于导入导出和配置迁移功能。

#### Scenario: 导出树形选择
- **WHEN** 用户在导入导出页面选择导出内容
- **THEN** 应显示环境→渠道→配置项的三级树形结构，支持多选

#### Scenario: 导入预览树
- **WHEN** 用户上传导入文件
- **THEN** 应显示导入内容的预览树，标识新增/已存在/冲突状态

### Requirement: RuntimeConfig 完整功能
系统 SHALL 在首页提供完整的运行时配置查看和导出功能。

#### Scenario: 查看运行时配置
- **WHEN** 用户在首页选择环境和渠道
- **THEN** 应显示该渠道的所有配置项列表

#### Scenario: 导出静态资源
- **WHEN** 用户点击导出静态资源
- **THEN** 应生成包含所有配置的 ZIP 或 JSON 文件

### Requirement: keyvalue 类型表单
系统 SHALL 支持键值对类型配置的创建和编辑。

#### Scenario: 创建键值对配置
- **WHEN** 用户选择 keyvalue 类型创建配置
- **THEN** 应提供动态添加/删除键值对的表单界面

### Requirement: API 客户端增强
系统 SHALL 提供完善的 API 错误处理机制。

#### Scenario: HTTP 错误处理
- **WHEN** API 请求返回非 2xx 状态码
- **THEN** 应抛出包含状态码和错误信息的 ApiError

#### Scenario: 网络错误处理
- **WHEN** 网络请求失败
- **THEN** 应捕获错误并提示用户

#### Scenario: Toast 通知
- **WHEN** API 请求失败
- **THEN** 应显示 Toast 错误通知

### Requirement: 配置内容预览优化
系统 SHALL 根据配置类型提供差异化的内容预览。

#### Scenario: 图片类型预览
- **WHEN** 配置类型为 image
- **THEN** 应显示缩略图，点击可放大预览

#### Scenario: 颜色类型预览
- **WHEN** 配置类型为 color
- **THEN** 应显示颜色方块和十六进制值

#### Scenario: JSON 对象预览
- **WHEN** 配置类型为 object
- **THEN** 应显示对象图标和键名列表

### Requirement: 缺失功能补充
系统 SHALL 补充验证发现的其他缺失功能。

#### Scenario: 配置详情获取
- **WHEN** 需要获取单个配置详情
- **THEN** 应提供 fetchConfigDetail 方法

#### Scenario: 配置类型过滤
- **WHEN** 用户在配置列表页按类型过滤
- **THEN** 应支持按配置类型筛选

#### Scenario: 移动端检测
- **WHEN** 需要判断是否为移动设备
- **THEN** 应提供 useIsMobile composable

#### Scenario: 样式工具类
- **WHEN** 需要文本截断
- **THEN** 应提供 .line-clamp-2 工具类

## MODIFIED Requirements
无

## REMOVED Requirements
无
