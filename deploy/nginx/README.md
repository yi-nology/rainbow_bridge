## Nginx Example for Rainbow Bridge

本目录提供一个独立的 Nginx 反向代理示例，便于将 Rainbow Bridge 暴露在统一的 `/rainbow-bridge/` 前缀下。

### 文件说明

- `rainbow-bridge.conf`：默认 server 配置，监听 80 端口并将 `/rainbow-bridge/` 的所有请求转发到上游 `rainbow-bridge:8080`，同时做了 gzip 优化。根路径会 302 到 `/rainbow-bridge/`。

### 使用方式

#### Docker 运行

```bash
docker run -d \
  --name rainbow-bridge-nginx \
  --network <your_network> \
  -p 8080:80 \
  -v $(pwd)/deploy/nginx/rainbow-bridge.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:1.25-alpine
```

确保 Nginx 与 Rainbow Bridge 服务在同一个网络（如 Docker Compose 自定义网络）并且上游主机名 `rainbow-bridge` 可解析到应用容器。如果实际主机名不同，可在挂载前修改 `proxy_pass`。

#### Kubernetes / 物理机

把 `rainbow-bridge.conf` 按需放入 `/etc/nginx/conf.d/` 或创建 ConfigMap 挂载到 Nginx Pod 中；若端口或主机名不同，同样改动 `proxy_pass` 即可。

### 常见自定义

1. **HTTPS**：可在 `server` 块里增加证书配置，并把 `listen 80` 改成 `listen 443 ssl`。
2. **鉴权**：在 `location /rainbow-bridge/` 中加入 Basic Auth、JWT 校验等。
3. **访问日志**：根据需要自定义 `log_format` 或使用集中日志方案。

该配置与 `deploy/docker-compose/docker-compose.yaml`、`deploy/kubernetes/rainbow-bridge.yaml` 相互独立，可在任何需要的反向代理场景下复用。
