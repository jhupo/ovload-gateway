/** Wire types shared by settings API adapters and feature state. */
export type AuditNode = {
  id: string
  name: string
  baseUrl: string
  model: string
  timeoutMs: string
  enabled: boolean
  stateCharLimit: string
  proxyId: string
}

export type AuditRule = {
  id: string
  name: string
  enabled: boolean
  instructions: string
  trueCriteria: string
  falseCriteria: string
  flagThreshold: string
  hitThreshold: string
}

export type AuditDraft = {
  version: 2
  shared: {
    endpoints: AuditNode[]
    groupIds: string[]
    retries: string
    sampleRate: string
    recordNonHits: boolean
    hitRetentionDays: string
    nonHitRetentionDays: string
    keywordMode: 'keyword_only' | 'keyword_and_api' | 'api_only'
    keywords: string
  }
  prompt: AuditStage
  content: AuditStage & {
    delivery: 'buffered' | 'observe'
    maxOutputChars: string
  }
}

export type AuditStage = {
  enabled: boolean
  rules: AuditRule[]
  mode: 'observe' | 'block'
  emailOnHit: boolean
  autoBan: boolean
  failureAction: 'block' | 'allow'
  blockStatus: '400' | '403' | '422'
  blockMessage: string
  banThreshold: string
  violationHours: string
}

export type ReferralOverride = {
  userId: string
  invitationCode: string
  rate: string
}

export type ReferralDraft = {
  enabled: boolean
  rate: string
  freezeHours: string
  eligibilityDays: string
  cap: string
  overrides: ReferralOverride[]
}

export type ChannelMonitoringDraft = {
  version: 1
  thresholds: {
    samples: string
    errorWarning: string
    errorCritical: string
    ttftTarget: string
    ttftWarning: string
    ttftCritical: string
    cacheWarning: string
    cacheCritical: string
  }
  groupIds: string[]
  ignoredErrors: string[]
}

export type Agreement = {
  enabled: boolean
  mode: 'modal' | 'checkbox'
  updated: string
  documents: { id: string; title: string; slug: string; content: string }[]
}
