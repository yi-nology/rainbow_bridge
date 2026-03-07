# 使用指南

欢迎使用虹桥计划！本指南将帮助你快速上手系统的各项功能。

## 📚 目录

### 快速开始
- [简介](/) - 项目介绍和核心特性
- [安装部署](/guide/installation) - 详细的安装步骤
- [快速开始](/guide/quick-start) - 5 分钟快速体验

### UI配置流程
- [环境管理](/guide/ui-config/environment) - 创建和管理环境
- [渠道管理](/guide/ui-config/pipeline) - 创建和管理渠道
- [配置管理](/guide/ui-config/config) - 5 种数据类型的配置方法
- [资源管理](/guide/ui-config/assets) - 上传和管理静态资源
- [导出配置](/guide/ui-config/export) - 导出为静态包或 ZIP
- [配置迁移](/guide/ui-config/migration) - 多环境/渠道同步

### 平台对接
- [前端对接](/guide/integration/frontend) - React/Vue等前端框架集成
- [后端对接](/guide/integration/backend) - Go/Java/Node.js后端集成
- [移动端对接](/guide/integration/mobile) - iOS/Android集成

## 🎯 学习路径

### 新手入门
1. 阅读 [项目简介](/) 了解核心概念
2. 按照 [安装部署](/guide/installation) 完成环境搭建
3. 通过 [快速开始](/guide/quick-start) 体验基本功能
4. 学习 [UI配置流程](/guide/ui-config/environment) 掌握配置管理

### 开发者
1. 查看 [平台对接指南](/guide/integration/frontend) 集成到你的项目
2. 参考 [API 文档](/api/) 了解接口详情
3. 阅读 [工程状态](/status/) 了解构建和测试情况

### 运维人员
1. 查看 [部署测试状态](/status/deployment-status) 验证部署方式
2. 参考 [发版本流程](/release/release-process) 了解发布规范
3. 查看 [版本历史](/release/version-history) 了解版本变更

## 💡 最佳实践

- **环境隔离**：为 dev/test/prod 创建独立环境
- **渠道管理**：使用 main/hotfix/feature 等渠道区分功能线
- **配置命名**：使用有意义的名称，如 `api_base_url` 而非 `url1`
- **资源组织**：按业务分类组织资源，使用语义化文件名
- **定期备份**：使用导出功能定期备份配置

## 🔗 相关资源

- [GitHub 仓库](https://github.com/yi-nology/rainbow_bridge)
- [Issue 追踪](https://github.com/yi-nology/rainbow_bridge/issues)
- [技术设计文档](https://github.com/yi-nology/rainbow_bridge/blob/main/README.md)
- [测试指南](https://github.com/yi-nology/rainbow_bridge/blob/main/TESTING.md)
