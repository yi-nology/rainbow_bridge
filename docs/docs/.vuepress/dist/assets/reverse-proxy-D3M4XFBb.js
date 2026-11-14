import{i as e,r as t,s as n,t as r}from"./app-FtcyK8lR.js";var i=JSON.parse(`{"path":"/guide/reverse-proxy.html","title":"反向代理配置","lang":"zh-CN","frontmatter":{},"git":{"updatedTime":1772867338000,"contributors":[{"name":"MurphyYi","username":"MurphyYi","email":"zy84338719@hotmail.com","commits":1,"url":"https://github.com/MurphyYi"}],"changelog":[{"hash":"4087e1f9a0c378c7e741702c747d9d7adca98aa6","time":1772867338000,"email":"zy84338719@hotmail.com","author":"MurphyYi","message":"docs: 添加反向代理配置文档"}]},"filePathRelative":"guide/reverse-proxy.md"}`),a={name:`reverse-proxy.md`};function o(r,i,a,o,s,c){return n(),t(`div`,null,[...i[0]||=[e(`<h1 id="反向代理配置" tabindex="-1"><a class="header-anchor" href="#反向代理配置">#</a> 反向代理配置</h1><p>本指南提供常见反向代理服务器（Nginx、Apache、Caddy）的配置示例，帮助你将虹桥计划部署在生产环境中。</p><h2 id="概述" tabindex="-1"><a class="header-anchor" href="#概述">#</a> 概述</h2><p>反向代理的作用：</p><ul><li><strong>HTTPS 终止</strong>：处理 SSL/TLS 证书</li><li><strong>域名绑定</strong>：将服务绑定到特定域名</li><li><strong>负载均衡</strong>：分发请求到多个后端实例</li><li><strong>访问控制</strong>：IP 白名单、速率限制等</li></ul><h2 id="nginx-配置" tabindex="-1"><a class="header-anchor" href="#nginx-配置">#</a> Nginx 配置</h2><h3 id="基础-http-配置" tabindex="-1"><a class="header-anchor" href="#基础-http-配置">#</a> 基础 HTTP 配置</h3><div class="language-nginx line-numbers-mode" data-highlighter="prismjs" data-ext="nginx"><pre><code class="language-nginx"><span class="line"><span class="token directive"><span class="token keyword">server</span></span> <span class="token punctuation">{</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">listen</span> <span class="token number">80</span></span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">server_name</span> rainbow-bridge.example.com</span><span class="token punctuation">;</span></span>
<span class="line"></span>
<span class="line">    <span class="token directive"><span class="token keyword">location</span> /rainbow-bridge/</span> <span class="token punctuation">{</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_pass</span> http://127.0.0.1:8080/rainbow-bridge/</span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_set_header</span> Host <span class="token variable">$host</span></span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_set_header</span> X-Real-IP <span class="token variable">$remote_addr</span></span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_set_header</span> X-Forwarded-For <span class="token variable">$proxy_add_x_forwarded_for</span></span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_set_header</span> X-Forwarded-Proto <span class="token variable">$scheme</span></span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token punctuation">}</span></span>
<span class="line"><span class="token punctuation">}</span></span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="https-配置-推荐" tabindex="-1"><a class="header-anchor" href="#https-配置-推荐">#</a> HTTPS 配置（推荐）</h3><p>使用 Let&#39;s Encrypt 免费证书：</p><div class="language-nginx line-numbers-mode" data-highlighter="prismjs" data-ext="nginx"><pre><code class="language-nginx"><span class="line"><span class="token directive"><span class="token keyword">server</span></span> <span class="token punctuation">{</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">listen</span> <span class="token number">80</span></span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">server_name</span> rainbow-bridge.example.com</span><span class="token punctuation">;</span></span>
<span class="line">    </span>
<span class="line">    <span class="token comment"># 重定向到 HTTPS</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">return</span> <span class="token number">301</span> https://<span class="token variable">$server_name</span><span class="token variable">$request_uri</span></span><span class="token punctuation">;</span></span>
<span class="line"><span class="token punctuation">}</span></span>
<span class="line"></span>
<span class="line"><span class="token directive"><span class="token keyword">server</span></span> <span class="token punctuation">{</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">listen</span> <span class="token number">443</span> ssl http2</span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">server_name</span> rainbow-bridge.example.com</span><span class="token punctuation">;</span></span>
<span class="line"></span>
<span class="line">    <span class="token comment"># SSL 证书配置</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">ssl_certificate</span> /etc/letsencrypt/live/rainbow-bridge.example.com/fullchain.pem</span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">ssl_certificate_key</span> /etc/letsencrypt/live/rainbow-bridge.example.com/privkey.pem</span><span class="token punctuation">;</span></span>
<span class="line">    </span>
<span class="line">    <span class="token comment"># SSL 安全配置</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">ssl_protocols</span> TLSv1.2 TLSv1.3</span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">ssl_prefer_server_ciphers</span> <span class="token boolean">on</span></span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">ssl_ciphers</span> ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256</span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">ssl_session_cache</span> shared:SSL:10m</span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">ssl_session_timeout</span> <span class="token number">10m</span></span><span class="token punctuation">;</span></span>
<span class="line"></span>
<span class="line">    <span class="token directive"><span class="token keyword">location</span> /rainbow-bridge/</span> <span class="token punctuation">{</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_pass</span> http://127.0.0.1:8080/rainbow-bridge/</span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_set_header</span> Host <span class="token variable">$host</span></span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_set_header</span> X-Real-IP <span class="token variable">$remote_addr</span></span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_set_header</span> X-Forwarded-For <span class="token variable">$proxy_add_x_forwarded_for</span></span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_set_header</span> X-Forwarded-Proto <span class="token variable">$scheme</span></span><span class="token punctuation">;</span></span>
<span class="line">        </span>
<span class="line">        <span class="token comment"># WebSocket 支持（如需要）</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_http_version</span> 1.1</span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_set_header</span> Upgrade <span class="token variable">$http_upgrade</span></span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_set_header</span> Connection <span class="token string">&quot;upgrade&quot;</span></span><span class="token punctuation">;</span></span>
<span class="line">        </span>
<span class="line">        <span class="token comment"># 超时设置</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_connect_timeout</span> <span class="token number">60s</span></span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_send_timeout</span> <span class="token number">60s</span></span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">proxy_read_timeout</span> <span class="token number">60s</span></span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token punctuation">}</span></span>
<span class="line"><span class="token punctuation">}</span></span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="文件上传大小限制" tabindex="-1"><a class="header-anchor" href="#文件上传大小限制">#</a> 文件上传大小限制</h3><p>如果需要上传大文件：</p><div class="language-nginx line-numbers-mode" data-highlighter="prismjs" data-ext="nginx"><pre><code class="language-nginx"><span class="line"><span class="token directive"><span class="token keyword">http</span></span> <span class="token punctuation">{</span></span>
<span class="line">    <span class="token comment"># 设置最大上传大小</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">client_max_body_size</span> <span class="token number">100M</span></span><span class="token punctuation">;</span></span>
<span class="line"><span class="token punctuation">}</span></span>
<span class="line"></span>
<span class="line"><span class="token directive"><span class="token keyword">server</span></span> <span class="token punctuation">{</span></span>
<span class="line">    <span class="token comment"># ... 其他配置</span></span>
<span class="line">    </span>
<span class="line">    <span class="token directive"><span class="token keyword">location</span> /rainbow-bridge/</span> <span class="token punctuation">{</span></span>
<span class="line">        <span class="token comment"># ... 其他代理配置</span></span>
<span class="line">        </span>
<span class="line">        <span class="token comment"># 上传文件大小限制</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">client_max_body_size</span> <span class="token number">100M</span></span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token punctuation">}</span></span>
<span class="line"><span class="token punctuation">}</span></span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="速率限制" tabindex="-1"><a class="header-anchor" href="#速率限制">#</a> 速率限制</h3><p>防止 API 被滥用：</p><div class="language-nginx line-numbers-mode" data-highlighter="prismjs" data-ext="nginx"><pre><code class="language-nginx"><span class="line"><span class="token directive"><span class="token keyword">http</span></span> <span class="token punctuation">{</span></span>
<span class="line">    <span class="token comment"># 定义限流区域</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">limit_req_zone</span> <span class="token variable">$binary_remote_addr</span> zone=api_limit:10m rate=10r/s</span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">limit_req_zone</span> <span class="token variable">$binary_remote_addr</span> zone=upload_limit:10m rate=1r/s</span><span class="token punctuation">;</span></span>
<span class="line"><span class="token punctuation">}</span></span>
<span class="line"></span>
<span class="line"><span class="token directive"><span class="token keyword">server</span></span> <span class="token punctuation">{</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">location</span> /rainbow-bridge/api/</span> <span class="token punctuation">{</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">limit_req</span> zone=api_limit burst=20 nodelay</span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token comment"># ... 其他代理配置</span></span>
<span class="line">    <span class="token punctuation">}</span></span>
<span class="line">    </span>
<span class="line">    <span class="token directive"><span class="token keyword">location</span> /rainbow-bridge/api/v1/asset/upload</span> <span class="token punctuation">{</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">limit_req</span> zone=upload_limit burst=5 nodelay</span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token comment"># ... 其他代理配置</span></span>
<span class="line">    <span class="token punctuation">}</span></span>
<span class="line"><span class="token punctuation">}</span></span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="ip-白名单" tabindex="-1"><a class="header-anchor" href="#ip-白名单">#</a> IP 白名单</h3><p>限制管理界面访问：</p><div class="language-nginx line-numbers-mode" data-highlighter="prismjs" data-ext="nginx"><pre><code class="language-nginx"><span class="line"><span class="token directive"><span class="token keyword">server</span></span> <span class="token punctuation">{</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">location</span> /rainbow-bridge/</span> <span class="token punctuation">{</span></span>
<span class="line">        <span class="token comment"># 允许的内网 IP</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">allow</span> 10.0.0.0/8</span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">allow</span> 172.16.0.0/12</span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">allow</span> 192.168.0.0/16</span><span class="token punctuation">;</span></span>
<span class="line">        </span>
<span class="line">        <span class="token comment"># 允许特定 IP</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">allow</span> 203.0.113.100</span><span class="token punctuation">;</span></span>
<span class="line">        </span>
<span class="line">        <span class="token comment"># 拒绝其他所有</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">deny</span> all</span><span class="token punctuation">;</span></span>
<span class="line">        </span>
<span class="line">        <span class="token comment"># ... 其他代理配置</span></span>
<span class="line">    <span class="token punctuation">}</span></span>
<span class="line"><span class="token punctuation">}</span></span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="基础认证" tabindex="-1"><a class="header-anchor" href="#基础认证">#</a> 基础认证</h3><p>为管理界面添加密码保护：</p><div class="language-nginx line-numbers-mode" data-highlighter="prismjs" data-ext="nginx"><pre><code class="language-nginx"><span class="line"><span class="token directive"><span class="token keyword">server</span></span> <span class="token punctuation">{</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">location</span> /rainbow-bridge/</span> <span class="token punctuation">{</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">auth_basic</span> <span class="token string">&quot;Rainbow Bridge Admin&quot;</span></span><span class="token punctuation">;</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">auth_basic_user_file</span> /etc/nginx/.htpasswd</span><span class="token punctuation">;</span></span>
<span class="line">        </span>
<span class="line">        <span class="token comment"># ... 其他代理配置</span></span>
<span class="line">    <span class="token punctuation">}</span></span>
<span class="line"><span class="token punctuation">}</span></span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><p>生成密码文件：</p><div class="language-bash line-numbers-mode" data-highlighter="prismjs" data-ext="sh"><pre><code class="language-bash"><span class="line"><span class="token comment"># 安装 htpasswd 工具</span></span>
<span class="line"><span class="token function">sudo</span> <span class="token function">apt</span> <span class="token function">install</span> apache2-utils</span>
<span class="line"></span>
<span class="line"><span class="token comment"># 创建密码文件</span></span>
<span class="line"><span class="token function">sudo</span> htpasswd <span class="token parameter variable">-c</span> /etc/nginx/.htpasswd admin</span>
<span class="line"></span>
<span class="line"><span class="token comment"># 重启 Nginx</span></span>
<span class="line"><span class="token function">sudo</span> nginx <span class="token parameter variable">-s</span> reload</span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="apache-配置" tabindex="-1"><a class="header-anchor" href="#apache-配置">#</a> Apache 配置</h2><h3 id="基础反向代理" tabindex="-1"><a class="header-anchor" href="#基础反向代理">#</a> 基础反向代理</h3><p>启用必要的模块：</p><div class="language-bash line-numbers-mode" data-highlighter="prismjs" data-ext="sh"><pre><code class="language-bash"><span class="line"><span class="token function">sudo</span> a2enmod proxy</span>
<span class="line"><span class="token function">sudo</span> a2enmod proxy_http</span>
<span class="line"><span class="token function">sudo</span> a2enmod ssl</span>
<span class="line"><span class="token function">sudo</span> a2enmod headers</span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><p>虚拟主机配置：</p><div class="language-apache line-numbers-mode" data-highlighter="prismjs" data-ext="apache"><pre><code class="language-apache"><span class="line">&lt;VirtualHost *:80&gt;</span>
<span class="line">    ServerName rainbow-bridge.example.com</span>
<span class="line">    </span>
<span class="line">    ProxyPreserveHost On</span>
<span class="line">    ProxyPass /rainbow-bridge/ http://127.0.0.1:8080/rainbow-bridge/</span>
<span class="line">    ProxyPassReverse /rainbow-bridge/ http://127.0.0.1:8080/rainbow-bridge/</span>
<span class="line">    </span>
<span class="line">    # 请求头设置</span>
<span class="line">    RequestHeader set X-Forwarded-Proto &quot;http&quot;</span>
<span class="line">&lt;/VirtualHost&gt;</span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="https-配置" tabindex="-1"><a class="header-anchor" href="#https-配置">#</a> HTTPS 配置</h3><div class="language-apache line-numbers-mode" data-highlighter="prismjs" data-ext="apache"><pre><code class="language-apache"><span class="line">&lt;VirtualHost *:80&gt;</span>
<span class="line">    ServerName rainbow-bridge.example.com</span>
<span class="line">    </span>
<span class="line">    # 重定向到 HTTPS</span>
<span class="line">    Redirect permanent / https://rainbow-bridge.example.com/</span>
<span class="line">&lt;/VirtualHost&gt;</span>
<span class="line"></span>
<span class="line">&lt;VirtualHost *:443&gt;</span>
<span class="line">    ServerName rainbow-bridge.example.com</span>
<span class="line">    </span>
<span class="line">    # SSL 配置</span>
<span class="line">    SSLEngine on</span>
<span class="line">    SSLCertificateFile /etc/letsencrypt/live/rainbow-bridge.example.com/cert.pem</span>
<span class="line">    SSLCertificateKeyFile /etc/letsencrypt/live/rainbow-bridge.example.com/privkey.pem</span>
<span class="line">    SSLCertificateChainFile /etc/letsencrypt/live/rainbow-bridge.example.com/chain.pem</span>
<span class="line">    </span>
<span class="line">    # SSL 安全设置</span>
<span class="line">    SSLProtocol all -SSLv2 -SSLv3</span>
<span class="line">    SSLCipherSuite HIGH:!aNULL:!MD5</span>
<span class="line">    </span>
<span class="line">    ProxyPreserveHost On</span>
<span class="line">    ProxyPass /rainbow-bridge/ http://127.0.0.1:8080/rainbow-bridge/</span>
<span class="line">    ProxyPassReverse /rainbow-bridge/ http://127.0.0.1:8080/rainbow-bridge/</span>
<span class="line">    </span>
<span class="line">    RequestHeader set X-Forwarded-Proto &quot;https&quot;</span>
<span class="line">&lt;/VirtualHost&gt;</span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="文件上传大小限制-1" tabindex="-1"><a class="header-anchor" href="#文件上传大小限制-1">#</a> 文件上传大小限制</h3><div class="language-apache line-numbers-mode" data-highlighter="prismjs" data-ext="apache"><pre><code class="language-apache"><span class="line"># 在 apache2.conf 或虚拟主机配置中</span>
<span class="line">LimitRequestBody 104857600  # 100MB</span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="caddy-配置" tabindex="-1"><a class="header-anchor" href="#caddy-配置">#</a> Caddy 配置</h2><p>Caddy 是一个现代化的 Web 服务器，自动管理 HTTPS 证书。</p><h3 id="基础配置" tabindex="-1"><a class="header-anchor" href="#基础配置">#</a> 基础配置</h3><p><code>Caddyfile</code>:</p><div class="language-text line-numbers-mode" data-highlighter="prismjs" data-ext="text"><pre><code class="language-text"><span class="line">rainbow-bridge.example.com {</span>
<span class="line">    reverse_proxy /rainbow-bridge/* localhost:8080</span>
<span class="line">}</span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="完整配置" tabindex="-1"><a class="header-anchor" href="#完整配置">#</a> 完整配置</h3><div class="language-text line-numbers-mode" data-highlighter="prismjs" data-ext="text"><pre><code class="language-text"><span class="line">rainbow-bridge.example.com {</span>
<span class="line">    # 自动 HTTPS</span>
<span class="line">    # Caddy 会自动申请和续期 Let&#39;s Encrypt 证书</span>
<span class="line">    </span>
<span class="line">    # 日志</span>
<span class="line">    log {</span>
<span class="line">        output file /var/log/caddy/rainbow-bridge.log</span>
<span class="line">        format json</span>
<span class="line">    }</span>
<span class="line">    </span>
<span class="line">    # 反向代理</span>
<span class="line">    reverse_proxy /rainbow-bridge/* localhost:8080 {</span>
<span class="line">        # 健康检查</span>
<span class="line">        health_uri /rainbow-bridge/ping</span>
<span class="line">        health_interval 30s</span>
<span class="line">        </span>
<span class="line">        # 请求头</span>
<span class="line">        header_up X-Real-IP {remote_host}</span>
<span class="line">        header_up X-Forwarded-For {remote_host}</span>
<span class="line">        header_up X-Forwarded-Proto {scheme}</span>
<span class="line">    }</span>
<span class="line">    </span>
<span class="line">    # 文件上传大小限制</span>
<span class="line">    request_body {</span>
<span class="line">        max_size 100MB</span>
<span class="line">    }</span>
<span class="line">}</span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="内网部署-无-https" tabindex="-1"><a class="header-anchor" href="#内网部署-无-https">#</a> 内网部署（无 HTTPS）</h3><div class="language-text line-numbers-mode" data-highlighter="prismjs" data-ext="text"><pre><code class="language-text"><span class="line">:80 {</span>
<span class="line">    reverse_proxy /rainbow-bridge/* localhost:8080</span>
<span class="line">}</span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="多域名配置" tabindex="-1"><a class="header-anchor" href="#多域名配置">#</a> 多域名配置</h3><div class="language-text line-numbers-mode" data-highlighter="prismjs" data-ext="text"><pre><code class="language-text"><span class="line"># 主域名</span>
<span class="line">rainbow-bridge.example.com {</span>
<span class="line">    reverse_proxy /rainbow-bridge/* localhost:8080</span>
<span class="line">}</span>
<span class="line"></span>
<span class="line"># 内网域名（可选）</span>
<span class="line">rainbow-bridge.internal.company.com {</span>
<span class="line">    tls internal</span>
<span class="line">    reverse_proxy /rainbow-bridge/* localhost:8080</span>
<span class="line">}</span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="traefik-配置" tabindex="-1"><a class="header-anchor" href="#traefik-配置">#</a> Traefik 配置</h2><p>如果使用 Docker Compose 部署：</p><p><code>docker-compose.yml</code>:</p><div class="language-yaml line-numbers-mode" data-highlighter="prismjs" data-ext="yml"><pre><code class="language-yaml"><span class="line"><span class="token key atrule">version</span><span class="token punctuation">:</span> <span class="token string">&#39;3.8&#39;</span></span>
<span class="line"></span>
<span class="line"><span class="token key atrule">services</span><span class="token punctuation">:</span></span>
<span class="line">  <span class="token key atrule">traefik</span><span class="token punctuation">:</span></span>
<span class="line">    <span class="token key atrule">image</span><span class="token punctuation">:</span> traefik<span class="token punctuation">:</span>v2.10</span>
<span class="line">    <span class="token key atrule">command</span><span class="token punctuation">:</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;--api.insecure=true&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;--providers.docker=true&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;--entrypoints.web.address=:80&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;--entrypoints.websecure.address=:443&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;--certificatesresolvers.letsencrypt.acme.tlschallenge=true&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;--certificatesresolvers.letsencrypt.acme.email=admin@example.com&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json&quot;</span></span>
<span class="line">    <span class="token key atrule">ports</span><span class="token punctuation">:</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;80:80&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;443:443&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;8081:8080&quot;</span>  <span class="token comment"># Traefik Dashboard</span></span>
<span class="line">    <span class="token key atrule">volumes</span><span class="token punctuation">:</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;/var/run/docker.sock:/var/run/docker.sock:ro&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;./letsencrypt:/letsencrypt&quot;</span></span>
<span class="line">  </span>
<span class="line">  <span class="token key atrule">rainbow-bridge</span><span class="token punctuation">:</span></span>
<span class="line">    <span class="token key atrule">image</span><span class="token punctuation">:</span> ghcr.io/yi<span class="token punctuation">-</span>nology/rainbow_bridge<span class="token punctuation">-</span>api<span class="token punctuation">:</span>latest</span>
<span class="line">    <span class="token key atrule">labels</span><span class="token punctuation">:</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;traefik.enable=true&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;traefik.http.routers.rainbow.rule=PathPrefix(\`/rainbow-bridge\`)&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;traefik.http.routers.rainbow.entrypoints=web&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;traefik.http.routers.rainbow-secure.rule=PathPrefix(\`/rainbow-bridge\`)&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;traefik.http.routers.rainbow-secure.entrypoints=websecure&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;traefik.http.routers.rainbow-secure.tls=true&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;traefik.http.routers.rainbow-secure.tls.certresolver=letsencrypt&quot;</span></span>
<span class="line">      <span class="token punctuation">-</span> <span class="token string">&quot;traefik.http.services.rainbow.loadbalancer.server.port=8080&quot;</span></span>
<span class="line">    <span class="token key atrule">volumes</span><span class="token punctuation">:</span></span>
<span class="line">      <span class="token punctuation">-</span> ./data<span class="token punctuation">:</span>/app/data</span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="常见问题" tabindex="-1"><a class="header-anchor" href="#常见问题">#</a> 常见问题</h2><h3 id="q-如何验证反向代理配置" tabindex="-1"><a class="header-anchor" href="#q-如何验证反向代理配置">#</a> Q: 如何验证反向代理配置？</h3><p>A: 使用以下命令测试：</p><div class="language-bash line-numbers-mode" data-highlighter="prismjs" data-ext="sh"><pre><code class="language-bash"><span class="line"><span class="token comment"># 测试配置语法</span></span>
<span class="line"><span class="token function">sudo</span> nginx <span class="token parameter variable">-t</span></span>
<span class="line"></span>
<span class="line"><span class="token comment"># 测试访问</span></span>
<span class="line"><span class="token function">curl</span> <span class="token parameter variable">-I</span> https://rainbow-bridge.example.com/rainbow-bridge/ping</span>
<span class="line"></span>
<span class="line"><span class="token comment"># 查看日志</span></span>
<span class="line"><span class="token function">sudo</span> <span class="token function">tail</span> <span class="token parameter variable">-f</span> /var/log/nginx/access.log</span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="q-如何处理-cors-问题" tabindex="-1"><a class="header-anchor" href="#q-如何处理-cors-问题">#</a> Q: 如何处理 CORS 问题？</h3><p>A: 在 Nginx 中添加 CORS 头：</p><div class="language-nginx line-numbers-mode" data-highlighter="prismjs" data-ext="nginx"><pre><code class="language-nginx"><span class="line"><span class="token directive"><span class="token keyword">location</span> /rainbow-bridge/api/</span> <span class="token punctuation">{</span></span>
<span class="line">    <span class="token comment"># CORS 配置</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">add_header</span> Access-Control-Allow-Origin *</span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">add_header</span> Access-Control-Allow-Methods <span class="token string">&quot;GET, POST, OPTIONS&quot;</span></span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">add_header</span> Access-Control-Allow-Headers <span class="token string">&quot;Content-Type, x-environment, x-pipeline&quot;</span></span><span class="token punctuation">;</span></span>
<span class="line">    </span>
<span class="line">    <span class="token comment"># 处理预检请求</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">if</span> (<span class="token variable">$request_method</span> = OPTIONS)</span> <span class="token punctuation">{</span></span>
<span class="line">        <span class="token directive"><span class="token keyword">return</span> <span class="token number">204</span></span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token punctuation">}</span></span>
<span class="line">    </span>
<span class="line">    <span class="token comment"># ... 其他代理配置</span></span>
<span class="line"><span class="token punctuation">}</span></span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="q-如何配置-websocket" tabindex="-1"><a class="header-anchor" href="#q-如何配置-websocket">#</a> Q: 如何配置 WebSocket？</h3><p>A: Nginx 配置：</p><div class="language-nginx line-numbers-mode" data-highlighter="prismjs" data-ext="nginx"><pre><code class="language-nginx"><span class="line"><span class="token directive"><span class="token keyword">location</span> /rainbow-bridge/ws/</span> <span class="token punctuation">{</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">proxy_pass</span> http://127.0.0.1:8080/rainbow-bridge/ws/</span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">proxy_http_version</span> 1.1</span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">proxy_set_header</span> Upgrade <span class="token variable">$http_upgrade</span></span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">proxy_set_header</span> Connection <span class="token string">&quot;upgrade&quot;</span></span><span class="token punctuation">;</span></span>
<span class="line">    <span class="token directive"><span class="token keyword">proxy_set_header</span> Host <span class="token variable">$host</span></span><span class="token punctuation">;</span></span>
<span class="line"><span class="token punctuation">}</span></span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="q-后端如何获取真实-ip" tabindex="-1"><a class="header-anchor" href="#q-后端如何获取真实-ip">#</a> Q: 后端如何获取真实 IP？</h3><p>A: 确保传递以下请求头：</p><div class="language-nginx line-numbers-mode" data-highlighter="prismjs" data-ext="nginx"><pre><code class="language-nginx"><span class="line"><span class="token directive"><span class="token keyword">proxy_set_header</span> X-Real-IP <span class="token variable">$remote_addr</span></span><span class="token punctuation">;</span></span>
<span class="line"><span class="token directive"><span class="token keyword">proxy_set_header</span> X-Forwarded-For <span class="token variable">$proxy_add_x_forwarded_for</span></span><span class="token punctuation">;</span></span>
<span class="line"><span class="token directive"><span class="token keyword">proxy_set_header</span> X-Forwarded-Proto <span class="token variable">$scheme</span></span><span class="token punctuation">;</span></span>
<span class="line"></span></code></pre><div class="line-numbers" aria-hidden="true" style="counter-reset:line-number 0;"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><p>后端应用会自动解析这些头部获取真实客户端 IP。</p><h2 id="相关文档" tabindex="-1"><a class="header-anchor" href="#相关文档">#</a> 相关文档</h2><ul><li><a href="./installation">安装部署</a> - 部署方式选择</li><li><a href="./integration/frontend">平台对接</a> - 客户端集成</li><li><a href="./ui-config/export">导出配置</a> - 静态站点导出</li></ul>`,66)]])}var s=r(a,[[`render`,o]]);export{i as _pageData,s as default};