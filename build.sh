#!/bin/bash
RUN_NAME=hertz_service

BASE_PATH="${BASE_PATH:-}"
BUILD_MODE="${BUILD_MODE:-}"
BUILD_TARGET="${BUILD_TARGET:-app}"

VERSION=$(git describe --tags --always 2>/dev/null || echo "dev")
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u '+%Y-%m-%d_%H:%M:%S')

echo "Building with BASE_PATH: ${BASE_PATH}"
echo "Build target: ${BUILD_TARGET} (server=API only, app=with frontend)"
if [ -n "$BUILD_MODE" ]; then
    echo "Build mode: ${BUILD_MODE}"
fi

LDFLAGS="-X 'main.Version=${VERSION}' -X 'main.GitCommit=${GIT_COMMIT}' -X 'main.BuildTime=${BUILD_TIME}' -X 'main.BasePath=${BASE_PATH}'"

mkdir -p output/bin
cp script/* output 2>/dev/null
chmod +x output/bootstrap.sh

BUILD_TAGS=""
if [ "$BUILD_MODE" = "dev" ]; then
    BUILD_TAGS="-tags=dev"
    echo "Building ${RUN_NAME} in DEV mode (filesystem static files)"
else
    echo "Building ${RUN_NAME} in PRODUCTION mode (embedded static files)"
fi

echo "Building ${RUN_NAME} version ${VERSION} (${GIT_COMMIT}) at ${BUILD_TIME}"

case "$BUILD_TARGET" in
    server)
        echo "Building API server only (no frontend)"
        go build ${BUILD_TAGS} -ldflags="${LDFLAGS}" -o output/bin/${RUN_NAME} .
        ;;
    app)
        echo "Building full application (with frontend)"
        go build ${BUILD_TAGS} -ldflags="${LDFLAGS}" -o output/bin/${RUN_NAME} ./cmd/app
        ;;
    both)
        echo "Building both app"
        go build ${BUILD_TAGS} -ldflags="${LDFLAGS}" -o output/bin/${RUN_NAME} . 
        ;;
    *)
        echo "Unknown BUILD_TARGET: ${BUILD_TARGET}. Use 'server', 'app', or 'both'"
        exit 1
        ;;
esac
