#!/bin/bash
# Fast deploy script for Rainbow Bridge on Kubernetes
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${SCRIPT_DIR}/rainbow-bridge.yaml"
NAMESPACE="rainbow-bridge"

if ! kubectl version --short >/dev/null 2>&1; then
  echo "kubectl is required but not found in PATH" >&2
  exit 1
fi

echo "Applying manifests from ${MANIFEST}..."
kubectl apply -f "${MANIFEST}"

echo "Waiting for deployment to become ready..."
kubectl rollout status deployment/rainbow-bridge -n "${NAMESPACE}"

echo "Deployment completed successfully."
