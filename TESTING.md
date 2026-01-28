# 虹桥计划（Rainbow Bridge）测试指南

> **测试覆盖**：单元测试 + 集成测试 + E2E 测试 + 性能测试

## 目录

1. [测试概览](#测试概览)
2. [后端测试](#后端测试)
3. [前端测试](#前端测试)
4. [E2E 测试](#e2e-测试)
5. [性能测试](#性能测试)
6. [CI/CD 集成](#cicd-集成)
7. [最佳实践](#最佳实践)

---

## 测试概览

### 测试金字塔

```
          /\
         /  \        E2E Tests (Playwright)
        /____\       - 环境管理流程
       /      \      - 配置 CRUD 流程
      /        \     - 资源上传下载
     /__________\    - 配置迁移
    /            \   
   /  Integration \  Integration Tests
  /________________\ - HTTP API 集成
 /                  \ - 数据库集成
/____________________ - 文件系统集成
                      
    Unit Tests       Unit Tests (Go + Vitest)
====================  - DAO 层
                      - Service 层
                      - 组件层
                      - Hooks 层
```

### 测试覆盖目标

- **单元测试覆盖率**: ≥ 80%
- **集成测试覆盖率**: ≥ 70%
- **E2E 测试**: 核心用户流程全覆盖
- **性能测试**: API 响应时间 p95 < 500ms

---

## 后端测试

### 1. 单元测试

#### 运行所有单元测试
```bash
go test ./...
```

#### 运行带覆盖率的测试
```bash
go test -v -race -coverprofile=coverage.out -covermode=atomic ./...
go tool cover -html=coverage.out
```

#### 运行特定包的测试
```bash
# DAO 层测试
go test -v ./biz/dal/db/...

# Service 层测试
go test -v ./biz/service/...

# 配置测试
go test -v ./pkg/config/...
```

### 2. DAO 层测试

位置：`biz/dal/db/*_test.go`

**示例：Environment DAO 测试**
```go
func TestEnvironmentDAO_Create(t *testing.T) {
    db := SetupTestDB(t)
    defer CleanupTestDB(t, db)
    
    dao := NewEnvironmentDAO()
    env := &model.Environment{
        EnvironmentKey:  "test-env",
        EnvironmentName: "Test Environment",
    }
    
    err := dao.Create(context.Background(), db, env)
    assert.NoError(t, err)
    assert.NotZero(t, env.ID)
}
```

**测试覆盖**：
- ✅ Environment DAO（已完成）
- ⏳ Pipeline DAO
- ⏳ Config DAO
- ⏳ Asset DAO

### 3. Service 层测试

位置：`biz/service/*_test.go`

**测试示例**：
```go
func TestConfigService_Create(t *testing.T) {
    // Setup
    db := SetupTestDB(t)
    defer CleanupTestDB(t, db)
    
    service := NewService(db)
    
    // Test
    config := &model.Config{
        ResourceKey:    "test-key",
        EnvironmentKey: "dev",
        PipelineKey:    "main",
        Name:           "test_config",
        Alias:          "Test Config",
        Type:           "text",
        Content:        "test value",
    }
    
    err := service.CreateConfig(ctx, config)
    assert.NoError(t, err)
    
    // Verify
    found, err := service.GetConfigByKey(ctx, "test-key")
    assert.NoError(t, err)
    assert.Equal(t, config.Name, found.Name)
}
```

### 4. Handler 层集成测试

使用 Hertz 的测试工具进行 HTTP 接口测试：

```go
func TestEnvironmentHandler_List(t *testing.T) {
    h := server.Default()
    // Register routes
    RegisterRoutes(h)
    
    // Test request
    w := ut.PerformRequest(h.Engine, "GET", "/api/v1/environment/list", nil)
    
    assert.Equal(t, 200, w.Code)
    // Assert response body
}
```

### 5. 测试工具

**`biz/dal/db/testutil.go`** 提供测试辅助函数：

```go
// 创建测试数据库
db := SetupTestDB(t)
defer CleanupTestDB(t, db)

// 创建测试环境
env := CreateTestEnvironment(t, db, "test-env")

// 创建测试渠道
pipe := CreateTestPipeline(t, db, "test-env", "test-pipeline")

// 创建测试配置
config := CreateTestConfig(t, db, "test-env", "test-pipeline", "test-key")
```

---

## 前端测试

### 1. 测试环境搭建

```bash
cd react

# 安装依赖
npm install

# 运行测试
npm test

# 运行带覆盖率的测试
npm run test:coverage
```

### 2. 组件测试（Vitest + Testing Library）

**示例：配置列表组件测试**
```typescript
import { render, screen } from '@testing-library/react'
import { ConfigList } from '@/components/config-list'

describe('ConfigList', () => {
  it('should render config items', () => {
    const configs = [
      { name: 'config1', alias: 'Config 1', type: 'text' },
      { name: 'config2', alias: 'Config 2', type: 'json' },
    ]
    
    render(<ConfigList configs={configs} />)
    
    expect(screen.getByText('Config 1')).toBeInTheDocument()
    expect(screen.getByText('Config 2')).toBeInTheDocument()
  })
})
```

### 3. Hooks 测试

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { useConfigs } from '@/hooks/use-configs'

describe('useConfigs', () => {
  it('should fetch configs', async () => {
    const { result } = renderHook(() => useConfigs('dev', 'main'))
    
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(5)
  })
})
```

### 4. API 客户端测试

```typescript
import { configApi } from '@/lib/api/config'
import { rest } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  rest.get('/api/v1/config/list', (req, res, ctx) => {
    return res(ctx.json({
      code: 200,
      data: { list: [...] }
    }))
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('configApi', () => {
  it('should fetch config list', async () => {
    const result = await configApi.list({
      environment_key: 'dev',
      pipeline_key: 'main'
    })
    
    expect(result.list).toBeDefined()
  })
})
```

---

## E2E 测试

### 1. 环境准备

```bash
cd tests/e2e

# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install
```

### 2. 运行 E2E 测试

```bash
# 运行所有测试
npm test

# 运行带界面的测试
npm run test:headed

# 运行特定测试文件
npx playwright test specs/environment.spec.ts

# 调试模式
npm run test:debug

# 生成测试报告
npm run test:report
```

### 3. 测试用例

**已实现**：
- ✅ 环境管理流程 (`environment.spec.ts`)
  - 创建环境
  - 编辑环境
  - 删除环境

**待实现**：
- ⏳ 配置管理流程 (`config.spec.ts`)
- ⏳ 资源上传流程 (`assets.spec.ts`)
- ⏳ 配置迁移流程 (`migration.spec.ts`)
- ⏳ 导入导出流程 (`transfer.spec.ts`)

### 4. 编写 E2E 测试

**示例：配置 CRUD 测试**
```typescript
import { test, expect } from '@playwright/test'

test.describe('Config Management', () => {
  test('should create config', async ({ page }) => {
    await page.goto('/config')
    
    // 选择环境和渠道
    await page.selectOption('[name="environment"]', 'dev')
    await page.selectOption('[name="pipeline"]', 'main')
    
    // 点击创建按钮
    await page.click('button:has-text("创建配置")')
    
    // 填写表单
    await page.fill('[name="name"]', 'test_config')
    await page.fill('[name="alias"]', 'Test Config')
    await page.selectOption('[name="type"]', 'text')
    await page.fill('[name="content"]', 'test value')
    
    // 提交
    await page.click('button:has-text("确定")')
    
    // 验证
    await expect(page.locator('text=成功')).toBeVisible()
    await expect(page.locator('text=test_config')).toBeVisible()
  })
})
```

### 5. 测试配置

**`playwright.config.ts`** 配置项：
- `baseURL`: 测试基础 URL（默认 `http://localhost:8080`）
- `trace`: 失败时记录 trace
- `screenshot`: 失败时截图
- `video`: 失败时录制视频
- `webServer`: 自动启动后端服务

---

## 性能测试

### 1. 环境准备

安装 k6：
```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
  sudo tee /usr/share/keyrings/k6-archive-keyring.list
sudo apt-get update
sudo apt-get install k6

# Windows
choco install k6
```

### 2. 运行性能测试

```bash
# 基本负载测试
k6 run tests/performance/api-load-test.js

# 指定 BASE_URL 和 BASE_PATH
BASE_URL=http://localhost:8080 BASE_PATH=/rainbow-bridge k6 run tests/performance/api-load-test.js

# 输出 JSON 结果
k6 run tests/performance/api-load-test.js --out json=reports/results.json

# 自定义负载参数
k6 run --vus 100 --duration 5m tests/performance/api-load-test.js
```

### 3. 性能测试场景

**`api-load-test.js`** - API 负载测试

**测试阶段**：
1. 30s - 上升到 20 个并发用户
2. 1m - 保持 20 个并发用户
3. 30s - 上升到 50 个并发用户
4. 1m - 保持 50 个并发用户
5. 30s - 下降到 0

**性能指标**：
- HTTP 请求时长（p95 < 500ms）
- 错误率（< 10%）
- 吞吐量（req/s）

**测试接口**：
- `GET /api/v1/environment/list`
- `GET /api/v1/config/list`
- `GET /api/v1/runtime/config`
- `GET /api/v1/version`

### 4. 查看性能报告

测试完成后会生成两个报告：
- `reports/summary.json` - JSON 格式详细数据
- `reports/summary.html` - HTML 可视化报告

打开 HTML 报告：
```bash
open tests/performance/reports/summary.html
```

### 5. 性能基准

**目标性能指标**：

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 响应时间（p95） | < 500ms | 95% 请求低于 500ms |
| 响应时间（p99） | < 1000ms | 99% 请求低于 1s |
| 错误率 | < 1% | 错误请求占比小于 1% |
| 吞吐量 | > 100 req/s | 每秒处理请求数 |
| 并发用户数 | 50+ | 稳定支持 50 并发用户 |

---

## CI/CD 集成

### GitHub Actions 工作流

**`.github/workflows/test.yml`** 包含以下测试任务：

#### 1. 后端单元测试
- 运行所有 Go 测试
- 生成覆盖率报告
- 上传到 Codecov

#### 2. 前端单元测试
- 安装 Node.js 依赖
- 运行前端测试
- （待配置）

#### 3. E2E 测试
- 构建后端服务
- 安装 Playwright
- 运行 E2E 测试
- 上传测试报告和截图

#### 4. 性能测试
- 仅在 main 分支或提交信息包含 `[perf]` 时触发
- 安装 k6
- 运行性能测试
- 上传性能报告

#### 5. 代码质量检查
- Go: golangci-lint
- 前端: ESLint

### 触发条件

```yaml
on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]
```

### 查看测试结果

1. **GitHub Actions 页面**：查看测试状态和日志
2. **Artifacts**：下载测试报告、截图、性能数据
3. **Codecov**：查看代码覆盖率趋势

---

## 最佳实践

### 1. 测试命名规范

**Go 测试**：
```go
// 格式：Test<功能>_<场景>
func TestEnvironmentDAO_Create_Success(t *testing.T) {}
func TestEnvironmentDAO_Create_DuplicateKey(t *testing.T) {}
func TestConfigService_Update_NotFound(t *testing.T) {}
```

**TypeScript 测试**：
```typescript
// describe: 描述测试对象
// it/test: 描述测试场景
describe('ConfigList', () => {
  it('should render config items', () => {})
  it('should handle empty list', () => {})
})
```

### 2. 测试组织

**AAA 模式（Arrange-Act-Assert）**：
```go
func TestExample(t *testing.T) {
    // Arrange - 准备测试数据
    db := SetupTestDB(t)
    defer CleanupTestDB(t, db)
    
    // Act - 执行被测试的操作
    result, err := DoSomething(db)
    
    // Assert - 验证结果
    assert.NoError(t, err)
    assert.Equal(t, expected, result)
}
```

### 3. 测试隔离

- 每个测试使用独立的数据库（in-memory SQLite）
- 使用 `t.Cleanup()` 或 `defer` 清理资源
- 避免测试之间的依赖

### 4. Mock 和 Stub

**使用场景**：
- 外部 API 调用
- 文件系统操作
- 时间依赖的测试

**示例**：
```go
type MockAssetUploader struct{}

func (m *MockAssetUploader) Upload(file io.Reader) (string, error) {
    return "mock-file-id", nil
}
```

### 5. 测试覆盖率目标

- **关键代码**: 100% 覆盖（DAO、核心业务逻辑）
- **一般代码**: 80% 覆盖
- **UI 代码**: 60% 覆盖

### 6. 性能测试策略

- **定期执行**: 每周运行一次完整性能测试
- **持续监控**: 在 CI/CD 中运行轻量级性能测试
- **基准对比**: 与之前的版本对比性能变化
- **及时优化**: 发现性能退化立即优化

### 7. E2E 测试最佳实践

- 使用 Page Object 模式组织页面元素
- 使用稳定的选择器（data-testid）
- 避免硬编码等待时间，使用 `waitFor`
- 测试关键用户流程，不要测试所有细节

### 8. 测试数据管理

- 使用 Factory 模式创建测试数据
- 使用随机数据避免冲突（时间戳、UUID）
- 清理测试数据，避免污染环境

---

## 故障排查

### 常见问题

#### 1. 后端测试失败

**问题**: `database locked`
```
解决方案：
- 确保每个测试使用独立的数据库
- 使用 defer CleanupTestDB(t, db) 清理资源
```

**问题**: `port already in use`
```
解决方案：
- 使用随机端口或确保端口未被占用
- 测试完成后关闭服务器
```

#### 2. E2E 测试失败

**问题**: `Timeout 30000ms exceeded`
```
解决方案：
- 增加超时时间：test.setTimeout(60000)
- 检查后端服务是否正常启动
- 使用 --headed 模式查看浏览器行为
```

**问题**: 元素找不到
```
解决方案：
- 使用更稳定的选择器（data-testid）
- 等待元素可见：await page.waitForSelector()
- 检查 basePath 配置是否正确
```

#### 3. 性能测试失败

**问题**: `error rate too high`
```
解决方案：
- 检查后端服务是否正常运行
- 降低并发用户数
- 检查数据库连接池配置
```

---

## 参考资源

### 文档
- [Go Testing](https://go.dev/doc/tutorial/add-a-test)
- [Playwright Documentation](https://playwright.dev/)
- [k6 Documentation](https://k6.io/docs/)
- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)

### 工具
- [Testify](https://github.com/stretchr/testify) - Go 测试断言库
- [gomock](https://github.com/golang/mock) - Go Mock 工具
- [MSW](https://mswjs.io/) - API Mocking 工具
- [Codecov](https://codecov.io/) - 代码覆盖率可视化

---

## 贡献指南

### 添加新测试

1. **后端测试**: 在对应包下创建 `*_test.go` 文件
2. **前端测试**: 在组件旁创建 `.test.tsx` 文件
3. **E2E 测试**: 在 `tests/e2e/specs/` 创建 `.spec.ts` 文件
4. **性能测试**: 在 `tests/performance/` 创建 `.js` 文件

### 测试审查清单

- [ ] 测试名称清晰描述测试场景
- [ ] 使用 AAA 模式组织测试代码
- [ ] 测试覆盖正常和异常场景
- [ ] 测试是隔离的，不依赖其他测试
- [ ] 使用合适的断言方法
- [ ] 清理测试资源
- [ ] 文档更新（如需要）

---

## License

本项目遵循 [Apache License 2.0](LICENSE)。
