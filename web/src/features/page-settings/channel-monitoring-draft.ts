import { z } from 'zod'
import { errorCategories } from '@/features/channels/data'

export const thresholdKeys = [
  'samples',
  'errorWarning',
  'errorCritical',
  'ttftTarget',
  'ttftWarning',
  'ttftCritical',
  'cacheWarning',
  'cacheCritical',
] as const
export type ThresholdKey = (typeof thresholdKeys)[number]
const integer = (min: number, max: number) =>
  z
    .string()
    .refine(
      (value) =>
        /^\d{1,7}$/.test(value) && Number(value) >= min && Number(value) <= max,
      'rangeError'
    )
const percent = z
  .string()
  .refine(
    (value) => /^\d{1,3}(?:\.\d{1,2})?$/.test(value) && Number(value) <= 100,
    'percentError'
  )
const unique = (values: string[]) => new Set(values).size === values.length
export const channelMonitoringSchema = z
  .object({
    version: z.literal(1),
    thresholds: z.object({
      samples: integer(1, 1000000),
      errorWarning: percent,
      errorCritical: percent,
      ttftTarget: integer(0, 3600000),
      ttftWarning: integer(0, 3600000),
      ttftCritical: integer(0, 3600000),
      cacheWarning: percent,
      cacheCritical: percent,
    }),
    groupIds: z
      .array(z.string().regex(/^grp_[0-9a-f]{32}$/, 'groupError'))
      .max(200)
      .refine(unique, 'groupError'),
    ignoredErrors: z
      .array(z.enum(errorCategories))
      .max(errorCategories.length)
      .refine(unique, 'errorError'),
  })
  .superRefine(({ thresholds: v }, ctx) => {
    const order = (left: ThresholdKey, right: ThresholdKey) => {
      if (Number(v[left]) > Number(v[right]))
        ctx.addIssue({
          code: 'custom',
          path: ['thresholds', right],
          message: 'orderError',
        })
    }
    order('errorWarning', 'errorCritical')
    order('ttftTarget', 'ttftWarning')
    order('ttftWarning', 'ttftCritical')
    order('cacheCritical', 'cacheWarning')
  })
export type ChannelMonitoringDraft = z.infer<typeof channelMonitoringSchema>
export type MonitoringErrors = Record<string, string>
export const defaultChannelMonitoring = (): ChannelMonitoringDraft => ({
  version: 1,
  thresholds: {
    samples: '',
    errorWarning: '',
    errorCritical: '',
    ttftTarget: '',
    ttftWarning: '',
    ttftCritical: '',
    cacheWarning: '',
    cacheCritical: '',
  },
  groupIds: [],
  ignoredErrors: [],
})
export function channelMonitoringErrors(
  draft: ChannelMonitoringDraft
): MonitoringErrors {
  const result = channelMonitoringSchema.safeParse(draft)
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join('.'),
          [
            'rangeError',
            'percentError',
            'orderError',
            'groupError',
            'errorError',
          ].includes(issue.message)
            ? issue.message
            : 'invalidDraft',
        ])
      )
}
