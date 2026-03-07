# 反向代理配置

本指南提供常见反向代理服务器（Nginx、Apache、Caddy）的配置示例，帮助你将虹桥计划部署在生产环境中。

## 概述

反向代理的作用：
- **HTTPS 终止**：处理 SSL/TLS 证书
- **域名绑定**：将服务绑定到特定域名
- **负载均衡**：分发请求到多个后端实例
- **访问控制**：IP 白名单、速率限制等

## Nginx 配置

### 基础 HTTP 配置

```nginx
server {
    listen 80;
    server_name rainbow-bridge.example.com;

    location /rainbow-bridge/ {
        proxy_pass http://127.0.0.1:8080/rainbow-bridge/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### HTTPS 配置（推荐）

使用 Let's Encrypt 免费证书：

```nginx
server {
    listen 80;
    server_name rainbow-bridge.example.com;
    
    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name rainbow-bridge.example.com;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/rainbow-bridge.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rainbow-bridge.example.com/privkey.pem;
    
    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    location /rainbow-bridge/ {
        proxy_pass http://127.0.0.1:8080/rainbow-bridge/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket 支持（如需要）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### 文件上传大小限制

如果需要上传大文件：

```nginx
http {
    # 设置最大上传大小
    client_max_body_size 100M;
}

server {
    # ... 其他配置
    
    location /rainbow-bridge/ {
        # ... 其他代理配置
        
        # 上传文件大小限制
        client_max_body_size 100M;
    }
}
```

### 速率限制

防止 API 被滥用：

```nginx
http {
    # 定义限流区域
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=upload_limit:10m rate=1r/s;
}

server {
    location /rainbow-bridge/api/ {
        limit_req zone=api_limit burst=20 nodelay;
        # ... 其他代理配置
    }
    
    location /rainbow-bridge/api/v1/asset/upload {
        limit_req zone=upload_limit burst=5 nodelay;
        # ... 其他代理配置
    }
}
```

### IP 白名单

限制管理界面访问：

```nginx
server {
    location /rainbow-bridge/ {
        # 允许的内网 IP
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        
        # 允许特定 IP
        allow 203.0.113.100;
        
        # 拒绝其他所有
        deny all;
        
        # ... 其他代理配置
    }
}
```

### 基础认证

为管理界面添加密码保护：

```nginx
server {
    location /rainbow-bridge/ {
        auth_basic "Rainbow Bridge Admin";
        auth_basic_user_file /etc/nginx/.htpasswd;
        
        # ... 其他代理配置
    }
}
```

生成密码文件：
```bash
# 安装 htpasswd 工具
sudo apt install apache2-utils

# 创建密码文件
sudo htpasswd -c /etc/nginx/.htpasswd admin

# 重启 Nginx
sudo nginx -s reload
```

## Apache 配置

### 基础反向代理

启用必要的模块：
```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod ssl
sudo a2enmod headers
```

虚拟主机配置：

```apache
<VirtualHost *:80>
    ServerName rainbow-bridge.example.com
    
    ProxyPreserveHost On
    ProxyPass /rainbow-bridge/ http://127.0.0.1:8080/rainbow-bridge/
    ProxyPassReverse /rainbow-bridge/ http://127.0.0.1:8080/rainbow-bridge/
    
    # 请求头设置
    RequestHeader set X-Forwarded-Proto "http"
</VirtualHost>
```

### HTTPS 配置

```apache
<VirtualHost *:80>
    ServerName rainbow-bridge.example.com
    
    # 重定向到 HTTPS
    Redirect permanent / https://rainbow-bridge.example.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName rainbow-bridge.example.com
    
    # SSL 配置
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/rainbow-bridge.example.com/cert.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/rainbow-bridge.example.com/privkey.pem
    SSLCertificateChainFile /etc/letsencrypt/live/rainbow-bridge.example.com/chain.pem
    
    # SSL 安全设置
    SSLProtocol all -SSLv2 -SSLv3
    SSLCipherSuite HIGH:!aNULL:!MD5
    
    ProxyPreserveHost On
    ProxyPass /rainbow-bridge/ http://127.0.0.1:8080/rainbow-bridge/
    ProxyPassReverse /rainbow-bridge/ http://127.0.0.1:8080/rainbow-bridge/
    
    RequestHeader set X-Forwarded-Proto "https"
</VirtualHost>
```

### 文件上传大小限制

```apache
# 在 apache2.conf 或虚拟主机配置中
LimitRequestBody 104857600  # 100MB
```

## Caddy 配置

Caddy 是一个现代化的 Web 服务器，自动管理 HTTPS 证书。

### 基础配置

`Caddyfile`:
```
rainbow-bridge.example.com {
    reverse_proxy /rainbow-bridge/* localhost:8080
}
```

### 完整配置

```
rainbow-bridge.example.com {
    # 自动 HTTPS
    # Caddy 会自动申请和续期 Let's Encrypt 证书
    
    # 日志
    log {
        output file /var/log/caddy/rainbow-bridge.log
        format json
    }
    
    # 反向代理
    reverse_proxy /rainbow-bridge/* localhost:8080 {
        # 健康检查
        health_uri /rainbow-bridge/ping
        health_interval 30s
        
        # 请求头
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
    
    # 文件上传大小限制
    request_body {
        max_size 100MB
    }
}
```

### 内网部署（无 HTTPS）

```
:80 {
    reverse_proxy /rainbow-bridge/* localhost:8080
}
```

### 多域名配置

```
# 主域名
rainbow-bridge.example.com {
    reverse_proxy /rainbow-bridge/* localhost:8080
}

# 内网域名（可选）
rainbow-bridge.internal.company.com {
    tls internal
    reverse_proxy /rainbow-bridge/* localhost:8080
}
```

## Traefik 配置

如果使用 Docker Compose 部署：

`docker-compose.yml`:
```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
      - "8081:8080"  # Traefik Dashboard
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "./letsencrypt:/letsencrypt"
  
  rainbow-bridge:
    image: ghcr.io/yi-nology/rainbow_bridge-api:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.rainbow.rule=PathPrefix(`/rainbow-bridge`)"
      - "traefik.http.routers.rainbow.entrypoints=web"
      - "traefik.http.routers.rainbow-secure.rule=PathPrefix(`/rainbow-bridge`)"
      - "traefik.http.routers.rainbow-secure.entrypoints=websecure"
      - "traefik.http.routers.rainbow-secure.tls=true"
      - "traefik.http.routers.rainbow-secure.tls.certresolver=letsencrypt"
      - "traefik.http.services.rainbow.loadbalancer.server.port=8080"
    volumes:
      - ./data:/app/data
```

## 常见问题

### Q: 如何验证反向代理配置？

A: 使用以下命令测试：

```bash
# 测试配置语法
sudo nginx -t

# 测试访问
curl -I https://rainbow-bridge.example.com/rainbow-bridge/ping

# 查看日志
sudo tail -f /var/log/nginx/access.log
```

### Q: 如何处理 CORS 问题？

A: 在 Nginx 中添加 CORS 头：

```nginx
location /rainbow-bridge/api/ {
    # CORS 配置
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
    add_header Access-Control-Allow-Headers "Content-Type, x-environment, x-pipeline";
    
    # 处理预检请求
    if ($request_method = OPTIONS) {
        return 204;
    }
    
    # ... 其他代理配置
}
```

### Q: 如何配置 WebSocket？

A: Nginx 配置：

```nginx
location /rainbow-bridge/ws/ {
    proxy_pass http://127.0.0.1:8080/rainbow-bridge/ws/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

### Q: 后端如何获取真实 IP？

A: 确保传递以下请求头：

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

后端应用会自动解析这些头部获取真实客户端 IP。

## 相关文档

- [安装部署](./installation) - 部署方式选择
- [平台对接](./integration/frontend) - 客户端集成
- [导出配置](./ui-config/export) - 静态站点导出
