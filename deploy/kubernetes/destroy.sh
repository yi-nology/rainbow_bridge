#!/usr/bin/env bash
# Rainbow Bridge Kubernetes 清理脚本
# 支持交互式选择删除指定 namespace 下的服务
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
  --purge-namespace      删除 namespace 本身（默认仅删除服务）
  -h, --help             显示此帮助信息

示例:
  $(basename "$0")                         # 交互式选择并删除服务
  $(basename "$0") -n production          # 删除 production namespace 下的服务
  $(basename "$0") -n test --purge-namespace  # 删除服务并删除 namespace
  NAMESPACE=dev $(basename "$0")          # 使用环境变量指定 namespace

注意:
  - 默认只删除 Rainbow Bridge 服务相关资源，保留 namespace
  - 使用 --purge-namespace 才会删除整个 namespace
  - 只删除指定 namespace 下名为 'rainbow-bridge' 的资源
EOF
}

# 解析命令行参数
NAMESPACE="${NAMESPACE:-}"
PURGE_NAMESPACE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --purge-namespace)
      PURGE_NAMESPACE=true
      shift
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

# 交互式选择 namespace
if [[ -z "${NAMESPACE}" ]]; then
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}  Rainbow Bridge 服务清理${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
  
  # 获取包含 Rainbow Bridge 部署的 namespaces
  echo -e "${YELLOW}正在扫描集群中的 Rainbow Bridge 部署...${NC}"
  mapfile -t NAMESPACES_WITH_RB < <(kubectl get deployments --all-namespaces -l app=rainbow-bridge -o jsonpath='{range .items[*]}{.metadata.namespace}{"\\n"}{end}' 2>/dev/null | sort -u)
  
  if [[ ${#NAMESPACES_WITH_RB[@]} -eq 0 ]]; then
    echo -e "${YELLOW}提示: 未找到任何 Rainbow Bridge 部署${NC}"
    echo -e "您可以手动指定 namespace: ${BLUE}$0 -n <namespace>${NC}"
    exit 0
  fi
  
  echo -e "\n${GREEN}找到以下 namespace 中的 Rainbow Bridge 部署:${NC}"
  for i in "${!NAMESPACES_WITH_RB[@]}"; do
    ns="${NAMESPACES_WITH_RB[$i]}"
    replicas=$(kubectl get deployment rainbow-bridge -n "$ns" -o jsonpath='{.status.availableReplicas}' 2>/dev/null || echo "0")
    total=$(kubectl get deployment rainbow-bridge -n "$ns" -o jsonpath='{.status.replicas}' 2>/dev/null || echo "0")
    status="运行中"
    color="$GREEN"
    if [[ "$replicas" != "$total" ]] || [[ "$replicas" == "0" ]]; then
      status="异常"
      color="$YELLOW"
    fi
    printf "  %2d) %-30s ${color}[状态: %s, Pod: %s/%s]${NC}\n" "$((i+1))" "$ns" "$status" "$replicas" "$total"
  done
  
  echo -e "\n${YELLOW}请选择要清理的 namespace:${NC}"
  echo "  0) 手动输入 namespace"
  echo ""
  read -rp "请输入选项 [0-${#NAMESPACES_WITH_RB[@]}]: " choice
  
  if [[ "$choice" == "0" ]]; then
    read -rp "请输入 namespace 名称: " NAMESPACE
    if [[ -z "${NAMESPACE}" ]]; then
      echo -e "${RED}错误: Namespace 不能为空${NC}" >&2
      exit 1
    fi
  elif [[ "$choice" =~ ^[0-9]+$ ]] && [[ "$choice" -ge 1 ]] && [[ "$choice" -le "${#NAMESPACES_WITH_RB[@]}" ]]; then
    NAMESPACE="${NAMESPACES_WITH_RB[$((choice-1))]}"
    echo -e "${GREEN}已选择: ${NAMESPACE}${NC}"
  else
    echo -e "${RED}错误: 无效的选择${NC}" >&2
    exit 1
  fi
  
  # 询问是否删除 namespace
  if [[ ! "$PURGE_NAMESPACE" == true ]]; then
    echo -e "\n${YELLOW}是否同时删除 namespace '${NAMESPACE}'?${NC}"
    read -rp "删除 namespace? [y/N]: " purge_choice
    if [[ "$purge_choice" =~ ^[Yy]$ ]]; then
      PURGE_NAMESPACE=true
    fi
  fi
fi

# 检查 namespace 是否存在
if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  echo -e "${RED}错误: Namespace '${NAMESPACE}' 不存在${NC}" >&2
  exit 1
fi

# 检查是否有 Rainbow Bridge 部署
if ! kubectl get deployment rainbow-bridge -n "${NAMESPACE}" >/dev/null 2>&1; then
  echo -e "${YELLOW}提示: Namespace '${NAMESPACE}' 中未找到 Rainbow Bridge 部署${NC}"
  read -rp "是否继续清理其他相关资源? [y/N]: " continue_choice
  if [[ ! "$continue_choice" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}操作已取消${NC}"
    exit 0
  fi
fi

# 显示将要删除的资源
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}删除信息确认${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Namespace:  ${GREEN}${NAMESPACE}${NC}"
echo -e "\n将删除以下资源:"
echo -e "  ${RED}✗${NC} Deployment: rainbow-bridge"
echo -e "  ${RED}✗${NC} Service: rainbow-bridge"
echo -e "  ${RED}✗${NC} ConfigMap: rainbow-bridge-config"
echo -e "  ${RED}✗${NC} PVC: rainbow-bridge-data"

if [[ "$PURGE_NAMESPACE" == true ]]; then
  echo -e "  ${RED}✗${NC} Namespace: ${NAMESPACE} ${RED}(包括所有资源)${NC}"
else
  echo -e "\n${GREEN}保留:${NC}"
  echo -e "  ${GREEN}✓${NC} Namespace: ${NAMESPACE}"
fi

echo -e "\n${YELLOW}警告: 此操作不可恢复！${NC}"
read -rp "确认删除? 请输入 namespace 名称 '${NAMESPACE}' 以确认: " confirm

if [[ "$confirm" != "${NAMESPACE}" ]]; then
  echo -e "${YELLOW}删除已取消${NC}"
  exit 0
fi

# 开始删除
echo -e "\n${YELLOW}正在删除 Rainbow Bridge 资源...${NC}"

# 删除 namespace 中的资源
echo -e "\n${BLUE}[1/4]${NC} 删除 Deployment..."
if kubectl delete deployment/rainbow-bridge -n "${NAMESPACE}" --ignore-not-found 2>/dev/null; then
  echo -e "${GREEN}✓ Deployment 已删除${NC}"
else
  echo -e "${YELLOW}⚠ Deployment 不存在或删除失败${NC}"
fi

echo -e "\n${BLUE}[2/4]${NC} 删除 Service..."
if kubectl delete service/rainbow-bridge -n "${NAMESPACE}" --ignore-not-found 2>/dev/null; then
  echo -e "${GREEN}✓ Service 已删除${NC}"
else
  echo -e "${YELLOW}⚠ Service 不存在或删除失败${NC}"
fi

echo -e "\n${BLUE}[3/4]${NC} 删除 ConfigMap..."
if kubectl delete configmap/rainbow-bridge-config -n "${NAMESPACE}" --ignore-not-found 2>/dev/null; then
  echo -e "${GREEN}✓ ConfigMap 已删除${NC}"
else
  echo -e "${YELLOW}⚠ ConfigMap 不存在或删除失败${NC}"
fi

echo -e "\n${BLUE}[4/4]${NC} 删除 PVC..."
if kubectl delete pvc/rainbow-bridge-data -n "${NAMESPACE}" --ignore-not-found 2>/dev/null; then
  echo -e "${GREEN}✓ PVC 已删除${NC}"
  echo -e "${YELLOW}提示: PV 可能仍然存在，请手动检查${NC}"
else
  echo -e "${YELLOW}⚠ PVC 不存在或删除失败${NC}"
fi

# 删除 namespace（如果需要）
if [[ "$PURGE_NAMESPACE" == true ]]; then
  echo -e "\n${BLUE}[Bonus]${NC} 删除 Namespace..."
  if kubectl delete namespace "${NAMESPACE}" --ignore-not-found 2>/dev/null; then
    echo -e "${GREEN}✓ Namespace '${NAMESPACE}' 已删除${NC}"
  else
    echo -e "${RED}✗ Namespace 删除失败${NC}" >&2
  fi
else
  echo -e "\n${GREEN}✓ Namespace '${NAMESPACE}' 已保留${NC}"
fi

# 完成
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ 清理完成！${NC}"
echo -e "${GREEN}========================================${NC}"

if [[ "$PURGE_NAMESPACE" != true ]]; then
  echo -e "\n如需完全删除 namespace:"
  echo -e "  ${BLUE}$0 -n ${NAMESPACE} --purge-namespace${NC}"
fi

echo -e "\n验证删除结果:"
echo -e "  ${BLUE}kubectl get all -n ${NAMESPACE}${NC}"
