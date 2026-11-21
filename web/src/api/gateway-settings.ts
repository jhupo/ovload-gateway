import { z } from 'zod'
import {
  privacyPolicySchema,
  requestLocationSchema,
} from './contracts/codex'
import { platformRequest } from './platform-client'

const uint = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const u32 = uint.max(4_294_967_295)
function safeJsonNumbers(value: unknown): boolean {
  if (typeof value === 'number')
    return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER
  if (Array.isArray(value)) return value.every(safeJsonNumbers)
  if (value && typeof value === 'object')
    return Object.values(value).every(safeJsonNumbers)
  return true
}
const preservedJson = z.json().refine(safeJsonNumbers)
export const requestProfileSchema = z.record(z.string(), preservedJson)
export type RequestProfile = z.infer<typeof requestProfileSchema>
export const schedulingWeightNames = [
  'loadWeight',
  'quotaWeight',
  'healthWeight',
  'latencyWeight',
  'resetWeight',
  'queueWeight',
] as const
const weight = z
  .number()
  .min(0)
  .max(10)
  .refine((value) => Math.round(value * 10) / 10 === value)
export const smartSchedulingSchema = z
  .object({
    loadWeight: weight,
    quotaWeight: weight,
    healthWeight: weight,
    latencyWeight: weight,
    resetWeight: weight,
    queueWeight: weight,
  })
  .refine((value) => Object.values(value).some((weight) => weight > 0))
export type SmartScheduling = z.infer<typeof smartSchedulingSchema>

// Read metadata separately; writes only include changed provider configurations.
export const gatewaySettingsSchema = z.object({
  configRevision: uint.positive(),
  codexPrivacyPolicy: privacyPolicySchema.refine(safeJsonNumbers),
  requestLocationEnabled: z.boolean(),
  requestLocation: requestLocationSchema,
  refreshMarginSeconds: uint.positive(),
  refreshConcurrency: u32.positive(),
  maxConcurrentPerAccount: u32,
  maxWaitingPerKey: u32.max(1000),
  maxWaitingPerAccount: u32.max(1000),
  concurrencyWaitTimeoutSeconds: u32.min(1).max(120),
  openaiGuardianReservedConcurrency: u32,
  openaiAccountAffinity: z.enum(['relaxed', 'preferred', 'strict']),
  maxAccountRotations: u32.max(31),
  openaiSessionAffinityTtlHours: u32.min(1).max(720),
  responsesMaxDecompressedBodyBytes: uint.positive(),
  smartScheduling: smartSchedulingSchema,
  smartSchedulingDefaults: smartSchedulingSchema.optional(),
  providerRequestProfiles: z
    .record(z.string(), requestProfileSchema)
    .optional(),
  minCodexDesktopVersion: z.string().nullable(),
  minCodexCliVersion: z.string().nullable(),
  usageRetentionDays: u32.min(1).max(31),
  opsEventRetentionDays: u32.positive(),
  auditRetentionDays: u32.positive(),
  accountAutoFreezeEnabled: z.boolean(),
  accountAutoFreezeThreshold: u32.min(2).max(1000),
  accountAutoFreezeWindowSeconds: uint.min(60).max(3600),
  accountAutoFreezeDurationSeconds: uint.min(300).max(604800),
  accountAutoFreezeProbeEnabled: z.boolean(),
  accountAutoFreezeProbeModel: z.string().nullable(),
  accountAutoFreezeAdaptiveConcurrency: z.boolean(),
  accountWarmupEnabled: z.boolean(),
  accountWarmupScheduleTime: z.string(),
  accountWarmupModel: z.string().nullable(),
  resetCreditLeadMinutes: u32.min(1).max(1440),
  resetCreditMaxWeeklyRemainingPercent: u32.max(100).nullable(),
  modelMappings: z.record(z.string(), z.string()),
  rotationStrategy: z.enum([
    'smart',
    'quota_reset_priority',
    'round_robin',
    'sticky',
  ]),
})

export type GatewaySettingsSnapshot = z.infer<typeof gatewaySettingsSchema>
const gatewaySettingsUpdateSchema = gatewaySettingsSchema
  .omit({
    providerRequestProfiles: true,
    smartSchedulingDefaults: true,
  })
  .extend({
    providerRequestProfiles: z
      .record(z.string(), requestProfileSchema.nullable())
      .optional(),
  })
export type GatewaySettingsUpdate = z.infer<typeof gatewaySettingsUpdateSchema>

export const gatewaySettingsApi = {
  load: async (signal?: AbortSignal): Promise<GatewaySettingsSnapshot> =>
    gatewaySettingsSchema.parse(
      await platformRequest<unknown>('/settings', { signal })
    ),
  replace: async (
    settings: GatewaySettingsUpdate,
    signal?: AbortSignal
  ): Promise<GatewaySettingsSnapshot> => {
    const body = gatewaySettingsUpdateSchema.parse(settings)
    return gatewaySettingsSchema.parse(
      await platformRequest<unknown>('/settings/update', {
        method: 'POST',
        body,
        signal,
      })
    )
  },
}
