/** Deployment roots shared by API requests and resource previews. */
export function getBasePath(): string {
  if (typeof window !== 'undefined' && window.__BASE_PATH__ !== undefined && window.__BASE_PATH__ !== '__BASE_PATH__') return window.__BASE_PATH__
  const base = import.meta.env.BASE_URL || ''
  return base.includes('__BASE_PATH__') ? '' : base
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || ''
}

declare global {
  interface Window { __BASE_PATH__?: string }
}
