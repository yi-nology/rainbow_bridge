#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PROTO_DIR="$ROOT_DIR/proto"
MODEL_DIR="$ROOT_DIR/biz/model/api"

echo "=== Rainbow Bridge Proto Code Generation ==="
echo "Root directory: $ROOT_DIR"
echo "Proto directory: $PROTO_DIR"

# Ensure output directories exist
mkdir -p "$MODEL_DIR/commonpb"
mkdir -p "$MODEL_DIR/configpb"
mkdir -p "$MODEL_DIR/assetpb"
mkdir -p "$MODEL_DIR/transferpb"
mkdir -p "$MODEL_DIR/systempb"

# Generate protobuf code for all proto files
echo "Generating protobuf code..."

# Generate google/api protos first
protoc -I"$PROTO_DIR" --go_out=paths=source_relative:"$ROOT_DIR" \
  "$PROTO_DIR/google/api/http.proto" \
  "$PROTO_DIR/google/api/annotations.proto"

# Generate common proto
protoc -I"$PROTO_DIR" --go_out=paths=source_relative:"$MODEL_DIR/commonpb" \
  "$PROTO_DIR/common/common.proto"

# Generate service protos (they depend on common)
for svc in config asset transfer system; do
  echo "Generating $svc proto..."
  protoc -I"$PROTO_DIR" --go_out=paths=source_relative:"$MODEL_DIR/${svc}pb" \
    "$PROTO_DIR/${svc}/${svc}.proto"
done

# Move generated files to correct locations
if [ -f "$MODEL_DIR/commonpb/common/common.pb.go" ]; then
  mv "$MODEL_DIR/commonpb/common/common.pb.go" "$MODEL_DIR/commonpb/common.pb.go"
  rmdir "$MODEL_DIR/commonpb/common" 2>/dev/null || true
fi

for svc in config asset transfer system; do
  if [ -f "$MODEL_DIR/${svc}pb/${svc}/${svc}.pb.go" ]; then
    mv "$MODEL_DIR/${svc}pb/${svc}/${svc}.pb.go" "$MODEL_DIR/${svc}pb/${svc}.pb.go"
    rmdir "$MODEL_DIR/${svc}pb/${svc}" 2>/dev/null || true
  fi
done

# Format generated code
echo "Formatting generated code..."
if command -v goimports >/dev/null 2>&1; then
  find "$MODEL_DIR" -name "*.pb.go" -exec goimports -w {} \;
  find "$ROOT_DIR/google" -name "*.pb.go" -exec goimports -w {} \; 2>/dev/null || true
else
  find "$MODEL_DIR" -name "*.pb.go" -exec gofmt -w {} \;
  find "$ROOT_DIR/google" -name "*.pb.go" -exec gofmt -w {} \; 2>/dev/null || true
fi

echo "=== Code generation complete ==="
echo ""
echo "Generated files:"
find "$MODEL_DIR" -name "*.pb.go" -type f 2>/dev/null | sort
echo ""
echo "Note: Handler and router code should be manually maintained."
echo "The hz tool is not used in this multi-service architecture."
