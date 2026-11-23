import { expect, test } from 'vitest'
import type { GatewaySettingsSnapshot } from '@/api/gateway-settings'
import { gatewayDraft } from './draft'
import { reconcileGatewayRevision } from './revision'

const snapshot: GatewaySettingsSnapshot = {
  configRevision: 17,
  codexPrivacyPolicy: { enabled: false, onError: 'skip_rule', rules: [] },
  requestLocationEnabled: false,
  requestLocation: {
    country: 'US',
    region: 'Fixture',
    city: 'Fixture',
    timezone: 'UTC',
  },
  refreshMarginSeconds: 300,
  refreshConcurrency: 2,
  maxConcurrentPerAccount: 5,
  maxWaitingPerKey: 0,
  maxWaitingPerAccount: 0,
  concurrencyWaitTimeoutSeconds: 30,
  openaiGuardianReservedConcurrency: 1,
  openaiAccountAffinity: 'strict',
  maxAccountRotations: 3,
  openaiSessionAffinityTtlHours: 24,
  responsesMaxDecompressedBodyBytes: 67_108_864,
  smartScheduling: {
    loadWeight: 1,
    quotaWeight: 0.8,
    healthWeight: 1,
    latencyWeight: 0.5,
    resetWeight: 0,
    queueWeight: 0,
  },
  usageRetentionDays: 7,
  opsEventRetentionDays: 30,
  auditRetentionDays: 90,
  accountAutoFreezeEnabled: false,
  accountAutoFreezeThreshold: 3,
  accountAutoFreezeWindowSeconds: 300,
  accountAutoFreezeDurationSeconds: 600,
  accountAutoFreezeProbeEnabled: false,
  accountAutoFreezeProbeModel: null,
  accountAutoFreezeAdaptiveConcurrency: false,
  accountWarmupEnabled: false,
  accountWarmupScheduleTime: '08:00',
  accountWarmupModel: null,
  resetCreditLeadMinutes: 60,
  resetCreditMaxWeeklyRemainingPercent: null,
  modelMappings: { 'fixture-model': 'fixture-upstream' },
  providerRequestProfiles: {
    fixture: { first: 'one', second: { enabled: true } },
  },
  rotationStrategy: 'smart',
}

test('a price revision preserves unsaved gateway changes without mutating its baseline', () => {
  const saved = gatewayDraft(snapshot)
  const draft = {
    ...saved,
    maxConcurrentPerAccount: '',
    modelMappings: { 'local-model': 'local-upstream' },
  }
  const result = reconcileGatewayRevision(saved, draft, {
    ...snapshot,
    configRevision: 19,
  })
  expect(result).toEqual({
    saved: { ...saved, configRevision: 19 },
    draft: { ...draft, configRevision: 19 },
  })
  expect(saved.configRevision).toBe(17)
  expect(draft.configRevision).toBe(17)
})

test('external gateway changes prevent advancing the local revision', () => {
  const saved = gatewayDraft(snapshot)
  expect(
    reconcileGatewayRevision(saved, saved, {
      ...snapshot,
      configRevision: 18,
      maxConcurrentPerAccount: 7,
    })
  ).toBeNull()
  expect(
    reconcileGatewayRevision(saved, saved, {
      ...snapshot,
      configRevision: 18,
      providerRequestProfiles: { fixture: { first: 'external' } },
    })
  ).toBeNull()
})

test('a revision cannot move either saved or draft backwards', () => {
  const saved = gatewayDraft(snapshot)
  expect(
    reconcileGatewayRevision(saved, saved, { ...snapshot, configRevision: 16 })
  ).toBeNull()
  expect(
    reconcileGatewayRevision(
      saved,
      { ...saved, configRevision: 20 },
      { ...snapshot, configRevision: 19 }
    )
  ).toBeNull()
})

test('equivalent configuration objects can use different JSON member order', () => {
  const saved = gatewayDraft(snapshot)
  expect(
    reconcileGatewayRevision(saved, saved, {
      ...snapshot,
      configRevision: 18,
      providerRequestProfiles: {
        fixture: { second: { enabled: true }, first: 'one' },
      },
    })
  ).toEqual({
    saved: { ...saved, configRevision: 18 },
    draft: { ...saved, configRevision: 18 },
  })
})
