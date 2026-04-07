import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getBasePath(): string {
  return import.meta.env.BASE_URL || ''
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || ''
}

export function resolveAssetUrl(url: string | undefined | null): string {
  if (!url) return ''
  
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  
  const apiBaseUrl = getApiBaseUrl()
  const basePath = getBasePath()
  const normalizedBasePath = basePath.replace(/\/$/, '')
  const normalizedApiBaseUrl = apiBaseUrl ? apiBaseUrl.replace(/\/$/, '') : ''
  
  if (url.startsWith('asset://')) {
    const fileId = url.replace('asset://', '')
    const assetUrl = `/api/v1/asset/file/${fileId}`
    // 开发环境下，让前端代理处理路径
    if (import.meta.env.DEV) {
      return normalizedBasePath ? `${normalizedBasePath}${assetUrl}` : assetUrl
    }
    // 生产环境下，使用 API 基础 URL
    if (normalizedApiBaseUrl) {
      return `${normalizedApiBaseUrl}${assetUrl}`
    }
    return assetUrl
  }
  
  if (url.startsWith('/api/v1/asset/file/')) {
    // 开发环境下，让前端代理处理路径
    if (import.meta.env.DEV) {
      return normalizedBasePath ? `${normalizedBasePath}${url}` : url
    }
    // 生产环境下，使用 API 基础 URL
    if (normalizedApiBaseUrl) {
      return `${normalizedApiBaseUrl}${url}`
    }
    return url
  }
  
  if (normalizedBasePath && url.startsWith(`${normalizedBasePath}/`)) {
    if (normalizedApiBaseUrl) {
      return `${normalizedApiBaseUrl}${url}`
    }
    return url
  }
  
  if (url.startsWith('/')) {
    if (normalizedApiBaseUrl) {
      return `${normalizedApiBaseUrl}${url}`
    }
    return normalizedBasePath ? `${normalizedBasePath}${url}` : url
  }
  
  return url
}

// 转换驼峰命名为蛇形命名
export function toSnakeCase(obj: any): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    result[snakeKey] = value
  }
  return result
}

// 转换蛇形命名为驼峰命名
export function toCamelCase(obj: any): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[camelKey] = toCamelCase(value)
    } else if (Array.isArray(value)) {
      result[camelKey] = (value as unknown[]).map(item => {
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          return toCamelCase(item)
        }
        return item
      })
    } else {
      result[camelKey] = value
    }
  }
  return result
}
