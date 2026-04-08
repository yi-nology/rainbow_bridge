#!/usr/bin/env bash
# Rainbow Bridge Kubernetes 重启脚本 (Standalone 版本)
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
  echo "  ║             🌈 Rainbow Bridge Kubernetes 重启           ║"
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

# 重启应用
restart_application() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}重启 Rainbow Bridge (Standalone)${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo -e "命名空间: ${GREEN}$NAMESPACE${NC}"
  echo ""

  # 检查部署是否存在
  if ! kubectl get deployment rainbow-bridge -n "$NAMESPACE" >/dev/null 2>&1; then
    echo -e "${RED}错误: 部署不存在${NC}"
    echo "请先部署应用"
    exit 1
  fi

  # 重启部署
  echo -e "${YELLOW}正在重启部署...${NC}"
  kubectl rollout restart deployment rainbow-bridge -n "$NAMESPACE"

  # 等待重启完成
  echo -e "${YELLOW}正在等待重启完成...${NC}"
  kubectl rollout status deployment rainbow-bridge -n "$NAMESPACE"

  echo -e "\n${GREEN}========================================${NC}"
  echo -e "${GREEN}✓ 重启成功！${NC}"
  echo -e "${GREEN}========================================${NC}"

  # 显示 Pod 信息
  echo -e "\n${BLUE}Pod 信息:${NC}"
  kubectl get pods -n "$NAMESPACE" -l app=rainbow-bridge
}

main() {
  show_banner
  check_kubectl
  restart_application
}

main "$@"
