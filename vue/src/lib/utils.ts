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
  
  if (url.startsWith('asset://')) {
    const fileId = url.replace('asset://', '')
    if (apiBaseUrl) {
      return `${apiBaseUrl.replace(/\/$/, '')}${normalizedBasePath}/api/v1/asset/file/${fileId}`
    }
    return `${normalizedBasePath}/api/v1/asset/file/${fileId}`
  }
  
  if (url.startsWith('/api/v1/asset/file/')) {
    if (apiBaseUrl) {
      return `${apiBaseUrl.replace(/\/$/, '')}${normalizedBasePath}${url}`
    }
    return normalizedBasePath ? `${normalizedBasePath}${url}` : url
  }
  
  if (normalizedBasePath && url.startsWith(`${normalizedBasePath}/`)) {
    if (apiBaseUrl) {
      return `${apiBaseUrl.replace(/\/$/, '')}${url}`
    }
    return url
  }
  
  if (url.startsWith('/')) {
    if (apiBaseUrl) {
      return `${apiBaseUrl.replace(/\/$/, '')}${normalizedBasePath}${url}`
    }
    return normalizedBasePath ? `${normalizedBasePath}${url}` : url
  }
  
  return url
}
