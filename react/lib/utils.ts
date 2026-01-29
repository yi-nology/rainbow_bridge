import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 解析资源URL，处理 asset:// 协议和相对路径
 * @param url - 原始 URL，可能是 asset://fileId 或 /api/v1/asset/file/fileId 格式
 * @returns 完整的可访问 URL
 */
export function resolveAssetUrl(url: string | undefined | null): string {
  if (!url) return ''
  
  // 如果已经是完整的 HTTP/HTTPS URL，直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  
  // 获取 API 基础地址（开发环境指向后端服务器）
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ''
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  const normalizedBasePath = basePath.replace(/\/$/, '')
  
  // 处理 asset:// 协议
  if (url.startsWith('asset://')) {
    const fileId = url.replace('asset://', '')
    if (apiBaseUrl) {
      // 开发环境：使用后端 API 地址
      return `${apiBaseUrl.replace(/\/$/, '')}${normalizedBasePath}/api/v1/asset/file/${fileId}`
    }
    // 生产环境：使用相对路径
    return `${normalizedBasePath}/api/v1/asset/file/${fileId}`
  }
  
  // 如果是 /api/v1/asset/file/ 开头的路径（未带 basePath）
  if (url.startsWith('/api/v1/asset/file/')) {
    if (apiBaseUrl) {
      // 开发环境：添加后端 API 地址 + basePath
      return `${apiBaseUrl.replace(/\/$/, '')}${normalizedBasePath}${url}`
    }
    // 生产环境：添加 basePath
    return normalizedBasePath ? `${normalizedBasePath}${url}` : url
  }
  
  // 已经带有 basePath 前缀的绝对路径（如 /rainbow-bridge/api/v1/asset/file/...）
  if (normalizedBasePath && url.startsWith(`${normalizedBasePath}/`)) {
    if (apiBaseUrl) {
      // 开发环境：仅添加后端 API 地址，避免重复叠加 basePath
      return `${apiBaseUrl.replace(/\/$/, '')}${url}`
    }
    // 生产环境：直接返回
    return url
  }
  
  // 其他相对路径（以 / 开头）
  if (url.startsWith('/')) {
    if (apiBaseUrl) {
      return `${apiBaseUrl.replace(/\/$/, '')}${normalizedBasePath}${url}`
    }
    return normalizedBasePath ? `${normalizedBasePath}${url}` : url
  }
  
  return url
}
