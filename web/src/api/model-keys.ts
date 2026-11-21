import { apiRequest } from './client'
import type { Page } from './types'

export type ModelKey = {
  id: string
  tenant_id: string
  user_id: string
  group_id: string
  billing_source: 'wallet'
  name: string
  prefix: string
  enabled: boolean
  limits: { max_concurrency: number; requests_per_minute: number }
  expires_at: string | null
  revoked_at: string | null
  revision: number
  created_at: string
  updated_at: string
}
export type ModelKeyGroup = { id: string; name: string }
export type ModelKeyInput = Pick<ModelKey, 'name' | 'limits' | 'expires_at'>
export type IssuedModelKey = {
  key: ModelKey
  secret: string | null
  secret_disclosed: boolean
  replayed: boolean
}

export const modelKeys = {
  list: (cursor?: string, signal?: AbortSignal) =>
    apiRequest<Page<ModelKey>>(
      'customer',
      `/api-keys?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { signal }
    ).then(({ data }) => data),
  groups: (signal?: AbortSignal) =>
    apiRequest<{ items: ModelKeyGroup[] }>('customer', '/api-key-groups', {
      signal,
    }).then(({ data }) => data.items),
  create: (
    input: ModelKeyInput & { group_id: string },
    idempotencyKey: string
  ) =>
    apiRequest<IssuedModelKey>('customer', '/api-keys', {
      method: 'POST',
      body: input,
      idempotencyKey,
    }).then(({ data }) => data),
  update: (record: ModelKey, input: ModelKeyInput & { enabled: boolean }) =>
    apiRequest<ModelKey>(
      'customer',
      `/api-keys/${encodeURIComponent(record.id)}`,
      { method: 'PATCH', body: input, revision: record.revision }
    ).then(({ data }) => data),
  revoke: (record: ModelKey) =>
    apiRequest<ModelKey>(
      'customer',
      `/api-keys/${encodeURIComponent(record.id)}/revoke`,
      { method: 'POST', body: {}, revision: record.revision }
    ).then(({ data }) => data),
  rotate: (record: ModelKey, idempotencyKey: string) =>
    apiRequest<IssuedModelKey>(
      'customer',
      `/api-keys/${encodeURIComponent(record.id)}/rotate`,
      { method: 'POST', body: {}, revision: record.revision, idempotencyKey }
    ).then(({ data }) => data),
}
