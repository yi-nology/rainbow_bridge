import { get, post } from './client'
import { ApiError, ErrorType, formatError } from './error'

// 示例1: 使用try-catch处理错误
export async function fetchEnvironmentList() {
  try {
    const response = await get('/api/environments')
    return response.data
  } catch (error) {
    // 处理特定类型的错误
    if (error instanceof ApiError) {
      switch (error.type) {
        case ErrorType.NETWORK:
          console.log('网络错误:', error.message)
          // 可以在这里添加网络错误的处理逻辑，比如重试
          break
        case ErrorType.HTTP:
          console.log('HTTP错误:', error.code, error.message)
          // 可以在这里添加HTTP错误的处理逻辑
          break
        case ErrorType.API:
          console.log('API错误:', error.code, error.message, error.detail)
          // 可以在这里添加API错误的处理逻辑
          break
        default:
          console.log('其他错误:', error.message)
      }
    } else {
      console.log('未知错误:', error)
    }
    
    // 可以选择重新抛出错误，让上层处理
    // throw error
    
    // 或者返回默认值
    return []
  }
}

// 示例2: 不使用try-catch，让错误向上传播
export async function createEnvironment(data: { name: string; description: string }) {
  // 这里不处理错误，让调用者处理
  const response = await post('/api/environments', data)
  return response.data
}

// 示例3: 格式化错误信息供用户展示
export function displayError(error: unknown) {
  const errorMessage = formatError(error)
  // 这里可以使用UI组件展示错误信息
  console.log('用户友好的错误信息:', errorMessage)
  return errorMessage
}
