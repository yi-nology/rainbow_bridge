import { ApiError } from './error'

export interface AssetDeleteResult { file_id: string; deleted: true; already_deleted: boolean }
export interface AssetReference {
  environment_key: string; pipeline_key: string; scope_id: string
  resource_key: string; name: string; alias: string
}
export interface AssetReferences { reference_count: number; references: AssetReference[]; references_truncated: boolean }

/** Only the documented summary is rendered; never expose raw error payloads. */
export function assetReferences(error: unknown): AssetReferences | null {
  if (!(error instanceof ApiError) || error.errorType !== 'ASSET_IN_USE') return null
  const data = error.payload?.data as Partial<AssetReferences> | undefined
  if (!data || !Number.isSafeInteger(data.reference_count) || data.reference_count! < 1 ||
      !Array.isArray(data.references) || data.references.length > 20 || data.references.length > data.reference_count! ||
      typeof data.references_truncated !== 'boolean') return null
  const fields = ['environment_key', 'pipeline_key', 'scope_id', 'resource_key', 'name', 'alias'] as const
  if (!data.references.every(item => item && fields.every(key => typeof item[key] === 'string'))) return null
  return data as AssetReferences
}
