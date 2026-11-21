import { accountProviders } from '@/lib/upstream-platforms'

export const providerOptions = accountProviders.map(({ value, label }) => ({
  id: value,
  name: label,
}))

export const errorCategories = [
  'content_policy',
  'context_limit',
  'model_unsupported',
  'quota_or_balance',
  'rate_or_capacity',
  'transport_or_stream',
  'not_found',
  'authentication',
  'invalid_request',
  'group_access',
  'account_pool_unavailable',
  'timeout',
  'upstream_forbidden',
  'client_cancelled',
] as const
