import { expect, test } from 'vitest'
import {
  filterOrders,
  paymentSummary,
  type Order,
} from '@/features/orders/data'
import { addCalendarDays, calendarDate, calendarDayStart } from './calendar'

test('Shanghai day boundaries include midnight and exclude the next day', () => {
  expect(calendarDate('2026-11-08T16:00:00Z', 'Asia/Shanghai')).toBe(
    '2026-11-09'
  )
  expect(
    new Date(calendarDayStart('2026-11-09', 'Asia/Shanghai')).toISOString()
  ).toBe('2026-11-08T16:00:00.000Z')
  const order = (at: string): Order => ({
    id: at,
    number: at,
    user: 'Test',
    email: 'test@example.com',
    type: 'balance',
    plan: '',
    credited: 100,
    paid: 100,
    method: 'alipay',
    status: 'paid',
    created: at,
    settled: at,
  })
  const rows = [
    order('2026-11-08T15:59:59Z'),
    order('2026-11-08T16:00:00Z'),
    order('2026-11-09T15:59:59Z'),
    order('2026-11-09T16:00:00Z'),
  ]
  expect(
    filterOrders(
      rows,
      '',
      'all',
      'all',
      'all',
      '2026-11-09',
      '2026-11-09',
      'Asia/Shanghai'
    )
  ).toHaveLength(2)
  const summary = paymentSummary(
    '2026-11-09',
    '2026-11-09',
    rows,
    'Asia/Shanghai'
  )
  expect(summary.total).toBe(200)
  expect(summary.days[0].count).toBe(2)
})
test('calendar ranges handle DST and month boundaries without assuming 24 hours', () => {
  const start = calendarDayStart('2026-03-08', 'America/New_York')
  const end = calendarDayStart('2026-03-09', 'America/New_York')
  expect(end - start).toBe(23 * 3600000)
  expect(
    calendarDayStart('2026-11-02', 'America/New_York') -
      calendarDayStart('2026-11-01', 'America/New_York')
  ).toBe(25 * 3600000)
  expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29')
  expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01')
  expect(Number.isNaN(calendarDayStart('', 'UTC'))).toBe(true)
})
