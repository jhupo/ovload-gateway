import { z } from 'zod'
import { platformRequest } from '@/api/platform-client'
import {
  privacyPolicySchema,
  privacyPreviewResultSchema,
  requestLocationSchema,
  type CodexPrivacyPolicy,
  type PrivacyStep,
  type PrivacyPreviewResult,
  type RequestLocation,
} from '@/api/contracts/codex'

export function newPrivacyStep(): PrivacyStep {
  return {
    scope: 'request_body',
    selector: '$.metadata',
    action: 'remove_field',
    pattern: null,
    replacement: '',
    value: null,
    replaceAll: true,
    caseInsensitive: false,
    multiLine: false,
  }
}

const detectedLocationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('detected'), location: requestLocationSchema }),
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('conflict') }),
  z.object({ status: z.literal('notRequested') }),
])

export const codexSettingsApi = {
  localLocation: async (signal?: AbortSignal) =>
    detectedLocationSchema.parse(
      await platformRequest<unknown>('/settings/location', {
        signal,
        timeoutMs: 30000,
      })
    ),
  detectLocation: async () =>
    detectedLocationSchema.parse(
      await platformRequest<unknown>('/settings/location/detect', {
        method: 'POST',
      })
    ),
  previewPrivacy: async (body: {
    policy: CodexPrivacyPolicy
    body: PrivacyPreviewResult['body']
    headers: Record<string, string[]>
    turnMetadata: string | null
  }) =>
    privacyPreviewResultSchema.parse(
      await platformRequest<unknown>('/settings/privacy/preview', {
        method: 'POST',
        body,
      })
    ),
}

const byteLength = (value: string) => new TextEncoder().encode(value).length

export function validateWarmupSchedule(value: string): string | undefined {
  if (
    !value ||
    value.length > 255 ||
    !value
      .split(',')
      .every((time) => /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(time))
  )
    return 'scheduleError'
}

export function validateRequestLocation(
  value: RequestLocation
): string | undefined {
  if (
    !/^[A-Z]{2}$/.test(value.country) ||
    [value.region, value.city].some(
      (text) =>
        !text.trim() ||
        [...text.trim()].length > 128 ||
        [...text].some((character) => {
          const code = character.codePointAt(0)!
          return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
        })
    )
  )
    return 'locationError'
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format()
  } catch {
    return 'locationError'
  }
}

export function validatePrivacyPolicy(
  policy: CodexPrivacyPolicy
): string | undefined {
  const parsed = privacyPolicySchema.safeParse(policy)
  if (
    !parsed.success ||
    policy.rules.length > 32 ||
    new Set(policy.rules.map((rule) => rule.id)).size !== policy.rules.length
  )
    return 'privacyError'
  let steps = 0
  for (const rule of policy.rules) {
    steps += rule.steps.length
    if (
      !rule.id ||
      byteLength(rule.id) > 64 ||
      !rule.name ||
      byteLength(rule.name) > 192 ||
      !rule.steps.length ||
      steps > 32
    )
      return 'privacyError'
    for (const step of rule.steps) {
      if (
        byteLength(step.selector) > 1024 ||
        byteLength(step.pattern ?? '') > 4096 ||
        byteLength(step.replacement) > 4096 ||
        byteLength(JSON.stringify(step.value)) > 4096
      )
        return 'privacyError'
      if (step.scope === 'request_header') {
        if (
          !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(step.selector) ||
          step.action === 'rename_key'
        )
          return 'privacyError'
      } else if (
        !step.selector.startsWith('$') ||
        (step.scope === 'environment_text' && step.selector !== '$')
      )
        return 'privacyError'
      if (step.action === 'set_value' && step.pattern !== null)
        return 'privacyError'
      if (
        ['regex_replace', 'rename_key'].includes(step.action) &&
        step.pattern === null
      )
        return 'privacyError'
    }
  }
}
