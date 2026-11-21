import { useTranslation } from 'react-i18next'
import { useSiteTimezone } from '@/hooks/use-site-timezone'

export function useSubscriptionFormat() {
  const { i18n } = useTranslation()
  const timeZone = useSiteTimezone()
  const currency = new Intl.NumberFormat(i18n.language, {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const date = new Intl.DateTimeFormat(i18n.language, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return {
    cents: (value: number) => currency.format(value / 100),
    micros: (value: number) => currency.format(value / 1_000_000),
    date: (value: string) => date.format(new Date(value)),
  }
}
