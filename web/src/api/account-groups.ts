import { platformRequest } from './platform-client'

export type GroupUserOverride = {
  multiplierBps: number | null
  requestsPerMinute: number | null
}
export type GroupControls = {
  allowLive: boolean
  requestsPerMinute: number
  userOverrides: Record<string, GroupUserOverride>
}
export type GroupPricing = {
  peak: null | {
    timezone: string
    startMinute: number
    endMinute: number
    peakMultiplierBps: number
    offPeakMultiplierBps: number
  }
  modelPrices: Record<
    string,
    { input: string; output: string; cacheRead: string; cacheWrite: string }
  >
}
export type AccountGroup = {
  controls: GroupControls
  platform?: string | null
  pricing: GroupPricing
  id: string
  name: string
  description: string | null
  color: string
  enabled: boolean
  allowImageGeneration: boolean
  fastMode: 'default' | 'disabled' | 'enabled'
  visibility: 'private' | 'public'
  retailMultiplierBps: number
  modelRoutes: Record<string, string> | null
  memberCount: number
  providerCounts: Record<string, number>
  clientKeyCount: number
  accountSummary: { available: number; limited: number; total: number }
  capacity: { usedSlots: number | null; totalSlots: number | null }
  usage: { yesterdayUsd: string; todayUsd: string; retainedTotalUsd: string }
  createdAt: string
  updatedAt: string
}

export type AccountGroupOption = Pick<
  AccountGroup,
  'id' | 'name' | 'color' | 'enabled'
>
export type PlatformPage = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}
export type AccountGroupPage = {
  items: AccountGroup[]
  page: PlatformPage
  configRevision: number
}
export type AccountGroupMutation = {
  id: string
  record: AccountGroup | null
  configRevision: number
}
export type GroupFields = Pick<
  AccountGroup,
  | 'name'
  | 'description'
  | 'color'
  | 'fastMode'
  | 'allowImageGeneration'
  | 'visibility'
  | 'retailMultiplierBps'
  | 'modelRoutes'
  | 'pricing'
  | 'platform'
  | 'controls'
>

export function listAccountGroups(
  query: {
    page?: number
    pageSize?: number
    search?: string
    enabled?: boolean
    platform?: string
    visibility?: string
    sort?: 'name' | 'createdAt'
    descending?: boolean
  } = {},
  signal?: AbortSignal
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== '') params.set(key, String(value))
  return platformRequest<AccountGroupPage>(`/account-groups?${params}`, {
    signal,
  })
}

export function listAccountGroupOptions(
  query: {
    page?: number
    pageSize?: number
    search?: string
    enabled?: boolean
  } = {},
  signal?: AbortSignal
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== '') params.set(key, String(value))
  return platformRequest<{
    items: AccountGroupOption[]
    page: PlatformPage
    configRevision: number
  }>(`/account-groups/options?${params}`, { signal })
}

export function createAccountGroup(fields: GroupFields) {
  return platformRequest<AccountGroupMutation>('/account-groups/create', {
    method: 'POST',
    body: fields,
  })
}

export function updateAccountGroup(
  id: string,
  fields: GroupFields,
  configRevision: number
) {
  return platformRequest<AccountGroupMutation>('/account-groups/update', {
    method: 'POST',
    body: { id, ...fields, configRevision },
  })
}

export function setAccountGroupEnabled(id: string, enabled: boolean) {
  return platformRequest<AccountGroupMutation>(
    `/account-groups/${enabled ? 'enable' : 'disable'}`,
    { method: 'POST', body: { id } }
  )
}

export function deleteAccountGroup(id: string) {
  return platformRequest<AccountGroupMutation>('/account-groups/delete', {
    method: 'POST',
    body: { id },
  })
}

export function accountGroupFields(group: AccountGroup): GroupFields {
  const {
    name,
    description,
    color,
    platform,
    visibility,
    fastMode,
    allowImageGeneration,
    retailMultiplierBps,
    modelRoutes,
    pricing,
    controls,
  } = group
  return {
    name,
    description,
    color,
    platform,
    visibility,
    fastMode,
    allowImageGeneration,
    retailMultiplierBps,
    modelRoutes,
    pricing,
    controls,
  }
}
