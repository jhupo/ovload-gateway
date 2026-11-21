export type ReferralOverride = {
  userId: string
  invitationCode: string
  rate: string
}
export type ReferralDraft = {
  enabled: boolean
  rate: string
  freezeHours: string
  eligibilityDays: string
  cap: string
  overrides: ReferralOverride[]
}
export const defaultReferralDraft: ReferralDraft = {
  enabled: false,
  rate: '',
  freezeHours: '',
  eligibilityDays: '',
  cap: '',
  overrides: [],
}

// Parse decimal inputs as fixed-point integers, including money and percentages.
function fixed(value: string, precision: number, maximum: number) {
  const pattern = precision === 0 ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/
  if (!pattern.test(value.trim())) return null
  const [whole, fraction = ''] = value.trim().split('.')
  const amount =
    Number(whole) * 10 ** precision + Number(fraction.padEnd(precision, '0'))
  return Number.isSafeInteger(amount) && amount <= maximum ? amount : null
}

export function referralErrors(value: ReferralDraft) {
  const errors: Record<string, string> = {}
  if (fixed(value.rate, 2, 10000) === null) errors.rate = 'rateError'
  if (fixed(value.freezeHours, 0, 876000) === null)
    errors.freezeHours = 'freezeError'
  if (fixed(value.eligibilityDays, 0, 36500) === null)
    errors.eligibilityDays = 'eligibilityError'
  if (fixed(value.cap, 2, 99999999999) === null) errors.cap = 'capError'
  return errors
}

export function overrideErrors(
  value: ReferralOverride,
  others: ReferralOverride[]
) {
  const errors: Record<string, string> = {}
  if (
    !/^[0-9a-f-]{36}$/i.test(value.userId) ||
    others.some((item) => item.userId === value.userId)
  ) {
    errors.userId = 'userError'
  }
  const code = value.invitationCode.trim()
  if (
    code &&
    (!/^[a-zA-Z0-9_-]{4,32}$/.test(code) ||
      others.some(
        (item) => item.invitationCode.toLowerCase() === code.toLowerCase()
      ))
  ) {
    errors.invitationCode = 'codeError'
  }
  if (value.rate.trim() && fixed(value.rate, 2, 10000) === null)
    errors.rate = 'rateError'
  if (!code && !value.rate.trim()) errors.invitationCode = 'overrideRequired'
  return errors
}

export function normalizeReferral(value: ReferralDraft): ReferralDraft {
  const decimal = (input: string) => (input.trim() ? String(Number(input)) : '')
  return {
    enabled: value.enabled,
    rate: decimal(value.rate),
    freezeHours: decimal(value.freezeHours),
    eligibilityDays: decimal(value.eligibilityDays),
    cap: decimal(value.cap),
    overrides: value.overrides.map((item) => ({
      userId: item.userId,
      invitationCode: item.invitationCode.trim(),
      rate: decimal(item.rate),
    })),
  }
}
