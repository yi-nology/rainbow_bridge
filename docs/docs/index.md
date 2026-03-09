---
home: true
title: 虹桥计划
heroImage: /icon.svg
heroText: 虹桥计划（Rainbow Bridge）
tagline: 静态资源与配置管理中台
actions:
  - text: 快速开始 →
    link: /guide/
    type: primary
  - text: 工程状态
    link: /status/
    type: default
  - text: 发版本信息
    link: /release/
    type: default
features:
  - title: 多维度配置管理
    details: 按环境（Environment）+ 渠道（Pipeline）双维度隔离配置，支持业务配置和系统配置
  - title: 多种数据类型
    details: 支持键值对、JSON 对象、纯文本、图片、色彩标签等 5 种配置类型
  - title: 在线资源管理
    details: 上传、预览、导出、导入静态资源，支持多种文件格式
  - title: 静态站点生成
    details: 将配置打包成 Nginx 静态站点或 zip 包，便于部署
  - title: 实时 API 接口
    details: 通过 REST 接口供业务系统实时读取配置
  - title: 自动化部署
    details: GitHub Actions 自动构建、测试和发布
footer: Apache-2.0 Licensed | Copyright © 2026 yi-nology
---

## 🎯 项目简介

虹桥计划（Rainbow Bridge）是一套自部署的"静态资源与配置管理"中台。项目名称灵感源自连接人界与天界的七彩虹桥，寓意为前端/客户端团队搭建一座高效、安全的资源传输通道。

系统基于 **CloudWeGo Hertz**（HTTP 网关）+ **GORM**（ORM）+ **SQLite/MySQL/PostgreSQL**（关系型数据库）构建，提供完整的配置管理和资源分发能力。

## 🚀 核心特性

### 配置管理
- ✅ 环境和渠道双维度隔离
- ✅ 5 种数据类型支持（KV、JSON、文本、图片、颜色）
- ✅ 配置迁移和同步
- ✅ 导入导出功能

### 资源管理
- ✅ 多格式文件上传（图片、字体、文档、音视频等）
- ✅ 资源预览和下载
- ✅ 批量操作支持
- ✅ 资源引用和关联

### 部署与交付
- ✅ Docker 容器化部署
- ✅ Kubernetes 支持
- ✅ 多平台二进制构建
- ✅ GitHub Actions 自动化

## 📊 最新状态

<!-- build-status-start -->
### 构建状态
| 构建类型 | 状态 | 详情 |
|---------|------|------|
| 二进制构建 | 🟢 | [查看](https://github.com/yi-nology/rainbow_bridge/actions/workflows/build-binaries.yml) |
| Docker API 镜像 | 🟢 | [查看](https://github.com/yi-nology/rainbow_bridge/actions/workflows/build-docker-api.yml) |
| Docker 前端镜像 | 🟢 | [查看](https://github.com/yi-nology/rainbow_bridge/actions/workflows/build-docker-frontend.yml) |

### 部署测试
| 部署方式 | 状态 | 详情 |
|---------|------|------|
| Docker Compose (SQLite) | 🟢 | [查看](https://github.com/yi-nology/rainbow_bridge/actions/workflows/deployment.yml) |
| Docker Compose (MySQL) | 🟢 | [查看](https://github.com/yi-nology/rainbow_bridge/actions/workflows/deployment.yml) |
<!-- build-status-end -->

## 🔗 快速链接

- [📖 使用指南](./guide/) - 详细的安装和配置教程
- [📊 工程状态](./status/) - 构建、部署和测试状态
- [📦 发版本信息](./release/) - 版本历史和发布流程
- [🔌 API 文档](./api/) - 完整的 API 接口参考
- [📄 GitHub 仓库](https://github.com/yi-nology/rainbow_bridge) - 源代码和 Issue 追踪

## 📦 快速开始

```bash
# Docker 部署（推荐）
docker pull ghcr.io/yi-nology/rainbow_bridge-api:latest
docker pull ghcr.io/yi-nology/rainbow_bridge-frontend:latest

cd deploy
docker compose up -d

# 访问管理控制台
open http://localhost:8080/rainbow-bridge
```

详细部署指南请查看 [快速开始](./guide/quick-start.html)。

## 📄 开源协议

本项目遵循 [Apache License 2.0](https://github.com/yi-nology/rainbow_bridge/blob/main/LICENSE)。
