#!/usr/bin/env bash
# Rainbow Bridge Kubernetes 清理脚本 - PostgreSQL + MinIO 方案
# 支持交互式选择删除指定 namespace 下的服务
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
  --purge-namespace        删除 namespace 本身（默认仅删除服务）
  --purge-pv               删除对应的 PersistentVolumes（默认保留）
  --purge-all              删除所有相关资源（等同于 --purge-namespace --purge-pv）
  -y, --yes                跳过确认提示（危险操作仍需输入 namespace 确认）
  -h, --help               显示此帮助信息

示例:
  $(basename "$0")                              # 交互式选择
  $(basename "$0") -n production               # 删除 production 的服务
  $(basename "$0") -n test --purge-namespace   # 删除服务并删除 namespace
  $(basename "$0") -n dev --purge-all          # 完全清理（包括 PV）

注意:
  - 默认只删除 Rainbow Bridge 相关资源，保留 namespace 和 PV
  - 使用 --purge-pv 会删除 PostgreSQL 和 MinIO 的 PV（数据将丢失！）
  - PV 数据目录需要手动清理
EOF
}

# 解析命令行参数
NAMESPACE="${NAMESPACE:-}"
PURGE_NAMESPACE=false
PURGE_PV=false
SKIP_CONFIRM=false

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
    --purge-pv)
      PURGE_PV=true
      shift
      ;;
    --purge-all)
      PURGE_NAMESPACE=true
      PURGE_PV=true
      shift
      ;;
    -y|--yes)
      SKIP_CONFIRM=true
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
  echo -e "${BLUE}  Rainbow Bridge 清理 (PostgreSQL + MinIO)${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
  
  # 获取包含 Rainbow Bridge 部署的 namespaces (pgsql-minio 方案)
  echo -e "${YELLOW}正在扫描集群中的 Rainbow Bridge 部署...${NC}"
  mapfile -t NAMESPACES_WITH_RB < <(kubectl get deployments --all-namespaces -l app=rainbow-bridge,component=app -o jsonpath='{range .items[*]}{.metadata.namespace}{"\n"}{end}' 2>/dev/null | sort -u)
  
  if [[ ${#NAMESPACES_WITH_RB[@]} -eq 0 ]]; then
    # 尝试查找没有 component 标签的部署
    mapfile -t NAMESPACES_WITH_RB < <(kubectl get deployments --all-namespaces -l app=rainbow-bridge -o jsonpath='{range .items[*]}{.metadata.namespace}{"\n"}{end}' 2>/dev/null | sort -u)
  fi
  
  if [[ ${#NAMESPACES_WITH_RB[@]} -eq 0 ]]; then
    echo -e "${YELLOW}提示: 未找到任何 Rainbow Bridge 部署${NC}"
    echo -e "您可以手动指定 namespace: ${BLUE}$0 -n <namespace>${NC}"
    exit 0
  fi
  
  echo -e "\n${GREEN}找到以下 namespace 中的 Rainbow Bridge 部署:${NC}"
  for i in "${!NAMESPACES_WITH_RB[@]}"; do
    ns="${NAMESPACES_WITH_RB[$i]}"
    
    # 检查各组件状态
    rb_ready=$(kubectl get deployment rainbow-bridge -n "$ns" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    pg_ready=$(kubectl get deployment postgres -n "$ns" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "-")
    minio_ready=$(kubectl get deployment minio -n "$ns" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "-")
    
    # 检查是否有 PV
    has_pg_pv=""
    has_minio_pv=""
    if kubectl get pv "pv-postgres-${ns}" >/dev/null 2>&1; then
      has_pg_pv="PG-PV"
    fi
    if kubectl get pv "pv-minio-${ns}" >/dev/null 2>&1; then
      has_minio_pv="MinIO-PV"
    fi
    
    pv_info=""
    if [[ -n "$has_pg_pv" ]] || [[ -n "$has_minio_pv" ]]; then
      pv_info=" ${CYAN}[${has_pg_pv}${has_pg_pv:+,}${has_minio_pv}]${NC}"
    fi
    
    printf "  %2d) %-25s ${GREEN}[App:%s PG:%s MinIO:%s]${NC}%s\n" "$((i+1))" "$ns" "$rb_ready" "$pg_ready" "$minio_ready" "$pv_info"
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
  
  # 询问清理选项
  if [[ "${SKIP_CONFIRM}" != true ]]; then
    echo -e "\n${YELLOW}清理选项:${NC}"
    echo "  1) 仅删除服务（保留 namespace 和 PV）"
    echo "  2) 删除服务和 namespace（保留 PV）"
    echo "  3) 删除服务和 PV（保留 namespace）"
    echo "  4) 完全清理（删除服务、namespace 和 PV）"
    echo ""
    read -rp "请选择清理方式 [1-4]: " clean_choice
    
    case "$clean_choice" in
      1) ;;
      2) PURGE_NAMESPACE=true ;;
      3) PURGE_PV=true ;;
      4) PURGE_NAMESPACE=true; PURGE_PV=true ;;
      *)
        echo -e "${RED}错误: 无效的选择${NC}" >&2
        exit 1
        ;;
    esac
  fi
fi

# 检查 namespace 是否存在
if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  echo -e "${RED}错误: Namespace '${NAMESPACE}' 不存在${NC}" >&2
  exit 1
fi

# 检查 PV 状态
PG_PV_NAME="pv-postgres-${NAMESPACE}"
MINIO_PV_NAME="pv-minio-${NAMESPACE}"
HAS_PG_PV=false
HAS_MINIO_PV=false
if kubectl get pv "${PG_PV_NAME}" >/dev/null 2>&1; then
  HAS_PG_PV=true
fi
if kubectl get pv "${MINIO_PV_NAME}" >/dev/null 2>&1; then
  HAS_MINIO_PV=true
fi

# 显示将要删除的资源
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}删除信息确认${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Namespace:  ${GREEN}${NAMESPACE}${NC}"
echo -e "\n将删除以下资源:"
echo -e "  ${RED}✗${NC} Deployment: rainbow-bridge"
echo -e "  ${RED}✗${NC} Deployment: postgres"
echo -e "  ${RED}✗${NC} Deployment: minio"
echo -e "  ${RED}✗${NC} Service: rainbow-bridge, postgres, minio"
echo -e "  ${RED}✗${NC} ConfigMap: rainbow-bridge-config, postgres-init-script"
echo -e "  ${RED}✗${NC} Secret: rainbow-bridge-secrets"
echo -e "  ${RED}✗${NC} PVC: postgres-data, minio-data"

if [[ "${PURGE_PV}" == true ]]; then
  if [[ "${HAS_PG_PV}" == true ]]; then
    echo -e "  ${RED}✗${NC} PV: ${PG_PV_NAME} ${RED}(PostgreSQL 数据将丢失!)${NC}"
  fi
  if [[ "${HAS_MINIO_PV}" == true ]]; then
    echo -e "  ${RED}✗${NC} PV: ${MINIO_PV_NAME} ${RED}(MinIO 数据将丢失!)${NC}"
  fi
else
  echo -e "\n${GREEN}保留:${NC}"
  if [[ "${HAS_PG_PV}" == true ]]; then
    echo -e "  ${GREEN}✓${NC} PV: ${PG_PV_NAME}"
  fi
  if [[ "${HAS_MINIO_PV}" == true ]]; then
    echo -e "  ${GREEN}✓${NC} PV: ${MINIO_PV_NAME}"
  fi
fi

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

# 删除 Deployments
echo -e "\n${BLUE}[1/7]${NC} 删除 Deployments..."
kubectl delete deployment rainbow-bridge postgres minio -n "${NAMESPACE}" --ignore-not-found 2>/dev/null && \
  echo -e "${GREEN}✓ Deployments 已删除${NC}" || \
  echo -e "${YELLOW}⚠ 部分 Deployment 不存在${NC}"

# 删除 Services
echo -e "\n${BLUE}[2/7]${NC} 删除 Services..."
kubectl delete service rainbow-bridge postgres minio -n "${NAMESPACE}" --ignore-not-found 2>/dev/null && \
  echo -e "${GREEN}✓ Services 已删除${NC}" || \
  echo -e "${YELLOW}⚠ 部分 Service 不存在${NC}"

# 删除 ConfigMaps
echo -e "\n${BLUE}[3/7]${NC} 删除 ConfigMaps..."
kubectl delete configmap rainbow-bridge-config postgres-init-script -n "${NAMESPACE}" --ignore-not-found 2>/dev/null && \
  echo -e "${GREEN}✓ ConfigMaps 已删除${NC}" || \
  echo -e "${YELLOW}⚠ 部分 ConfigMap 不存在${NC}"

# 删除 Secrets
echo -e "\n${BLUE}[4/7]${NC} 删除 Secrets..."
kubectl delete secret rainbow-bridge-secrets -n "${NAMESPACE}" --ignore-not-found 2>/dev/null && \
  echo -e "${GREEN}✓ Secrets 已删除${NC}" || \
  echo -e "${YELLOW}⚠ Secret 不存在${NC}"

# 删除 PVCs
echo -e "\n${BLUE}[5/7]${NC} 删除 PVCs..."
kubectl delete pvc postgres-data minio-data -n "${NAMESPACE}" --ignore-not-found 2>/dev/null && \
  echo -e "${GREEN}✓ PVCs 已删除${NC}" || \
  echo -e "${YELLOW}⚠ 部分 PVC 不存在${NC}"

# 删除 PVs（如果需要）
echo -e "\n${BLUE}[6/7]${NC} 处理 PersistentVolumes..."
if [[ "${PURGE_PV}" == true ]]; then
  if [[ "${HAS_PG_PV}" == true ]]; then
    kubectl delete pv "${PG_PV_NAME}" --ignore-not-found 2>/dev/null && \
      echo -e "${GREEN}✓ PV ${PG_PV_NAME} 已删除${NC}" || \
      echo -e "${RED}✗ PV ${PG_PV_NAME} 删除失败${NC}"
  fi
  if [[ "${HAS_MINIO_PV}" == true ]]; then
    kubectl delete pv "${MINIO_PV_NAME}" --ignore-not-found 2>/dev/null && \
      echo -e "${GREEN}✓ PV ${MINIO_PV_NAME} 已删除${NC}" || \
      echo -e "${RED}✗ PV ${MINIO_PV_NAME} 删除失败${NC}"
  fi
  echo -e "${YELLOW}提示: hostPath 目录中的数据仍然存在，如需清理请手动删除${NC}"
else
  echo -e "${GREEN}✓ PVs 已保留${NC}"
fi

# 删除 namespace（如果需要）
echo -e "\n${BLUE}[7/7]${NC} 处理 Namespace..."
if [[ "$PURGE_NAMESPACE" == true ]]; then
  kubectl delete namespace "${NAMESPACE}" --ignore-not-found 2>/dev/null && \
    echo -e "${GREEN}✓ Namespace '${NAMESPACE}' 已删除${NC}" || \
    echo -e "${RED}✗ Namespace 删除失败${NC}"
else
  echo -e "${GREEN}✓ Namespace '${NAMESPACE}' 已保留${NC}"
fi

# 完成
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ 清理完成！${NC}"
echo -e "${GREEN}========================================${NC}"

# 显示后续操作提示
echo -e "\n${GREEN}常用命令:${NC}"
if [[ "$PURGE_NAMESPACE" != true ]]; then
  echo -e "  查看 namespace 中的资源:"
  echo -e "    ${BLUE}kubectl get all -n ${NAMESPACE}${NC}"
fi
if [[ "${PURGE_PV}" != true ]] && ( [[ "${HAS_PG_PV}" == true ]] || [[ "${HAS_MINIO_PV}" == true ]] ); then
  echo -e "\n  删除 PVs:"
  [[ "${HAS_PG_PV}" == true ]] && echo -e "    ${BLUE}kubectl delete pv ${PG_PV_NAME}${NC}"
  [[ "${HAS_MINIO_PV}" == true ]] && echo -e "    ${BLUE}kubectl delete pv ${MINIO_PV_NAME}${NC}"
fi
echo -e "\n  重新部署:"
echo -e "    ${BLUE}${SCRIPT_DIR}/deploy.sh -n ${NAMESPACE}${NC}"
