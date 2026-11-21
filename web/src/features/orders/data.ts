import { calendarDate } from '@/lib/calendar'

export type OrderStatus = 'paid' | 'pending' | 'cancelled' | 'refunded'
export type Order = {
  id: string
  number: string
  user: string
  email: string
  type: 'balance' | 'plan'
  plan: string
  credited: number
  paid: number
  fee?: number
  currency?: 'USD' | 'CNY'
  subscriptionId?: string
  method: 'alipay' | 'wechat' | 'wallet'
  status: OrderStatus
  created: string
  settled: string | null
}
export const orders: Order[] = []
export const amount = (cents: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(cents / 100)
export function filterOrders(
  rows: Order[],
  query: string,
  status: string,
  method: string,
  type: string,
  from: string,
  to: string,
  timeZone: string
) {
  return rows.filter(
    (r) =>
      `${r.id} ${r.number} ${r.user} ${r.email}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (status === 'all' || r.status === status) &&
      (method === 'all' || r.method === method) &&
      (type === 'all' || r.type === type) &&
      (!from || calendarDate(r.created, timeZone) >= from) &&
      (!to || calendarDate(r.created, timeZone) <= to)
  )
}
export function paymentSummary(
  from: string,
  to: string,
  records: Order[] = orders,
  timeZone: string
) {
  const paid = records.filter(
    (r) =>
      r.status === 'paid' &&
      r.method !== 'wallet' &&
      r.settled &&
      calendarDate(r.settled, timeZone) >= from &&
      calendarDate(r.settled, timeZone) <= to
  )
  const days: { day: string; revenue: number; count: number }[] = []
  for (
    let stamp = Date.parse(from + 'T00:00:00Z');
    stamp <= Date.parse(to + 'T00:00:00Z');
    stamp += 86400000
  ) {
    const day = new Date(stamp).toISOString().slice(0, 10),
      matches = paid.filter(
        (r) => r.settled && calendarDate(r.settled, timeZone) === day
      )
    days.push({
      day,
      revenue: matches.reduce((n, r) => n + r.paid, 0),
      count: matches.length,
    })
  }
  const ranking = new Map<
    string,
    { id: string; name: string; email: string; total: number; count: number }
  >()
  paid.forEach((r) => {
    const item = ranking.get(r.email) || {
      id: r.email,
      name: r.user,
      email: r.email,
      total: 0,
      count: 0,
    }
    item.total += r.paid
    item.count++
    ranking.set(r.email, item)
  })
  return {
    days,
    paid,
    total: paid.reduce((n, r) => n + r.paid, 0),
    ranking: [...ranking.values()].sort((a, b) => b.total - a.total),
  }
}
