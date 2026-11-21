import { sessionPort } from './session-port'
import { ApiError } from './errors'
import { platformRequest } from './platform-client'
import { transportRequest } from './transport'

export type ObservationRange = 'today' | '24h' | '7d' | '30d'
export type TrendKind = 'usage' | 'latency' | 'errors'

export function observationWindow(range: ObservationRange, asOf: number) {
  return range === '24h'
    ? new URLSearchParams({
        startTime: new Date(asOf - 86_400_000).toISOString(),
        endTime: new Date(asOf).toISOString(),
      })
    : new URLSearchParams({ period: range, asOf: String(asOf) })
}

export type ObservationPage<T> = {
  items: T[]
  currentPage: number
  pageSize: number
  total: number
}
export type Analytics = {
  coverageStart: string | null
  coverageStartDisplay: string | null
  coverageEnd: string | null
  coverageEndDisplay: string | null
  generatedAt: string
  generatedAtDisplay: string
  lagSeconds: number
  state: string
  percentilesApproximate: boolean
}
export type Cost = { currency: string; estimatedAmount: string }
export type CostCoverage = {
  known: number
  partial: number
  unknown: number
  notBillable: number
}
export type TokenDetails = {
  inputTokens: number | null
  outputTokens: number | null
  cachedInputTokens: number | null
  cacheWriteInputTokens: number | null
  reasoningOutputTokens: number | null
  imageInputTokens: number | null
  imageOutputTokens: number | null
  totalTokens: number | null
}
export type UsageBilling = {
  image?: {
    inputAmountDisplay: string
    cacheReadAmountDisplay: string
    inputPriceDisplay: string
    cacheReadPriceDisplay: string
  }
  longContextBillingApplied: boolean
  inputPriceDisplay: string
  outputPriceDisplay: string
  cacheReadPriceDisplay: string
  cacheWritePriceDisplay: string
  inputAmountDisplay: string
  outputAmountDisplay: string
  cacheReadAmountDisplay: string
  cacheWriteAmountDisplay: string
  standardAmountDisplay: string
  totalAmountDisplay: string
  serviceTierDisplay: string
  multiplierDisplay: string
}
export type UsageCustomer = {
  userId: string | null
  userName: string | null
  userEmail: string | null
  retailChargeUsd: string | null
  pendingChargeUsd: string | null
  retailState: string | null
  fundingSource: string | null
  subscriptionId: string | null
}
export type UsageRecord = UsageCustomer & {
  routingGroupRefs: string[]
  routingGroupNamesSnapshot: string[]
  accountNotes: string | null
  accountPlanType: string | null
  accountPlanTypeDisplay: string | null
  reasoningEffort: string | null
  reasoningPreset: string | null
  subagentKind: string | null
  compact: boolean
  latencyDetails: UsageLatencyDetails
  id: string
  logicalOutcome: string
  errorCode: string | null
  errorMessage: string | null
  clientApiKeyName: string | null
  provider: string | null
  authenticationKind: string | null
  accountId: string | null
  accountEmail: string | null
  accountName: string | null
  route: string
  model: string | null
  requestedModel: string | null
  upstreamModel: string | null
  serviceTier: string | null
  clientTransport: string
  upstreamTransport: string | null
  tokenDetails: TokenDetails
  billing: UsageBilling | null
  firstTokenLatencyMs: number | null
  latencyMs: number | null
  createdAt: string
  createdAtDisplay: string
  clientIp: string | null
  userAgent: string | null
}
export type UsageAttempt = {
  id: string
  attemptIndex: number
  trigger: string
  provider: string
  model: string | null
  transport: string
  sendState: string
  outcome: string
  downstreamCommitted: boolean
  statusCode: number | null
  providerErrorCode: string | null
  failureClass: string | null
  costEstimateStatus: string
  estimatedCostAmount: string | null
  estimatedCostCurrency: string | null
  inputTokens: number | null
  outputTokens: number | null
  cachedInputTokens: number | null
  totalTokens: number | null
  firstTokenMs: number | null
  latencyMs: number | null
  credentialName: string | null
  accountId: string | null
  accountName: string | null
  accountEmail: string | null
  authenticationKind: string | null
  startedAt: string
  completedAt: string | null
}
export type UsageDetail = Omit<
  UsageRecord,
  | 'clientApiKeyName'
  | 'errorCode'
  | 'errorMessage'
  | 'accountNotes'
  | 'accountPlanType'
  | 'accountPlanTypeDisplay'
  | 'compact'
