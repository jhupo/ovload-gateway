import { expect, test } from 'vitest'
import { amountFormatter } from './amount'

test('USD uses the same dollar sign across locales', () => {
  for (const locale of ['en', 'zh']) {
    expect(amountFormatter(locale, { currency: 'CNY' }).format(29.58)).toMatch(
      /^CNY\s29\.58$/
    )
    expect(amountFormatter(locale, { currency: 'USD' }).format(0)).toMatch(
      /^\$0\.00$/
    )
  }
})
