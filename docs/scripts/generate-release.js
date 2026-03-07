#!/usr/bin/env node

/**
 * 从 GitHub API 获取 Releases 数据并生成 markdown 文件
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const REPO_OWNER = 'yi-nology';
const REPO_NAME = 'rainbow_bridge';
const OUTPUT_FILE = path.join(__dirname, '../docs/release/index.md');

// 获取 GitHub Releases
function fetchReleases() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=20`,
      headers: {
        'User-Agent': 'Rainbow-Bridge-Docs-Build',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GitHub API returned ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

// 格式化日期
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// 解析版本号
function parseVersion(tag) {
  const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (match) {
    return {
      major: parseInt(match[1]),
      minor: parseInt(match[2]),
      patch: parseInt(match[3]),
      full: tag
    };
  }
  return null;
}

// 生成版本历史 markdown
function generateVersionHistory(releases) {
  if (!releases || releases.length === 0) {
    return '_暂无发布记录_';
  }

  let md = '';
  const versions = { major: {} };

  releases.forEach(release => {
    const ver = parseVersion(release.tag_name);
    if (!ver) return;

    // 按主版本分组
    if (!versions.major[ver.major]) {
      versions.major[ver.major] = [];
    }
    versions.major[ver.major].push({ ...release, version: ver });
  });

  // 生成 markdown
  Object.keys(versions.major).sort((a, b) => b - a).forEach(major => {
    md += `### v${major}.x 系列\n\n`;

    versions.major[major].forEach((release, index) => {
      const ver = release.version;
      const isLatest = index === 0 && major === Object.keys(versions.major).sort((a, b) => b - a)[0];
      const date = formatDate(release.published_at);

      md += `#### ${release.tag_name}${isLatest ? ' (最新版本)' : ''} - ${date}\n\n`;

      if (isLatest) {
        md += `**[下载此版本](https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/${release.tag_name})**\n\n`;
      }

      if (release.body && release.body.trim()) {
        // 解析 release body
        const body = release.body
          .replace(/\r\n/g, '\n')
          .trim();
        md += body + '\n\n';
      }

      md += `**资产文件**：\n`;
      if (release.assets && release.assets.length > 0) {
        release.assets.forEach(asset => {
          const size = (asset.size / 1024 / 1024).toFixed(2);
          md += `- [${asset.name}](${asset.browser_download_url}) (${size} MB)\n`;
        });
      } else {
        md += `- [查看 GitHub Release](${release.html_url})\n`;
      }
      md += '\n---\n\n';
    });
  });

  return md;
}

// 生成下载统计表格
function generateDownloadStats(releases) {
  if (!releases || releases.length === 0) {
    return '_暂无数据_';
  }

  let md = '| 版本 | 下载量 | 发布日期 | 类型 |\n';
  md += '|------|--------|---------|------|\n';

  releases.slice(0, 10).forEach(release => {
    const downloads = release.assets.reduce((sum, asset) => sum + asset.download_count, 0);
    const date = formatDate(release.published_at);
    const type = release.prerelease ? '预发布' : '正式版';
    md += `| [${release.tag_name}](${release.html_url}) | ${downloads} | ${date} | ${type} |\n`;
  });

  return md;
}

// 生成完整 markdown
function generateMarkdown(releases) {
  const latestRelease = releases && releases.length > 0 ? releases[0] : null;
  const latestVersion = latestRelease ? latestRelease.tag_name : 'N/A';
  const latestDate = latestRelease ? formatDate(latestRelease.published_at) : 'N/A';

  return `# 发版本信息

本文档介绍虹桥计划的发版本流程、版本历史和变更日志。

## 📦 当前版本

**最新版本**：${latestVersion}  
**发布日期**：${latestDate}  
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
   \`\`\`bash
   git add .
   git commit -m "feat: 添加新功能"
   \`\`\`

2. **自动提示打 tag**
   
   提交后会自动询问是否要打 tag：
   \`\`\`bash
   # .githooks/post-commit 会触发询问
   是否要打 tag? (y/n): y
   
   请选择版本类型:
   1) 大版本 (major) - 不兼容的 API 修改
   2) 小版本 (minor) - 向下兼容的功能新增
   3) 补丁版本 (patch) - 向下兼容的问题修复
   输入选择 (1/2/3): 2
   \`\`\`

3. **推送 tag**
   \`\`\`bash
   git push origin v3.2.0
   # 或询问时选择立即推送
   \`\`\`

4. **触发 GitHub Actions**
   
   推送 tag 后会自动触发 Release workflow：
   - ✅ 二进制构建（多平台）
   - ✅ Docker 镜像构建（API + Frontend）
   - ✅ 创建 GitHub Release
   - ✅ 上传构建产物

### 手动发版本

#### 1. 确定版本号

遵循语义化版本规范（Semantic Versioning）：

\`\`\`
主版本号.次版本号.修订号
MAJOR.MINOR.PATCH
\`\`\`

- **MAJOR**：不兼容的 API 修改
- **MINOR**：向下兼容的功能新增
- **PATCH**：向下兼容的问题修复

#### 2. 创建并推送 tag

\`\`\`bash
# 创建 tag
git tag -a v3.2.0 -m "Release v3.2.0 - 新增 XX 功能"

# 推送 tag
git push origin v3.2.0
\`\`\`

#### 3. 验证 Release

访问 [GitHub Releases](https://github.com/${REPO_OWNER}/${REPO_NAME}/releases) 查看：

- ✅ Release 已创建
- ✅ Binary 产物已上传
- ✅ Docker 镜像已推送

## 📝 版本历史

<!-- release-history-start -->
${generateVersionHistory(releases)}
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

\`\`\`
<type>(<scope>): <subject>

<body>

<footer>
\`\`\`

**Type 类型**：
- \`feat\`: 新功能
- \`fix\`: Bug 修复
- \`docs\`: 文档更新
- \`style\`: 代码格式调整
- \`refactor\`: 重构
- \`test\`: 测试相关
- \`chore\`: 构建/工具链

**示例**：
\`\`\`bash
feat(config): 添加配置迁移功能

- 实现环境和渠道间的配置复制
- 支持冲突检测和覆盖选项
- 添加资源文件自动迁移

Closes #123
\`\`\`

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

\`\`\`bash
# 启用钩子
chmod +x script/auto_tag.sh
git config core.hooksPath .githooks

# 手动运行
./script/auto_tag.sh
\`\`\`

### GitHub Actions Workflow

**release.yml** 自动执行：

\`\`\`yaml
on:
  push:
    tags:
      - "v*"

jobs:
  build-binaries:     # 多平台编译
  build-docker-api:   # Docker API 镜像
  build-docker-frontend:  # Docker 前端镜像
  release:           # 创建 GitHub Release
\`\`\`

## 📊 发布统计

### 发布频率

- **大版本**：每 3-6 个月
- **小版本**：每 2-4 周
- **补丁版本**：按需发布

### 下载统计

<!-- download-stats-start -->
${generateDownloadStats(releases)}
<!-- download-stats-end -->

*数据统计来自 GitHub Releases，自动更新于 ${new Date().toLocaleString('zh-CN')}*

## 🔗 相关链接

- [GitHub Releases](https://github.com/${REPO_OWNER}/${REPO_NAME}/releases)
- [版本标签](https://github.com/${REPO_OWNER}/${REPO_NAME}/tags)
- [变更日志](https://github.com/${REPO_OWNER}/${REPO_NAME}/blob/main/CHANGELOG.md)
- [发版本 Workflow](https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/workflows/release.yml)
`;
}

// 主函数
async function main() {
  console.log('Fetching releases from GitHub...');
  
  try {
    const releases = await fetchReleases();
    console.log(`Found ${releases.length} releases`);

    const markdown = generateMarkdown(releases);

    // 确保目录存在
    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, markdown, 'utf8');
    console.log(`Generated: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
