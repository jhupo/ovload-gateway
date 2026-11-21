import { useTranslation } from 'react-i18next'
import { amountFormatter, type AmountUnit } from '@/lib/amount'

export function useMoneyFormat() {
  const { i18n } = useTranslation()
  return (cents: number, currency: AmountUnit = 'USD') =>
    amountFormatter(i18n.resolvedLanguage === 'zh' ? 'zh-CN' : 'en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
    }).format(cents / 100)
}
