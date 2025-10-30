#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUN_NAME="${RUN_NAME:-hertz_service}"
OUTPUT_ROOT="${OUTPUT_ROOT:-output/cross}"

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
  env CGO_ENABLED=0 GOOS="${GOOS}" GOARCH="${GOARCH}" go build -o "${target_dir}/${RUN_NAME}${extension}" .
done

echo "Cross compilation artifacts are available under ${OUTPUT_ROOT}"
