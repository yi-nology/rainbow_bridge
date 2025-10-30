#!/bin/bash
# Tear down Rainbow Bridge Kubernetes resources
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${SCRIPT_DIR}/rainbow-bridge.yaml"
NAMESPACE="rainbow-bridge"

if ! kubectl version --short >/dev/null 2>&1; then
  echo "kubectl is required but not found in PATH" >&2
  exit 1
fi

echo "Deleting resources defined in ${MANIFEST}..."
kubectl delete -f "${MANIFEST}" --ignore-not-found

echo "Waiting for namespace cleanup..."
kubectl wait --for=delete namespace/"${NAMESPACE}" --timeout=120s || true

echo "Teardown completed."
