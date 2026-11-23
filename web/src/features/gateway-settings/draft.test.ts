import { afterEach, expect, test, vi } from 'vitest'
import {
  gatewaySettingsApi,
  gatewaySettingsSchema,
  type GatewaySettingsSnapshot,
} from '@/api/gateway-settings'
import { PlatformPreflightError } from '@/api/platform-client'
import { useIdentitySession } from '@/stores/identity-session'
import { ensureStepUp } from '@/api/step-up'
import {
  fieldTab,
  gatewayDraft,
  gatewayErrors,
  gatewayReplacement,
} from './draft'

vi.mock('@/api/step-up', () => ({
  ensureStepUp: vi.fn().mockResolvedValue(undefined),
}))

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
  rotationStrategy: 'smart',
}

afterEach(() => {
  vi.unstubAllGlobals()
  useIdentitySession.getState().clear()
})

test('replacement retains loaded revision and unedited policy fields without GET metadata', () => {
  const loaded = gatewaySettingsSchema.parse({
    ...snapshot,
    providerRequestProfiles: { fixture: { secret: 'fixture-value' } },
    openaiClientProfile: { secret: 'fixture-value' },
    updatedAt: 'fixture',
  })
  const draft = gatewayDraft(loaded)
  draft.maxConcurrentPerAccount = '0'
  const replacement = gatewayReplacement(draft)
  expect(replacement).toEqual({ ...snapshot, maxConcurrentPerAccount: 0 })
  expect(replacement).not.toHaveProperty('providerRequestProfiles')
  expect(replacement).not.toHaveProperty('openaiClientProfile')
})

test('real bounds reject unsafe integers and preserve zero queue and unlimited concurrency', () => {
  const draft = gatewayDraft(snapshot)
  draft.maxConcurrentPerAccount = '0'
  expect(gatewayErrors(draft)).toEqual({})
  draft.usageRetentionDays = '32'
  draft.maxWaitingPerKey = '1001'
  draft.responsesMaxDecompressedBodyBytes = '9007199254740992'
  expect(gatewayErrors(draft)).toEqual({
    usageRetentionDays: 'numberError',
    maxWaitingPerKey: 'numberError',
    responsesMaxDecompressedBodyBytes: 'numberError',
  })
  expect(
    gatewaySettingsSchema.safeParse({
      ...snapshot,
      configRevision: Number.MAX_SAFE_INTEGER + 1,
    }).success
  ).toBe(false)
})

test('probe models validate against the real fields', () => {
  const draft = gatewayDraft(snapshot)
  expect(gatewayErrors(draft)).toEqual({})
  draft.accountAutoFreezeProbeModel = ' fixture-model'
  expect(gatewayErrors(draft)).toEqual({
    accountAutoFreezeProbeModel: 'modelError',
  })
  expect(fieldTab('accountAutoFreezeThreshold')).toBe('codex')
  expect(fieldTab('maxAccountRotations')).toBe('basic')
  expect(fieldTab('modelMappings')).toBe('models')
})

