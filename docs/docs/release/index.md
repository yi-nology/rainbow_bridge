# 发版本信息

本文档介绍虹桥计划的发版本流程、版本历史和变更日志。

## 📦 当前版本

**最新版本**：v3.5.1  
**发布日期**：2026/03/07  
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
主版本号.次版本号.修订号
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

<!-- release-history-start -->
### v3.x 系列

#### v3.5.1 (最新版本) - 2026/03/07

**[下载此版本](https://github.com/yi-nology/rainbow_bridge/releases/tag/v3.5.1)**

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.5.1/hertz_service-darwin-amd64.tar.gz) (17.69 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.5.1/hertz_service-darwin-arm64.tar.gz) (15.53 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.5.1/hertz_service-linux-amd64.tar.gz) (17.77 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.5.1/hertz_service-linux-arm64.tar.gz) (15.35 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.5.1/hertz_service-windows-amd64.zip) (17.92 MB)

---

#### v3.5.0 - 2026/03/07

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.5.0/hertz_service-darwin-amd64.tar.gz) (17.68 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.5.0/hertz_service-darwin-arm64.tar.gz) (15.53 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.5.0/hertz_service-linux-amd64.tar.gz) (17.77 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.5.0/hertz_service-linux-arm64.tar.gz) (15.35 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.5.0/hertz_service-windows-amd64.zip) (17.92 MB)

---

#### v3.1.3 - 2026/03/06

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.1.3/hertz_service-darwin-amd64.tar.gz) (17.68 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.1.3/hertz_service-darwin-arm64.tar.gz) (15.53 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.1.3/hertz_service-linux-amd64.tar.gz) (17.77 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.1.3/hertz_service-linux-arm64.tar.gz) (15.35 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.1.3/hertz_service-windows-amd64.zip) (17.92 MB)

---

#### v3.0.7 - 2026/03/01

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.0.7/hertz_service-darwin-amd64.tar.gz) (17.68 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.0.7/hertz_service-darwin-arm64.tar.gz) (15.43 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.0.7/hertz_service-linux-amd64.tar.gz) (17.07 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.0.7/hertz_service-linux-arm64.tar.gz) (14.54 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v3.0.7/hertz_service-windows-amd64.zip) (17.22 MB)

---

### v2.x 系列

#### v2.7.0 - 2026/02/16

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.7.0/hertz_service-darwin-amd64.tar.gz) (13.64 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.7.0/hertz_service-darwin-arm64.tar.gz) (11.55 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.7.0/hertz_service-linux-amd64.tar.gz) (13.17 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.7.0/hertz_service-linux-arm64.tar.gz) (10.87 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.7.0/hertz_service-windows-amd64.zip) (13.09 MB)

---

#### v2.6.0 - 2026/02/11

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.6.0/hertz_service-darwin-amd64.tar.gz) (13.61 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.6.0/hertz_service-darwin-arm64.tar.gz) (11.52 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.6.0/hertz_service-linux-amd64.tar.gz) (13.14 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.6.0/hertz_service-linux-arm64.tar.gz) (10.84 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.6.0/hertz_service-windows-amd64.zip) (13.04 MB)

---

#### v2.5.0 - 2026/02/10

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.5.0/hertz_service-darwin-amd64.tar.gz) (13.61 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.5.0/hertz_service-darwin-arm64.tar.gz) (11.52 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.5.0/hertz_service-linux-amd64.tar.gz) (13.14 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.5.0/hertz_service-linux-arm64.tar.gz) (10.84 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.5.0/hertz_service-windows-amd64.zip) (13.04 MB)

---

#### v2.4.2 - 2026/02/10

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.2/hertz_service-darwin-amd64.tar.gz) (13.61 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.2/hertz_service-darwin-arm64.tar.gz) (11.52 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.2/hertz_service-linux-amd64.tar.gz) (13.14 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.2/hertz_service-linux-arm64.tar.gz) (10.84 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.2/hertz_service-windows-amd64.zip) (13.04 MB)

---

