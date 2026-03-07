# 平台对接指南

本指南将帮助你将虹桥计划集成到你的项目中，实现配置的动态获取和资源分发。

## 概述

### 集成方式

虹桥计划提供多种集成方式：

| 方式 | 适用场景 | 特点 |
|------|---------|------|
| REST API | 所有平台 | 实时获取，最灵活 |
| 静态包 | 离线场景 | 无需网络，本地读取 |
| SDK | 特定平台 | 封装完善，使用便捷 |

### 数据流

```
┌─────────────────┐     ┌─────────────────┐
│   管理后台       │────→│   虹桥计划服务   │
│  (配置管理)      │     │   (API 服务)     │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │    客户端应用    │
                        │  (Web/App/小程序) │
                        └─────────────────┘
```

## REST API 集成

### 基础配置

**API 地址**：
```
http://your-domain/rainbow-bridge/api/v1
```

**请求头**：
```http
Content-Type: application/json
x-environment: prod      # 环境标识
x-pipeline: main         # 渠道标识
```

### 获取运行时配置

**请求**：
```http
GET /api/v1/runtime/config
Headers:
  x-environment: prod
  x-pipeline: main
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "api_base_url": "https://api.example.com",
    "theme_color": "#1677FF",
    "features": {
      "dark_mode": true,
      "new_ui": false
    }
  }
}
```

## 前端集成

### JavaScript/TypeScript

**基础封装**：
```typescript
interface ConfigResponse {
  code: number;
  message: string;
  data: Record<string, any>;
}

class RainbowBridge {
  private baseUrl: string;
  private environment: string;
  private pipeline: string;
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private cacheTTL: number = 5 * 60 * 1000; // 5 分钟

  constructor(options: {
    baseUrl: string;
    environment: string;
    pipeline: string;
  }) {
    this.baseUrl = options.baseUrl;
    this.environment = options.environment;
    this.pipeline = options.pipeline;
  }

  async getConfig(): Promise<Record<string, any>> {
    const cacheKey = `${this.environment}:${this.pipeline}`;
    const cached = this.cache.get(cacheKey);
    
    // 检查缓存
    if (cached && Date.now() < cached.expiry) {
      return cached.data;
    }

    // 请求配置
    const response = await fetch(`${this.baseUrl}/api/v1/runtime/config`, {
      headers: {
        'x-environment': this.environment,
        'x-pipeline': this.pipeline,
      },
    });

    const result: ConfigResponse = await response.json();
    
    if (result.code !== 0) {
      throw new Error(result.message);
    }

    // 更新缓存
    this.cache.set(cacheKey, {
      data: result.data,
      expiry: Date.now() + this.cacheTTL,
    });

    return result.data;
  }

  // 清除缓存
  clearCache() {
    this.cache.clear();
  }

  // 设置环境
  setEnvironment(environment: string) {
    this.environment = environment;
    this.clearCache();
  }

  // 设置渠道
  setPipeline(pipeline: string) {
    this.pipeline = pipeline;
    this.clearCache();
  }
}

// 使用示例
const bridge = new RainbowBridge({
  baseUrl: 'https://your-domain/rainbow-bridge',
  environment: 'prod',
  pipeline: 'main',
});

// 获取配置
const config = await bridge.getConfig();
console.log(config.api_base_url);
```

### React 集成

**自定义 Hook**：
```typescript
import { useState, useEffect } from 'react';

interface UseConfigOptions {
  baseUrl: string;
  environment: string;
  pipeline: string;
}

export function useConfig<T = Record<string, any>>(options: UseConfigOptions) {
  const [config, setConfig] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${options.baseUrl}/api/v1/runtime/config`, {
          headers: {
            'x-environment': options.environment,
            'x-pipeline': options.pipeline,
          },
        });
        const result = await response.json();
        if (result.code === 0) {
          setConfig(result.data);
        } else {
          throw new Error(result.message);
        }
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [options.baseUrl, options.environment, options.pipeline]);

  return { config, loading, error };
}

// 使用示例
function App() {
  const { config, loading, error } = useConfig({
    baseUrl: 'https://your-domain/rainbow-bridge',
    environment: 'prod',
    pipeline: 'main',
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div style={{ color: config?.theme_color }}>
      {/* 应用内容 */}
    </div>
  );
}
```

### Vue 集成

**Composable**：
```typescript
import { ref, onMounted } from 'vue';

interface UseConfigOptions {
  baseUrl: string;
  environment: string;
  pipeline: string;
}

export function useConfig<T = Record<string, any>>(options: UseConfigOptions) {
  const config = ref<T | null>(null);
  const loading = ref(true);
  const error = ref<Error | null>(null);

  const fetchConfig = async () => {
    loading.value = true;
    try {
      const response = await fetch(`${options.baseUrl}/api/v1/runtime/config`, {
        headers: {
          'x-environment': options.environment,
          'x-pipeline': options.pipeline,
        },
      });
      const result = await response.json();
      if (result.code === 0) {
        config.value = result.data;
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      error.value = err as Error;
    } finally {
      loading.value = false;
    }
  };

  onMounted(fetchConfig);

  return { config, loading, error, refresh: fetchConfig };
}

// 使用示例
<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <div v-else :style="{ color: config?.theme_color }">
    <!-- 应用内容 -->
  </div>
</template>

<script setup lang="ts">
const { config, loading, error } = useConfig({
  baseUrl: 'https://your-domain/rainbow-bridge',
  environment: 'prod',
  pipeline: 'main',
});
</script>
```

## 移动端集成

### iOS (Swift)

```swift
import Foundation

class RainbowBridge {
    private let baseUrl: String
    private var environment: String
    private var pipeline: String
    
    init(baseUrl: String, environment: String, pipeline: String) {
        self.baseUrl = baseUrl
        self.environment = environment
        self.pipeline = pipeline
    }
    
    func getConfig() async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: "\(baseUrl)/api/v1/runtime/config")!)
        request.setValue(environment, forHTTPHeaderField: "x-environment")
        request.setValue(pipeline, forHTTPHeaderField: "x-pipeline")
        
        let (data, _) = try await URLSession.shared.data(for: request)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let code = json["code"] as? Int,
              code == 0,
              let configData = json["data"] as? [String: Any] else {
            throw NSError(domain: "RainbowBridge", code: -1)
        }
        
        return configData
    }
}

