#!/usr/bin/env bash
# Rainbow Bridge Kubernetes 重启脚本
# 支持交互式选择或指定 namespace
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

usage() {
  cat <<EOF
使用方法: $(basename "$0") [OPTIONS]

选项:
  -n, --namespace <name>  指定 namespace（跳过交互式选择）
  -f, --force            强制重启（无需确认）
  -h, --help             显示此帮助信息

重启方式:
  1. 滚动重启（推荐）: 逐个替换 Pod，无停机时间
  2. 删除 Pod: 删除所有 Pod，让 Deployment 重新创建

示例:
  $(basename "$0")                    # 交互式选择 namespace
  $(basename "$0") -n production      # 重启 production namespace 下的服务
  $(basename "$0") -n test --force    # 强制重启，无需确认
  NAMESPACE=dev $(basename "$0")      # 使用环境变量指定 namespace
EOF
}

# 解析命令行参数
NAMESPACE="${NAMESPACE:-}"
FORCE_RESTART=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    -f|--force)
      FORCE_RESTART=true
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
  echo -e "${BLUE}  Rainbow Bridge 服务重启${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
  
  # 获取包含 Rainbow Bridge 部署的 namespaces
  echo -e "${YELLOW}正在扫描集群中的 Rainbow Bridge 部署...${NC}"
  mapfile -t NAMESPACES_WITH_RB < <(kubectl get deployments --all-namespaces -l app=rainbow-bridge -o jsonpath='{range .items[*]}{.metadata.namespace}{"\n"}{end}' 2>/dev/null | sort -u)
  
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
    ready=$(kubectl get deployment rainbow-bridge -n "$ns" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    
    status="运行中"
    color="$GREEN"
    if [[ "$ready" != "$total" ]] || [[ "$ready" == "0" ]]; then
      status="异常"
      color="$YELLOW"
    fi
    
    # 获取重启时间
    restart_time=$(kubectl get deployment rainbow-bridge -n "$ns" -o jsonpath='{.metadata.annotations.kubectl\.kubernetes\.io/restartedAt}' 2>/dev/null || echo "未知")
    
    printf "  %2d) %-30s ${color}[状态: %s, Pod: %s/%s]${NC}\n" "$((i+1))" "$ns" "$status" "$ready" "$total"
    printf "      ${CYAN}上次重启: %s${NC}\n" "$restart_time"
  done
  
  echo -e "\n${YELLOW}请选择要重启的 namespace:${NC}"
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
fi

# 检查 namespace 是否存在
if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  echo -e "${RED}错误: Namespace '${NAMESPACE}' 不存在${NC}" >&2
  exit 1
fi

# 检查是否有 Rainbow Bridge 部署
if ! kubectl get deployment rainbow-bridge -n "${NAMESPACE}" >/dev/null 2>&1; then
  echo -e "${RED}错误: Namespace '${NAMESPACE}' 中未找到 Rainbow Bridge 部署${NC}" >&2
  exit 1
fi

# 获取当前部署信息
CURRENT_REPLICAS=$(kubectl get deployment rainbow-bridge -n "${NAMESPACE}" -o jsonpath='{.status.replicas}' 2>/dev/null || echo "0")
READY_REPLICAS=$(kubectl get deployment rainbow-bridge -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
IMAGE=$(kubectl get deployment rainbow-bridge -n "${NAMESPACE}" -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo "未知")

# 选择重启方式
if [[ "$FORCE_RESTART" != true ]]; then
  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}重启信息确认${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo -e "Namespace:      ${GREEN}${NAMESPACE}${NC}"
  echo -e "当前副本数:     ${CURRENT_REPLICAS}"
  echo -e "就绪副本数:     ${READY_REPLICAS}"
  echo -e "镜像版本:       ${IMAGE}"
  
  echo -e "\n${YELLOW}请选择重启方式:${NC}"
  echo -e "  1) ${GREEN}滚动重启${NC}（推荐）- 逐个替换 Pod，无停机时间"
  echo -e "  2) ${YELLOW}删除 Pod${NC} - 删除所有 Pod 并重新创建"
  echo ""
  read -rp "请选择 [1-2]: " restart_method
  
  case "$restart_method" in
    1)
      RESTART_TYPE="rollout"
      ;;
    2)
      RESTART_TYPE="delete"
      ;;
    *)
      echo -e "${RED}错误: 无效的选择${NC}" >&2
      exit 1
      ;;
  esac
  
  echo -e "\n${YELLOW}警告: 即将重启 Rainbow Bridge 服务${NC}"
  read -rp "确认重启? [y/N]: " confirm
  
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}重启已取消${NC}"
    exit 0
  fi
