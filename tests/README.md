# 测试套件快速开始

本目录包含虹桥计划的所有测试代码。

## 📁 目录结构

```
tests/
├── e2e/                    # E2E 测试（Playwright）
│   ├── specs/             # 测试用例
│   ├── playwright.config.ts
│   └── package.json
└── performance/           # 性能测试（k6）
    └── api-load-test.js
```

## 🚀 快速运行

### 后端单元测试
```bash
# 在项目根目录运行
go test ./...

# 带覆盖率
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

### E2E 测试
```bash
cd e2e

# 安装依赖（首次运行）
npm install
npx playwright install

# 运行测试
npm test

# 查看报告
npm run test:report
```

### 性能测试
```bash
# 安装 k6（首次运行）
# macOS: brew install k6
# Linux: 参考 https://k6.io/docs/getting-started/installation/

# 运行测试
k6 run performance/api-load-test.js

# 查看报告
open performance/reports/summary.html
```

## 📖 完整文档

详细的测试指南请参考根目录的 [TESTING.md](../TESTING.md)

## ✅ 测试覆盖

- ✅ 后端 DAO 层单元测试
- ✅ E2E 环境管理测试
- ✅ API 性能基准测试
- ⏳ 更多测试持续添加中...
