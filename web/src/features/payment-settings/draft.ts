import { z } from 'zod'

export const paymentStorageKey = 'ovload.payment-settings.v1'
const numeric = z.string().max(24)
const tierSchema = z.object({ id: z.uuid(), amount: numeric, percent: numeric })
const userOfferSchema = tierSchema.extend({ userId: z.string().max(80) })
export type UserOffer = z.infer<typeof userOfferSchema>
export const paymentSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  balanceEnabled: z.boolean(),
  minAmount: numeric,
  maxAmount: numeric,
  dailyLimit: numeric,
  orderTimeout: numeric,
  maxPending: numeric,
  rechargeMultiplier: numeric,
  subscriptionRate: numeric,
  feeRate: numeric,
  cancelLimitEnabled: z.boolean(),
  cancelMax: numeric,
  cancelWindow: numeric,
  cancelUnit: z.enum(['minute', 'hour', 'day']),
  cancelMode: z.enum(['rolling', 'fixed']),
  forceQr: z.boolean(),
  mobileDeepLink: z.boolean(),
  alipayAppId: z.string().max(32).default(''),
  alipaySellerId: z.string().max(32).default(''),
  alipayMode: z.enum(['qrcode', 'redirect']).default('qrcode'),
  userOffers: z.array(userOfferSchema).max(100).default([]),
  tiers: z.array(tierSchema).max(20),
})
export type PaymentDraft = z.infer<typeof paymentSchema>
export type PaymentErrors = Record<string, string | undefined>
export const numericFields = {
  minAmount: [0, 999999999.99, 2],
  maxAmount: [0, 999999999.99, 2],
  dailyLimit: [0, 999999999.99, 2],
  orderTimeout: [1, 1440, 0],
  maxPending: [1, 100, 0],
  rechargeMultiplier: [0.01, 10000, 2],
  subscriptionRate: [0, 10000, 2],
  feeRate: [0, 100, 2],
  cancelMax: [1, 10000, 0],
  cancelWindow: [1, 10000, 0],
} as const
export type NumericField = keyof typeof numericFields
export function createPaymentDraft(): PaymentDraft {
  return {
    version: 1,
    enabled: false,
    balanceEnabled: true,
    minAmount: '1',
    maxAmount: '10000',
    dailyLimit: '50000',
    orderTimeout: '30',
    maxPending: '3',
    rechargeMultiplier: '1',
    subscriptionRate: '0',
    feeRate: '0',
    cancelLimitEnabled: false,
    cancelMax: '10',
    cancelWindow: '1',
    cancelUnit: 'day',
    cancelMode: 'rolling',
    forceQr: false,
    mobileDeepLink: false,
    alipayAppId: '',
    alipaySellerId: '',
    alipayMode: 'qrcode',
    userOffers: [],
    tiers: [],
  }
}
// Parse decimal strings into integer minor units; do not perform floating-point money arithmetic.
export function scaledDecimal(value: string, precision = 2): number | null {
  const clean = value.trim()
  if (
    !new RegExp(
      `^\\d{1,10}${precision ? `(\\.\\d{1,${precision}})?` : ''}$`
    ).test(clean)
  )
    return null
  const [whole, fraction = ''] = clean.split('.')
  const result =
    Number(whole) * 10 ** precision + Number(fraction.padEnd(precision, '0'))
  return Number.isSafeInteger(result) ? result : null
}
function validNumber(value: string, min: number, max: number, precision = 2) {
  const scaled = scaledDecimal(value, precision)
  return (
    scaled !== null &&
    scaled >= Math.round(min * 10 ** precision) &&
    scaled <= Math.round(max * 10 ** precision)
  )
}
function canonical(value: string) {
  const [whole, fraction] = value.trim().split('.')
  const digits = fraction?.replace(/0+$/, '')
  return String(Number(whole)) + (digits ? '.' + digits : '')
}
function amountErrors(value: {
  minAmount: string
  maxAmount: string
  dailyLimit: string
}) {
  const errors: PaymentErrors = {}
  for (const name of ['minAmount', 'maxAmount', 'dailyLimit'] as const)
    if (!validNumber(value[name], 0, 999999999.99))
      errors[name] = 'invalidNumber'
  const min = scaledDecimal(value.minAmount)
  const max = scaledDecimal(value.maxAmount)
  if (min !== null && max !== null && max > 0 && min > max)
    errors.maxAmount = 'invalidRange'
  return errors
}
export function userOfferErrors(
  offer: UserOffer,
  others: UserOffer[]
): PaymentErrors {
  const errors: PaymentErrors = {}
  if (!/^[0-9a-f-]{36}$/i.test(offer.userId)) errors.userId = 'requiredUser'
  else if (
    others.some((row) => row.id !== offer.id && row.userId === offer.userId)
  )
    errors.userId = 'duplicateUser'
  if (!validNumber(offer.amount, 0.01, 999999999.99))
    errors.amount = 'invalidNumber'
  if (!validNumber(offer.percent, 0, 1000)) errors.percent = 'invalidPercent'
  return errors
}
export function normalizeUserOffer(offer: UserOffer): UserOffer {
  return {
    ...userOfferSchema.parse(offer),
    amount: canonical(offer.amount),
    percent: canonical(offer.percent),
  }
}
export function paymentErrors(draft: PaymentDraft): PaymentErrors {
  const errors = amountErrors(draft)
  for (const [name, [min, max, precision]] of Object.entries(numericFields))
    if (!validNumber(draft[name as NumericField], min, max, precision))
      errors[name] = 'invalidNumber'
  for (const name of ['alipayAppId', 'alipaySellerId'] as const) {
    if (
      !/^[0-9]{0,32}$/.test(draft[name].trim()) ||
      (draft.enabled && !draft[name].trim())
    )
      errors[name] = 'invalidAppId'
  }
  if (
    draft.userOffers.length > 100 ||
    new Set(draft.userOffers.map((row) => row.id)).size !==
      draft.userOffers.length ||
    draft.userOffers.some(
      (row) => Object.keys(userOfferErrors(row, draft.userOffers)).length
    )
  )
    errors.userOffers = 'invalidUserOffers'
  const amounts = new Set<number>()
  draft.tiers.forEach((tier) => {
    const amount = scaledDecimal(tier.amount)
    if (!validNumber(tier.amount, 0.01, 999999999.99))
      errors['amount-' + tier.id] = 'invalidNumber'
    else if (amounts.has(amount!))
      errors['amount-' + tier.id] = 'duplicateAmount'
    if (amount !== null) amounts.add(amount)
    if (!validNumber(tier.percent, 0, 1000))
      errors['percent-' + tier.id] = 'invalidPercent'
  })
  if (
    draft.tiers.length > 20 ||
    new Set(draft.tiers.map((row) => row.id)).size !== draft.tiers.length
  )
    errors.tiers = 'invalidTiers'
  return errors
}
export function fieldTab(name: string) {
  if (name === 'alipayAppId' || name === 'alipaySellerId') return 'alipay'
  return name === 'tiers' ||
    name === 'userOffers' ||
    name.startsWith('amount-') ||
    name.startsWith('percent-')
    ? 'offers'
    : 'basic'
}
export function normalizePaymentDraft(draft: PaymentDraft): PaymentDraft {
  const parsed = paymentSchema.parse(draft)
  for (const name of Object.keys(numericFields) as NumericField[])
    parsed[name] = canonical(parsed[name])
  return {
    ...parsed,
    alipayAppId: parsed.alipayAppId.trim(),
    alipaySellerId: parsed.alipaySellerId.trim(),
    userOffers: parsed.userOffers.map(normalizeUserOffer),
    tiers: parsed.tiers
      .map((tier) => ({
        ...tier,
        amount: canonical(tier.amount),
        percent: canonical(tier.percent),
      }))
      .sort((a, b) => scaledDecimal(a.amount)! - scaledDecimal(b.amount)!),
  }
}
export function readPaymentDraft(): {
  draft: PaymentDraft
  invalid: boolean
  adjusted: boolean
} {
  try {
    const raw = sessionStorage.getItem(paymentStorageKey)
    if (!raw)
      return { draft: createPaymentDraft(), invalid: false, adjusted: false }
    if (raw.length > 150000) throw new Error('oversized draft')
    const input: unknown = JSON.parse(raw)
    const adjusted = !!(
      input &&
      typeof input === 'object' &&
      'offerMode' in input &&
      input.offerMode === 'discount' &&
      'tiers' in input &&
      Array.isArray(input.tiers) &&
      input.tiers.length
    )
    const draft = paymentSchema.parse(input)
    if (adjusted) draft.tiers = []
    if (Object.keys(paymentErrors(draft)).length)
      throw new Error('invalid draft')
    return { draft: normalizePaymentDraft(draft), invalid: false, adjusted }
  } catch {
    return { draft: createPaymentDraft(), invalid: true, adjusted: false }
  }
}
