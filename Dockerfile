# syntax=docker/dockerfile:1.6

##
## Build stage
##
ARG GO_VERSION=1.22
FROM golang:${GO_VERSION}-bookworm AS builder

ARG TARGETOS
ARG TARGETARCH

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

RUN go build -o /out/hertz_service .

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
COPY web /app/web

RUN mkdir -p /app/data/uploads && chown -R rainbow:rainbow /app

USER rainbow

EXPOSE 8080

ENTRYPOINT ["/app/hertz_service", "--config", "/app/config.yaml"]
