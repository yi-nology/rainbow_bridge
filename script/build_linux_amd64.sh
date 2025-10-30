#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUN_NAME="${RUN_NAME:-hertz_service}"
OUTPUT_ROOT="${OUTPUT_ROOT:-output/linux_amd64}"
USE_CGO="${USE_CGO:-1}"
CC_BIN="${CC_BIN:-x86_64-linux-gnu-gcc}"

cd "${PROJECT_ROOT}"

mkdir -p "${OUTPUT_ROOT}"

if [[ "${USE_CGO}" == "1" ]]; then
  TEMP_CC_WRAPPER=""
  TEMP_CXX_WRAPPER=""
  clean_up() {
    if [[ -n "${TEMP_CC_WRAPPER}" && -f "${TEMP_CC_WRAPPER}" ]]; then
      rm -f "${TEMP_CC_WRAPPER}"
    fi
    if [[ -n "${TEMP_CXX_WRAPPER}" && -f "${TEMP_CXX_WRAPPER}" ]]; then
      rm -f "${TEMP_CXX_WRAPPER}"
    fi
  }
  trap clean_up EXIT

  if [[ -n "${CC:-}" ]]; then
    COMPILER="${CC}"
  elif command -v "${CC_BIN}" >/dev/null 2>&1; then
    COMPILER="${CC_BIN}"
  elif command -v zig >/dev/null 2>&1; then
    ZIG_BIN="$(command -v zig)"
    TEMP_CC_WRAPPER="$(mktemp "${PROJECT_ROOT}/${OUTPUT_ROOT}/zig-cc-XXXXXX.sh")"
    TEMP_CXX_WRAPPER="$(mktemp "${PROJECT_ROOT}/${OUTPUT_ROOT}/zig-cxx-XXXXXX.sh")"
    cat <<'EOF' > "${TEMP_CC_WRAPPER}"
#!/bin/bash
ZIG_BIN_PLACEHOLDER cc --target=x86_64-linux-gnu "$@"
EOF
    cat <<'EOF' > "${TEMP_CXX_WRAPPER}"
#!/bin/bash
ZIG_BIN_PLACEHOLDER c++ --target=x86_64-linux-gnu "$@"
EOF
    chmod +x "${TEMP_CC_WRAPPER}" "${TEMP_CXX_WRAPPER}"
    sed -i.bak "s|ZIG_BIN_PLACEHOLDER|exec ${ZIG_BIN}|g" "${TEMP_CC_WRAPPER}" "${TEMP_CXX_WRAPPER}"
    rm -f "${TEMP_CC_WRAPPER}.bak" "${TEMP_CXX_WRAPPER}.bak"
    COMPILER="${TEMP_CC_WRAPPER}"
    export CXX="${TEMP_CXX_WRAPPER}"
  elif command -v gcc >/dev/null 2>&1; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      if gcc -v 2>&1 | grep -qi "Apple clang"; then
        echo "Notice: found macOS clang masquerading as gcc; it cannot target linux/amd64."
        echo "Install a cross compiler (e.g. 'brew install zig' or 'brew install x86_64-unknown-linux-gnu')"
        echo "or rerun with USE_CGO=0 to drop sqlite support."
        USE_CGO=0
      else
        COMPILER="gcc"
      fi
    else
      COMPILER="gcc"
    fi
  else
    echo "Warning: no suitable C compiler found; falling back to CGO_ENABLED=0 build."
    USE_CGO=0
  fi
fi

echo "Building ${RUN_NAME} for linux/amd64 (CGO_ENABLED=${USE_CGO})..."
if [[ "${USE_CGO}" == "1" ]]; then
  env CGO_ENABLED=1 GOOS=linux GOARCH=amd64 CC="${COMPILER}" go build -o "${OUTPUT_ROOT}/${RUN_NAME}" .
else
  env CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o "${OUTPUT_ROOT}/${RUN_NAME}" .
fi

echo "Artifact available at ${OUTPUT_ROOT}/${RUN_NAME}"
