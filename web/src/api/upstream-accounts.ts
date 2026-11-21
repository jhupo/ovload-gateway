import type { UpstreamProvider } from '@/lib/upstream-platforms'
import { platformRequest } from './platform-client'

export type { UpstreamProvider } from '@/lib/upstream-platforms'
export type ModelAccess = {
  mode: 'all' | 'allowlist' | 'denylist'
  models: string[]
}
export type RelativeTimeView =
  | { kind: 'just_now' }
  | { kind: 'elapsed'; value: number; unit: 'minute' | 'hour' | 'day' }
  | { kind: 'absolute'; value: string }
export type UpstreamAccount = {
  configRevision: number
  id: string
  name: string
  email: string | null
  provider: string
  notes: string | null
  enabled: boolean
  status: string
  authenticationKind: string
  hasRefreshToken: boolean
  groups: { id: string; name: string; enabled: boolean }[]
  outboundProxyId: string | null
  outboundProxyEndpoint: string | null
  concurrencyLimit: number | null
  capacity: { usedSlots: number | null; totalSlots: number | null }
  weight: number
  modelAccess: ModelAccess
  planType: string | null
  planTypeDisplay: string
  errorReason: string | null
  errorMessage: string | null
  accessTokenExpiresAt: string | null
  addedAt: string
  updatedAt: string
  capabilities: {
    quota: boolean
    quotaRefresh: boolean
    profile: boolean
    subscription: boolean
    avatar: boolean
    resetCredits: boolean
    consumeResetCredit: boolean
  }
  quota: {
    refreshedAt: string | null
    refreshedAtRelative: RelativeTimeView | null
    credits: {
      hasCredits: boolean
      unlimited: boolean
      balance: string | null
    } | null
    windows: {
      key: string
      group?: string
      limitId?: string | null
      limitName?: string | null
      role?: 'primary' | 'secondary' | 'monthly' | null
      windowSeconds?: number | null
      labelDisplay: string
      windowLabelDisplay?: string
      usedPercent: number | null
      limitReached?: boolean
      resetAtDisplay: string
    }[]
  }
  usage: {
    retailChargeUsd?: string | null
    requestCount: number | null
    inputTokens: number | null
    outputTokens: number | null
    cachedInputTokens: number | null
    reasoningOutputTokens: number | null
    cacheWriteInputTokens: number | null
    totalTokens: number | null
    lastUsedAt: string | null
    lastUsedAtRelative: RelativeTimeView | null
    costEstimateStatus: string
    knownCostCount?: number | null
    unknownCostCount?: number | null
    costs: { currency: string; estimatedAmount: string }[]
    models: {
      model: string
      requestCount: number
      successRate: number | null
      inputTokens: number | null
      outputTokens: number | null
      cachedInputTokens: number | null
      billingAmountUsd: string | null
      costEstimateStatus: string
      knownCostCount?: number | null
      unknownCostCount?: number | null
      lastUsedAt: string
      lastUsedAtRelative: RelativeTimeView
    }[]
  }
}
export type AccountPersonalInfo = {
  profile: {
    displayName: string | null
    username: string | null
    imageUrl: string | null
    hasStatsError: boolean
    summary: {
      totalTextTokens: number | null
      peakTokens: number | null
      longestTaskDurationMs: number | null
      currentStreakDays: number | null
      longestStreakDays: number | null
    }
    activityCalendar: {
      rangeLabel: string
      weeks: {
        key: string
        monthLabel: string | null
        cells: {
          date: string
          dateDisplay: string
          tokens: number
          isFuture: boolean
        }[]
      }[]
    } | null
    dailyUsage: { date: string; tokens: number }[] | null
    activityInsights: {
      fastModePercent: number | null
      reasoningEffort: string | null
      reasoningEffortPercent: number | null
      skillsExplored: number | null
      totalSkillsUsed: number | null
      totalThreads: number | null
      invocations:
        | {
            type: string
            pluginId: string | null
            pluginName: string | null
            skillId: string | null
            skillName: string | null
            usageCount: number | null
          }[]
        | null
    }
  } | null
  profileError: string | null
  subscription: {
    startsAt: string | null
    startsAtDisplay: string | null
    expiresAt: string
    expiresAtDisplay: string
    willRenew: boolean | null
    billingPeriod: string | null
    billingCurrency: string | null
    observedAt: string
    observedAtDisplay: string
  } | null
}
export type AccountQuotaForecast = {
  accountId: string
  generatedAt: string
  forecasts: {
    period: 'weekly' | 'monthly'
    targetDays: number
    extrapolated: boolean
    source: {
      label: string
      usedPercent: number | null
      usedPercentDisplay: string
      observedAt: string | null
      observedAtDisplay: string
      resetAt: string
      tokensDisplay: string
      usdDisplay: string
    } | null
    unavailableReason: string | null
    lowSample: boolean
    incompleteCost: boolean
    incompleteTokens: boolean
    estimatedTokens: number | null
    estimatedTokensDisplay: string
    estimatedUsd: number | null
    estimatedUsdDisplay: string
  }[]
}
export type AccountResetCredit = {
  id: string
  status: string | null
  title: string | null
  expiresAt: string | null
  expiresAtDisplay: string | null
  resetType: string | null
}
export type AccountResetCredits = {
  availableCount: number
  credits: AccountResetCredit[]
}
export type ConsumeResetCredit = {
  accountId: string
  creditId?: string
  redeemRequestId: string
}
export type NumberedPage<T> = {
  items: T[]
  page: { page: number; pageSize: number; total: number; totalPages: number }
}
export type AccountSummary = {
  total: number
  normal: number
  quotaExhausted: number
  rateLimited: number
  disabled: number
  error: number
}
export type AccountSettings = {
  notes: string
  enabled: boolean
  concurrencyLimit: number | null
  weight: number
  modelAccess: ModelAccess
  groupIds: string[]
}
export type SavedProxy = {
  id: string
  name: string
  enabled: boolean
  endpoint: string
}
export type AccountGroupOption = { id: string; name: string; enabled: boolean }
export type AuthorizationFlow = {
  flowId: string
  authorizationUrl: string
  expiresAt: string
}
export type AccountConnection = {
  baseUrl?: string
  transport: 'http' | 'prefer_websocket'
  apiKey?: string
}
export type AccountDetail = {
  account: UpstreamAccount
  credentialConfiguration?: {
    base_url?: string
    transport: 'http' | 'prefer_websocket'
  }
}
export type AccountConcurrencyEntry = {
  leaseId: string
  requestId: string | null
  clientKeyId: string | null
  clientKeyName: string | null
  model: string | null
  clientIp: string | null
  startedAt: string | null
  startedAtDisplay: string | null
  occupiedMs: number | null
}
export type AccountConcurrencyPage = {
  accountId: string
  entries: AccountConcurrencyEntry[]
  total: number
  page: number
  pageSize: number
  observedAt: string
}
export function settingsFor(account: UpstreamAccount): AccountSettings {
  return {
    notes: account.notes ?? '',
    enabled: account.enabled,
    concurrencyLimit: account.concurrencyLimit,
    weight: account.weight,
    modelAccess: account.modelAccess,
    groupIds: account.groups.map((group) => group.id),
  }
}
export const upstreamAccounts = {
  list: (query: URLSearchParams, signal?: AbortSignal) =>
    platformRequest<
      NumberedPage<UpstreamAccount> & {
        configRevision: number
        summary: AccountSummary
      }
    >(`/accounts?${query}`, {
      signal,
    }),
  detail: (id: string, signal?: AbortSignal) =>
    platformRequest<AccountDetail>(
      `/accounts/detail?${new URLSearchParams({ accountId: id })}`,
      { signal }
    ),
  concurrency: (id: string, page = 1, pageSize = 20, signal?: AbortSignal) =>
    platformRequest<AccountConcurrencyPage>(
      `/accounts/concurrency?${new URLSearchParams({ accountId: id, page: String(page), pageSize: String(pageSize) })}`,
      { signal }
    ),
  groups: (
    search: string,
    page: number,
    signal?: AbortSignal,
    platform?: string
  ) =>
    platformRequest<NumberedPage<AccountGroupOption>>(
      `/account-groups?${new URLSearchParams({ search, page: String(page), pageSize: '50', ...(platform ? { platform } : {}) })}`,
      { signal }
    ),
  proxies: (search: string, page: number, signal?: AbortSignal) =>
    platformRequest<NumberedPage<SavedProxy>>(
      `/proxies?${new URLSearchParams({ search, page: String(page), pageSize: '50' })}`,
      { signal }
    ),
  update: (
    account: UpstreamAccount,
    settings: AccountSettings,
    proxyId: string,
    connection?: AccountConnection,
    name?: string
  ) =>
    platformRequest('/accounts/update', {
      method: 'POST',
      body: {
        accountId: account.id,
        ...(name !== undefined ? { name } : {}),
        configRevision: account.configRevision,
        ...settings,
        outboundProxyId: proxyId,
        ...(connection ? { connection } : {}),
      },
    }),
  batchUpdate: (
    configRevision: number,
    accountIds: string[],
    changes: Partial<AccountSettings> & { outboundProxyId?: string }
  ) =>
    platformRequest('/accounts/batch-update', {
      method: 'POST',
      body: { configRevision, accountIds, ...changes },
    }),
  remove: (account: UpstreamAccount) =>
    platformRequest('/accounts/delete', {
      method: 'POST',
      body: { provider: account.provider, accountIds: [account.id] },
    }),
  refresh: (id: string) =>
    platformRequest('/accounts/refresh', {
      method: 'POST',
      body: { accountId: id },
    }),
  refreshQuota: (id: string) =>
    platformRequest('/accounts/quota/refresh', {
      method: 'POST',
      timeoutMs: 45000,
      body: { accountId: id },
    }),
  previewModels: (
    provider: UpstreamProvider,
    baseUrl: string,
    apiKey: string,
    proxyId: string,
    signal?: AbortSignal
  ) =>
    platformRequest<{ models: { id: string; label: string }[] }>(
      '/accounts/models/preview',
      {
        method: 'POST',
        timeoutMs: 45000,
        signal,
        body: {
          provider,
          data: {
            schema_version: 1,
            name: 'Model discovery',
            base_url: baseUrl,
            api_key: apiKey,
          },
          ...(proxyId ? { outboundProxyId: proxyId } : {}),
        },
      }
    ),
  testModels: (id: string, signal?: AbortSignal) =>
    platformRequest<{
      models: {
        id: string
        label: string
        kind: 'text' | 'image'
        compact?: boolean
      }[]
    }>('/accounts/connection-test/models', {
      method: 'POST',
      timeoutMs: 45000,
      signal,
      body: { accountId: id },
    }),
  syncModels: (id: string, signal?: AbortSignal) =>
    platformRequest<{ models: { id: string; label: string }[] }>(
      '/accounts/models/refresh',
      { method: 'POST', timeoutMs: 45000, signal, body: { accountId: id } }
    ),
  models: (id: string, signal?: AbortSignal) =>
    platformRequest<{ models: { id: string; label: string }[] }>(
      `/accounts/models?${new URLSearchParams({ accountId: id })}`,
      { signal }
    ),
  personalInfo: (id: string, signal?: AbortSignal) =>
    platformRequest<AccountPersonalInfo>(
      `/accounts/personal-info?${new URLSearchParams({ accountId: id })}`,
      { signal }
    ),
  quotaForecast: (id: string, signal?: AbortSignal) =>
    platformRequest<AccountQuotaForecast>(
      `/accounts/quota-forecast?${new URLSearchParams({ accountId: id })}`,
      { signal }
    ),
  resetCredits: (id: string, signal?: AbortSignal) =>
    platformRequest<AccountResetCredits>(
      `/accounts/reset-credits?${new URLSearchParams({ accountId: id })}`,
      { signal }
    ),
  consumeResetCredit: (command: ConsumeResetCredit) =>
    platformRequest<{ code: string; credit: AccountResetCredit | null }>(
      '/accounts/reset-credits',
      { method: 'POST', body: command }
    ),
  import: (
    provider: UpstreamProvider,
    data: Record<string, unknown>,
    settings: AccountSettings,
    proxyId: string
  ) =>
    platformRequest<{ importedCount: number; accountIds: string[] }>(
      '/accounts/import',
      {
        method: 'POST',
        body: {
          provider,
          data,
          settings,
          ...(proxyId ? { outboundProxyId: proxyId } : {}),
        },
      }
    ),
  startAuthorization: (
    provider: UpstreamProvider,
    name: string,
    proxyId: string,
    accountId?: string
  ) =>
    platformRequest<AuthorizationFlow>('/accounts/oauth/start', {
      method: 'POST',
      body: {
        provider,
        name,
        outboundProxyId: proxyId,
        ...(accountId ? { accountId } : {}),
      },
    }),
  completeAuthorization: (
    provider: UpstreamProvider,
    flowId: string,
    callbackUrl: string,
    settings: AccountSettings
  ) =>
    platformRequest<{ accountId: string }>('/accounts/oauth/complete', {
      method: 'POST',
      timeoutMs: 120_000,
      body: { provider, flowId, callbackUrl, settings },
    }),
}
