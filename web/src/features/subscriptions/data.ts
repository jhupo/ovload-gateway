export type Plan = {
  subscriberCount?: number
  id: string
  revision?: number
  name: string
  originalPriceCents: number
  weeklyCents: number
  unlimited: { daily: boolean; weekly: boolean; monthly: boolean }
  sort: number
  currencyLabel: string
  features: string
  priceCents: number
  days: number
  dailyCents: number
  monthlyCents: number
  resetTime: string
  timezone: 'Asia/Shanghai' | 'UTC'
  description: string
  notes: string
  published: boolean
}
export type Subscription = {
  id: string
  revision?: number
  userId: string
  plan: Plan
  start: string
  end: string
  weeklyUsed?: number
  dailyUsed: number
  monthlyUsed: number
  revoked: boolean
  notes: string
}
export const day = 86_400_000
export const plans: Plan[] = []
export const subscriptions: Subscription[] = []
export function statusOf(row: Subscription, now: number) {
  return row.revoked
    ? 'revoked'
    : Date.parse(row.end) <= now
      ? 'expired'
      : Date.parse(row.start) > now
        ? 'scheduled'
        : 'active'
}
export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    cents / 100
  )
export function parseCents(value: string): number | null {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) return null
  const [whole, part = ''] = value.split('.')
  return Number(whole) * 100 + Number(part.padEnd(2, '0'))
}
// Reset boundaries belong to the purchased plan's timezone and start anniversary.
export function nextReset(
  row: Subscription,
  period: 'daily' | 'weekly' | 'monthly',
  timestamp: number
) {
  const offset = row.plan.timezone === 'Asia/Shanghai' ? 8 * 3_600_000 : 0
  const now = new Date(timestamp + offset)
  if (period === 'daily') {
    const [h, m] = row.plan.resetTime.split(':').map(Number)
    let next =
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        h,
        m
      ) - offset
    if (next <= timestamp) next += day
    return next
  }
  if (period === 'weekly')
    return (
      Date.parse(row.start) +
      (Math.floor((timestamp - Date.parse(row.start)) / (7 * day)) + 1) *
        7 *
        day
    )
  const start = new Date(Date.parse(row.start) + offset)
  let month = now.getUTCMonth()
  const candidate = () =>
    Date.UTC(
      now.getUTCFullYear(),
      month,
      Math.min(
        start.getUTCDate(),
        new Date(Date.UTC(now.getUTCFullYear(), month + 1, 0)).getUTCDate()
      ),
      start.getUTCHours(),
      start.getUTCMinutes()
    ) - offset
  if (candidate() <= timestamp) month++
  return candidate()
}
export function newPlan(): Plan {
  return {
    id: '',
    name: '',
    originalPriceCents: 0,
    weeklyCents: 0,
    unlimited: { daily: false, weekly: false, monthly: false },
    sort: 0,
    currencyLabel: 'USD',
    features: '',
    priceCents: 0,
    days: 30,
    dailyCents: 0,
    monthlyCents: 0,
    resetTime: '00:00',
    timezone: 'UTC',
    description: '',
    notes: '',
    published: false,
  }
}
