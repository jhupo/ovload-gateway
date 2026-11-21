export type AmountUnit = 'CNY' | 'USD'

export function amountFormatter(
  locale: string | undefined,
  options: Omit<Intl.NumberFormatOptions, 'currency'> & {
    currency: AmountUnit
  }
): Pick<Intl.NumberFormat, 'format'> {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    ...options,
    currencyDisplay: options.currency === 'USD' ? 'narrowSymbol' : 'code',
  })
}
