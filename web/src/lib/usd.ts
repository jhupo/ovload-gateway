/** Parses a nonnegative numeric(20, 10) USD amount into scale-10 integer units. */
export function parseUsd(value: string): bigint | null {
  if (!/^\d{1,10}(?:\.\d{1,10})?$/.test(value)) return null
  const [integer, fraction = ''] = value.split('.')
  return BigInt(integer) * 10_000_000_000n + BigInt(fraction.padEnd(10, '0'))
}

/** Formats exact backend USD decimals without a floating-point conversion. */
export function formatUsd(value: string | null | undefined, locale: string) {
  if (value == null || !/^\d+(?:\.\d{1,10})?$/.test(value)) return '\u2014'
  const [integer, fraction = ''] = value.split('.')
  const whole = new Intl.NumberFormat(locale).format(BigInt(integer))
  const separator =
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value ?? '.'
  const decimals = fraction.replace(/0+$/, '').padEnd(2, '0')
  return `$${whole}${separator}${decimals}`
}
