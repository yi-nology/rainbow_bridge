import { toast } from 'vue-sonner'
import { getApiBaseUrl } from '../utils'
import type { ApiResponse, OperateResponse } from './types'

export function getBasePath(): string {
  return import.meta.env.BASE_URL || ''
}

export class ApiError extends Error {
  code: number
  detail: string

  constructor(code: number, message: string, detail: string = '') {
    super(message)
    this.code = code
    this.detail = detail
    this.name = 'ApiError'
  }
}

interface RawApiResponse<T = unknown> extends ApiResponse<T> {
  operate_response?: OperateResponse
}

async function handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
  if (!response.ok) {
    throw new ApiError(response.status, `HTTP error: ${response.status}`)
  }

  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    const data: RawApiResponse<T> = await response.json()

    if (
      data.operate_response &&
      data.operate_response.code !== 0 &&
      data.operate_response.code !== 200
    ) {
      throw new ApiError(
        data.operate_response.code,
        data.operate_response.msg || '操作失败',
        data.operate_response.error || ''
      )
    }

    if (data.code !== undefined && data.code !== 0 && data.code !== 200) {
      throw new ApiError(data.code, data.msg || '请求失败', data.error || '')
    }

    return data
  }

  return {} as ApiResponse<T>
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  data?: Record<string, unknown>,
  options?: {
    headers?: Record<string, string>
    showErrorToast?: boolean
  }
): Promise<ApiResponse<T>> {
  const apiBaseUrl = getApiBaseUrl()
  const baseUrl = apiBaseUrl || ''
  const showErrorToast = options?.showErrorToast !== false

  const url = new URL(`${baseUrl}${path}`, window.location.origin)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options?.headers,
  }

  let body: string | undefined
  if (method === 'GET' && data) {
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value))
      }
    })
  } else if (data) {
    body = JSON.stringify(data)
  }

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body,
      credentials: 'include',
    })

    return await handleResponse<T>(response)
  } catch (error) {
    if (error instanceof ApiError) {
      const toastMessage = error.detail
        ? `${error.message}: ${error.detail}`
        : error.message

      if (showErrorToast) {
        toast.error(toastMessage)
      }
      throw error
    }

    const message = error instanceof Error ? error.message : '网络连接失败'
    if (showErrorToast) {
      toast.error(message)
    }
    throw new ApiError(-1, message)
  }
}

export async function get<T>(
  path: string,
  params?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  return request<T>('GET', path, params)
}

export async function post<T>(
  path: string,
  data?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  return request<T>('POST', path, data)
}

export async function upload<T>(
  path: string,
  formData: FormData,
  options?: {
    headers?: Record<string, string>
    showErrorToast?: boolean
  }
): Promise<ApiResponse<T>> {
  const apiBaseUrl = getApiBaseUrl()
  const baseUrl = apiBaseUrl || ''
  const showErrorToast = options?.showErrorToast !== false

  const url = new URL(`${baseUrl}${path}`, window.location.origin)

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      body: formData,
      credentials: 'include',
    })

    return await handleResponse<T>(response)
  } catch (error) {
    if (error instanceof ApiError) {
      const toastMessage = error.detail
        ? `${error.message}: ${error.detail}`
        : error.message

      if (showErrorToast) {
        toast.error(toastMessage)
      }
      throw error
    }

    const message = error instanceof Error ? error.message : '网络连接失败'
    if (showErrorToast) {
      toast.error(message)
    }
    throw new ApiError(-1, message)
  }
}
