#!/bin/bash
RUN_NAME=hertz_service

# Get BASE_PATH from environment or use default
BASE_PATH="${BASE_PATH:-rainbow-bridge}"

# Get version information
VERSION=$(git describe --tags --always 2>/dev/null || echo "dev")
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u '+%Y-%m-%d_%H:%M:%S')

echo "Building with BASE_PATH: ${BASE_PATH}"

# Build frontend
echo "Building frontend..."
if command -v npm &> /dev/null; then
    cd react
    npm ci --silent 2>/dev/null || npm install --silent
    
    # 动态修改 next.config.mjs 中的 basePath
    if [ -n "$BASE_PATH" ]; then
        sed -i.bak "s|basePath: '/rainbow-bridge'|basePath: '/${BASE_PATH}'|g" next.config.mjs
    else
        sed -i.bak "s|basePath: '/rainbow-bridge'|basePath: ''|g" next.config.mjs
    fi
    
    npm run build
    
    # 恢复原始配置
    if [ -f next.config.mjs.bak ]; then
        mv next.config.mjs.bak next.config.mjs
    fi
    
    cd ..
    
    # Copy frontend output to web/
    rm -rf web/*
    mkdir -p web
    cp -r react/out/* web/
    echo "Frontend build completed with basePath: /${BASE_PATH}"
else
    echo "Warning: npm not found, skipping frontend build"
    if [ ! -d "web" ] || [ -z "$(ls -A web 2>/dev/null)" ]; then
        echo "Error: web/ directory is empty and npm is not available"
        exit 1
    fi
fi

# Build flags for version injection
LDFLAGS="-X 'main.Version=${VERSION}' -X 'main.GitCommit=${GIT_COMMIT}' -X 'main.BuildTime=${BUILD_TIME}' -X 'main.BasePath=${BASE_PATH}'"

mkdir -p output/bin
cp script/* output 2>/dev/null
chmod +x output/bootstrap.sh

echo "Building ${RUN_NAME} version ${VERSION} (${GIT_COMMIT}) at ${BUILD_TIME}"
go build -ldflags="${LDFLAGS}" -o output/bin/${RUN_NAME}
