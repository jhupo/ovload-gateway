import { expect, test } from 'vitest'
import { accountSummary } from './schema'

test('capacity excludes unavailable accounts while retaining in-flight work', () => {
  expect(
    accountSummary([
      { id: 'ready', status: 'available', concurrency: 10, inUse: 7 },
      { id: 'limited', status: 'limited', concurrency: 20, inUse: 2 },
      { id: 'disabled', status: 'disabled', concurrency: 30, inUse: 1 },
    ])
  ).toEqual({ available: 1, limited: 1, total: 3, capacity: 10, used: 10 })
})

test('an empty group has zero capacity and no division by zero', () => {
  expect(accountSummary([])).toEqual({
    available: 0,
    limited: 0,
    total: 0,
    capacity: 0,
    used: 0,
  })
})
