import { z } from 'zod'

const integer = (min: number, max: number) =>
  z
    .string()
    .refine(
      (value) =>
        /^\d+$/.test(value.trim()) &&
        Number(value) >= min &&
        Number(value) <= max,
      { message: 'integerError', params: { min, max } }
    )
const percentage = z
  .string()
  .refine(
    (value) => /^\d+(?:\.\d{1,2})?$/.test(value.trim()) && Number(value) <= 100,
    { message: 'percentageError' }
  )
const url = z
  .string()
  .max(2048)
  .refine(
    (value) => {
      try {
        const parsed = new URL(value)
        return (
          ['https:', 'http:'].includes(parsed.protocol) &&
          !parsed.username &&
          !parsed.password
        )
      } catch {
        return false
      }
    },
    { message: 'urlError' }
  )
const groupIds = z
  .array(z.string())
  .max(20)
  .refine(
    (ids) =>
      new Set(ids).size === ids.length &&
      ids.every((id) => /^grp_[0-9a-f]{32}$/.test(id)),
    { message: 'groupsError' }
  )
export const endpointSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1, 'required').max(80),
  baseUrl: url,
  model: z
    .string()
    .trim()
    .min(1, 'required')
    .max(160)
    .regex(/^jev-(?:latest|preview|\d+\.\d+\.\d+)$/, 'modelError'),
  timeoutMs: integer(100, 30000),
  enabled: z.boolean(),
  stateCharLimit: integer(128, 100000),
  proxyId: z.string().max(80),
})
export type AuditNode = z.infer<typeof endpointSchema>
const keywordRules = {
  keywordMode: z.enum(['keyword_only', 'keyword_and_api', 'api_only']),
  keywords: z.string().max(20000),
}
const retentionRules = {
  recordNonHits: z.boolean(),
  hitRetentionDays: integer(1, 3650),
  nonHitRetentionDays: integer(1, 3),
}
export const keywordRulesSchema = z.object(keywordRules)
export const retentionRulesSchema = z.object(retentionRules)
export const executionRulesSchema = z.object({
  retries: integer(0, 10),
  sampleRate: percentage,
})
export const responseRulesSchema = z.object({
  mode: z.enum(['observe', 'block']),
  emailOnHit: z.boolean(),
  autoBan: z.boolean(),
  failureAction: z.enum(['block', 'allow']),
  blockStatus: z.enum(['400', '403', '422']),
  blockMessage: z.string().max(1000),
  banThreshold: integer(1, 10000),
  violationHours: integer(1, 87600),
})
export const auditRuleSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1, 'required').max(80),
    enabled: z.boolean(),
    instructions: z.string().trim().min(1, 'required').max(2000),
    trueCriteria: z.string().trim().min(1, 'required').max(2000),
    falseCriteria: z.string().trim().min(1, 'required').max(2000),
    flagThreshold: percentage,
    hitThreshold: percentage,
  })
  .superRefine((rule, ctx) => {
    if (
      percentage.safeParse(rule.flagThreshold).success &&
      percentage.safeParse(rule.hitThreshold).success &&
      Number(rule.flagThreshold) >= Number(rule.hitThreshold)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['hitThreshold'],
        message: 'thresholdOrderError',
      })
  })
