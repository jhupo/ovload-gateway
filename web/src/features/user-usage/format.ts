import { useTranslation } from 'react-i18next'
import { formatUsd } from '@/lib/usd'
import { useSiteTimezone } from '@/hooks/use-site-timezone'

export function useUsageFormat() {
  const { i18n } = useTranslation()
  const timeZone = useSiteTimezone()
  const number = new Intl.NumberFormat(i18n.language)
  const seconds = new Intl.NumberFormat(i18n.language, {
    maximumFractionDigits: 2,
  })
  const date = new Intl.DateTimeFormat(i18n.language, {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  return {
    number: (value: number | null | undefined) =>
      value == null ? '\u2014' : number.format(value),
    money: (value: string | null | undefined) =>
      formatUsd(value, i18n.language),
    date: (value: string) => date.format(new Date(value)),
    duration: (value: number | null) =>
      value === null
        ? '\u2014'
        : value < 1000
          ? `${number.format(value)} ms`
          : `${seconds.format(value / 1000)} s`,
  }
}
