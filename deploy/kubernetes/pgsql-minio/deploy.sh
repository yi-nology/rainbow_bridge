#!/usr/bin/env bash
# Rainbow Bridge Kubernetes 部署脚本 (PostgreSQL + MinIO 版本)
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
  echo "  ║           🌈 Rainbow Bridge Kubernetes 部署              ║"
  echo "  ║                 (PostgreSQL + MinIO 版本)                ║"
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

# 创建命名空间
create_namespace() {
  if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
    echo -e "${YELLOW}正在创建命名空间: $NAMESPACE${NC}"
    kubectl create namespace "$NAMESPACE"
  fi
}

# 部署 PostgreSQL
deploy_postgres() {
  echo -e "${YELLOW}正在部署 PostgreSQL...${NC}"
  
  # 创建 PostgreSQL 持久卷声明
  kubectl apply -f "$SCRIPT_DIR/postgres-pvc.yaml" -n "$NAMESPACE"
  
  # 部署 PostgreSQL
  kubectl apply -f "$SCRIPT_DIR/postgres-deployment.yaml" -n "$NAMESPACE"
  
  # 创建 PostgreSQL 服务
  kubectl apply -f "$SCRIPT_DIR/postgres-service.yaml" -n "$NAMESPACE"
  
  # 等待 PostgreSQL 就绪
  echo -e "${YELLOW}正在等待 PostgreSQL 就绪...${NC}"
  kubectl rollout status deployment postgres -n "$NAMESPACE"
}

# 部署 MinIO
deploy_minio() {
  echo -e "${YELLOW}正在部署 MinIO...${NC}"
  
  # 创建 MinIO 持久卷声明
  kubectl apply -f "$SCRIPT_DIR/minio-pvc.yaml" -n "$NAMESPACE"
  
  # 部署 MinIO
  kubectl apply -f "$SCRIPT_DIR/minio-deployment.yaml" -n "$NAMESPACE"
  
  # 创建 MinIO 服务
  kubectl apply -f "$SCRIPT_DIR/minio-service.yaml" -n "$NAMESPACE"
  
  # 等待 MinIO 就绪
  echo -e "${YELLOW}正在等待 MinIO 就绪...${NC}"
  kubectl rollout status deployment minio -n "$NAMESPACE"
}

# 部署应用
deploy_application() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}部署 Rainbow Bridge (PostgreSQL + MinIO)${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo -e "命名空间: ${GREEN}$NAMESPACE${NC}"
  echo -e "部署目录: ${GREEN}$SCRIPT_DIR${NC}"
  echo ""

  # 部署 PostgreSQL
  deploy_postgres

  # 部署 MinIO
  deploy_minio

  # 创建配置映射
  echo -e "${YELLOW}正在创建配置映射...${NC}"
  kubectl apply -f "$SCRIPT_DIR/rainbow-bridge-configmap.yaml" -n "$NAMESPACE"

  # 创建持久卷声明
  echo -e "${YELLOW}正在创建持久卷声明...${NC}"
  kubectl apply -f "$SCRIPT_DIR/rainbow-bridge-pvc.yaml" -n "$NAMESPACE"

  # 部署应用
  echo -e "${YELLOW}正在部署应用...${NC}"
  kubectl apply -f "$SCRIPT_DIR/rainbow-bridge-deployment.yaml" -n "$NAMESPACE"

  # 创建服务
  echo -e "${YELLOW}正在创建服务...${NC}"
  kubectl apply -f "$SCRIPT_DIR/rainbow-bridge-service.yaml" -n "$NAMESPACE"

  # 等待部署完成
  echo -e "${YELLOW}正在等待部署完成...${NC}"
  kubectl rollout status deployment rainbow-bridge -n "$NAMESPACE"

  echo -e "\n${GREEN}========================================${NC}"
  echo -e "${GREEN}✓ 部署成功！${NC}"
  echo -e "${GREEN}========================================${NC}"

  # 显示服务信息
  echo -e "\n${BLUE}服务信息:${NC}"
  kubectl get services -n "$NAMESPACE"

  # 显示 Pod 信息
  echo -e "\n${BLUE}Pod 信息:${NC}"
  kubectl get pods -n "$NAMESPACE"

  # 获取访问 URL
  local service_type
  service_type=$(kubectl get service rainbow-bridge -n "$NAMESPACE" -o jsonpath='{.spec.type}')

  if [ "$service_type" == "LoadBalancer" ]; then
    echo -e "\n${GREEN}访问地址:${NC}"
    echo -e "  ${BLUE}http://$(kubectl get service rainbow-bridge -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}'):8080${NC}"
  elif [ "$service_type" == "NodePort" ]; then
    echo -e "\n${GREEN}访问地址:${NC}"
    echo -e "  ${BLUE}http://<节点IP>:$(kubectl get service rainbow-bridge -n "$NAMESPACE" -o jsonpath='{.spec.ports[0].nodePort}')${NC}"
  else
    echo -e "\n${GREEN}访问地址:${NC}"
    echo -e "  ${BLUE}http://localhost:8080${NC} (需要端口转发)"
    echo -e "  ${YELLOW}执行以下命令进行端口转发:${NC}"
    echo -e "  ${BLUE}kubectl port-forward service/rainbow-bridge 8080:8080 -n $NAMESPACE${NC}"
  fi

  # MinIO 访问信息
  echo -e "\n${GREEN}MinIO 访问信息:${NC}"
  echo -e "  ${BLUE}控制台地址: http://localhost:9001${NC} (需要端口转发)"
  echo -e "  ${YELLOW}执行以下命令进行端口转发:${NC}"
  echo -e "  ${BLUE}kubectl port-forward service/minio 9001:9001 -n $NAMESPACE${NC}"
  echo -e "  用户名: minioadmin"
  echo -e "  密码: minioadmin123"
}

main() {
  show_banner
  check_kubectl
  create_namespace
  deploy_application
}

main "$@"
