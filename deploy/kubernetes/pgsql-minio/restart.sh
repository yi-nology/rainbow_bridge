#!/usr/bin/env bash
# Rainbow Bridge Kubernetes 重启脚本 - PostgreSQL + MinIO 方案
# 支持交互式选择或指定 namespace，支持重启单个组件
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
  -n, --namespace <name>   指定 namespace（跳过交互式选择）
  -c, --component <name>   重启指定组件: app, postgres, minio, all（默认: app）
  -f, --force              强制滚动重启（无需确认）
  -y, --yes                跳过确认提示（同 --force）
  -h, --help               显示此帮助信息

组件说明:
  app      - 仅重启 Rainbow Bridge 应用
  postgres - 仅重启 PostgreSQL 数据库
  minio    - 仅重启 MinIO 对象存储
  all      - 重启所有组件

示例:
  $(basename "$0")                         # 交互式选择，重启应用
  $(basename "$0") -n production           # 重启 production 的应用
  $(basename "$0") -n test -c all          # 重启所有组件
  $(basename "$0") -n dev -c postgres -y   # 重启 PostgreSQL，跳过确认
EOF
}

# 解析命令行参数
NAMESPACE="${NAMESPACE:-}"
COMPONENT="app"
FORCE_RESTART=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    -c|--component)
      COMPONENT="$2"
      if [[ ! "$COMPONENT" =~ ^(app|postgres|minio|all)$ ]]; then
        echo -e "${RED}错误: 组件必须是 app, postgres, minio 或 all${NC}" >&2
        exit 1
      fi
      shift 2
      ;;
    -f|--force|-y|--yes)
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
  echo -e "${BLUE}  Rainbow Bridge 服务重启 (PostgreSQL + MinIO)${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
  
  # 获取包含 Rainbow Bridge 部署的 namespaces
  echo -e "${YELLOW}正在扫描集群中的 Rainbow Bridge 部署...${NC}"
  mapfile -t NAMESPACES_WITH_RB < <(kubectl get deployments --all-namespaces -l app=rainbow-bridge -o jsonpath='{range .items[*]}{.metadata.namespace}{"\n"}{end}' 2>/dev/null | sort -u)
  
  if [[ ${#NAMESPACES_WITH_RB[@]} -eq 0 ]]; then
    echo -e "${YELLOW}提示: 未找到任何 Rainbow Bridge 部署${NC}"
    exit 0
  fi
  
  echo -e "\n${GREEN}找到以下 namespace 中的 Rainbow Bridge 部署:${NC}"
  for i in "${!NAMESPACES_WITH_RB[@]}"; do
    ns="${NAMESPACES_WITH_RB[$i]}"
    
    # 检查各组件状态
    rb_ready=$(kubectl get deployment rainbow-bridge -n "$ns" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    rb_total=$(kubectl get deployment rainbow-bridge -n "$ns" -o jsonpath='{.status.replicas}' 2>/dev/null || echo "0")
    pg_ready=$(kubectl get deployment postgres -n "$ns" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "-")
    minio_ready=$(kubectl get deployment minio -n "$ns" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "-")
    
    status_color="$GREEN"
    if [[ "$rb_ready" != "$rb_total" ]] || [[ "$rb_ready" == "0" ]]; then
      status_color="$YELLOW"
    fi
    
    printf "  %2d) %-25s ${status_color}[App:%s/%s PG:%s MinIO:%s]${NC}\n" \
      "$((i+1))" "$ns" "$rb_ready" "$rb_total" "$pg_ready" "$minio_ready"
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

# 获取当前部署信息
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}当前部署状态${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Namespace: ${GREEN}${NAMESPACE}${NC}"

# 显示各组件状态
echo -e "\n${CYAN}组件状态:${NC}"
kubectl get deployments -n "${NAMESPACE}" -l app=rainbow-bridge -o wide 2>/dev/null || true

# 选择重启组件
if [[ "$FORCE_RESTART" != true ]]; then
  echo -e "\n${YELLOW}请选择要重启的组件:${NC}"
  echo "  1) Rainbow Bridge 应用"
  echo "  2) PostgreSQL 数据库"
  echo "  3) MinIO 对象存储"
  echo "  4) 所有组件"
  echo ""
  read -rp "请选择 [1-4] (默认: 1): " comp_choice
  
  case "$comp_choice" in
    1|"") COMPONENT="app" ;;
    2) COMPONENT="postgres" ;;
    3) COMPONENT="minio" ;;
    4) COMPONENT="all" ;;
    *)
      echo -e "${RED}错误: 无效的选择${NC}" >&2
      exit 1
      ;;
  esac
  
  echo -e "\n${YELLOW}警告: 即将重启组件: ${COMPONENT}${NC}"
  read -rp "确认重启? [y/N]: " confirm
  
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}重启已取消${NC}"
    exit 0
  fi
