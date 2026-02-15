#!/usr/bin/env bash
# Rainbow Bridge 统一部署脚本
# 支持 Docker Compose 和 Kubernetes 两种部署方式
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# 版本信息
VERSION="1.0.0"

show_banner() {
  echo -e "${CYAN}"
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║                                                          ║"
  echo "  ║              🌈 Rainbow Bridge 部署工具                  ║"
  echo "  ║                                                          ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

usage() {
  cat <<EOF
使用方法: $(basename "$0") [命令] [选项]

命令:
  deploy      部署服务（默认）
  destroy     销毁服务
  restart     重启服务
  status      查看状态

选项:
  -h, --help     显示帮助信息
  -v, --version  显示版本信息

示例:
  $(basename "$0")              # 交互式部署
  $(basename "$0") deploy       # 交互式部署
  $(basename "$0") destroy      # 交互式销毁
  $(basename "$0") status       # 查看状态
EOF
}

# 检查命令是否存在
check_command() {
  command -v "$1" >/dev/null 2>&1
}

# 选择部署平台
select_platform() {
  echo -e "\n${BLUE}请选择部署平台:${NC}"
  echo ""
  echo -e "  ${GREEN}1)${NC} Docker Compose  ${CYAN}(推荐本地开发/单机部署)${NC}"
  echo -e "  ${GREEN}2)${NC} Kubernetes      ${CYAN}(推荐生产环境/集群部署)${NC}"
  echo ""
  
  # 检查可用性
  local docker_available=false
  local k8s_available=false
  
  if check_command docker && docker info >/dev/null 2>&1; then
    docker_available=true
  fi
  
  if check_command kubectl && kubectl cluster-info >/dev/null 2>&1; then
    k8s_available=true
  fi
  
  if [[ "$docker_available" == false ]] && [[ "$k8s_available" == false ]]; then
    echo -e "${RED}错误: 未检测到可用的 Docker 或 Kubernetes 环境${NC}"
    echo -e "请先安装 Docker 或配置 kubectl"
    exit 1
  fi
  
  [[ "$docker_available" == false ]] && echo -e "  ${YELLOW}⚠ Docker 不可用${NC}"
  [[ "$k8s_available" == false ]] && echo -e "  ${YELLOW}⚠ Kubernetes 不可用${NC}"
  
  echo ""
  read -rp "请选择 [1-2]: " platform_choice
  
  case "$platform_choice" in
    1)
      if [[ "$docker_available" == false ]]; then
        echo -e "${RED}错误: Docker 不可用${NC}"
        exit 1
      fi
      PLATFORM="docker-compose"
      ;;
    2)
      if [[ "$k8s_available" == false ]]; then
        echo -e "${RED}错误: Kubernetes 不可用${NC}"
        exit 1
      fi
      PLATFORM="kubernetes"
      ;;
    *)
      echo -e "${RED}错误: 无效的选择${NC}"
      exit 1
      ;;
  esac
}

# Docker Compose 方案选择
select_docker_compose_mode() {
  echo -e "\n${BLUE}请选择 Docker Compose 部署方案:${NC}"
  echo ""
  echo -e "  ${GREEN}1)${NC} SQLite          ${CYAN}(最简单，适合个人/测试)${NC}"
  echo -e "  ${GREEN}2)${NC} MySQL           ${CYAN}(中小型生产环境)${NC}"
  echo -e "  ${GREEN}3)${NC} PostgreSQL      ${CYAN}(大型生产环境)${NC}"
  echo -e "  ${GREEN}4)${NC} PostgreSQL+MinIO ${CYAN}(云原生，对象存储)${NC}"
  echo -e "  ${GREEN}5)${NC} MinIO 集群      ${CYAN}(企业级高可用)${NC}"
  echo ""
  read -rp "请选择 [1-5]: " mode_choice
  
  case "$mode_choice" in
    1) DC_MODE="sqlite" ;;
    2) DC_MODE="mysql" ;;
    3) DC_MODE="postgres" ;;
    4) DC_MODE="pgsql-minio" ;;
    5) DC_MODE="minio-cluster" ;;
    *)
      echo -e "${RED}错误: 无效的选择${NC}"
      exit 1
      ;;
  esac
  
  DC_DIR="${SCRIPT_DIR}/docker-compose/${DC_MODE}"
  
  if [[ ! -d "$DC_DIR" ]]; then
    echo -e "${RED}错误: 目录不存在: ${DC_DIR}${NC}"
    exit 1
  fi
}

