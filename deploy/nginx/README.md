# Nginx 反向代理配置

本目录提供了 Rainbow Bridge 的 Nginx 反向代理配置文件，用于将流量转发到 Rainbow Bridge 服务。

## 配置说明

### 配置文件

- `rainbow-bridge.conf`: Rainbow Bridge 的 Nginx 反向代理配置文件

### 使用方法

1. **安装 Nginx**

   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install nginx

   # CentOS/RHEL
   sudo yum install nginx
   ```

2. **复制配置文件**

   ```bash
   sudo cp rainbow-bridge.conf /etc/nginx/conf.d/
   ```

3. **修改配置文件**

   根据实际部署情况，修改配置文件中的以下内容：

   - `upstream rainbow_bridge` 中的服务器地址和端口
   - `server_name` 中的域名
   - 如需部署静态文件，取消注释 `root` 指令并设置正确的路径

4. **检查配置**

   ```bash
   sudo nginx -t
   ```

5. **重启 Nginx**

   ```bash
   sudo systemctl restart nginx
   ```

## 反向代理配置详解

### 核心配置

- **upstream**：定义后端服务器集群
- **server**：配置虚拟主机
- **location**：定义请求路径的处理规则
- **proxy_pass**：将请求转发到后端服务器

### 重要参数

- `proxy_set_header`：设置请求头信息
- `proxy_http_version`：设置 HTTP 版本
- `proxy_set_header Upgrade` 和 `proxy_set_header Connection`：支持 WebSocket 连接

## 常见问题

### 404 错误

- 检查后端服务是否正常运行
- 检查 `upstream` 配置是否正确
- 检查 `proxy_pass` 路径是否正确

### 502 错误

- 后端服务未运行或无法访问
- 网络连接问题
- 防火墙阻止了连接

### 性能优化

- 增加 `proxy_buffers` 配置
- 启用 `gzip` 压缩
- 配置 `keepalive` 连接

## 示例配置

### 基本配置

```nginx
upstream rainbow_bridge {
    server localhost:8080;
}

server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://rainbow_bridge;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### HTTPS 配置

```nginx
upstream rainbow_bridge {
    server localhost:8080;
}

server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;

    location / {
        proxy_pass http://rainbow_bridge;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