fi

# 执行重启
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}开始重启服务${NC}"
echo -e "${BLUE}========================================${NC}"

restart_deployment() {
  local name="$1"
  local label="$2"
  
  echo -e "\n${YELLOW}正在重启 ${name}...${NC}"
  
  if ! kubectl get deployment "${name}" -n "${NAMESPACE}" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Deployment ${name} 不存在，跳过${NC}"
    return 0
  fi
  
  if kubectl rollout restart deployment/"${name}" -n "${NAMESPACE}"; then
    echo -e "${GREEN}✓ ${name} 重启命令已执行${NC}"
    
    echo -e "${YELLOW}正在等待 ${name} 就绪...${NC}"
    if kubectl rollout status deployment/"${name}" -n "${NAMESPACE}" --timeout=3m; then
      echo -e "${GREEN}✓ ${name} 重启完成${NC}"
    else
      echo -e "${RED}✗ ${name} 重启超时${NC}" >&2
      return 1
    fi
  else
    echo -e "${RED}✗ ${name} 重启失败${NC}" >&2
    return 1
  fi
}

case "$COMPONENT" in
  app)
    restart_deployment "rainbow-bridge" "Rainbow Bridge"
    ;;
  postgres)
    restart_deployment "postgres" "PostgreSQL"
    ;;
  minio)
    restart_deployment "minio" "MinIO"
    ;;
  all)
    restart_deployment "postgres" "PostgreSQL"
    restart_deployment "minio" "MinIO"
    restart_deployment "rainbow-bridge" "Rainbow Bridge"
    ;;
esac

# 显示重启后的状态
echo -e "\n${CYAN}========================================${NC}"
echo -e "${CYAN}重启后状态${NC}"
echo -e "${CYAN}========================================${NC}"

echo -e "\n${CYAN}Pod 列表:${NC}"
kubectl get pods -n "${NAMESPACE}" -l app=rainbow-bridge -o wide

echo -e "\n${GREEN}常用命令:${NC}"
echo -e "  查看 Pod 状态:"
echo -e "    ${BLUE}kubectl get pods -n ${NAMESPACE} -l app=rainbow-bridge${NC}"
echo -e "\n  查看应用日志:"
echo -e "    ${BLUE}kubectl logs -f -n ${NAMESPACE} -l app=rainbow-bridge,component=app${NC}"
echo -e "\n  查看 PostgreSQL 日志:"
echo -e "    ${BLUE}kubectl logs -f -n ${NAMESPACE} -l app=rainbow-bridge,component=postgres${NC}"
echo -e "\n  查看 MinIO 日志:"
echo -e "    ${BLUE}kubectl logs -f -n ${NAMESPACE} -l app=rainbow-bridge,component=minio${NC}"
echo -e "\n  销毁部署:"
echo -e "    ${BLUE}${SCRIPT_DIR}/destroy.sh -n ${NAMESPACE}${NC}"