#### v2.4.1 - 2026/01/30

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.1/hertz_service-darwin-amd64.tar.gz) (13.61 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.1/hertz_service-darwin-arm64.tar.gz) (11.52 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.1/hertz_service-linux-amd64.tar.gz) (13.14 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.1/hertz_service-linux-arm64.tar.gz) (10.84 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.1/hertz_service-windows-amd64.zip) (13.04 MB)

---

#### v2.4.0 - 2026/01/29

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.0/hertz_service-darwin-amd64.tar.gz) (13.61 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.0/hertz_service-darwin-arm64.tar.gz) (11.52 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.0/hertz_service-linux-amd64.tar.gz) (13.14 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.0/hertz_service-linux-arm64.tar.gz) (10.84 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.4.0/hertz_service-windows-amd64.zip) (13.04 MB)

---

#### v2.3.0 - 2026/01/29

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.3.0/hertz_service-darwin-amd64.tar.gz) (13.60 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.3.0/hertz_service-darwin-arm64.tar.gz) (11.51 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.3.0/hertz_service-linux-amd64.tar.gz) (13.14 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.3.0/hertz_service-linux-arm64.tar.gz) (10.83 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.3.0/hertz_service-windows-amd64.zip) (13.03 MB)

---

#### v2.2.0 - 2026/01/29

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.2.0/hertz_service-darwin-amd64.tar.gz) (13.60 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.2.0/hertz_service-darwin-arm64.tar.gz) (11.51 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.2.0/hertz_service-linux-amd64.tar.gz) (13.13 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.2.0/hertz_service-linux-arm64.tar.gz) (10.83 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.2.0/hertz_service-windows-amd64.zip) (13.02 MB)

---

#### v2.1.1 - 2026/01/29

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.1.1/hertz_service-darwin-amd64.tar.gz) (13.59 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.1.1/hertz_service-darwin-arm64.tar.gz) (11.49 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.1.1/hertz_service-linux-amd64.tar.gz) (13.12 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.1.1/hertz_service-linux-arm64.tar.gz) (10.80 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.1.1/hertz_service-windows-amd64.zip) (13.01 MB)

---

#### v2.1.0 - 2026/01/29

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.1.0/hertz_service-darwin-amd64.tar.gz) (13.59 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.1.0/hertz_service-darwin-arm64.tar.gz) (11.49 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.1.0/hertz_service-linux-amd64.tar.gz) (13.12 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.1.0/hertz_service-linux-arm64.tar.gz) (10.80 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.1.0/hertz_service-windows-amd64.zip) (13.01 MB)

---

#### v2.0.3 - 2026/01/29

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.3/hertz_service-darwin-amd64.tar.gz) (13.42 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.3/hertz_service-darwin-arm64.tar.gz) (11.32 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.3/hertz_service-linux-amd64.tar.gz) (12.96 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.3/hertz_service-linux-arm64.tar.gz) (10.65 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.3/hertz_service-windows-amd64.zip) (12.85 MB)

---

#### v2.0.2 - 2026/01/29

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.2/hertz_service-darwin-amd64.tar.gz) (13.42 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.2/hertz_service-darwin-arm64.tar.gz) (11.32 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.2/hertz_service-linux-amd64.tar.gz) (12.96 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.2/hertz_service-linux-arm64.tar.gz) (10.65 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.2/hertz_service-windows-amd64.zip) (12.85 MB)

---

#### v2.0.1 - 2026/01/29

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.1/hertz_service-darwin-amd64.tar.gz) (13.42 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.1/hertz_service-darwin-arm64.tar.gz) (11.32 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.1/hertz_service-linux-amd64.tar.gz) (12.96 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.1/hertz_service-linux-arm64.tar.gz) (10.65 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.1/hertz_service-windows-amd64.zip) (12.85 MB)

---

#### v2.0.0 - 2026/01/29

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.0/hertz_service-darwin-amd64.tar.gz) (13.42 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.0/hertz_service-darwin-arm64.tar.gz) (11.32 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.0/hertz_service-linux-amd64.tar.gz) (12.96 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.0/hertz_service-linux-arm64.tar.gz) (10.65 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v2.0.0/hertz_service-windows-amd64.zip) (12.85 MB)

