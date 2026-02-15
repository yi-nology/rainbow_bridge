#!/usr/bin/env bash
# Rainbow Bridge Kubernetes 部署脚本
# 支持交互式选择或指定 namespace，动态创建命名空间和相关资源
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="${SCRIPT_DIR}/rainbow-bridge.yaml"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 默认配置
DEFAULT_PV_BASE_PATH="/mnt/data/rainbow-bridge"
DEFAULT_IMAGE="ghcr.io/yi-nology/rainbow_bridge:latest"

usage() {
  cat <<EOF
使用方法: $(basename "$0") [OPTIONS]

选项:
  -n, --namespace <name>     指定 namespace（跳过交互式选择）
  -p, --node-port <port>     使用 NodePort 暴露服务（端口范围: 30000-32767）
  -i, --image <image>        指定容器镜像（默认: ${DEFAULT_IMAGE}）
  --pv-path <path>           指定 PV 的 hostPath 路径（默认: ${DEFAULT_PV_BASE_PATH}/<namespace>）
  --dry-run                  仅生成配置，不实际部署
  -y, --yes                  跳过确认提示
  -h, --help                 显示此帮助信息

示例:
  $(basename "$0")                              # 交互式选择 namespace
  $(basename "$0") -n production               # 直接部署到 production namespace
  $(basename "$0") -n test -p 30080            # 部署到 test，使用 NodePort 30080
  $(basename "$0") -n dev --pv-path /data/dev  # 指定 PV 路径
  NAMESPACE=dev $(basename "$0")               # 使用环境变量指定 namespace

多环境部署说明:
  - 每个 namespace 独立部署，互不干扰
  - PV 按 namespace 隔离，数据独立存储
  - 默认使用 ClusterIP，如需外部访问请使用 --node-port 或配置 Ingress
EOF
}

# 解析命令行参数
NAMESPACE="${NAMESPACE:-}"
NODE_PORT=""
IMAGE="${DEFAULT_IMAGE}"
PV_PATH=""
DRY_RUN=false
SKIP_CONFIRM=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    -p|--node-port)
      NODE_PORT="$2"
      if [[ ! "$NODE_PORT" =~ ^[0-9]+$ ]] || [[ "$NODE_PORT" -lt 30000 ]] || [[ "$NODE_PORT" -gt 32767 ]]; then
        echo -e "${RED}错误: NodePort 必须在 30000-32767 范围内${NC}" >&2
        exit 1
      fi
      shift 2
      ;;
    -i|--image)
      IMAGE="$2"
      shift 2
      ;;
    --pv-path)
      PV_PATH="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
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
  
  # 检查已部署 Rainbow Bridge 的 namespaces
  echo -e "${YELLOW}正在检查已部署的 Rainbow Bridge 实例...${NC}"
  mapfile -t DEPLOYED_NS < <(kubectl get deployments --all-namespaces -l app=rainbow-bridge -o jsonpath='{range .items[*]}{.metadata.namespace}{"\n"}{end}' 2>/dev/null | sort -u)
  
  echo -e "\n${GREEN}现有的 namespaces:${NC}"
  for i in "${!EXISTING_NS[@]}"; do
    ns="${EXISTING_NS[$i]}"
    deployed=""
    for dns in "${DEPLOYED_NS[@]}"; do
      if [[ "$dns" == "$ns" ]]; then
        deployed=" ${CYAN}[已部署 Rainbow Bridge]${NC}"
        break
      fi
    done
    printf "  %2d) %-30s%s\n" "$((i+1))" "$ns" "$deployed"
  done
  
  echo -e "\n${YELLOW}请选择部署目标:${NC}"
  echo "  0) 创建新的 namespace"
  echo ""
  read -rp "请输入选项 [0-${#EXISTING_NS[@]}]: " choice
  
  if [[ "$choice" == "0" ]]; then
    read -rp "请输入新的 namespace 名称: " NAMESPACE
    if [[ -z "${NAMESPACE}" ]]; then
      echo -e "${RED}错误: Namespace 不能为空${NC}" >&2
      exit 1
    fi
    # 验证 namespace 名称格式
    if [[ ! "${NAMESPACE}" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]]; then
      echo -e "${RED}错误: Namespace 名称必须由小写字母、数字和连字符组成，且不能以连字符开头或结尾${NC}" >&2
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

