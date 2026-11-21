import { useTranslation } from 'react-i18next'
import { useSiteTimezone } from '@/hooks/use-site-timezone'
import { useMoneyFormat } from './use-money-format'

export function useRecordFormat() {
  const { i18n } = useTranslation()
  const timeZone = useSiteTimezone()
  const money = useMoneyFormat()
  const date = new Intl.DateTimeFormat(i18n.language, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return { money, date: (value: string) => date.format(new Date(value)) }
}