---

### v1.x 系列

#### v1.1.6 - 2026/01/27

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v1.1.6/hertz_service-darwin-amd64.tar.gz) (12.93 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v1.1.6/hertz_service-darwin-arm64.tar.gz) (10.81 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v1.1.6/hertz_service-linux-amd64.tar.gz) (12.46 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v1.1.6/hertz_service-linux-arm64.tar.gz) (10.15 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v1.1.6/hertz_service-windows-amd64.zip) (12.35 MB)

---

#### v1.1.5 - 2026/01/27

**资产文件**：
- [hertz_service-darwin-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v1.1.5/hertz_service-darwin-amd64.tar.gz) (12.92 MB)
- [hertz_service-darwin-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v1.1.5/hertz_service-darwin-arm64.tar.gz) (10.81 MB)
- [hertz_service-linux-amd64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v1.1.5/hertz_service-linux-amd64.tar.gz) (12.46 MB)
- [hertz_service-linux-arm64.tar.gz](https://github.com/yi-nology/rainbow_bridge/releases/download/v1.1.5/hertz_service-linux-arm64.tar.gz) (10.15 MB)
- [hertz_service-windows-amd64.zip](https://github.com/yi-nology/rainbow_bridge/releases/download/v1.1.5/hertz_service-windows-amd64.zip) (12.35 MB)

---


<!-- release-history-end -->

## 📋 发布检查清单

### 发布前检查

- [ ] 所有测试通过（单元/E2E/性能）
- [ ] 代码质量检查通过（golangci-lint）
- [ ] 文档已更新（README + VuePress）
- [ ] CHANGELOG.md 已更新
- [ ] 版本号符合语义化规范
- [ ] 向后兼容性验证
- [ ] Docker 镜像本地测试通过

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
| 版本 | 下载量 | 发布日期 | 类型 |
|------|--------|---------|------|
| [v3.5.1](https://github.com/yi-nology/rainbow_bridge/releases/tag/v3.5.1) | 2 | 2026/03/07 | 正式版 |
| [v3.5.0](https://github.com/yi-nology/rainbow_bridge/releases/tag/v3.5.0) | 4 | 2026/03/07 | 正式版 |
| [v3.1.3](https://github.com/yi-nology/rainbow_bridge/releases/tag/v3.1.3) | 0 | 2026/03/06 | 正式版 |
| [v3.0.7](https://github.com/yi-nology/rainbow_bridge/releases/tag/v3.0.7) | 8 | 2026/03/01 | 正式版 |
| [v2.7.0](https://github.com/yi-nology/rainbow_bridge/releases/tag/v2.7.0) | 5 | 2026/02/16 | 正式版 |
| [v2.6.0](https://github.com/yi-nology/rainbow_bridge/releases/tag/v2.6.0) | 0 | 2026/02/11 | 正式版 |
| [v2.5.0](https://github.com/yi-nology/rainbow_bridge/releases/tag/v2.5.0) | 1 | 2026/02/10 | 正式版 |
| [v2.4.2](https://github.com/yi-nology/rainbow_bridge/releases/tag/v2.4.2) | 0 | 2026/02/10 | 正式版 |
| [v2.4.1](https://github.com/yi-nology/rainbow_bridge/releases/tag/v2.4.1) | 5 | 2026/01/30 | 正式版 |
| [v2.4.0](https://github.com/yi-nology/rainbow_bridge/releases/tag/v2.4.0) | 0 | 2026/01/29 | 正式版 |

<!-- download-stats-end -->

*数据统计来自 GitHub Releases，自动更新于 2026/3/7 15:38:49*

## 🔗 相关链接

- [GitHub Releases](https://github.com/yi-nology/rainbow_bridge/releases)
- [版本标签](https://github.com/yi-nology/rainbow_bridge/tags)
- [变更日志](https://github.com/yi-nology/rainbow_bridge/blob/main/CHANGELOG.md)
- [发版本 Workflow](https://github.com/yi-nology/rainbow_bridge/actions/workflows/release.yml)