# Kubernetes 方案选择
select_kubernetes_mode() {
  echo -e "\n${BLUE}请选择 Kubernetes 部署方案:${NC}"
  echo ""
  echo -e "  ${GREEN}1)${NC} Standalone      ${CYAN}(单机SQLite，最简单)${NC}"
  echo -e "  ${GREEN}2)${NC} PostgreSQL+MinIO ${CYAN}(生产级，完整功能)${NC}"
  echo ""
  read -rp "请选择 [1-2]: " mode_choice
  
  case "$mode_choice" in
    1) K8S_MODE="standalone" ;;
    2) K8S_MODE="pgsql-minio" ;;
    *)
      echo -e "${RED}错误: 无效的选择${NC}"
      exit 1
      ;;
  esac
  
  K8S_DIR="${SCRIPT_DIR}/kubernetes/${K8S_MODE}"
  
  if [[ ! -d "$K8S_DIR" ]]; then
    echo -e "${RED}错误: 目录不存在: ${K8S_DIR}${NC}"
    exit 1
  fi
}

# Docker Compose 部署
deploy_docker_compose() {
  select_docker_compose_mode
  
  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}Docker Compose 部署 - ${DC_MODE}${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo -e "目录: ${DC_DIR}"
  echo ""
  
  read -rp "确认部署? [y/N]: " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}部署已取消${NC}"
    exit 0
  fi
  
  cd "$DC_DIR"
  echo -e "\n${YELLOW}正在启动服务...${NC}"
  docker compose up -d
  
  echo -e "\n${GREEN}========================================${NC}"
  echo -e "${GREEN}✓ 部署成功！${NC}"
  echo -e "${GREEN}========================================${NC}"
  
  echo -e "\n${CYAN}服务状态:${NC}"
  docker compose ps
  
  echo -e "\n${GREEN}访问地址:${NC}"
  echo -e "  ${BLUE}http://localhost/rainbow-bridge/${NC}"
  
  if [[ "$DC_MODE" == "pgsql-minio" ]] || [[ "$DC_MODE" == "minio-cluster" ]]; then
    echo -e "\n${GREEN}MinIO 控制台:${NC}"
    echo -e "  ${BLUE}http://localhost:9001${NC}"
    echo -e "  用户名: minioadmin"
    echo -e "  密码: minioadmin123"
  fi
  
  echo -e "\n${GREEN}常用命令:${NC}"
  echo -e "  查看API日志:   ${BLUE}cd ${DC_DIR} && docker compose logs -f rainbow-bridge-api${NC}"
  echo -e "  查看前端日志:  ${BLUE}cd ${DC_DIR} && docker compose logs -f rainbow-bridge-frontend${NC}"
  echo -e "  查看全部日志:  ${BLUE}cd ${DC_DIR} && docker compose logs -f${NC}"
  echo -e "  停止服务:      ${BLUE}cd ${DC_DIR} && docker compose down${NC}"
  echo -e "  重启服务:      ${BLUE}cd ${DC_DIR} && docker compose restart${NC}"
}

