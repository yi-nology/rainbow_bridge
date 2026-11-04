import { apiURL } from './api/url'
import { getApiBaseUrl, getBasePath } from './runtime-url'

/** Preserve stored references; resolve only at the display/download boundary. */
export function resolveAssetUrl(value: string | undefined | null): string {
  if (!value) return ''
  if (/^https?:\/\//i.test(value) || value.startsWith('//')) return value
  if (value.startsWith('asset://')) return apiURL('/api/v1/asset/file/' + value.slice(8)).href
  if (value.startsWith('/api/v1/')) return apiURL(value).href

  const prefix = getBasePath().replace(/\/$/, '')
  if (prefix && value.startsWith(prefix + '/')) {
    // A previously prefixed API path still uses the explicitly configured API root.
    const path = value.slice(prefix.length)
    return path.startsWith('/api/v1/') && getApiBaseUrl() ? apiURL(path).href : value
  }
  if (value.startsWith('/')) {
    const root = getApiBaseUrl().replace(/\/$/, '') || prefix
    return new URL(root + value, window.location.origin).href
  }
  return value
}