# 设置 PV 路径
if [[ -z "${PV_PATH}" ]]; then
  PV_PATH="${DEFAULT_PV_BASE_PATH}/${NAMESPACE}"
fi

# 确认部署
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}部署配置确认${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Namespace:      ${GREEN}${NAMESPACE}${NC}"
echo -e "镜像:           ${IMAGE}"
echo -e "PV 路径:        ${PV_PATH}"
if [[ -n "${NODE_PORT}" ]]; then
  echo -e "Service 类型:   ${YELLOW}NodePort (${NODE_PORT})${NC}"
else
  echo -e "Service 类型:   ClusterIP"
fi
echo -e "Manifest:       ${MANIFEST}"

if [[ "${DRY_RUN}" == true ]]; then
  echo -e "\n${YELLOW}[DRY-RUN 模式] 仅生成配置，不实际部署${NC}"
fi

if [[ "${SKIP_CONFIRM}" != true ]]; then
  echo ""
  read -rp "确认部署? [y/N]: " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}部署已取消${NC}"
    exit 0
  fi
fi

# 创建临时 manifest 并替换占位符
TEMP_MANIFEST="$(mktemp)"
trap 'rm -f "${TEMP_MANIFEST}"' EXIT

echo -e "\n${YELLOW}正在生成部署配置...${NC}"

# 替换占位符
sed -e "s/__NAMESPACE__/${NAMESPACE}/g" \
    -e "s|__PV_HOST_PATH__|${PV_PATH}|g" \
    "${MANIFEST}" > "${TEMP_MANIFEST}"

# 替换镜像
if [[ "${IMAGE}" != "${DEFAULT_IMAGE}" ]]; then
  sed -i.bak "s|image: ${DEFAULT_IMAGE}|image: ${IMAGE}|g" "${TEMP_MANIFEST}"
  rm -f "${TEMP_MANIFEST}.bak"
fi

# 如果指定了 NodePort，修改 Service 配置
if [[ -n "${NODE_PORT}" ]]; then
  # 使用 awk 处理 Service 部分
  awk -v port="${NODE_PORT}" '
    /^apiVersion: v1$/,/^---$/ {
      if (/kind: Service/) { in_service = 1 }
      if (in_service && /type: ClusterIP/) {
        print "  type: NodePort"
        next
      }
      if (in_service && /port: 8080$/) {
        print
        print "      nodePort: " port
        next
      }
    }
    { print }
  ' "${TEMP_MANIFEST}" > "${TEMP_MANIFEST}.tmp"
  mv "${TEMP_MANIFEST}.tmp" "${TEMP_MANIFEST}"
fi

# DRY-RUN 模式
if [[ "${DRY_RUN}" == true ]]; then
  echo -e "\n${CYAN}========================================${NC}"
  echo -e "${CYAN}生成的 Manifest 配置:${NC}"
  echo -e "${CYAN}========================================${NC}"
  cat "${TEMP_MANIFEST}"
  echo -e "\n${GREEN}✓ DRY-RUN 完成，配置已生成${NC}"
  exit 0
fi

# 检查 StorageClass 是否已存在
echo -e "\n${BLUE}[1/4]${NC} 检查 StorageClass..."
if kubectl get storageclass rainbow-bridge-local-storage >/dev/null 2>&1; then
  echo -e "${GREEN}✓ StorageClass 已存在，跳过创建${NC}"
  # 从临时文件中移除 StorageClass 部分
  awk '/^apiVersion: storage.k8s.io\/v1$/,/^---$/ { if (/^---$/) { skip=0; next } skip=1 } !skip' "${TEMP_MANIFEST}" > "${TEMP_MANIFEST}.tmp"
  mv "${TEMP_MANIFEST}.tmp" "${TEMP_MANIFEST}"
else
  echo -e "${YELLOW}StorageClass 不存在，将创建${NC}"
fi

