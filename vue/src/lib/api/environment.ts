import { BaseApiService } from './base-api'
import type { Environment } from './types'

class EnvironmentApiService extends BaseApiService<Environment> {
  protected baseUrl = '/api/v1/environment'

  protected getIdParamName(): string {
    return 'environment_key'
  }

  protected getRequestKey(): string {
    return 'environment'
  }

  protected getResponseKey(): string {
    return 'environment'
  }
}

export const environmentApi = new EnvironmentApiService()

