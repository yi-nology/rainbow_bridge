# syntax=docker/dockerfile:1.6

##
## Go build stage
##
ARG GO_VERSION=1.23

##
## Build configuration
##
# BASE_PATH: 统一的路径前缀，同时影响前后端
# 留空表示部署在根路径，设置如 "rainbow-bridge" 则部署在子路径
ARG BASE_PATH=rainbow-bridge

##
## Frontend build stage
##
FROM node:20-bookworm AS frontend

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


FROM golang:${GO_VERSION}-bookworm AS builder

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

# Copy frontend build output
COPY --from=frontend /frontend/out ./web/

RUN go build \
    -ldflags="-X 'main.Version=${VERSION}' -X 'main.GitCommit=${GIT_COMMIT}' -X 'main.BuildTime=${BUILD_TIME}' -X 'main.BasePath=${BASE_PATH}'" \
    -o /out/hertz_service .

##
## Runtime stage
##
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libsqlite3-0 && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --uid 10001 rainbow

WORKDIR /app

COPY --from=builder /out/hertz_service /app/hertz_service
COPY config.yaml /app/config.yaml

RUN mkdir -p /app/data/uploads && chown -R rainbow:rainbow /app

USER rainbow

EXPOSE 8080

ENTRYPOINT ["/app/hertz_service", "--config", "/app/config.yaml"]