else
  RESTART_TYPE="rollout"
fi

# 执行重启
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}开始重启服务${NC}"
echo -e "${BLUE}========================================${NC}"

if [[ "$RESTART_TYPE" == "rollout" ]]; then
  echo -e "${YELLOW}正在执行滚动重启...${NC}"
  echo -e "命令: kubectl rollout restart deployment/rainbow-bridge -n ${NAMESPACE}"
  echo ""
  
  if kubectl rollout restart deployment/rainbow-bridge -n "${NAMESPACE}"; then
    echo -e "\n${GREEN}✓ 重启命令已执行${NC}"
    
    echo -e "\n${YELLOW}正在等待滚动更新完成...${NC}"
    if kubectl rollout status deployment/rainbow-bridge -n "${NAMESPACE}" --timeout=5m; then
      echo -e "\n${GREEN}========================================${NC}"
      echo -e "${GREEN}✓ 重启成功完成！${NC}"
      echo -e "${GREEN}========================================${NC}"
    else
      echo -e "\n${RED}✗ 滚动更新超时或失败${NC}" >&2
      echo -e "\n查看详细信息:"
      echo -e "  ${BLUE}kubectl describe deployment/rainbow-bridge -n ${NAMESPACE}${NC}"
      exit 1
    fi
  else
    echo -e "${RED}✗ 重启命令执行失败${NC}" >&2
    exit 1
  fi
else
  echo -e "${YELLOW}正在删除所有 Pod...${NC}"
  
  if kubectl delete pods -n "${NAMESPACE}" -l app=rainbow-bridge; then
    echo -e "\n${GREEN}✓ Pod 已删除${NC}"
    
    echo -e "\n${YELLOW}正在等待新 Pod 启动...${NC}"
    sleep 3
    
    if kubectl rollout status deployment/rainbow-bridge -n "${NAMESPACE}" --timeout=5m; then
      echo -e "\n${GREEN}========================================${NC}"
      echo -e "${GREEN}✓ 重启成功完成！${NC}"
      echo -e "${GREEN}========================================${NC}"
    else
      echo -e "\n${RED}✗ Pod 启动超时或失败${NC}" >&2
      echo -e "\n查看详细信息:"
      echo -e "  ${BLUE}kubectl describe deployment/rainbow-bridge -n ${NAMESPACE}${NC}"
      exit 1
    fi
  else
    echo -e "${RED}✗ 删除 Pod 失败${NC}" >&2
    exit 1
  fi
fi

# 显示重启后的状态
echo -e "\n${CYAN}========================================${NC}"
echo -e "${CYAN}重启后状态${NC}"
echo -e "${CYAN}========================================${NC}"

NEW_REPLICAS=$(kubectl get deployment rainbow-bridge -n "${NAMESPACE}" -o jsonpath='{.status.replicas}' 2>/dev/null || echo "0")
NEW_READY=$(kubectl get deployment rainbow-bridge -n "${NAMESPACE}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
NEW_RESTART_TIME=$(kubectl get deployment rainbow-bridge -n "${NAMESPACE}" -o jsonpath='{.metadata.annotations.kubectl\.kubernetes\.io/restartedAt}' 2>/dev/null || echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ")")

echo -e "Namespace:      ${GREEN}${NAMESPACE}${NC}"
echo -e "副本数:         ${NEW_READY}/${NEW_REPLICAS}"
echo -e "重启时间:       ${NEW_RESTART_TIME}"

echo -e "\n${CYAN}Pod 列表:${NC}"
kubectl get pods -n "${NAMESPACE}" -l app=rainbow-bridge -o wide

echo -e "\n${GREEN}常用命令:${NC}"
echo -e "  查看 Pod 状态:"
echo -e "    ${BLUE}kubectl get pods -n ${NAMESPACE} -l app=rainbow-bridge${NC}"
echo -e "\n  查看 Pod 日志:"
echo -e "    ${BLUE}kubectl logs -f -n ${NAMESPACE} -l app=rainbow-bridge${NC}"
echo -e "\n  查看 Deployment 详情:"
echo -e "    ${BLUE}kubectl describe deployment/rainbow-bridge -n ${NAMESPACE}${NC}"
echo -e "\n  查看滚动更新历史:"
echo -e "    ${BLUE}kubectl rollout history deployment/rainbow-bridge -n ${NAMESPACE}${NC}"
