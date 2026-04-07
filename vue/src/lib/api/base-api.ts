/**
 * 基础API服务类，封装了通用的CRUD操作
 * @template T - 数据类型
 * @template CreateDto - 创建数据类型（默认为T）
 * @template UpdateDto - 更新数据类型（默认为T）
 */
import { apiClient } from './client'
import { toCamelCase, toSnakeCase } from '../utils'
import type { ListData } from './types'

export abstract class BaseApiService<T, CreateDto = T, UpdateDto = T> {
  /**
   * API基础路径
   */
  protected abstract baseUrl: string

  /**
   * 获取列表数据
   * @param params - 查询参数（驼峰命名）
   * @returns 包含总数和数据列表的对象
   */
  async list(params?: Record<string, unknown>): Promise<{ total: number; list: T[] }> {
    const snakeParams = params ? toSnakeCase(params) as Record<string, unknown> : undefined
    const resp = await apiClient.get<ListData<any>>(`${this.baseUrl}/list`, snakeParams)
    const list = resp.data?.list || []
    const camelCaseList = list.map(item => toCamelCase(item) as T)
    return { total: resp.data?.total || 0, list: camelCaseList }
  }

  /**
   * 获取详情数据
   * @param id - 数据ID
   * @param params - 额外参数（驼峰命名）
   * @returns 包含详情数据的对象
   */
  async detail(id: string | number, params?: Record<string, unknown>): Promise<{ [key: string]: T | null }> {
    const snakeParams = params ? toSnakeCase(params) as Record<string, unknown> : undefined
    const resp = await apiClient.get<{ [key: string]: any }>(`${this.baseUrl}/detail`, {
      ...snakeParams,
      ...(typeof id === 'string' ? { [this.getIdParamName()]: id } : { id })
    })
    const key = this.getResponseKey()
    const data = resp.data?.[key]
    const camelCaseData = data ? toCamelCase(data) as T : null
    return { [key]: camelCaseData }
  }

  /**
   * 创建数据
   * @param data - 创建数据（驼峰命名）
   * @returns 包含创建后数据的对象
   */
  async create(data: CreateDto): Promise<{ [key: string]: T | null }> {
    const snakeCaseData = toSnakeCase(data as any) as any
    const resp = await apiClient.post<{ [key: string]: any }>(`${this.baseUrl}/create`, {
      [this.getRequestKey()]: snakeCaseData
    })
    const key = this.getResponseKey()
    const createdData = resp.data?.[key]
    const camelCaseData = createdData ? toCamelCase(createdData) as T : null
    return { [key]: camelCaseData }
  }

  /**
   * 更新数据
   * @param data - 更新数据（驼峰命名）
   * @returns 包含更新后数据的对象
   */
  async update(data: UpdateDto): Promise<{ [key: string]: T | null }> {
    const snakeCaseData = toSnakeCase(data as any) as any
    const resp = await apiClient.post<{ [key: string]: any }>(`${this.baseUrl}/update`, {
      [this.getRequestKey()]: snakeCaseData
    })
    const key = this.getResponseKey()
    const updatedData = resp.data?.[key]
    const camelCaseData = updatedData ? toCamelCase(updatedData) as T : null
    return { [key]: camelCaseData }
  }

  /**
   * 删除数据
   * @param id - 数据ID
   * @param params - 额外参数（驼峰命名）
   */
  async delete(id: string | number, params?: Record<string, unknown>): Promise<void> {
    const snakeParams = params ? toSnakeCase(params) as Record<string, unknown> : undefined
    await apiClient.post<null>(`${this.baseUrl}/delete`, {
      ...snakeParams,
      ...(typeof id === 'string' ? { [this.getIdParamName()]: id } : { id })
    })
  }

  /**
   * 获取ID参数名
   * @returns ID参数名
   */
  protected getIdParamName(): string {
    return 'id'
  }

  /**
   * 获取请求数据的键名
   * @returns 请求数据的键名
   */
  protected getRequestKey(): string {
    const className = this.constructor.name.replace('Api', '')
    return className.charAt(0).toLowerCase() + className.slice(1)
  }

  /**
   * 获取响应数据的键名
   * @returns 响应数据的键名
   */
  protected getResponseKey(): string {
    return this.getRequestKey()
  }
}
