# syntax=docker/dockerfile:1.6

##
## Go build stage
##
ARG GO_VERSION=1.25

##
## Frontend build stage
##
FROM node:20-bookworm AS frontend

WORKDIR /frontend

COPY react/package*.json ./
RUN npm ci

COPY react/ ./
RUN npm run build


FROM golang:${GO_VERSION}-bookworm AS builder

ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown

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
    -ldflags="-X 'main.Version=${VERSION}' -X 'main.GitCommit=${GIT_COMMIT}' -X 'main.BuildTime=${BUILD_TIME}'" \
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