> & {
  compact: boolean | null
  clientApiKeyId: string | null
  kind: string
  requestKind: string | null
  attemptIndex: number | null
  websocketPool: { kind: string } | null
  imageGenerationRequested: boolean
  imageGenerationSucceeded: boolean | null
  requestId: string
  routingScope: string
  routingGroupRefs: string[]
  routingGroupNamesSnapshot: string[]
  statusCode: number | null
  clientStatusCode?: number
  upstreamStatusCode?: number
  httpVersion?: string
  latencyDetails: UsageLatencyDetails
  protocol: string
  responseId: string | null
  upstreamRequestId: string | null
  attemptCount: number
  attempts: UsageAttempt[]
  attemptsComplete: boolean
  costs: Cost[]
  costCoverage: CostCoverage
  message: string
  metadata: Record<string, unknown>
}
export type UsageLatencyDetails = {
  admissionDecisionMs?: number
  accountSelectionWaitMs?: number
  capacityUsedSlots?: number
  capacityTotalSlots?: number
  transportDecisionWaitMs?: number
  wsConnectMs?: number
  upstreamHeadersMs?: number
  firstEventMs?: number
  firstReasoningMs?: number
  firstTextMs?: number
  openaiProcessingMs?: number
  upstreamResponseMs?: number
  upstreamApiOverheadMs?: number
  upstreamEngineMs?: number
}
export type TrendPoint = {
  bucket: string
  label: string
  requestsValue: number
  inputTokensValue: number
  outputTokensValue: number
  cachedInputTokensValue: number
  cacheHitRateValue: number
  tokensValue: number
  errorsValue: number
  latencyValue: number | null
  successRateValue: number | null
  firstTokenP95Ms: number | null
  latencyP95Ms: number | null
  outputThroughputP50: number | null
}
export type ObservationTrend = {
  analytics: Analytics
  kind: TrendKind
  points: TrendPoint[]
}
export type DashboardSummary = {
  analytics: Analytics
  asOf: string
  asOfDisplay: string
  cards: {
    users: { newUsers: number; totalUsers: number }
    credentials: {
      total: string
      totalValue: number
      available: string
      unavailable: string
    }
    traffic: {
      todayRequests: string
      todayRequestsValue: number
      totalRequests: string
    }
    // This imported card is already a USD display string, unlike Cost's raw decimal.
    tokens: {
      todayTokens: string
      todayTokensValue: number
      totalTokens: string
      totalBillingAmountUsd: string
    }
    cache: {
      todayHitRate: string
      todayHitRateValue: number | null
      totalHitRate: string
      totalCachedInputTokens: string
      averageFirstTokenLatencyMs: string
    }
  }
  trend: ObservationTrend
  healthTimeline: {
    status: string
    reliabilityDisplay: string
    successRequests: number
    failedRequests: number
    cancelledRequests: number
    incompleteRequests: number
    callerErrorRequests: number
    points: {
      bucketStart: string
      time: string
      status: string
      reliabilityDisplay: string
      successRequests: number
      failedRequests: number
    }[]
  }
  poolSummary: {
    total: number
    normal: number
    quotaExhausted: number
    rateLimited: number
    disabled: number
    error: number
  }
  capacityInfo: {
    maxConcurrentPerAccount: number
    totalSlots: number | null
    usedSlots: number | null
    availableSlots: number | null
  }
}
export type UsageSummary = {
  averageFirstTokenMs: string
  averageFirstTokenMsValue: number | null
  retailChargeUsd: string
  analytics: Analytics
  totalRequests: string
  inputTokens: string
  outputTokens: string
  cachedInputTokens: string
  cacheWriteInputTokens: string
  totalTokens: string
  averageLatencyMs: string
  logicalRequests: {
    requestCount: number
    successCount: number
    failureCount: number
    cancelledCount: number
    incompleteCount: number
    callerErrorCount: number
  }
  attempts: {
    attemptCount: number
    failureCount: number
    rateLimitedCount: number
    costCoverage: CostCoverage
    costs: Cost[]
  }
}
export type OperationError = {
  id: string
  requestId: string | null
  kind: string
  operation: string
  provider: string | null
  accountName: string | null
  model: string | null
  failureClass: string
  upstreamSendState: string | null
  message: string
  createdAt: string
  createdAtDisplay: string
  clientApiKeyName: string | null
  clientApiKeyId: string | null
  accountId: string | null
  upstreamRequestId: string | null
  clientStatusCode: number | null
  upstreamStatusCode: number | null
  errorDetails: string | null
  metadata: { source: string; component: string }
}

function read<T>(path: string, params: URLSearchParams, signal: AbortSignal) {
  return platformRequest<T>(`${path}?${params}`, { signal })
}

async function exportDiagnostics(
  id: string,
  signal: AbortSignal
): Promise<Blob> {
  const session = sessionPort().getSession()
  if (session?.audience !== 'management')
    throw new ApiError(
      401,
      'identity.unauthorized',
      'Management session required'
    )
  const query = new URLSearchParams({ requestId: id })
  const response = await transportRequest({
    audience: 'platform',
    path: `/diagnostics/export?${query}`,
    accept: 'application/zip',
    signal,
    timeoutMs: 15_000,
    skipStepUp: true,
  })
  if (response.status === 401)
    sessionPort().invalidateSession(session.id)
  if (
    !response.ok ||
    response.headers.get('Content-Type')?.split(';')[0].trim() !==
      'application/zip'
  )
    throw new ApiError(
      response.ok ? 503 : response.status,
      'platform.unavailable',
      'Diagnostic export unavailable',
      undefined,
      session.id
    )
  const archive = await response.blob()
  if (sessionPort().getSession()?.id !== session.id)
    throw new ApiError(
      401,
      'identity.unauthorized',
      'Session changed',
      undefined,
      session.id
    )
  return archive
}

export const observability = {
  exportDiagnostics,
  dashboard: (params: URLSearchParams, signal: AbortSignal) =>
    read<DashboardSummary>('/dashboard/summary', params, signal),
  trend: (params: URLSearchParams, signal: AbortSignal) =>
    read<ObservationTrend>('/dashboard/trend', params, signal),
  records: (params: URLSearchParams, signal: AbortSignal) =>
    read<ObservationPage<UsageRecord>>('/usage/records', params, signal),
  detail: (id: string, signal: AbortSignal) =>
    read<UsageDetail>(
      '/usage/records/detail',
      new URLSearchParams({ id }),
      signal
    ),
  summary: (params: URLSearchParams, signal: AbortSignal) =>
    read<UsageSummary>('/usage/records/summary', params, signal),
  errors: (params: URLSearchParams, signal: AbortSignal) =>
    read<ObservationPage<OperationError>>('/operations/errors', params, signal),
}
