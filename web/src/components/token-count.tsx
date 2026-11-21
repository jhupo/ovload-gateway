import { useTranslation } from 'react-i18next'
import { formatTokenCount } from '@/lib/token-count'

export function TokenCount({ value }: { value: number | null | undefined }) {
  const { i18n } = useTranslation()
  const exact =
    value == null
      ? undefined
      : new Intl.NumberFormat(i18n.language).format(value)
  return (
    <span title={exact} aria-label={exact}>
      {formatTokenCount(value, i18n.language)}
    </span>
  )
}
