import {
  smartSchedulingSchema,
  type GatewaySettingsSnapshot,
  type GatewaySettingsUpdate,
  type RequestProfile,
} from '@/api/gateway-settings'
import {
  validatePrivacyPolicy,
  validateRequestLocation,
  validateWarmupSchedule,
} from './codex-api'
import { modelMappingsError } from './model-mappings-draft'
import { openaiPreset, requestProfileErrors } from './profile-draft'
import { platformIds } from '@/lib/upstream-platforms'

const u32Max = 4_294_967_295
export const numericFields = {
  responsesMaxDecompressedBodyBytes: {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    tab: 'basic',
  },
  refreshMarginSeconds: { min: 1, max: Number.MAX_SAFE_INTEGER, tab: 'basic' },
  refreshConcurrency: { min: 1, max: u32Max, tab: 'basic' },
  maxConcurrentPerAccount: { min: 0, max: u32Max, tab: 'basic' },
  maxWaitingPerKey: { min: 0, max: 1000, tab: 'basic' },
  maxWaitingPerAccount: { min: 0, max: 1000, tab: 'basic' },
  concurrencyWaitTimeoutSeconds: { min: 1, max: 120, tab: 'basic' },
  maxAccountRotations: { min: 0, max: 31, tab: 'basic' },
  usageRetentionDays: { min: 1, max: 31, tab: 'basic' },
  opsEventRetentionDays: { min: 1, max: u32Max, tab: 'basic' },
  auditRetentionDays: { min: 1, max: u32Max, tab: 'basic' },
  accountAutoFreezeThreshold: { min: 2, max: 1000, tab: 'codex' },
  accountAutoFreezeWindowSeconds: { min: 60, max: 3600, tab: 'codex' },
  accountAutoFreezeDurationSeconds: { min: 300, max: 604800, tab: 'codex' },
  openaiGuardianReservedConcurrency: { min: 0, max: u32Max, tab: 'codex' },
  openaiSessionAffinityTtlHours: { min: 1, max: 720, tab: 'codex' },
  resetCreditLeadMinutes: { min: 1, max: 1440, tab: 'codex' },
} as const
export type NumericField = keyof typeof numericFields
export const textFields = [
  'minCodexDesktopVersion',
  'minCodexCliVersion',
  'accountAutoFreezeProbeModel',
  'accountWarmupModel',
  'accountWarmupScheduleTime',
  'resetCreditMaxWeeklyRemainingPercent',
] as const
export type TextField = (typeof textFields)[number]
export type GatewayFieldName =
  | NumericField
  | TextField
  | 'smartScheduling'
  | 'codexPrivacyPolicy'
  | 'requestLocation'
  | 'modelMappings'
  | 'openaiClientProfile'
  | 'xaiClientProfile'
  | 'geminiClientProfile'
  | 'claudeClientProfile'
export type GatewayErrors = Partial<Record<GatewayFieldName, string>>
export type GatewayDraft = Omit<
  GatewaySettingsSnapshot,
  NumericField | TextField | 'providerRequestProfiles'
> &
  Record<NumericField | TextField, string> & {
    providerRequestProfiles: Record<string, RequestProfile>
  }

