import { apiRequest } from './client'
import type { CustomerProfile } from './types'

export type CustomerIdentity = Pick<
  CustomerProfile,
  | 'id'
  | 'tenant_id'
  | 'email'
  | 'display_name'
  | 'status'
  | 'revision'
  | 'created_at'
  | 'updated_at'
>
export type CustomerSummary = CustomerIdentity & {
  role: 'user'
  max_concurrency: number
  requests_per_minute: number
  notes: string
  balance_usd: string | null
  last_active_at: string | null
  last_called_at: string | null
}
export type CustomerDetail = CustomerProfile & { notes: string }
export type CustomerDirectoryQuery = {
  page: number
  page_size: number
  query?: string
  status?: CustomerSummary['status'][]
  role?: 'user'[]
  sort?: 'id' | 'display_name' | 'balance_usd' | 'created_at'
  order?: 'asc' | 'desc'
}
export type CustomerDirectoryPage = {
  items: CustomerSummary[]
  total: number
  page: number
  page_size: number
}
export type CustomerFields = {
  email: string
  display_name: string
  max_concurrency: number
  requests_per_minute: number
  notes: string
}
export const customersApi = {
  list: (input: CustomerDirectoryQuery, signal?: AbortSignal) => {
    const query = new URLSearchParams({
      page: String(input.page),
      page_size: String(input.page_size),
    })
    if (input.query) query.set('query', input.query)
    if (input.status?.length) query.set('status', input.status.join(','))
    if (input.role?.length) query.set('role', input.role.join(','))
    if (input.sort) query.set('sort', input.sort)
    if (input.order) query.set('order', input.order)
    return apiRequest<CustomerDirectoryPage>('management', `/users?${query}`, {
      signal,
    }).then((r) => r.data)
  },
  get: (row: Pick<CustomerSummary, 'id' | 'tenant_id'>, signal?: AbortSignal) =>
    apiRequest<CustomerDetail>(
      'management',
      `/users/${encodeURIComponent(row.id)}?tenant_id=${encodeURIComponent(row.tenant_id)}`,
      { signal }
    ),
  create: (
    body: CustomerFields & {
      password: string
    }
  ) =>
    apiRequest<CustomerIdentity>('management', '/users', {
      method: 'POST',
      body,
    }),
  update: (
    row: CustomerIdentity,
    revision: string,
    body: CustomerFields & { password?: string }
  ) =>
    apiRequest<CustomerDetail>(
      'management',
      `/users/${encodeURIComponent(row.id)}?tenant_id=${encodeURIComponent(row.tenant_id)}`,
      { method: 'PATCH', revision, body }
    ),
  setActive: (row: CustomerIdentity, revision: string, active: boolean) =>
    apiRequest<CustomerIdentity>(
      'management',
      `/users/${encodeURIComponent(row.id)}/${active ? 'activate' : 'suspend'}?tenant_id=${encodeURIComponent(row.tenant_id)}`,
      { method: 'POST', revision }
    ),
}
