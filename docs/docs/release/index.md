# 发版本信息

本文档介绍虹桥计划的发版本流程、版本历史和变更日志。

## 📦 当前版本

**最新版本**：v3.1.3  
**发布日期**：2026-03-07  
**分支**：main  

### 版本特性

- ✅ 完整的配置管理能力
- ✅ 多维度环境和渠道管理
- ✅ 5 种数据类型支持
- ✅ 静态资源管理
- ✅ 配置迁移功能
- ✅ Docker/Kubernetes部署
- ✅ GitHub Actions自动化
- ✅ 完整的测试套件

## 🚀 发版本流程

### 自动发版本（推荐）

项目已配置自动打 tag 脚本，每次提交后可选择是否发布新版本。

#### 步骤：

1. **完成代码提交**
   ```bash
   git add .
   git commit -m "feat: 添加新功能"
   ```

2. **自动提示打 tag**
   
   提交后会自动询问是否要打 tag：
   ```bash
   # .githooks/post-commit 会触发询问
   是否要打 tag? (y/n): y
   
   请选择版本类型:
   1) 大版本 (major) - 不兼容的 API 修改
   2) 小版本 (minor) - 向下兼容的功能新增
   3) 补丁版本 (patch) - 向下兼容的问题修复
   输入选择 (1/2/3): 2
   ```

3. **推送 tag**
   ```bash
   git push origin v3.2.0
   # 或询问时选择立即推送
   ```

4. **触发 GitHub Actions**
   
   推送 tag 后会自动触发 Release workflow：
   - ✅ 二进制构建（多平台）
   - ✅ Docker 镜像构建（API + Frontend）
   - ✅ 创建 GitHub Release
   - ✅ 上传构建产物

### 手动发版本

#### 1. 确定版本号

遵循语义化版本规范（Semantic Versioning）：

```
主版本号。次版本号。修订号
MAJOR.MINOR.PATCH
```

- **MAJOR**：不兼容的 API 修改
- **MINOR**：向下兼容的功能新增
- **PATCH**：向下兼容的问题修复

#### 2. 创建并推送 tag

```bash
# 创建 tag
git tag -a v3.2.0 -m "Release v3.2.0 - 新增 XX 功能"

# 推送 tag
git push origin v3.2.0
```

#### 3. 验证 Release