export function gatewayDraft(snapshot: GatewaySettingsSnapshot): GatewayDraft {
  return {
    ...snapshot,
    providerRequestProfiles: snapshot.providerRequestProfiles ?? {},
    responsesMaxDecompressedBodyBytes: String(
      snapshot.responsesMaxDecompressedBodyBytes
    ),
    refreshMarginSeconds: String(snapshot.refreshMarginSeconds),
    refreshConcurrency: String(snapshot.refreshConcurrency),
    maxConcurrentPerAccount: String(snapshot.maxConcurrentPerAccount),
    maxWaitingPerKey: String(snapshot.maxWaitingPerKey),
    maxWaitingPerAccount: String(snapshot.maxWaitingPerAccount),
    concurrencyWaitTimeoutSeconds: String(
      snapshot.concurrencyWaitTimeoutSeconds
    ),
    maxAccountRotations: String(snapshot.maxAccountRotations),
    usageRetentionDays: String(snapshot.usageRetentionDays),
    opsEventRetentionDays: String(snapshot.opsEventRetentionDays),
    auditRetentionDays: String(snapshot.auditRetentionDays),
    accountAutoFreezeThreshold: String(snapshot.accountAutoFreezeThreshold),
    accountAutoFreezeWindowSeconds: String(
      snapshot.accountAutoFreezeWindowSeconds
    ),
    accountAutoFreezeDurationSeconds: String(
      snapshot.accountAutoFreezeDurationSeconds
    ),
    openaiGuardianReservedConcurrency: String(
      snapshot.openaiGuardianReservedConcurrency
    ),
    openaiSessionAffinityTtlHours: String(
      snapshot.openaiSessionAffinityTtlHours
    ),
    minCodexDesktopVersion: snapshot.minCodexDesktopVersion ?? '',
    minCodexCliVersion: snapshot.minCodexCliVersion ?? '',
    accountAutoFreezeProbeModel: snapshot.accountAutoFreezeProbeModel ?? '',
    accountWarmupModel: snapshot.accountWarmupModel ?? '',
    resetCreditLeadMinutes: String(snapshot.resetCreditLeadMinutes),
    resetCreditMaxWeeklyRemainingPercent:
      snapshot.resetCreditMaxWeeklyRemainingPercent === null
        ? ''
        : String(snapshot.resetCreditMaxWeeklyRemainingPercent),
  }
}

const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function gatewayErrors(
  draft: GatewayDraft,
  saved?: GatewayDraft | null
): GatewayErrors {
  const errors: GatewayErrors = {}
  for (const key of Object.keys(numericFields) as NumericField[]) {
    const { min, max } = numericFields[key]
    const value = Number(draft[key])
    if (
      !/^\d+$/.test(draft[key]) ||
      !Number.isSafeInteger(value) ||
      value < min ||
      value > max
    )
      errors[key] = 'numberError'
  }
  for (const key of ['minCodexDesktopVersion', 'minCodexCliVersion'] as const) {
    const value = draft[key]
    if (value && (value.length > 64 || !semver.test(value)))
      errors[key] = 'versionError'
  }
  for (const key of [
    'accountAutoFreezeProbeModel',
    'accountWarmupModel',
  ] as const) {
    const model = draft[key]
    if (
      model &&
      (new TextEncoder().encode(model).length > 128 ||
        model !== model.trim() ||
        hasControlCharacters(model))
    )
      errors[key] = 'modelError'
  }
  if (draft.accountWarmupEnabled && !draft.accountWarmupModel)
    errors.accountWarmupModel = 'warmupModelError'
  const schedule = validateWarmupSchedule(draft.accountWarmupScheduleTime)
  if (schedule) errors.accountWarmupScheduleTime = schedule
  const percent = draft.resetCreditMaxWeeklyRemainingPercent
  if (percent !== '' && (!/^\d+$/.test(percent) || Number(percent) > 100))
    errors.resetCreditMaxWeeklyRemainingPercent = 'percentError'
  if (!smartSchedulingSchema.safeParse(draft.smartScheduling).success)
    errors.smartScheduling = 'weightsError'
  const privacy = validatePrivacyPolicy(draft.codexPrivacyPolicy)
  if (privacy) errors.codexPrivacyPolicy = privacy
  const location = validateRequestLocation(draft.requestLocation)
  if (location) errors.requestLocation = location
  const mappings = modelMappingsError(draft.modelMappings)
  if (mappings) errors.modelMappings = mappings
  for (const provider of platformIds) {
    const profile = draft.providerRequestProfiles[provider]
    if (
      saved &&
      JSON.stringify(profile) ===
        JSON.stringify(saved.providerRequestProfiles[provider])
    )
      continue
    if (Object.keys(requestProfileErrors(provider, profile ?? null)).length)
      errors[`${provider}ClientProfile`] = 'profileError'
  }
  return errors
}

