#!/usr/bin/env bash
# Tear down Rainbow Bridge Kubernetes resources without nuking the namespace
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="${NAMESPACE:-rainbow_bridge}"
PURGE_NAMESPACE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--purge-namespace]

Options:
  --purge-namespace   Also delete the namespace (default: keep namespace)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge-namespace)
      PURGE_NAMESPACE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl is required but not found in PATH" >&2
  exit 1
fi

echo "Deleting Rainbow Bridge workloads in namespace ${NAMESPACE}..."
kubectl delete deployment/rainbow-bridge -n "${NAMESPACE}" --ignore-not-found
kubectl delete service/rainbow-bridge -n "${NAMESPACE}" --ignore-not-found
kubectl delete configmap/rainbow-bridge-config -n "${NAMESPACE}" --ignore-not-found
kubectl delete pvc/rainbow-bridge-data -n "${NAMESPACE}" --ignore-not-found

echo "Deleting cluster-scoped resources created by this project..."
kubectl delete pv/pv-rainbow-bridge --ignore-not-found
kubectl delete storageclass.storage.k8s.io/local-storage --ignore-not-found

if "${PURGE_NAMESPACE}"; then
  echo "Purging namespace ${NAMESPACE}..."
  kubectl delete namespace "${NAMESPACE}" --ignore-not-found
else
  echo "Namespace ${NAMESPACE} left intact."
fi

echo "Teardown completed."