// 使用示例
let bridge = RainbowBridge(
    baseUrl: "https://your-domain/rainbow-bridge",
    environment: "prod",
    pipeline: "main"
)

Task {
    do {
        let config = try await bridge.getConfig()
        print(config)
    } catch {
        print("Error: \(error)")
    }
}
```

### Android (Kotlin)

```kotlin
import okhttp3.OkHttpClient
import okhttp3.Request
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

class RainbowBridge(
    private val baseUrl: String,
    private var environment: String,
    private var pipeline: String
) {
    private val client = OkHttpClient()
    private val gson = Gson()
    
    suspend fun getConfig(): Map<String, Any> {
        val request = Request.Builder()
            .url("$baseUrl/api/v1/runtime/config")
            .header("x-environment", environment)
            .header("x-pipeline", pipeline)
            .build()
            
        return client.newCall(request).execute().use { response ->
            val body = response.body?.string() ?: throw Exception("Empty response")
            val type = object : TypeToken<Map<String, Any>>() {}.type
            val result: Map<String, Any> = gson.fromJson(body, type)
            
            if (result["code"] != 0.0) {
                throw Exception(result["message"] as? String ?: "Unknown error")
            }
            
            result["data"] as Map<String, Any>
        }
    }
}

// 使用示例
val bridge = RainbowBridge(
    baseUrl = "https://your-domain/rainbow-bridge",
    environment = "prod",
    pipeline = "main"
)

lifecycleScope.launch {
    try {
        val config = bridge.getConfig()
        Log.d("Config", config.toString())
    } catch (e: Exception) {
        Log.e("Config", "Error: ${e.message}")
    }
}
```

## 静态包集成

### 适用场景

- 离线应用
- 对启动速度要求高的应用
- 不依赖网络的场景

### 使用方式

1. 导出静态包
2. 集成到项目中
3. 本地读取配置

**JavaScript 示例**：
```typescript
// 静态包集成
import configData from './static-config/config.json';

// 直接使用
export const config = configData;

// 或者封装
class StaticConfig {
  private config: Record<string, any>;
  
  constructor(configData: Record<string, any>) {
    this.config = configData;
  }
  
  get<T>(key: string, defaultValue?: T): T {
    return this.config[key] ?? defaultValue;
  }
  
  getAll(): Record<string, any> {
    return { ...this.config };
  }
}

export const staticConfig = new StaticConfig(configData);
```

## 最佳实践

### 环境切换

根据构建环境动态设置：

```typescript
const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

const bridge = new RainbowBridge({
  baseUrl: process.env.RAINBOW_BRIDGE_URL,
  environment,
  pipeline: 'main',
});
```

### 错误处理

```typescript
async function loadConfig() {
  try {
    const config = await bridge.getConfig();
    return config;
  } catch (error) {
    // 1. 尝试使用缓存
    const cached = localStorage.getItem('config_cache');
    if (cached) {
      return JSON.parse(cached);
    }
    
    // 2. 使用默认配置
    return defaultConfig;
  }
}
```

### 缓存策略

```typescript
class CachedRainbowBridge extends RainbowBridge {
  private storageKey = 'rainbow_config';
  
  async getConfig(): Promise<Record<string, any>> {
    // 先读取本地缓存（快速启动）
    const cached = this.loadFromCache();
    if (cached) {
      // 后台更新缓存
      this.updateCacheInBackground();
      return cached;
    }
    
    // 无缓存时直接请求
    const config = await super.getConfig();
    this.saveToCache(config);
    return config;
  }
  
  private loadFromCache(): Record<string, any> | null {
    const cached = localStorage.getItem(this.storageKey);
    return cached ? JSON.parse(cached) : null;
  }
  
  private saveToCache(config: Record<string, any>) {
    localStorage.setItem(this.storageKey, JSON.stringify(config));
  }
  
  private async updateCacheInBackground() {
    try {
      const config = await super.getConfig();
      this.saveToCache(config);
    } catch (error) {
      console.warn('Background update failed:', error);
    }
  }
}
```

## 常见问题

### Q: 如何处理配置更新？

A: 客户端可以定时轮询或实现手动刷新：

```typescript
// 定时轮询
setInterval(() => bridge.getConfig(), 5 * 60 * 1000);

// 手动刷新
document.getElementById('refresh').addEventListener('click', () => {
  bridge.clearCache();
  bridge.getConfig();
});
```

### Q: 如何实现灰度发布？

A: 通过渠道切换：

```typescript
// 根据用户 ID 决定渠道
const pipeline = userId % 10 < 2 ? 'experiment' : 'main';

const bridge = new RainbowBridge({
  baseUrl: '...',
  environment: 'prod',
  pipeline,
});
```

### Q: 网络请求失败怎么办？

A: 建议实现多层降级：
1. 内存缓存
2. 本地存储缓存
3. 默认配置

## 相关文档

- [API 文档](/api/) - 完整的 API 接口参考
- [环境管理](/guide/ui-config/environment) - 环境概念详解
- [渠道管理](/guide/ui-config/channel) - 渠道概念详解
