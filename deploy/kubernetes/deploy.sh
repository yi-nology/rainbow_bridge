#!/usr/bin/env bash
# Rainbow Bridge Kubernetes 部署脚本
# 支持交互式选择或指定 namespace
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${SCRIPT_DIR}/rainbow-bridge.yaml"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
  cat <<EOF
使用方法: $(basename "$0") [OPTIONS]

选项:
  -n, --namespace <name>  指定 namespace（跳过交互式选择）
  -h, --help             显示此帮助信息

示例:
  $(basename "$0")                    # 交互式选择 namespace
  $(basename "$0") -n production     # 直接部署到 production namespace
  NAMESPACE=dev $(basename "$0")     # 使用环境变量指定 namespace
EOF
}

# 解析命令行参数
NAMESPACE="${NAMESPACE:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo -e "${RED}错误: 未知参数 $1${NC}" >&2
      usage
      exit 1
      ;;
  esac
done

# 检查 kubectl
if ! command -v kubectl >/dev/null 2>&1; then
  echo -e "${RED}错误: kubectl 未安装或不在 PATH 中${NC}" >&2
  exit 1
fi

# 检查 manifest 文件
if [[ ! -f "${MANIFEST}" ]]; then
  echo -e "${RED}错误: Manifest 文件未找到: ${MANIFEST}${NC}" >&2
  exit 1
fi

# 交互式选择 namespace
if [[ -z "${NAMESPACE}" ]]; then
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}  Rainbow Bridge Kubernetes 部署${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
  
  # 获取现有的 namespaces
  echo -e "${YELLOW}正在获取集群中的 namespace 列表...${NC}"
  mapfile -t EXISTING_NS < <(kubectl get namespaces -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | tr ' ' '\n' | sort)
  
  if [[ ${#EXISTING_NS[@]} -eq 0 ]]; then
    echo -e "${RED}错误: 无法获取 namespace 列表，请检查 kubectl 配置${NC}" >&2
    exit 1
  fi
  
  echo -e "\n${GREEN}现有的 namespaces:${NC}"
  for i in "${!EXISTING_NS[@]}"; do
    printf "  %2d) %s\n" "$((i+1))" "${EXISTING_NS[$i]}"
  done
  
  echo -e "\n${YELLOW}请选择部署目标:${NC}"
  echo "  0) 手动输入新的 namespace"
  echo ""
  read -rp "请输入选项 [0-${#EXISTING_NS[@]}]: " choice
  
  if [[ "$choice" == "0" ]]; then
    read -rp "请输入新的 namespace 名称: " NAMESPACE
    if [[ -z "${NAMESPACE}" ]]; then
      echo -e "${RED}错误: Namespace 不能为空${NC}" >&2
      exit 1
    fi
    echo -e "${YELLOW}提示: 将创建新的 namespace: ${NAMESPACE}${NC}"
  elif [[ "$choice" =~ ^[0-9]+$ ]] && [[ "$choice" -ge 1 ]] && [[ "$choice" -le "${#EXISTING_NS[@]}" ]]; then
    NAMESPACE="${EXISTING_NS[$((choice-1))]}"
    echo -e "${GREEN}已选择: ${NAMESPACE}${NC}"
  else
    echo -e "${RED}错误: 无效的选择${NC}" >&2
    exit 1
  fi
fi

# 确认部署
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}部署信息确认${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Namespace:  ${GREEN}${NAMESPACE}${NC}"
echo -e "Manifest:   ${MANIFEST}"
echo ""
read -rp "确认部署? [y/N]: " confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}部署已取消${NC}"
  exit 0
fi

# 创建临时 manifest 并替换 namespace
TEMP_MANIFEST="$(mktemp)"
trap 'rm -f "${TEMP_MANIFEST}"' EXIT

echo -e "\n${YELLOW}正在生成部署配置...${NC}"
sed "s/namespace: rainbow_bridge/namespace: ${NAMESPACE}/g" "${MANIFEST}" | \
sed "s/name: rainbow_bridge$/name: ${NAMESPACE}/" > "${TEMP_MANIFEST}"

# 应用 manifests
echo -e "${YELLOW}正在应用 manifests...${NC}"
if kubectl apply -f "${TEMP_MANIFEST}"; then
  echo -e "${GREEN}✓ Manifests 应用成功${NC}"
else
  echo -e "${RED}✗ Manifests 应用失败${NC}" >&2
  exit 1
fi

# 等待部署完成
echo -e "\n${YELLOW}正在等待部署完成...${NC}"
if kubectl rollout status deployment/rainbow-bridge -n "${NAMESPACE}" --timeout=5m; then
  echo -e "\n${GREEN}========================================${NC}"
  echo -e "${GREEN}✓ 部署成功完成！${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo -e "\nNamespace: ${GREEN}${NAMESPACE}${NC}"
  echo -e "\n查看服务状态:"
  echo -e "  ${BLUE}kubectl get all -n ${NAMESPACE}${NC}"
  echo -e "\n查看 Pod 日志:"
  echo -e "  ${BLUE}kubectl logs -f -n ${NAMESPACE} -l app=rainbow-bridge${NC}"
  echo -e "\n访问服务 (NodePort):"
  NODE_PORT=$(kubectl get svc rainbow-bridge -n "${NAMESPACE}" -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "32222")
  echo -e "  ${BLUE}http://<node-ip>:${NODE_PORT}/rainbow-bridge/${NC}"
else
  echo -e "\n${RED}✗ 部署失败或超时${NC}" >&2
  echo -e "\n查看详细信息:"
  echo -e "  ${BLUE}kubectl describe deployment/rainbow-bridge -n ${NAMESPACE}${NC}"
  echo -e "  ${BLUE}kubectl logs -n ${NAMESPACE} -l app=rainbow-bridge${NC}"
  exit 1
fi
