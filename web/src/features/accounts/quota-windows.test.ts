import { describe, expect, it } from 'vitest'
import {
  orderedQuotaWindows,
  quotaWindowPercent,
  type AccountQuotaWindow,
} from './quota-windows'

function window(
  key: string,
  windowSeconds: number | null,
  limitId: string | null = null
): AccountQuotaWindow {
  return {
    key,
    group: 'shortTerm',
    limitId,
    windowSeconds,
    labelDisplay: key,
    usedPercent: 31,
    resetAtDisplay: '2026-11-21 22:39:39',
  }
}

describe('account quota windows', () => {
  it('shows the real five-hour window before the weekly window when both share the same group', () => {
    const weekly = window('weekly', 604_800)
    const fiveHours = window('five-hours', 18_000)
    const input = [weekly, fiveHours]
    expect(orderedQuotaWindows(input)).toEqual([fiveHours, weekly])
    expect(input).toEqual([weekly, fiveHours])
  })

  it('keeps additional model quota buckets together after the general quota', () => {
    const windows = [
      window('model-weekly', 604_800, 'model-limit'),
      window('weekly', 604_800),
      window('model-five-hours', 18_000, 'model-limit'),
      window('five-hours', 18_000),
    ]
    expect(orderedQuotaWindows(windows).map((quota) => quota.key)).toEqual([
      'five-hours',
      'weekly',
      'model-five-hours',
      'model-weekly',
    ])
  })

  it('preserves unknown and custom windows instead of inventing a five-hour or weekly limit', () => {
    const daily = window('1日额度', 86_400)
    const unknown = window('主额度', null)
    expect(orderedQuotaWindows([unknown, daily])).toEqual([daily, unknown])
    expect(daily.labelDisplay).toBe('1日额度')
  })

  it('keeps an unavailable percentage unknown and clamps the rendered progress range', () => {
    expect(quotaWindowPercent(null)).toBeNull()
    expect(quotaWindowPercent(Number.NaN)).toBeNull()
    expect(quotaWindowPercent(Number.POSITIVE_INFINITY)).toBeNull()
    expect(quotaWindowPercent(100)).toBe(100)
    expect(quotaWindowPercent(31)).toBe(31)
    expect(quotaWindowPercent(-1)).toBe(0)
    expect(quotaWindowPercent(110)).toBe(100)
  })
})
