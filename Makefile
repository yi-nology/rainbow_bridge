.PHONY: build build-frontend build-api test lint docker dev clean help

# 变量
VERSION ?= $(shell git describe --tags --always --dirty)
GIT_COMMIT ?= $(shell git rev-parse --short HEAD)
BUILD_TIME ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
BASE_PATH ?= rainbow-bridge

# Go 参数
GOPROXY := https://goproxy.cn,direct
GOOS ?= $(shell go env GOOS)
GOARCH ?= $(shell go env GOARCH)

# Docker 参数
DOCKER_REGISTRY ?= ghcr.io/yi-nology
IMAGE_TAG ?= $(VERSION)

help: ## 显示帮助信息
	@echo "Rainbow Bridge 构建工具"
	@echo ""
	@echo "使用方法: make [target]"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

build: build-api build-frontend ## 构建前后端

build-api: ## 构建 Go API
	@echo "Building API..."
	CGO_ENABLED=0 GOOS=$(GOOS) GOARCH=$(GOARCH) go build \
		-ldflags="-X 'main.Version=$(VERSION)' -X 'main.GitCommit=$(GIT_COMMIT)' -X 'main.BuildTime=$(BUILD_TIME)' -X 'main.BasePath=$(BASE_PATH)'" \
		-o bin/rainbow-bridge-api .

build-frontend: ## 构建 Next.js 前端
	@echo "Building Frontend..."
	cd react && npm ci && npm run build

test: ## 运行测试
	@echo "Running tests..."
	go test -v -race -coverprofile=coverage.out ./...
	@echo "Coverage: $$(go tool cover -func=coverage.out | grep total | awk '{print $$3}')"

lint: ## 代码检查
	@echo "Running linters..."
	@which golangci-lint > /dev/null || (echo "Installing golangci-lint..." && go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest)
	golangci-lint run ./...

docker: docker-api docker-frontend ## 构建 Docker 镜像

docker-api: ## 构建 API Docker 镜像
	@echo "Building API Docker image..."
	docker build --target api \
		--build-arg VERSION=$(VERSION) \
		--build-arg GIT_COMMIT=$(GIT_COMMIT) \
		--build-arg BUILD_TIME=$(BUILD_TIME) \
		--build-arg BASE_PATH=$(BASE_PATH) \
		-t $(DOCKER_REGISTRY)/rainbow_bridge-api:$(IMAGE_TAG) .

docker-frontend: ## 构建 Frontend Docker 镜像
	@echo "Building Frontend Docker image..."
	docker build --target frontend \
		--build-arg BASE_PATH=$(BASE_PATH) \
		-t $(DOCKER_REGISTRY)/rainbow_bridge-frontend:$(IMAGE_TAG) .

dev: ## 启动开发环境
	@echo "Starting development environment..."
	docker compose -f deploy/docker-compose/sqlite/docker-compose.yaml up -d
	@echo "Development environment started!"
	@echo "API: http://localhost:8080/rainbow-bridge/api/v1/version"
	@echo "Frontend: http://localhost:80/rainbow-bridge/"

dev-down: ## 停止开发环境
	@echo "Stopping development environment..."
	docker compose -f deploy/docker-compose/sqlite/docker-compose.yaml down -v

clean: ## 清理构建产物
	@echo "Cleaning..."
	rm -rf bin/
	rm -rf react/.next/
	rm -rf react/out/
	rm -f coverage.out

# 运维命令
logs: ## 查看日志
	docker compose -f deploy/docker-compose/sqlite/docker-compose.yaml logs -f

ps: ## 查看运行状态
	docker compose -f deploy/docker-compose/sqlite/docker-compose.yaml ps

restart: dev-down dev ## 重启服务
