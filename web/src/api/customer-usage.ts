import { apiRequest } from './client'
import type { Page } from './types'

export type UsageOutcome =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'incomplete'
export type RetailBillingState =
  | 'held'
  | 'settled'
  | 'released'
  | 'reconciliation_required'
export type CustomerUsageFilter = {
  from: string
  to: string
  api_key_id?: string
  public_model_id?: string
  outcome?: UsageOutcome
}
type TokenFacts = {
  input_tokens: number | null
  output_tokens: number | null
  cached_input_tokens: number | null
  cache_write_input_tokens: number | null
  reasoning_output_tokens: number | null
  total_tokens: number | null
}
type RetailCharge = {
  retail_charge_usd: string | null
  currency: 'USD'
  scale: 10
}
export type CustomerUsageRecord = TokenFacts &
  RetailCharge & {
    request_id: string
    api_key_id: string
    public_model_id: string | null
    operation: string
    outcome: UsageOutcome
    client_status_code: number | null
    started_at: string
    completed_at: string | null
    first_token_ms: number | null
    latency_ms: number | null
    retail_state: RetailBillingState | null
  }
export type CustomerUsageSummary = TokenFacts &
  RetailCharge & {
    requests: number
    succeeded: number
    failed: number
    cancelled: number
    incomplete: number
    running: number
    usage_reported_requests: number
    settled_requests: number
  }
export type CustomerUsageDay = { date: string; summary: CustomerUsageSummary }

function query(filter: CustomerUsageFilter) {
  const params = new URLSearchParams({ from: filter.from, to: filter.to })
  if (filter.api_key_id) params.set('api_key_id', filter.api_key_id)
  if (filter.public_model_id)
    params.set('public_model_id', filter.public_model_id)
  if (filter.outcome) params.set('outcome', filter.outcome)
  return params
}

export async function listCustomerUsage(
  filter: CustomerUsageFilter,
  cursor?: string,
  limit = 50,
  signal?: AbortSignal
) {
  const params = query(filter)
  params.set('limit', String(limit))
  if (cursor) params.set('cursor', cursor)
  return apiRequest<Page<CustomerUsageRecord>>('customer', `/usage?${params}`, {
    signal,
  }).then(({ data }) => data)
}
export async function getCustomerUsage(id: string, signal?: AbortSignal) {
  return apiRequest<CustomerUsageRecord>(
    'customer',
    `/usage/${encodeURIComponent(id)}`,
    { signal }
  ).then(({ data }) => data)
}
export async function getCustomerUsageSummary(
  filter: CustomerUsageFilter,
  signal?: AbortSignal
) {
  return apiRequest<CustomerUsageSummary>(
    'customer',
    `/usage/summary?${query(filter)}`,
    { signal }
  ).then(({ data }) => data)
}
export async function getCustomerUsageTrend(
  filter: CustomerUsageFilter,
  signal?: AbortSignal
) {
  return apiRequest<{ items: CustomerUsageDay[] }>(
    'customer',
    `/usage/trend?${query(filter)}`,
    { signal }
  ).then(({ data }) => data.items)
}
export async function exportCustomerUsage(
  filter: CustomerUsageFilter,
  signal?: AbortSignal
) {
  return apiRequest<Blob>('customer', `/usage/export?${query(filter)}`, {
    signal,
    responseType: 'blob',
  }).then(({ data }) => data)
}