export function fieldTab(field: GatewayFieldName): string {
  if (field === 'geminiClientProfile') return 'gemini'
  if (field === 'claudeClientProfile') return 'claude'
  return field in numericFields
    ? numericFields[field as NumericField].tab
    : field === 'smartScheduling'
      ? 'basic'
      : field === 'modelMappings'
        ? 'models'
        : field === 'xaiClientProfile'
          ? 'xai'
          : 'codex'
}

export function gatewayReplacement(
  draft: GatewayDraft,
  saved?: GatewayDraft | null
): GatewaySettingsUpdate {
  const {
    providerRequestProfiles,
    smartSchedulingDefaults: _defaults,
    ...values
  } = draft
  const profileUpdates: Record<string, RequestProfile | null> = {}
  const normalizedProfiles: Record<string, RequestProfile> = {
    ...providerRequestProfiles,
    ...(providerRequestProfiles.openai
      ? {
          openai: openaiPreset(
            providerRequestProfiles.openai
          ) as RequestProfile,
        }
      : {}),
  }
  if (saved) {
    for (const provider of new Set([
      ...Object.keys(normalizedProfiles),
      ...Object.keys(saved.providerRequestProfiles),
    ])) {
      if (
        JSON.stringify(normalizedProfiles[provider]) !==
        JSON.stringify(saved.providerRequestProfiles[provider])
      )
        profileUpdates[provider] = normalizedProfiles[provider] ?? null
    }
  }
  return {
    ...values,
    accountWarmupEnabled: false,
    ...(Object.keys(profileUpdates).length
      ? { providerRequestProfiles: profileUpdates }
      : {}),
    responsesMaxDecompressedBodyBytes: Number(
      draft.responsesMaxDecompressedBodyBytes
    ),
    refreshMarginSeconds: Number(draft.refreshMarginSeconds),
    refreshConcurrency: Number(draft.refreshConcurrency),
    maxConcurrentPerAccount: Number(draft.maxConcurrentPerAccount),
    maxWaitingPerKey: Number(draft.maxWaitingPerKey),
    maxWaitingPerAccount: Number(draft.maxWaitingPerAccount),
    concurrencyWaitTimeoutSeconds: Number(draft.concurrencyWaitTimeoutSeconds),
    maxAccountRotations: Number(draft.maxAccountRotations),
    usageRetentionDays: Number(draft.usageRetentionDays),
    opsEventRetentionDays: Number(draft.opsEventRetentionDays),
    auditRetentionDays: Number(draft.auditRetentionDays),
    accountAutoFreezeThreshold: Number(draft.accountAutoFreezeThreshold),
    accountAutoFreezeWindowSeconds: Number(
      draft.accountAutoFreezeWindowSeconds
    ),
    accountAutoFreezeDurationSeconds: Number(
      draft.accountAutoFreezeDurationSeconds
    ),
    openaiGuardianReservedConcurrency: Number(
      draft.openaiGuardianReservedConcurrency
    ),
    openaiSessionAffinityTtlHours: Number(draft.openaiSessionAffinityTtlHours),
    minCodexDesktopVersion: draft.minCodexDesktopVersion || null,
    minCodexCliVersion: draft.minCodexCliVersion || null,
    accountAutoFreezeProbeModel: draft.accountAutoFreezeProbeModel || null,
    accountWarmupModel: draft.accountWarmupModel || null,
    resetCreditLeadMinutes: Number(draft.resetCreditLeadMinutes),
    resetCreditMaxWeeklyRemainingPercent:
      draft.resetCreditMaxWeeklyRemainingPercent === ''
        ? null
        : Number(draft.resetCreditMaxWeeklyRemainingPercent),
  }
}
