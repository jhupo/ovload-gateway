import { z } from 'zod'

export const lotteryFields = [
  'reward',
  'winnerCount',
  'participantTarget',
  'minimumRecharge',
] as const
export type LotteryField = (typeof lotteryFields)[number]

export function usdCents(value: string): number | null {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim())) return null
  const [whole, fraction = ''] = value.trim().split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

const money = (min: number, max: number) =>
  z.string().refine((value) => {
    const cents = usdCents(value)
    return cents !== null && cents >= min && cents <= max
  }, 'moneyError')
const integer = (max: number) =>
  z
    .string()
    .refine(
      (value) =>
        /^\d{1,6}$/.test(value) && Number(value) >= 1 && Number(value) <= max,
      'countError'
    )

export const lotterySchema = z
  .object({
    version: z.literal(1),
    reward: money(1, 1000000),
    winnerCount: integer(1000),
    participantTarget: integer(100000),
    minimumRecharge: money(0, 100000000),
    humanVerification: z.boolean(),
  })
  .superRefine((draft, ctx) => {
    if (Number(draft.winnerCount) > Number(draft.participantTarget))
      ctx.addIssue({
        code: 'custom',
        path: ['participantTarget'],
        message: 'targetError',
      })
  })

export type LotteryDraft = z.infer<typeof lotterySchema>
export const defaultLottery = (): LotteryDraft => ({
  version: 1,
  reward: '',
  winnerCount: '',
  participantTarget: '',
  minimumRecharge: '',
  humanVerification: false,
})

export function lotteryErrors(draft: LotteryDraft): Record<string, string> {
  const result = lotterySchema.safeParse(draft)
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join('.'),
          ['moneyError', 'countError', 'targetError'].includes(issue.message)
            ? issue.message
            : 'invalidDraft',
        ])
      )
}

export function normalizeLottery(draft: LotteryDraft): LotteryDraft {
  const decimal = (value: string) => {
    const cents = usdCents(value)!
    return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
  }
  return {
    ...draft,
    reward: decimal(draft.reward),
    minimumRecharge: decimal(draft.minimumRecharge),
    winnerCount: String(Number(draft.winnerCount)),
    participantTarget: String(Number(draft.participantTarget)),
  }
}
