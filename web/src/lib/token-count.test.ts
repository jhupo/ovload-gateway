import { expect, test } from 'vitest'
import { formatTokenCount } from './token-count'

test('Token quantities use K/M/B consistently in Chinese and English', () => {
  for (const locale of ['zh', 'en']) {
    for (const [value, expected] of [
      [0, '0'],
      [999, '999'],
      [1000, '1K'],
      [60941, '60.94K'],
      [999999, '1M'],
      [1234567, '1.23M'],
      [6081658667, '6.08B'],
      [66459730901, '66.46B'],
    ] as const) {
      expect(formatTokenCount(value, locale)).toBe(expected)
    }
    expect(formatTokenCount(null, locale)).toBe('—')
    expect(formatTokenCount(undefined, locale)).toBe('—')
    expect(formatTokenCount(Number.NaN, locale)).toBe('—')
  }
})

test('Localized decimal separators keep the same unit scale', () => {
  expect(formatTokenCount(1234, 'de')).toBe('1,23K')
})