# Docker Compose 销毁
destroy_docker_compose() {
  echo -e "\n${BLUE}请选择要销毁的 Docker Compose 部署:${NC}"
  echo ""
  
  # 查找正在运行的部署
  local running_modes=()
  for mode in sqlite mysql postgres pgsql-minio minio-cluster; do
    local dir="${SCRIPT_DIR}/docker-compose/${mode}"
    if [[ -d "$dir" ]] && [[ -f "$dir/docker-compose.yaml" ]]; then
      cd "$dir"
      if docker compose ps --quiet 2>/dev/null | grep -q .; then
        running_modes+=("$mode")
      fi
    fi
  done
  
  if [[ ${#running_modes[@]} -eq 0 ]]; then
    echo -e "${YELLOW}未发现正在运行的 Docker Compose 部署${NC}"
    return
  fi
  
  for i in "${!running_modes[@]}"; do
    echo -e "  ${GREEN}$((i+1)))${NC} ${running_modes[$i]}"
  done
  echo ""
  read -rp "请选择 [1-${#running_modes[@]}]: " choice
  
  if [[ "$choice" =~ ^[0-9]+$ ]] && [[ "$choice" -ge 1 ]] && [[ "$choice" -le "${#running_modes[@]}" ]]; then
    DC_MODE="${running_modes[$((choice-1))]}"
    DC_DIR="${SCRIPT_DIR}/docker-compose/${DC_MODE}"
    
    echo -e "\n${YELLOW}警告: 即将销毁 ${DC_MODE} 部署${NC}"
    read -rp "是否同时删除数据卷? [y/N]: " delete_volumes
    
    cd "$DC_DIR"
    if [[ "$delete_volumes" =~ ^[Yy]$ ]]; then
      docker compose down -v
      echo -e "${GREEN}✓ 服务已停止，数据卷已删除${NC}"
    else
      docker compose down
      echo -e "${GREEN}✓ 服务已停止，数据卷已保留${NC}"
    fi
  else
    echo -e "${RED}错误: 无效的选择${NC}"
    exit 1
  fi
}

# Docker Compose 状态
status_docker_compose() {
  echo -e "\n${BLUE}Docker Compose 部署状态:${NC}"
  echo ""
  
  for mode in sqlite mysql postgres pgsql-minio minio-cluster; do
    local dir="${SCRIPT_DIR}/docker-compose/${mode}"
    if [[ -d "$dir" ]] && [[ -f "$dir/docker-compose.yaml" ]]; then
      cd "$dir"
      local status="未运行"
      local color="$YELLOW"
      if docker compose ps --quiet 2>/dev/null | grep -q .; then
        status="运行中"
        color="$GREEN"
      fi
      printf "  %-15s ${color}[%s]${NC}\n" "$mode" "$status"
    fi
  done
}

# Kubernetes 部署
deploy_kubernetes() {
  select_kubernetes_mode
  
  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}Kubernetes 部署 - ${K8S_MODE}${NC}"
  echo -e "${BLUE}========================================${NC}"
  
  # 调用对应的部署脚本
  if [[ -x "${K8S_DIR}/deploy.sh" ]]; then
    "${K8S_DIR}/deploy.sh"
  else
    echo -e "${RED}错误: 部署脚本不存在或不可执行: ${K8S_DIR}/deploy.sh${NC}"
    exit 1
  fi
}

# Kubernetes 销毁
destroy_kubernetes() {
  echo -e "\n${BLUE}请选择要销毁的 Kubernetes 部署方案:${NC}"
  echo ""
  echo -e "  ${GREEN}1)${NC} Standalone"
  echo -e "  ${GREEN}2)${NC} PostgreSQL+MinIO"
  echo ""
  read -rp "请选择 [1-2]: " mode_choice
  
  case "$mode_choice" in
    1) K8S_MODE="standalone" ;;
    2) K8S_MODE="pgsql-minio" ;;
    *)
      echo -e "${RED}错误: 无效的选择${NC}"
      exit 1
      ;;
  esac
  
  K8S_DIR="${SCRIPT_DIR}/kubernetes/${K8S_MODE}"
  
  if [[ -x "${K8S_DIR}/destroy.sh" ]]; then
    "${K8S_DIR}/destroy.sh"
  else
    echo -e "${RED}错误: 销毁脚本不存在: ${K8S_DIR}/destroy.sh${NC}"
    exit 1
  fi
}

