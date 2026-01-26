# Go + Protobuf 项目代码规范

> 通用的 Go 微服务项目代码编写规范，基于 CloudWeGo Hertz + Protobuf + GORM 技术栈

**适用场景：**
- Go 微服务项目
- 使用 Protobuf 定义 API
- 使用 Hz 工具生成代码
- GORM 作为 ORM 框架
- RESTful API 设计

---

## 目录

- [1. 技术栈要求](#1-技术栈要求)
- [2. 项目结构规范](#2-项目结构规范)
- [3. Proto 文件规范](#3-proto-文件规范)
- [4. Go 代码风格](#4-go-代码风格)
- [5. 数据库设计规范](#5-数据库设计规范)
- [6. API 设计规范](#6-api-设计规范)
- [7. 前端代码规范](#7-前端代码规范)
- [8. 开发流程](#8-开发流程)
- [9. 常见陷阱](#9-常见陷阱)

---

## 1. 技术栈要求

### 1.1 后端必选

| 技术 | 版本要求 | 说明 |
|-----|---------|------|
| **Go** | 1.21+ | 编程语言 |
| **Protobuf** | proto3 | API 定义 |
| **GORM** | 最新稳定版 | ORM 框架 |

### 1.2 后端推荐

| 技术 | 推荐版本 | 说明 |
|-----|---------|------|
| **CloudWeGo Hertz** | v0.10+ | Web 框架 |
| **Hz** | v0.9+ | 代码生成工具 |
| **SQLite/MySQL/PostgreSQL** | - | 数据库 |

### 1.3 前端推荐

- **无框架或轻量框架**：原生 JS / Vue / React
- **模块化**：ES6 Module
- **HTTP 客户端**：Fetch API / Axios

---

## 2. 项目结构规范

### 2.1 标准目录结构

```
project_root/
├── idl/                          # Protobuf 定义
│   ├── api.proto                # API 注解扩展
│   ├── common.proto             # 通用消息
│   └── biz/                     # 业务模块定义
│       ├── module1.proto
│       ├── module2.proto
│       └── ...
│
├── biz/                         # 业务代码（或 internal/）
│   ├── model/                   # Protobuf 生成的消息模型
│   │   ├── common/
│   │   ├── module1/
│   │   └── module2/
│   ├── handler/                 # HTTP 请求处理层
│   │   ├── common.go            # 通用响应工具
│   │   └── {module}/            # 各模块处理器
│   ├── service/                 # 业务逻辑层
│   │   ├── service.go           # 主服务类
│   │   └── {module}_service.go  # 模块业务逻辑
│   ├── dal/                     # 数据访问层
│   │   ├── db/                  # DAO 实现
│   │   │   └── {module}_dao.go
│   │   └── model/               # 数据库模型
│   │       └── {module}.go
│   ├── router/                  # 路由层
│   │   ├── register.go          # 统一注册
│   │   └── {module}/            # 模块路由
│   └── middleware/              # 中间件
│       ├── cors.go
│       ├── auth.go
│       └── recovery.go
│
├── pkg/                         # 通用工具包（可被外部引用）
│   ├── common/                  # 公共函数
│   ├── config/                  # 配置加载
│   ├── database/                # 数据库初始化
│   ├── constants/               # 常量定义
│   └── util/                    # 工具函数
│
├── cmd/                         # 程序入口（可选）
│   └── server/
│       └── main.go
│
├── deploy/                      # 部署配置
│   ├── docker-compose/
│   ├── kubernetes/
│   └── nginx/
│
├── script/                      # 构建脚本
│   ├── build.sh
│   ├── gen.sh                   # 代码生成脚本
│   └── test.sh
│
├── web/                         # 前端代码（如有）
├── docs/                        # 文档
├── test/                        # 测试
│
├── main.go                      # 应用入口
├── go.mod                       # Go 模块
├── config.yaml                  # 应用配置
├── .hz                          # Hz 配置
├── Dockerfile
├── Makefile
├── README.md
├── CODING_STANDARDS.md          # 本文档
└── AGENT.md                     # AI 开发记录（推荐）
```

### 2.2 分层架构说明

```
请求流向：
Client → Router → Handler → Service → DAO → Database
                            ↓
                          Logic (业务规则)
```

**职责划分：**
- **Router**: 路由定义和中间件注册
- **Handler**: HTTP 请求解析、参数验证、响应封装
- **Service**: 业务逻辑实现、流程编排
- **DAO (Data Access Object)**: 数据库 CRUD 操作
- **Model**: 数据结构定义（Protobuf 模型 + 数据库模型）

---

## 3. Proto 文件规范

### 3.1 文件组织

```
idl/
├── api.proto          # API 注解扩展（proto2，定义 HTTP 路由注解）
├── common.proto       # 通用消息（proto3，跨模块复用）
└── biz/               # 业务模块（proto3）
    ├── user.proto
    ├── order.proto
    └── product.proto
```

**导入关系：**
- 业务 proto 导入 `api.proto` 和 `common.proto`
- `api.proto` 导入 `google/protobuf/descriptor.proto`

### 3.2 命名规范

#### Package 命名
```protobuf
package user;           // 小写，对应功能模块
package user_service;   // 多词用下划线分隔
```

#### Message 命名

| 类型 | 命名规则 | 示例 |
|-----|---------|------|
| **实体消息** | PascalCase | `User`, `Order`, `Product` |
| **请求消息** | `{Action}{Entity}Request` | `CreateUserRequest`, `UpdateOrderRequest` |
| **响应消息** | `{Entity}{Type}Response` | `UserResponse`, `UserListResponse` |
| **通用响应** | 语义化名称 | `BaseResponse`, `OperateResponse` |

#### 字段命名
```protobuf
// 使用 snake_case
string user_id = 1;
string user_name = 2;
int32 age = 3;
bool is_active = 4;
repeated string tags = 5;
```

#### Service 和 RPC 命名
```protobuf
service UserService {
  rpc Create(CreateUserRequest) returns (UserResponse);        // PascalCase
  rpc Update(UpdateUserRequest) returns (UserResponse);
  rpc Delete(DeleteUserRequest) returns (BaseResponse);
  rpc Get(GetUserRequest) returns (UserResponse);
  rpc List(ListUserRequest) returns (UserListResponse);
}
```

### 3.3 API 注解规范

#### 标准 RESTful 路由
```protobuf
service UserService {
  rpc Create(CreateUserRequest) returns (UserResponse) {
    option (api.post) = "/api/v1/user/create";
  }
  
  rpc Update(UpdateUserRequest) returns (UserResponse) {
    option (api.post) = "/api/v1/user/update";
  }
  
  rpc Delete(DeleteUserRequest) returns (BaseResponse) {
    option (api.post) = "/api/v1/user/delete";
  }
  
  rpc Get(GetUserRequest) returns (UserResponse) {
    option (api.get) = "/api/v1/user/detail";
  }
  
  rpc List(ListUserRequest) returns (UserListResponse) {
    option (api.get) = "/api/v1/user/list";
  }
}
```

#### 字段注解（HTTP 参数绑定）
```protobuf
message GetUserRequest {
  string user_id = 1 [(api.query) = "user_id"];           // Query 参数
  string token = 2 [(api.header) = "Authorization"];      // Header
}

message UpdateUserRequest {
  string user_id = 1 [(api.path) = "user_id"];           // Path 参数
  User user = 2 [(api.body) = "user"];                   // Body
}
```

**可用注解：**
- `api.header` - HTTP Header
- `api.query` - URL Query 参数
- `api.path` - URL Path 参数
- `api.body` - Request Body
- `api.form` - Form 表单
- `api.cookie` - Cookie

### 3.4 通用响应结构

**不推荐：Protobuf 不支持隐式继承**

❌ **错误示例（Protobuf 无继承）：**
```protobuf
// Protobuf 不支持这种写法
message BaseResponse {
  int32 code = 1;
  string msg = 2;
}

message UserResponse extends BaseResponse {  // ❌ 错误：不支持 extends
  User user = 3;
}
```

✅ **正确做法（组合）：**
```protobuf
// common.proto
message BaseResponse {
  int32 code = 1;
  string msg = 2;
  string error = 3;
}

// user.proto
message UserResponse {
  BaseResponse base = 1;      // ✅ 使用组合
  User user = 2;
}

message UserListResponse {
  BaseResponse base = 1;
  repeated User users = 2;
  int32 total = 3;
}
```

### 3.5 代码生成规范

#### 生成命令
```bash
# 更新所有 proto 生成代码
hz update -idl idl/biz/*.proto

# 或更新指定模块
hz update -idl idl/biz/user.proto
```

#### 代码生成脚本（gen.sh）

**⚠️ 常见陷阱：SVC_PACKAGE 占位符必须替换**

```bash
#!/bin/bash
# script/gen.sh

set -e

# 定义变量
IDL_DIR="idl/biz"
API_PACKAGE="api"  # ⚠️ 重要：确保这里使用正确的包名，不是占位符 ${SVC_PACKAGE}

# 生成代码
echo "生成 Protobuf 代码..."
hz update -idl ${IDL_DIR}/*.proto

echo "代码生成完成！"
```

#### 重要规则

**🚫 禁止手动修改的文件：**
- `biz/model/**/*.pb.go` - Protobuf 消息
- `biz/router/*/*.go` - 路由定义（register.go 除外）
- Handler 中标记 `Code generated by hz. DO NOT EDIT.` 的文件

**✅ 允许修改的文件：**
- `biz/handler/*/` 中的业务逻辑实现
- `biz/service/` 中的所有文件
- `biz/dal/` 中的所有文件
- 自定义路由文件（如 `router.go`）

**识别标识：**
```go
// Code generated by hz. DO NOT EDIT.
```

---

## 4. Go 代码风格

### 4.1 命名规范

#### 包级别

| 类型 | 规则 | 示例 |
|-----|------|------|
| **包名** | 小写单词，简短 | `handler`, `service`, `dao`, `util` |
| **导出常量** | PascalCase | `MaxRetries`, `DefaultTimeout` |
| **私有常量** | camelCase | `defaultPageSize`, `maxUploadSize` |
| **全局变量** | camelCase（私有）/ PascalCase（导出） | `dbInstance`, `GlobalConfig` |

#### 函数和方法
```go
// 导出函数：PascalCase，动词开头
func NewService(db *gorm.DB) *Service { }
func CreateUser(ctx context.Context, user *User) error { }

// 私有函数：camelCase
func validateEmail(email string) bool { }
func parseUserInput(input string) (*User, error) { }
```

#### 结构体
```go
// 导出结构体：PascalCase
type UserService struct {
    dao      *UserDAO
    logger   *log.Logger
}

type CreateUserRequest struct {
    Username string `json:"username" binding:"required"`
    Email    string `json:"email" binding:"required,email"`
    Age      int    `json:"age" binding:"gte=0,lte=150"`
}

// 字段标签顺序：gorm -> json -> form -> binding
type User struct {
    ID        uint      `gorm:"primaryKey" json:"id"`
    Username  string    `gorm:"column:username;uniqueIndex" json:"username" form:"username" binding:"required"`
    Email     string    `gorm:"column:email;uniqueIndex" json:"email" form:"email" binding:"required,email"`
    CreatedAt time.Time `gorm:"column:created_at" json:"created_at"`
}
```

### 4.2 错误处理

#### 错误定义
```go
// 包级别错误变量
var (
    ErrUserNotFound      = errors.New("user not found")
    ErrInvalidPassword   = errors.New("invalid password")
    ErrEmailAlreadyExists = errors.New("email already exists")
    ErrPermissionDenied  = errors.New("permission denied")
)
```

#### 错误检查模式
```go
// 1. 立即返回错误
if err := validateInput(input); err != nil {
    return nil, err
}

// 2. 区分错误类型
user, err := dao.GetByID(ctx, userID)
if err != nil {
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrUserNotFound
    }
    return nil, fmt.Errorf("get user: %w", err)
}

// 3. 使用 errors.Is 检查特定错误
if errors.Is(err, ErrEmailAlreadyExists) {
    return handler.RespondError(c, http.StatusBadRequest, err)
}

// 4. 错误包装（保留堆栈）
if err != nil {
    return fmt.Errorf("create user failed: %w", err)
}
```

#### 致命错误处理
```go
// main.go 中使用 log.Fatalf
config, err := loadConfig("config.yaml")
if err != nil {
    log.Fatalf("failed to load config: %v", err)
}

db, err := initDatabase(config.Database)
if err != nil {
    log.Fatalf("failed to init database: %v", err)
}
```

### 4.3 Import 排序

**三段式排序：**
1. 标准库（字母排序）
2. 第三方库（按域名排序）
3. 项目内部包（按路径排序）

```go
import (
    // 标准库
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "time"
    
    // 第三方库
    "github.com/cloudwego/hertz/pkg/app"
    "github.com/cloudwego/hertz/pkg/protocol/consts"
    "gorm.io/gorm"
    
    // 项目内部
    "github.com/yourorg/yourproject/biz/dal/model"
    "github.com/yourorg/yourproject/biz/service"
    "github.com/yourorg/yourproject/pkg/common"
)
```

### 4.4 注释规范

#### 包级别注释
```go
// Package service implements the business logic layer.
package service
```

#### 函数注释（英文，完整句子）
```go
// CreateUser creates a new user in the database.
// It validates the input and returns an error if validation fails.
func (s *UserService) CreateUser(ctx context.Context, req *CreateUserRequest) (*User, error) {
    // ...
}
```

#### 业务逻辑注释（可用中文）
```go
// 检查用户名是否已存在
existing, err := s.dao.GetByUsername(ctx, req.Username)
if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
    return nil, err
}
if existing != nil {
    return nil, ErrUsernameExists  // 用户名已被占用
}
```

#### 分组注释
```go
// -------------------- Request/Response Types --------------------

type CreateUserRequest struct { }
type UpdateUserRequest struct { }

// -------------------- Business Logic --------------------

func (s *UserService) CreateUser(ctx context.Context, req *CreateUserRequest) error { }
```

### 4.5 常量和枚举

#### 常量组
```go
const (
    DefaultPageSize = 20
    MaxPageSize     = 100
    TokenExpiry     = 24 * time.Hour
)
```

#### 使用 map 实现"枚举"
```go
type UserStatus string

const (
    UserStatusActive   UserStatus = "active"
    UserStatusInactive UserStatus = "inactive"
    UserStatusBanned   UserStatus = "banned"
)

var ValidUserStatuses = map[UserStatus]bool{
    UserStatusActive:   true,
    UserStatusInactive: true,
    UserStatusBanned:   true,
}

func IsValidUserStatus(status UserStatus) bool {
    return ValidUserStatuses[status]
}
```

### 4.6 Context 使用

```go
// 定义私有 key 类型（防止冲突）
type contextKey string

const (
    userIDKey    contextKey = "user_id"
    requestIDKey contextKey = "request_id"
)

// 设置值
func ContextWithUserID(ctx context.Context, userID int64) context.Context {
    return context.WithValue(ctx, userIDKey, userID)
}

// 获取值（类型安全）
func GetUserIDFromContext(ctx context.Context) (int64, bool) {
    v := ctx.Value(userIDKey)
    if v == nil {
        return 0, false
    }
    
    // 类型断言
    userID, ok := v.(int64)
    return userID, ok
}
```

### 4.7 依赖注入模式

```go
// Service 结构体聚合依赖
type UserService struct {
    db        *gorm.DB
    userDAO   *UserDAO
    cache     Cache
    logger    Logger
}

// 构造函数注入
func NewUserService(db *gorm.DB, cache Cache, logger Logger) *UserService {
    return &UserService{
        db:      db,
        userDAO: NewUserDAO(),
        cache:   cache,
        logger:  logger,
    }
}

// 方法使用依赖
func (s *UserService) CreateUser(ctx context.Context, user *User) error {
    if err := s.userDAO.Create(ctx, s.db, user); err != nil {
        s.logger.Errorf("failed to create user: %v", err)
        return err
    }
    
    // 清除缓存
    s.cache.Delete(fmt.Sprintf("user:%d", user.ID))
    return nil
}
```

---

## 5. 数据库设计规范

### 5.1 表设计规范

#### 基础模型（推荐继承）
```go
type BaseModel struct {
    ID        uint           `gorm:"primaryKey" json:"id"`
    CreatedAt time.Time      `gorm:"column:created_at" json:"created_at"`
    UpdatedAt time.Time      `gorm:"column:updated_at" json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`  // 软删除
}
```

#### 模型定义示例
```go
type User struct {
    BaseModel
    Username string `gorm:"column:username;uniqueIndex;type:varchar(50);not null" json:"username"`
    Email    string `gorm:"column:email;uniqueIndex;type:varchar(100);not null" json:"email"`
    Password string `gorm:"column:password;type:varchar(255);not null" json:"-"`
    Status   string `gorm:"column:status;type:varchar(20);default:'active'" json:"status"`
    Age      int    `gorm:"column:age" json:"age"`
}

// TableName 指定表名
func (User) TableName() string {
    return "users"
}
```

### 5.2 命名规范

| 元素 | 规则 | 示例 |
|-----|------|------|
| **表名** | snake_case 复数 | `users`, `orders`, `order_items` |
| **列名** | snake_case | `user_id`, `created_at`, `is_active` |
| **索引** | `idx_{table}_{columns}` | `idx_users_email`, `idx_orders_user_id` |
| **唯一索引** | `uk_{table}_{columns}` | `uk_users_username`, `uk_users_email` |

### 5.3 索引规范

```go
type Order struct {
    BaseModel
    UserID    uint      `gorm:"column:user_id;index:idx_orders_user_id;not null" json:"user_id"`
    OrderNo   string    `gorm:"column:order_no;uniqueIndex:uk_orders_order_no;type:varchar(50)" json:"order_no"`
    Status    string    `gorm:"column:status;index:idx_orders_status" json:"status"`
    Amount    float64   `gorm:"column:amount;type:decimal(10,2)" json:"amount"`
}

// 复合索引
type OrderItem struct {
    BaseModel
    OrderID   uint `gorm:"column:order_id;uniqueIndex:uk_order_item,priority:1" json:"order_id"`
    ProductID uint `gorm:"column:product_id;uniqueIndex:uk_order_item,priority:2" json:"product_id"`
    Quantity  int  `gorm:"column:quantity" json:"quantity"`
}
```

---

## 6. API 设计规范

### 6.1 RESTful 路由规范

| 操作 | HTTP 方法 | 路由模式 | 说明 |
|-----|----------|---------|------|
| 列表查询 | GET | `/api/v1/{resource}/list` | 支持分页、过滤、排序 |
| 详情查询 | GET | `/api/v1/{resource}/detail` | 通过 query 或 path 参数 |
| 创建 | POST | `/api/v1/{resource}/create` | Body 传递数据 |
| 更新 | POST/PUT | `/api/v1/{resource}/update` | Body 传递数据 |
| 删除 | POST/DELETE | `/api/v1/{resource}/delete` | Body 或 query 传递 ID |

**资源命名示例：**
- `/api/v1/user/list`
- `/api/v1/order/detail?order_id=123`
- `/api/v1/product/create`

### 6.2 统一响应格式

```json
{
  "code": 0,
  "msg": "success",
  "error": "",
  "data": { }
}
```

**字段说明：**
- `code`: 业务状态码（0 表示成功，非 0 表示失败）
- `msg`: 操作提示消息（给用户看）
- `error`: 详细错误信息（调试用）
- `data`: 业务数据

**Go 实现：**
```go
type BaseResponse struct {
    Code  int32  `json:"code"`
    Msg   string `json:"msg,omitempty"`
    Error string `json:"error,omitempty"`
    Data  any    `json:"data,omitempty"`
}

// 成功响应
func RespondSuccess(c *app.RequestContext, data any) {
    c.JSON(http.StatusOK, BaseResponse{
        Code: 0,
        Msg:  "success",
        Data: data,
    })
}

// 错误响应
func RespondError(c *app.RequestContext, httpStatus int, err error) {
    c.JSON(httpStatus, BaseResponse{
        Code:  int32(httpStatus),
        Msg:   http.StatusText(httpStatus),
        Error: err.Error(),
    })
}
```

### 6.3 错误码规范

```go
const (
    CodeSuccess           = 0
    CodeBadRequest        = 400
    CodeUnauthorized      = 401
    CodeForbidden         = 403
    CodeNotFound          = 404
    CodeConflict          = 409
    CodeInternalError     = 500
    CodeServiceUnavailable = 503
)
```

### 6.4 分页规范

**请求参数：**
```go
type PaginationRequest struct {
    Page     int `json:"page" form:"page" binding:"gte=1"`          // 页码（从 1 开始）
    PageSize int `json:"page_size" form:"page_size" binding:"gte=1,lte=100"` // 每页数量
}
```

**响应格式：**
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "items": [ ],
    "total": 100,
    "page": 1,
    "page_size": 20
  }
}
```

---

## 7. 前端代码规范

### 7.1 命名规范

```javascript
// 常量：全大写下划线分隔
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = '/api/v1';

// 变量：camelCase
let userId = 123;
let userList = [];

// 函数：camelCase，动词开头
function fetchUserList() { }
async function createUser(data) { }

// 类：PascalCase
class UserManager { }
```

### 7.2 API 封装

```javascript
// lib/api.js
export async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.error || data.msg);
  }
  
  return data.data;
}

export const API = {
  user: {
    list: (params) => request('/api/v1/user/list?' + new URLSearchParams(params)),
    create: (data) => request('/api/v1/user/create', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }
};
```

### 7.3 错误处理

```javascript
async function loadUsers() {
  try {
    const users = await API.user.list({ page: 1, page_size: 20 });
    renderUsers(users);
  } catch (error) {
    console.error('加载用户列表失败:', error);
    showToast(`加载失败: ${error.message}`, 'error');
  }
}
```

---

## 8. 开发流程

### 8.1 新增功能模块

**步骤：**

1. **定义 Proto**
   ```bash
   # 创建 idl/biz/new_module.proto
   vim idl/biz/new_module.proto
   ```

2. **生成代码**
   ```bash
   hz update -idl idl/biz/new_module.proto
   # 或使用脚本
   ./script/gen.sh
   ```

3. **实现数据层（DAO + Model）**
   ```bash
   # 创建数据库模型
   vim biz/dal/model/new_module.go
   
   # 创建 DAO
   vim biz/dal/db/new_module_dao.go
   ```

4. **实现业务层（Service）**
   ```bash
   vim biz/service/new_module_service.go
   ```

5. **实现处理层（Handler）**
   ```bash
   # Hz 自动生成了框架，填充业务逻辑
   vim biz/handler/new_module/handler.go
   ```

6. **测试**
   ```bash
   # 运行测试
   go test ./...
   
   # 启动服务
   go run main.go
   
   # 测试 API
   curl -X POST http://localhost:8080/api/v1/new_module/create \
     -H "Content-Type: application/json" \
     -d '{"field": "value"}'
   ```

### 8.2 修改现有功能

**规则：**

1. **修改 Proto 定义**：必须重新生成代码
   ```bash
   hz update -idl idl/biz/{module}.proto
   ```

2. **只修改业务逻辑**：直接编辑 Service/Handler/DAO，不需要重新生成

3. **禁止手动修改**：`*.pb.go` 和标记为 `Code generated by hz` 的文件

### 8.3 代码审查检查项

**基础检查：**
- [ ] Proto 定义是否符合命名规范
- [ ] 错误处理是否完整（不能忽略错误）
- [ ] 是否有 SQL 注入风险
- [ ] 数据库索引是否合理
- [ ] API 路由是否符合 RESTful
- [ ] 响应格式是否统一

**安全检查：**
- [ ] 敏感信息是否脱敏（密码、Token）
- [ ] 是否有越权访问风险
- [ ] 输入验证是否充分
- [ ] SQL 语句是否使用参数化查询

**性能检查：**
- [ ] 是否有 N+1 查询问题
- [ ] 大列表查询是否分页
- [ ] 是否需要添加缓存
- [ ] 资源是否正确释放（数据库连接、文件句柄）

### 8.4 提交规范

**Commit 消息格式：**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型（type）：**
- `feat`: 新功能
- `fix`: Bug 修复
- `refactor`: 代码重构（不改变功能）
- `perf`: 性能优化
- `style`: 代码格式（不影响功能）
- `docs`: 文档更新
- `test`: 测试相关
- `chore`: 构建/工具相关

**示例：**
```
feat(user): 新增用户注册功能

- 实现用户注册 API
- 添加邮箱验证逻辑
- 添加密码强度校验

Closes #123
```

### 8.5 维护 AGENT.md（推荐）

**目的：** 记录 AI 辅助开发的经验和规范，帮助 AI 更好地理解项目

**内容建议：**
- 项目架构说明
- 关键设计决策
- 代码搜索策略
- 常见问题和解决方案
- 最佳实践

**示例结构：**
```markdown
# AI 开发指南

## 项目概述
简要描述项目功能和技术栈

## 代码搜索策略
1. 语义搜索 - 理解功能实现位置
2. 符号搜索 - 查找类、函数定义
3. 文件检索 - 定位特定文件

## 修改策略
- 新增功能：创建新文件
- 修改现有功能：精确替换
- 向后兼容：提供转换函数

## 常见陷阱
### gen.sh 脚本中的占位符
- 问题：SVC_PACKAGE 占位符未替换
- 解决：改为具体的包名，如 "api"
```

---

## 9. 常见陷阱

### 9.1 代码生成相关

#### ❌ 陷阱 1：gen.sh 模板中的占位符未替换

**问题：**
```bash
# script/gen.sh（错误示例）
API_PACKAGE="${SVC_PACKAGE}"  # ❌ 占位符未替换
```

**解决：**
```bash
# script/gen.sh（正确示例）
API_PACKAGE="api"  # ✅ 使用实际包名
```

#### ❌ 陷阱 2：手动修改生成的文件

**问题：** 手动修改 `*.pb.go` 文件，下次生成时被覆盖

**解决：** 
- 业务逻辑写在 Service 层
- 类型转换写在单独的 converter 文件
- 不要修改标记为 `Code generated by hz` 的文件

### 9.2 Protobuf 设计陷阱

#### ❌ 陷阱 3：误用继承

**问题：** Protobuf 不支持隐式继承

```protobuf
// ❌ 错误：Protobuf 不支持 extends
message UserResponse extends BaseResponse {
  User user = 3;
}
```

**解决：** 使用组合
```protobuf
// ✅ 正确：使用组合
message UserResponse {
  BaseResponse base = 1;
  User user = 2;
}
```

### 9.3 错误处理陷阱

#### ❌ 陷阱 4：忽略错误

```go
// ❌ 错误：忽略错误
user, _ := dao.GetByID(ctx, userID)
```

**解决：**
```go
// ✅ 正确：处理错误
user, err := dao.GetByID(ctx, userID)
if err != nil {
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrUserNotFound
    }
    return nil, fmt.Errorf("get user: %w", err)
}
```

### 9.4 数据库陷阱

#### ❌ 陷阱 5：N+1 查询问题

```go
// ❌ 错误：N+1 查询
orders, _ := db.Find(&Order{}).Error
for _, order := range orders {
    user, _ := db.First(&User{}, order.UserID).Error  // 每次循环查询一次
}
```

**解决：**
```go
// ✅ 正确：使用 Preload 预加载
orders := []Order{}
db.Preload("User").Find(&orders)
```

### 9.5 API 设计陷阱

#### ❌ 陷阱 6：密码等敏感信息返回给前端

```go
// ❌ 错误：密码字段暴露
type User struct {
    Password string `json:"password"`  // 危险！
}
```

**解决：**
```go
// ✅ 正确：使用 json:"-" 隐藏敏感字段
type User struct {
    Password string `json:"-" gorm:"column:password"`
}
```

---

## 附录：快速参考

### Proto 到 Go 类型映射

| Proto 类型 | Go 类型 | 说明 |
|-----------|---------|------|
| `string` | `string` | UTF-8 字符串 |
| `int32` | `int32` | 32 位整数 |
| `int64` | `int64` | 64 位整数 |
| `uint32` | `uint32` | 无符号 32 位整数 |
| `uint64` | `uint64` | 无符号 64 位整数 |
| `bool` | `bool` | 布尔值 |
| `float` | `float32` | 单精度浮点 |
| `double` | `float64` | 双精度浮点 |
| `bytes` | `[]byte` | 字节数组 |
| `repeated T` | `[]T` | 切片 |
| `map<K,V>` | `map[K]V` | 映射 |

### 常用 GORM 标签

```go
`gorm:"column:field_name"`                  // 列名
`gorm:"primaryKey"`                         // 主键
`gorm:"autoIncrement"`                      // 自增
`gorm:"index"`                              // 普通索引
`gorm:"uniqueIndex"`                        // 唯一索引
`gorm:"uniqueIndex:uk_name,priority:1"`     // 复合唯一索引
`gorm:"type:varchar(100)"`                  // 列类型
`gorm:"size:255"`                           // 列大小
`gorm:"not null"`                           // 非空
`gorm:"default:0"`                          // 默认值
`gorm:"-"`                                  // 忽略字段
`gorm:"<-:create"`                          // 仅创建时写入
`gorm:"<-:update"`                          // 仅更新时写入
`gorm:"<-:false"`                           // 只读
`gorm:"->:false;<-:create"`                 // 创建后只读
```

### 常用 JSON 标签

```go
`json:"field_name"`           // JSON 字段名
`json:"field_name,omitempty"` // 空值时省略
`json:"-"`                    // 忽略字段（不序列化）
```

### 常用 Binding 标签（参数验证）

```go
`binding:"required"`              // 必填
`binding:"email"`                 // 邮箱格式
`binding:"min=1,max=100"`        // 数值范围
`binding:"len=10"`               // 长度
`binding:"gte=0,lte=150"`        // 大于等于/小于等于
`binding:"oneof=red green blue"` // 枚举值
```

---

**文档版本**: v1.0  
**最后更新**: 2026-01-22  
**适用项目**: Go + Protobuf + Hertz/Gin + GORM 技术栈

**贡献者欢迎提交改进建议！**
