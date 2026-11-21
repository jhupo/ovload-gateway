/** Token quantities use K/M/B in every language; digits follow the UI locale. */
export function formatTokenCount(
  value: number | null | undefined,
  locale: string
) {
  if (value == null || !Number.isFinite(value)) return '—'
  const units = [
    { scale: 1e9, suffix: 'B' },
    { scale: 1e6, suffix: 'M' },
    { scale: 1e3, suffix: 'K' },
  ]
  let index = units.findIndex(({ scale }) => value >= scale)
  if (index > 0 && Math.round((value / units[index].scale) * 100) / 100 >= 1000)
    index -= 1
  const unit = index < 0 ? undefined : units[index]
  return (
    new Intl.NumberFormat(locale, {
      maximumFractionDigits: unit ? 2 : 0,
    }).format(unit ? value / unit.scale : value) + (unit?.suffix ?? '')
  )
}