export type AuditRule = z.infer<typeof auditRuleSchema>
export const ruleListSchema = z.object({
  rules: z
    .array(auditRuleSchema)
    .max(20)
    .refine(
      (rules) => new Set(rules.map((rule) => rule.id)).size === rules.length,
      { message: 'duplicateRule' }
    ),
})
export function newAuditRule(): AuditRule {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: false,
    instructions: '',
    trueCriteria: '',
    falseCriteria: '',
    flagThreshold: '',
    hitThreshold: '',
  }
}
export const deliveryRulesSchema = z.object({
  delivery: z.enum(['buffered', 'observe']),
  maxOutputChars: integer(128, 1000000),
})
export const auditSchema = z
  .object({
    version: z.literal(2),
    shared: z.object({
      endpoints: z.array(endpointSchema).max(20),
      groupIds,
      ...executionRulesSchema.shape,
      ...retentionRules,
      ...keywordRules,
    }),
    prompt: z.object({
      enabled: z.boolean(),
      ...ruleListSchema.shape,
      ...responseRulesSchema.shape,
    }),
    content: z.object({
      enabled: z.boolean(),
      ...ruleListSchema.shape,
      ...deliveryRulesSchema.shape,
      ...responseRulesSchema.shape,
    }),
  })
  .superRefine((value, ctx) => {
    const enabled = value.prompt.enabled || value.content.enabled
    if (
      enabled &&
      value.shared.keywordMode !== 'keyword_only' &&
      !value.shared.endpoints.some((node) => node.enabled)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['shared', 'endpoints'],
        message: 'endpointRequired',
      })
    if (enabled && !value.shared.groupIds.length)
      ctx.addIssue({
        code: 'custom',
        path: ['shared', 'groupIds'],
        message: 'groupsError',
      })
    if (
      enabled &&
      value.shared.keywordMode !== 'api_only' &&
      !value.shared.keywords.trim()
    )
      ctx.addIssue({
        code: 'custom',
        path: ['shared', 'keywords'],
        message: 'keywordsRequired',
      })
    for (const stage of ['prompt', 'content'] as const) {
      if (!value[stage].enabled) continue
      if (
        value.shared.keywordMode !== 'keyword_only' &&
        !value[stage].rules.some((rule) => rule.enabled)
      )
        ctx.addIssue({
          code: 'custom',
          path: [stage, 'rules'],
          message: 'rulesRequired',
        })
      if (
        value[stage].mode === 'block' &&
        Number(value.shared.sampleRate) !== 100
      )
        ctx.addIssue({
          code: 'custom',
          path: ['shared', 'sampleRate'],
          message: 'blockingSampleError',
        })
    }
    if (
      value.content.delivery === 'observe' &&
      (value.content.mode !== 'observe' ||
        value.content.failureAction !== 'allow')
    )
      ctx.addIssue({
        code: 'custom',
        path: ['content', 'delivery'],
        message: 'streamPolicyError',
      })
    if (
      new Set(value.shared.endpoints.map((node) => node.id)).size !==
      value.shared.endpoints.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['shared', 'endpoints'],
        message: 'duplicateNode',
      })
  })
export type AuditDraft = z.infer<typeof auditSchema>
const defaultResponse = {
  mode: 'observe' as const,
  emailOnHit: false,
  autoBan: false,
  failureAction: 'block' as const,
  blockStatus: '403' as const,
  blockMessage: '',
  banThreshold: '10',
  violationHours: '720',
}
export const defaultAuditDraft: AuditDraft = {
  version: 2,
  shared: {
    endpoints: [],
    groupIds: [],
    retries: '',
    sampleRate: '',
    recordNonHits: false,
    hitRetentionDays: '',
    nonHitRetentionDays: '',
    keywordMode: 'keyword_and_api',
    keywords: '',
  },
  prompt: {
    enabled: false,
    rules: [],
    ...defaultResponse,
  },
  content: {
    enabled: false,
    rules: [],
    delivery: 'buffered',
    maxOutputChars: '',
    ...defaultResponse,
  },
}
export type AuditErrors = Record<string, string>
export function auditErrorKey(message: string) {
  return [
    'required',
    'integerError',
    'percentageError',
    'urlError',
    'groupsError',
    'rulesRequired',
    'thresholdOrderError',
    'duplicateRule',
    'streamPolicyError',
    'blockingSampleError',
    'keywordsRequired',
    'modelError',
    'endpointRequired',
    'duplicateNode',
  ].includes(message)
    ? message
    : 'required'
}
export function auditErrors(value: AuditDraft): AuditErrors {
  const parsed = auditSchema.safeParse(value)
  if (parsed.success) return {}
  return Object.fromEntries(
    parsed.error.issues.map((issue) => [
      issue.path.join('.'),
      auditErrorKey(issue.message),
    ])
  )
}