# Kubernetes 重启
restart_kubernetes() {
  echo -e "\n${BLUE}请选择要重启的 Kubernetes 部署方案:${NC}"
  echo ""
  echo -e "  ${GREEN}1)${NC} Standalone"
  echo -e "  ${GREEN}2)${NC} PostgreSQL+MinIO"
  echo ""
  read -rp "请选择 [1-2]: " mode_choice
  
  case "$mode_choice" in
    1) K8S_MODE="standalone" ;;
    2) K8S_MODE="pgsql-minio" ;;
    *)
      echo -e "${RED}错误: 无效的选择${NC}"
      exit 1
      ;;
  esac
  
  K8S_DIR="${SCRIPT_DIR}/kubernetes/${K8S_MODE}"
  
  if [[ -x "${K8S_DIR}/restart.sh" ]]; then
    "${K8S_DIR}/restart.sh"
  else
    echo -e "${RED}错误: 重启脚本不存在: ${K8S_DIR}/restart.sh${NC}"
    exit 1
  fi
}

# Kubernetes 状态
status_kubernetes() {
  echo -e "\n${BLUE}Kubernetes 部署状态:${NC}"
  echo ""
  
  # 获取所有 Rainbow Bridge 部署
  local namespaces
  namespaces=$(kubectl get deployments --all-namespaces -l app=rainbow-bridge -o jsonpath='{range .items[*]}{.metadata.namespace}{"\n"}{end}' 2>/dev/null | sort -u)
  
  if [[ -z "$namespaces" ]]; then
    echo -e "  ${YELLOW}未发现 Rainbow Bridge 部署${NC}"
    return
  fi
  
  for ns in $namespaces; do
    local ready
    ready=$(kubectl get deployment rainbow-bridge -n "$ns" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    local total
    total=$(kubectl get deployment rainbow-bridge -n "$ns" -o jsonpath='{.status.replicas}' 2>/dev/null || echo "0")
    
    local color="$GREEN"
    [[ "$ready" != "$total" ]] && color="$YELLOW"
    [[ "$ready" == "0" ]] && color="$RED"
    
    printf "  %-20s ${color}[Pod: %s/%s]${NC}\n" "$ns" "$ready" "$total"
  done
}

# 部署命令
cmd_deploy() {
  select_platform
  
  case "$PLATFORM" in
    docker-compose)
      deploy_docker_compose
      ;;
    kubernetes)
      deploy_kubernetes
      ;;
  esac
}

# 销毁命令
cmd_destroy() {
  select_platform
  
  case "$PLATFORM" in
    docker-compose)
      destroy_docker_compose
      ;;
    kubernetes)
      destroy_kubernetes
      ;;
  esac
}

# 重启命令
cmd_restart() {
  select_platform
  
  case "$PLATFORM" in
    docker-compose)
      select_docker_compose_mode
      cd "$DC_DIR"
      docker compose restart
      echo -e "${GREEN}✓ 服务已重启${NC}"
      ;;
    kubernetes)
      restart_kubernetes
      ;;
  esac
}

# 状态命令
cmd_status() {
  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}Rainbow Bridge 部署状态${NC}"
  echo -e "${BLUE}========================================${NC}"
  
  # Docker Compose 状态
  if check_command docker && docker info >/dev/null 2>&1; then
    status_docker_compose
  fi
  
  # Kubernetes 状态
  if check_command kubectl && kubectl cluster-info >/dev/null 2>&1; then
    status_kubernetes
  fi
}

# 主函数
main() {
  # 解析命令
  local cmd="${1:-deploy}"
  
  case "$cmd" in
    -h|--help)
      usage
      exit 0
      ;;
    -v|--version)
      echo "Rainbow Bridge Deploy Tool v${VERSION}"
      exit 0
      ;;
    deploy)
      show_banner
      cmd_deploy
      ;;
    destroy)
      show_banner
      cmd_destroy
      ;;
    restart)
      show_banner
      cmd_restart
      ;;
    status)
      show_banner
      cmd_status
      ;;
    *)
      echo -e "${RED}错误: 未知命令 '$cmd'${NC}"
      usage
      exit 1
      ;;
  esac
}

main "$@"
