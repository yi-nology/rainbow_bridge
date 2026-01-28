#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUN_NAME="${RUN_NAME:-hertz_service}"
OUTPUT_ROOT="${OUTPUT_ROOT:-output/cross}"

# Build configuration
BASE_PATH="${BASE_PATH:-rainbow-bridge}"
VERSION="${VERSION:-$(git describe --tags --always 2>/dev/null || echo "dev")}"
GIT_COMMIT="${GIT_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")}"
BUILD_TIME="${BUILD_TIME:-$(date -u '+%Y-%m-%d_%H:%M:%S')}"

targets=(
  "linux amd64"
  "linux arm64"
  "darwin amd64"
  "darwin arm64"
  "windows amd64"
  "windows arm64"
)

cd "${PROJECT_ROOT}"

for target in "${targets[@]}"; do
  read -r GOOS GOARCH <<< "${target}"

  target_dir="${OUTPUT_ROOT}/${GOOS}/${GOARCH}"
  mkdir -p "${target_dir}"

  extension=""
  if [[ "${GOOS}" == "windows" ]]; then
    extension=".exe"
  fi

  echo "Building for ${GOOS}/${GOARCH}..."
  LDFLAGS="-X 'main.Version=${VERSION}' -X 'main.GitCommit=${GIT_COMMIT}' -X 'main.BuildTime=${BUILD_TIME}' -X 'main.BasePath=${BASE_PATH}'"
  env CGO_ENABLED=0 GOOS="${GOOS}" GOARCH="${GOARCH}" go build -ldflags="${LDFLAGS}" -o "${target_dir}/${RUN_NAME}${extension}" .
done

echo "Cross compilation artifacts are available under ${OUTPUT_ROOT}"
echo "Built with BASE_PATH=${BASE_PATH}, VERSION=${VERSION}"
