export type CodeType = 'balance' | 'concurrency' | 'subscription' | 'invitation'
export type Redemption = { id: string; user: string; email: string; at: string }
export type RedemptionCode = {
  id: string
  revision?: number
  code: string
  type: CodeType
  value: number
  planName: string
  maxUses: number
  perUser: number
  disabled: boolean
  expiresAt: string | null
  createdAt: string
  notes: string
  used?: number
  history: Redemption[]
}
export function codeStatus(code: RedemptionCode, now: number) {
  if (code.disabled) return 'disabled'
  if (code.expiresAt && Date.parse(code.expiresAt) <= now) return 'expired'
  if (code.maxUses > 0 && (code.used ?? code.history.length) >= code.maxUses)
    return 'exhausted'
  return (code.used ?? code.history.length) ? 'partial' : 'unused'
}
export function positiveInteger(value: string, max: number) {
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= max
}
export function moneyToCents(value: string): number | null {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return cents > 0 ? cents : null
}
