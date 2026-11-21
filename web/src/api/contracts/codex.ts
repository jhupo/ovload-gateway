import { z } from 'zod'

export const requestLocationSchema = z.object({
  country: z.string(),
  region: z.string(),
  city: z.string(),
  timezone: z.string(),
})
export type RequestLocation = z.infer<typeof requestLocationSchema>

export const privacyStepSchema = z.object({
  scope: z.enum([
    'turn_metadata',
    'desktop_git_context',
    'environment_text',
    'request_body',
    'request_header',
  ]),
  selector: z.string(),
  action: z.enum(['regex_replace', 'set_value', 'rename_key', 'remove_field']),
  pattern: z.string().nullable(),
  replacement: z.string(),
  value: z.json(),
  replaceAll: z.boolean(),
  caseInsensitive: z.boolean(),
  multiLine: z.boolean(),
})
export const privacyRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  steps: z.array(privacyStepSchema),
})
export const privacyPolicySchema = z.object({
  enabled: z.boolean(),
  onError: z.enum(['skip_rule', 'reject_request']),
  rules: z.array(privacyRuleSchema),
})
export type PrivacyStep = z.infer<typeof privacyStepSchema>
export type PrivacyRule = z.infer<typeof privacyRuleSchema>
export type CodexPrivacyPolicy = z.infer<typeof privacyPolicySchema>

export const privacyPreviewResultSchema = z.object({
  body: z.json(),
  headers: z.record(z.string(), z.array(z.string())),
  turnMetadata: z.string().nullable(),
  outcomes: z.array(
    z.object({
      ruleId: z.string(),
      matches: z.number().int().nonnegative(),
      status: z.string(),
      reason: z.string().nullable(),
    })
  ),
})
export type PrivacyPreviewResult = z.infer<typeof privacyPreviewResultSchema>
