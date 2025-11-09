#!/usr/bin/env bash
# Fast deploy script for Rainbow Bridge on Kubernetes
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${SCRIPT_DIR}/rainbow-bridge.yaml"
NAMESPACE="${NAMESPACE:-rainbow_bridge}"

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required but not found in PATH" >&2
  exit 1
fi

if [[ ! -f "${MANIFEST}" ]]; then
  echo "Manifest not found at ${MANIFEST}" >&2
  exit 1
fi

echo "Applying manifests from ${MANIFEST}..."
kubectl apply -f "${MANIFEST}"

echo "Waiting for deployment rollout in namespace ${NAMESPACE}..."
kubectl rollout status deployment/rainbow-bridge -n "${NAMESPACE}"

echo "Deployment completed successfully."
