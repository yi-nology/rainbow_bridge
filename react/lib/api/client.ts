import { toast } from 'sonner'

export class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
    public originalError?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
  showErrorToast?: boolean
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new ApiError(response.status, `HTTP error: ${response.status}`)
  }

  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    const data = await response.json()
    
    // 检查业务错误码
    if (data.operate_response && data.operate_response.code !== 0 && data.operate_response.code !== 200) {
      throw new ApiError(
        data.operate_response.code,
        data.operate_response.msg || '操作失败',
        data.operate_response.error
      )
    }
    
    // 检查顶层错误码 (0 和 200 都表示成功)
    if (data.code !== undefined && data.code !== 0 && data.code !== 200) {
      throw new ApiError(data.code, data.msg || '请求失败', data.error)
    }
    
    return data as T
  }

  return response as unknown as T
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path, window.location.origin)
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        url.searchParams.append(key, String(value))
      }
    })
  }
  
  return url.toString()
}

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, showErrorToast = true, ...fetchOptions } = options

  const url = buildUrl(path, params)
  
  const defaultHeaders: Record<string, string> = {}
  
  // 只有非 FormData 请求才设置 Content-Type
  if (!(fetchOptions.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json'
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...defaultHeaders,
        ...fetchOptions.headers,
      },
    })

    return await handleResponse<T>(response)
  } catch (error) {
    if (error instanceof ApiError) {
      if (showErrorToast) {
        toast.error(error.message)
      }
      throw error
    }

    // 网络错误
    const message = error instanceof Error ? error.message : '网络连接失败'
    if (showErrorToast) {
      toast.error(message)
    }
    throw new ApiError(-1, message)
  }
}

// GET 请求封装
export function get<T>(path: string, params?: Record<string, string | number | boolean | undefined>, options?: RequestOptions): Promise<T> {
  return request<T>(path, { ...options, method: 'GET', params })
}

// POST 请求封装
export function post<T>(path: string, data?: unknown, options?: RequestOptions): Promise<T> {
  return request<T>(path, {
    ...options,
    method: 'POST',
    body: data instanceof FormData ? data : JSON.stringify(data),
  })
}

// 文件上传封装
export function upload<T>(path: string, formData: FormData, options?: RequestOptions): Promise<T> {
  return request<T>(path, {
    ...options,
    method: 'POST',
    body: formData,
  })
}