test('runtime API sends an exact replacement with CSRF and retains conflict as an error', async () => {
  useIdentitySession.getState().setSession({
    id: 'fixture-management-session',
    audience: 'management',
    tenant_id: null,
    user_id: null,
    principal_id: 'fixture-operator',
    expires_at: '2099-01-01T00:00:00Z',
    csrf_token: 'synthetic-csrf',
  })
  const fetch = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(
      Response.json({
        code: 200,
        message: 'ok',
        data: { ...snapshot, configRevision: 18 },
      })
    )
  )
  vi.stubGlobal('fetch', fetch)
  const result = await gatewaySettingsApi.replace(snapshot)
  expect(result.configRevision).toBe(18)
  expect(fetch.mock.calls[0]?.[0]).toBe('/api/admin/settings/update')
  const init = fetch.mock.calls[0]?.[1]
  expect(init?.method).toBe('POST')
  expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('synthetic-csrf')
  expect(JSON.parse(String(init?.body))).toEqual(snapshot)
  fetch.mockImplementation(() =>
    Promise.resolve(
      Response.json({ code: 409, message: 'fixture conflict' }, { status: 409 })
    )
  )
  await expect(gatewaySettingsApi.replace(snapshot)).rejects.toMatchObject({
    status: 409,
  })
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('runtime API rejects customer access and unsafe inherited policy numbers before writing', async () => {
  useIdentitySession.getState().setSession({
    id: 'fixture-customer-session',
    audience: 'customer',
    tenant_id: 'fixture-tenant',
    user_id: 'fixture-user',
    principal_id: null,
    expires_at: '2099-01-01T00:00:00Z',
  })
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(gatewaySettingsApi.load()).rejects.toMatchObject({ status: 401 })
  await expect(
    gatewaySettingsApi.replace({
      ...snapshot,
      codexPrivacyPolicy: {
        enabled: true,
        onError: 'skip_rule',
        rules: [
          {
            id: 'unsafe',
            name: 'unsafe',
            enabled: true,
            steps: [
              {
                scope: 'request_body',
                selector: '$.fixture',
                action: 'set_value',
                pattern: null,
                replacement: '',
                value: Number.MAX_SAFE_INTEGER + 1,
                replaceAll: false,
                caseInsensitive: false,
                multiLine: false,
              },
            ],
          },
        ],
      },
    })
  ).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})

test('cancelling authentication never writes and permits a later retry', async () => {
  useIdentitySession.getState().setSession({
    id: 'fixture-management-session',
    audience: 'management',
    tenant_id: null,
    user_id: null,
    principal_id: 'fixture-operator',
    expires_at: '2099-01-01T00:00:00Z',
    csrf_token: 'synthetic-csrf',
  })
  const fetch = vi.fn(() =>
    Promise.resolve(
      Response.json({
        code: 200,
        message: 'ok',
        data: { ...snapshot, configRevision: 18 },
      })
    )
  ).mockResolvedValueOnce(
    Response.json({ errorKey: 'identity.step_up_required' }, { status: 403 })
  )
  vi.stubGlobal('fetch', fetch)
  vi.mocked(ensureStepUp).mockRejectedValueOnce(
    new Error('Verification cancelled')
  )
  await expect(gatewaySettingsApi.replace(snapshot)).rejects.toBeInstanceOf(
    PlatformPreflightError
  )
  expect(fetch).toHaveBeenCalledTimes(1)
  await expect(gatewaySettingsApi.replace(snapshot)).resolves.toMatchObject({
    configRevision: 18,
  })
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('provider updates are scoped to changed providers and preserve unknown configurations', () => {
  const saved = gatewayDraft({
    ...snapshot,
    smartSchedulingDefaults: snapshot.smartScheduling,
    providerRequestProfiles: {
      fixture: { future: true },
      openai: {
        mode: 'custom',
        userAgent: 'fixture/1.0',
        originator: 'fixture',
        codexVersion: '1.0.0',
      },
      xai: {
        versionMode: 'latest',
        clientVersion: null,
        clientIdentifier: 'grok-shell',
        clientMode: 'headless',
        targetOs: 'linux',
        targetArch: 'x86_64',
      },
    },
  })
  const draft = structuredClone(saved)
  draft.maxConcurrentPerAccount = '9'
  const preset = gatewayReplacement(draft, saved).providerRequestProfiles
    ?.openai
  expect(preset).toMatchObject({
    client: 'desktop',
    versionMode: 'latest',
    codexVersion: null,
  })
  expect(preset).not.toHaveProperty('mode')
  expect(preset).not.toHaveProperty('userAgent')
  expect(gatewayReplacement(draft, saved)).not.toHaveProperty(
    'smartSchedulingDefaults'
  )
  draft.providerRequestProfiles.xai = {
    ...draft.providerRequestProfiles.xai,
    targetArch: 'aarch64',
  }
  expect(gatewayReplacement(draft, saved).providerRequestProfiles).toEqual({
    xai: draft.providerRequestProfiles.xai,
    openai: preset,
  })
  delete draft.providerRequestProfiles.openai
  expect(gatewayReplacement(draft, saved).providerRequestProfiles).toEqual({
    xai: draft.providerRequestProfiles.xai,
    openai: null,
  })
  expect(draft.providerRequestProfiles.fixture).toEqual({ future: true })
})

test('automation, weights and nullable reset thresholds respect backend constraints', () => {
  const draft = gatewayDraft(snapshot)
  draft.accountWarmupEnabled = true
  draft.accountWarmupScheduleTime = '08:00,23:59'
  draft.accountWarmupModel = 'fixture-model'
  draft.resetCreditMaxWeeklyRemainingPercent = '0'
  expect(gatewayErrors(draft)).toEqual({})
  expect(gatewayReplacement(draft).resetCreditMaxWeeklyRemainingPercent).toBe(0)
  draft.resetCreditMaxWeeklyRemainingPercent = ''
  expect(
    gatewayReplacement(draft).resetCreditMaxWeeklyRemainingPercent
  ).toBeNull()
  draft.accountWarmupScheduleTime = '24:00'
  draft.accountWarmupModel = ''
  draft.resetCreditMaxWeeklyRemainingPercent = '101'
  draft.smartScheduling = {
    loadWeight: 0,
    quotaWeight: 0,
    healthWeight: 0,
    latencyWeight: 0,
    resetWeight: 0,
    queueWeight: 0,
  }
  expect(gatewayErrors(draft)).toMatchObject({
    accountWarmupScheduleTime: 'scheduleError',
    accountWarmupModel: 'warmupModelError',
    resetCreditMaxWeeklyRemainingPercent: 'percentError',
    smartScheduling: 'weightsError',
  })
})
