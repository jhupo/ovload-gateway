import { platformRequest } from './platform-client'
import type { NumberedPage } from './upstream-accounts'

export type ProxyLocation = {
  country: string
  region: string
  city: string
  timezone: string
}
export type ProxyTest = {
  location: {
    status: 'notRequested' | 'detected' | 'failed' | 'conflict'
    location?: ProxyLocation
    message?: string
  }
  success: boolean
  latencyMs: number
  exitIp: string | null
  exitIpv4: string | null
  exitIpv6: string | null
  message: string
}
export type ProxyRecord = {
  id: string
  name: string
  endpoint: string
  hasAuthentication: boolean
  enabled: boolean
  maxWebsocketConnections: number
  autoLocation: boolean
  location: ProxyLocation | null
  detectedLocation: { location: ProxyLocation; detectedAt: string } | null
  revision: number
  accountCount: number
  lastTestAt: string | null
  lastTest: ProxyTest | null
  createdAt: string
  updatedAt: string
}
export type ProxyAccount = {
  id: string
  name: string
  email: string | null
  provider: string
  enabled: boolean
  authenticationKind: string
  planType: string | null
  planTypeDisplay: string | null
  groups: { id: string; name: string }[]
}
export type ProxyInput = {
  name: string
  proxyUrl?: string
  maxWebsocketConnections: number
  autoLocation: boolean
  enabled: boolean
  location?: ProxyLocation | null
}
export type ProxyMutation = { record: ProxyRecord; configRevision: number }
export type ProxyBatchResult<T> =
  | { status: 'succeeded'; data: T }
  | { status: 'failed'; httpStatus: number; code: number; message: string }
  | { status: 'skipped' }

function revision(record: ProxyRecord) {
  if (!Number.isSafeInteger(record.revision) || record.revision < 1)
    throw new Error('Invalid proxy revision')
  return { id: record.id, revision: record.revision }
}

export const proxies = {
  list: (params: URLSearchParams, signal?: AbortSignal) =>
    platformRequest<NumberedPage<ProxyRecord>>(`/proxies?${params}`, {
      signal,
    }),
  accounts: (
    id: string,
    page: number,
    signal?: AbortSignal,
    search = '',
    pageSize = 20
  ) =>
    platformRequest<NumberedPage<ProxyAccount>>(
      `/proxies/accounts?${new URLSearchParams({ proxyId: id, page: String(page), pageSize: String(pageSize), search })}`,
      { signal }
    ),
  create: async (inputs: ProxyInput[]) => {
    const result = await platformRequest<ProxyBatchResult<ProxyMutation>[]>(
      '/proxies/create',
      {
        method: 'POST',
        timeoutMs: 60_000,
        body: inputs.map(
          ({
            name,
            proxyUrl,
            maxWebsocketConnections,
            autoLocation,
            location,
          }) => ({
            name,
            proxyUrl,
            maxWebsocketConnections,
            autoLocation,
            location,
          })
        ),
      }
    )
    if (!Array.isArray(result) || result.length !== inputs.length)
      throw new Error('Invalid proxy batch result')
    return result
  },
  update: (
    record: ProxyRecord,
    input: Partial<ProxyInput> & { name: string }
  ) =>
    platformRequest<ProxyMutation>('/proxies/update', {
      method: 'POST',
      body: { ...revision(record), ...input },
      timeoutMs: 60_000,
    }),
  delete: (record: ProxyRecord) =>
    platformRequest<{ configRevision: number }>('/proxies/delete', {
      method: 'POST',
      body: revision(record),
    }),
  test: (record: ProxyRecord, detectLocation: boolean) =>
    platformRequest<ProxyBatchResult<ProxyRecord>[]>('/proxies/test', {
      method: 'POST',
      body: [{ ...revision(record), detectLocation }],
      timeoutMs: 60_000,
    }),
  probe: (proxyUrl: string, detectLocation: boolean) =>
    platformRequest<ProxyTest>('/proxies/probe', {
      method: 'POST',
      body: { proxyUrl, detectLocation },
      timeoutMs: 60_000,
    }),
  removeAccount: (proxyId: string, accountId: string) =>
    platformRequest<{ configRevision: number }>('/proxies/accounts/remove', {
      method: 'POST',
      body: { proxyId, accountId },
    }),
}
