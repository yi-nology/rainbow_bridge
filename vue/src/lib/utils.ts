import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export { getBasePath, getApiBaseUrl } from './runtime-url'
export { resolveAssetUrl } from './asset-url'

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