访问 [GitHub Releases](https://github.com/yi-nology/rainbow_bridge/releases) 查看：

- ✅ Release 已创建
- ✅ Binary 产物已上传
- ✅ Docker 镜像已推送

## 📝 版本历史

### v3.x 系列

#### v3.1.3 (当前版本) - 2026-03-07

**新增功能**：
- ✅ 完整的 VuePress 文档系统
- ✅ GitHub Actions 自动集成发布文档
- ✅ 工程可用状态实时展示
- ✅ 详细的发版本流程文档

**改进**：
- ✅ 完善 README 文档体系
- ✅ 优化部署测试流程
- ✅ 增强 UI配置指南

**技术栈**：
- 后端：Go 1.22+ + Hertz
- 前端：React 19 + Next.js 16
- 数据库：SQLite/MySQL/PostgreSQL
- 部署：Docker + Kubernetes

#### v3.1.0 - 2026-02-xx

**新增功能**：
- ✅ 配置迁移功能（多环境/渠道同步）
- ✅ 选择性导入导出
- ✅ 导入预览和冲突检测

**改进**：
- ✅ 优化配置比对算法
- ✅ 增强资源引用处理
- ✅ 改进错误提示

#### v3.0.0 - 2026-01-xx

**重大更新**：
- ✅ 全新的 React 前端界面
- ✅ 基于 Protobuf 的 API 设计
- ✅ 完整的测试体系（单元测试 + E2E + 性能）
- ✅ GitHub Actions CI/CD 流程

**破坏性变更**：
- ⚠️ API 接口路径调整为 `/api/v1/*`
- ⚠️ 配置文件格式更新
- ⚠️ 数据库表结构变更

### v2.x 系列

#### v2.5.0 - 2025-12-xx

**最后稳定版**：
- ✅ 基础配置管理功能
- ✅ 简单的资源上传
- ✅ 单环境支持

## 🔄 变更日志

### 最近变更（v3.1.2 → v3.1.3）

**新增**：
```markdown
- docs: 创建 VuePress 文档系统
  - 使用指南模块
  - 工程状态模块
  - 发版本信息模块
  - API 文档模块
  
- ci: 添加文档自动发布 workflow
  - 自动构建 VuePress 站点
  - 自动部署到 GitHub Pages
  - 自动更新索引
```

**改进**：
```markdown
- docs(README): 完善部署测试状态章节
  - 添加动态状态表格
  - 增加本地测试指南
  - 补充故障排查说明
```

**修复**：
```markdown
- fix: 修复配置迁移时的资源引用问题
- fix: 修复前端 basePath 配置问题
```

### 完整 Changelog

查看完整的变更日志请访问：
[GitHub Releases](https://github.com/yi-nology/rainbow_bridge/releases)

## 📋 发布检查清单

### 发布前检查

- [ ] 所有测试通过（单元/E2E/性能）
- [ ] 代码质量检查通过（golangci-lint）
- [ ] 文档已更新（README + VuePress）
- [ ] CHANGELOG.md 已更新
- [ ] 版本号符合语义化规范
- [ ] 向后兼容性验证
- [ ] Docker 镜像本地测试通过
- [ ] Kubernetes 部署验证通过

### 发布后验证

- [ ] GitHub Release 创建成功
- [ ] Binary 产物上传成功
- [ ] Docker 镜像推送成功
- [ ] GitHub Pages 文档更新
- [ ] Issue 和 PR 清理
- [ ] 通知相关人员/团队

## 🎯 发版本规范

### Commit Message 规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type 类型**：
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具链

**示例**：
```bash
feat(config): 添加配置迁移功能

- 实现环境和渠道间的配置复制
- 支持冲突检测和覆盖选项
- 添加资源文件自动迁移

Closes #123
```

### 版本号升级规则

| 变更类型 | 版本升级 | 示例 |
|---------|---------|------|
| 破坏性变更 | MAJOR +1 | v2.0.0 → v3.0.0 |
| 新功能（向下兼容） | MINOR +1 | v3.1.0 → v3.2.0 |
| Bug 修复 | PATCH +1 | v3.1.2 → v3.1.3 |
| 文档/测试 | PATCH +1 | v3.1.2 → v3.1.3 |

## 🔧 自动化工具

### auto_tag.sh

项目提供自动打 tag 脚本：

```bash
# 启用钩子
chmod +x script/auto_tag.sh
git config core.hooksPath .githooks

# 手动运行
./script/auto_tag.sh
```

### GitHub Actions Workflow

**release.yml** 自动执行：

```yaml
on:
  push:
    tags:
      - "v*"

jobs:
  build-binaries:     # 多平台编译
  build-docker-api:   # Docker API 镜像
  build-docker-frontend:  # Docker 前端镜像
  release:           # 创建 GitHub Release
```

## 📊 发布统计

### 发布频率

- **大版本**：每 3-6 个月
- **小版本**：每 2-4 周
- **补丁版本**：按需发布

### 下载统计

<!-- download-stats-start -->
| 版本 | 下载量 | 发布日期 |
|------|--------|---------|
| v3.1.3 | - | 2026-03-07 |
| v3.1.2 | 156 | 2026-02-28 |
| v3.1.1 | 243 | 2026-02-15 |
| v3.1.0 | 512 | 2026-01-30 |
<!-- download-stats-end -->

*数据统计来自 GitHub Releases*

## 🔗 相关链接

- [GitHub Releases](https://github.com/yi-nology/rainbow_bridge/releases)
- [版本标签](https://github.com/yi-nology/rainbow_bridge/tags)
- [变更日志](https://github.com/yi-nology/rainbow_bridge/blob/main/CHANGELOG.md)
- [发版本 Workflow](https://github.com/yi-nology/rainbow_bridge/actions/workflows/release.yml)