# 检查 PV 是否已存在
echo -e "\n${BLUE}[2/4]${NC} 检查 PersistentVolume..."
PV_NAME="pv-rainbow-bridge-${NAMESPACE}"
if kubectl get pv "${PV_NAME}" >/dev/null 2>&1; then
  echo -e "${GREEN}✓ PV ${PV_NAME} 已存在，跳过创建${NC}"
  # 从临时文件中移除 PV 部分
  awk -v pv_name="${PV_NAME}" '
    /^apiVersion: v1$/,/^---$/ {
      if (/kind: PersistentVolume/) { in_pv = 1 }
      if (in_pv && /^---$/) { in_pv = 0; next }
      if (in_pv) { next }
    }
    { print }
  ' "${TEMP_MANIFEST}" > "${TEMP_MANIFEST}.tmp"
  mv "${TEMP_MANIFEST}.tmp" "${TEMP_MANIFEST}"
else
  echo -e "${YELLOW}PV ${PV_NAME} 不存在，将创建${NC}"
fi

# 应用 manifests
echo -e "\n${BLUE}[3/4]${NC} 应用 manifests..."
if kubectl apply -f "${TEMP_MANIFEST}"; then
  echo -e "${GREEN}✓ Manifests 应用成功${NC}"
else
  echo -e "${RED}✗ Manifests 应用失败${NC}" >&2
  exit 1
fi

# 等待部署完成
echo -e "\n${BLUE}[4/4]${NC} 等待部署完成..."
if kubectl rollout status deployment/rainbow-bridge -n "${NAMESPACE}" --timeout=5m; then
  echo -e "\n${GREEN}========================================${NC}"
  echo -e "${GREEN}✓ 部署成功完成！${NC}"
  echo -e "${GREEN}========================================${NC}"
else
  echo -e "\n${RED}✗ 部署失败或超时${NC}" >&2
  echo -e "\n查看详细信息:"
  echo -e "  ${BLUE}kubectl describe deployment/rainbow-bridge -n ${NAMESPACE}${NC}"
  echo -e "  ${BLUE}kubectl logs -n ${NAMESPACE} -l app=rainbow-bridge${NC}"
  exit 1
fi

# 显示部署信息
echo -e "\n${CYAN}========================================${NC}"
echo -e "${CYAN}部署信息${NC}"
echo -e "${CYAN}========================================${NC}"

echo -e "Namespace:      ${GREEN}${NAMESPACE}${NC}"
echo -e "PV 路径:        ${PV_PATH}"

# 获取 Pod 状态
echo -e "\n${CYAN}Pod 状态:${NC}"
kubectl get pods -n "${NAMESPACE}" -l app=rainbow-bridge -o wide

# 获取 Service 信息
echo -e "\n${CYAN}Service 信息:${NC}"
kubectl get svc rainbow-bridge -n "${NAMESPACE}"

# 访问方式说明
echo -e "\n${GREEN}访问方式:${NC}"
if [[ -n "${NODE_PORT}" ]]; then
  echo -e "  NodePort:     ${BLUE}http://<node-ip>:${NODE_PORT}/rainbow-bridge/${NC}"
fi
echo -e "  Cluster 内部: ${BLUE}http://rainbow-bridge.${NAMESPACE}.svc.cluster.local:8080/rainbow-bridge/${NC}"
echo -e "  Port Forward: ${BLUE}kubectl port-forward -n ${NAMESPACE} svc/rainbow-bridge 8080:8080${NC}"

echo -e "\n${GREEN}常用命令:${NC}"
echo -e "  查看 Pod 状态:"
echo -e "    ${BLUE}kubectl get pods -n ${NAMESPACE} -l app=rainbow-bridge${NC}"
echo -e "\n  查看 Pod 日志:"
echo -e "    ${BLUE}kubectl logs -f -n ${NAMESPACE} -l app=rainbow-bridge${NC}"
echo -e "\n  重启服务:"
echo -e "    ${BLUE}${SCRIPT_DIR}/restart.sh -n ${NAMESPACE}${NC}"
echo -e "\n  销毁部署:"
echo -e "    ${BLUE}${SCRIPT_DIR}/destroy.sh -n ${NAMESPACE}${NC}"
