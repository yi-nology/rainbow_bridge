#!/bin/bash
RUN_NAME=hertz_service

# Get version information
VERSION=$(git describe --tags --always 2>/dev/null || echo "dev")
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u '+%Y-%m-%d_%H:%M:%S')

# Build flags for version injection
LDFLAGS="-X 'main.Version=${VERSION}' -X 'main.GitCommit=${GIT_COMMIT}' -X 'main.BuildTime=${BUILD_TIME}'"

mkdir -p output/bin
cp script/* output 2>/dev/null
chmod +x output/bootstrap.sh

echo "Building ${RUN_NAME} version ${VERSION} (${GIT_COMMIT}) at ${BUILD_TIME}"
go build -ldflags="${LDFLAGS}" -o output/bin/${RUN_NAME}