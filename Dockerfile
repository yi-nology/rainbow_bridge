# syntax=docker/dockerfile:1.6

##
## Build configuration
##
ARG GO_VERSION=1.23
# BASE_PATH: 统一的路径前缀，同时影响前后端
# 留空表示部署在根路径，设置如 "rainbow-bridge" 则部署在子路径
ARG BASE_PATH=rainbow-bridge

##
## Frontend build stage
##
FROM node:20-bookworm AS frontend-builder

ARG BASE_PATH

WORKDIR /frontend

COPY react/package*.json ./
RUN npm ci

COPY react/ ./

# 设置 NEXT_PUBLIC_BASE_PATH 环境变量供 Next.js 使用
RUN if [ -n "$BASE_PATH" ]; then \
      export NEXT_PUBLIC_BASE_PATH="/${BASE_PATH}"; \
    else \
      export NEXT_PUBLIC_BASE_PATH=""; \
    fi && \
    npm run build

##
## Go build stage
##
FROM golang:${GO_VERSION}-bookworm AS go-builder

ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ARG BASE_PATH=rainbow-bridge

ENV CGO_ENABLED=1 \
    GOOS=${TARGETOS:-linux} \
    GOARCH=${TARGETARCH:-amd64}

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsqlite3-dev \
    pkg-config \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build \
    -ldflags="-X 'main.Version=${VERSION}' -X 'main.GitCommit=${GIT_COMMIT}' -X 'main.BuildTime=${BUILD_TIME}' -X 'main.BasePath=${BASE_PATH}'" \
    -o /out/hertz_service .

##
## API runtime stage (target: api)
## 纯 Go API 服务，不包含前端静态文件
##
FROM debian:bookworm-slim AS api

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libsqlite3-0 \
    wget && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --uid 10001 rainbow

WORKDIR /app

COPY --from=go-builder /out/hertz_service /app/hertz_service
COPY config.yaml /app/config.yaml

RUN mkdir -p /app/data/uploads && chown -R rainbow:rainbow /app

USER rainbow

EXPOSE 8080

ENTRYPOINT ["/app/hertz_service", "--config", "/app/config.yaml"]

##
## Frontend runtime stage (target: frontend)
## Nginx 服务前端静态文件，反向代理 API 到 Go 后端
##
FROM nginx:alpine AS frontend

ARG BASE_PATH=rainbow-bridge

# 复制前端构建产物到 nginx html 目录
# Next.js export 输出在 /frontend/out/ 下，需要放到 basePath 对应的子目录
RUN mkdir -p /usr/share/nginx/html/${BASE_PATH}
COPY --from=frontend-builder /frontend/out/ /usr/share/nginx/html/${BASE_PATH}/

# 移除默认 nginx 配置
RUN rm -f /etc/nginx/conf.d/default.conf

# 复制自定义 nginx 配置
COPY deploy/nginx/frontend.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
