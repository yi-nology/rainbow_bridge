#!/usr/bin/env bash
# Rainbow Bridge Kubernetes 销毁脚本 (Standalone 版本)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认命名空间
NAMESPACE="default"

# 解析参数
while getopts "n:h" opt; do
  case $opt in
    n)
      NAMESPACE="$OPTARG"
      ;;
    h)
      echo "使用方法: $0 [-n 命名空间]"
      exit 0
      ;;
    *)
      echo -e "${RED}错误: 无效的参数${NC}"
      echo "使用方法: $0 [-n 命名空间]"
      exit 1
      ;;
  esac

done

show_banner() {
  echo -e "${BLUE}"
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║                                                          ║"
  echo "  ║             🌈 Rainbow Bridge Kubernetes 销毁           ║"
  echo "  ║                    (Standalone 版本)                     ║"
  echo "  ║                                                          ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# 检查 kubectl 是否可用
check_kubectl() {
  if ! command -v kubectl >/dev/null 2>&1; then
    echo -e "${RED}错误: kubectl 命令未找到${NC}"
    echo "请安装 kubectl 并配置 Kubernetes 集群访问"
    exit 1
  fi

  if ! kubectl cluster-info >/dev/null 2>&1; then
    echo -e "${RED}错误: 无法连接到 Kubernetes 集群${NC}"
    echo "请确保 kubectl 已正确配置"
    exit 1
  fi
}

# 销毁应用
destroy_application() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}销毁 Rainbow Bridge (Standalone)${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo -e "命名空间: ${GREEN}$NAMESPACE${NC}"
  echo ""

  # 删除服务
  if kubectl get service rainbow-bridge -n "$NAMESPACE" >/dev/null 2>&1; then
    echo -e "${YELLOW}正在删除服务...${NC}"
    kubectl delete service rainbow-bridge -n "$NAMESPACE"
  fi

  # 删除部署
  if kubectl get deployment rainbow-bridge -n "$NAMESPACE" >/dev/null 2>&1; then
    echo -e "${YELLOW}正在删除部署...${NC}"
    kubectl delete deployment rainbow-bridge -n "$NAMESPACE"
  fi

  # 删除持久卷声明
  if kubectl get pvc rainbow-bridge-data -n "$NAMESPACE" >/dev/null 2>&1; then
    echo -e "${YELLOW}正在删除持久卷声明...${NC}"
    kubectl delete pvc rainbow-bridge-data -n "$NAMESPACE"
  fi

  echo -e "\n${GREEN}========================================${NC}"
  echo -e "${GREEN}✓ 销毁成功！${NC}"
  echo -e "${GREEN}========================================${NC}"

  # 显示命名空间信息
  echo -e "\n${BLUE}命名空间 $NAMESPACE 中的资源:${NC}"
  kubectl get all -n "$NAMESPACE"
}

main() {
  show_banner
  check_kubectl
  destroy_application
}

main "$@"
