import { useTranslation } from 'react-i18next'
import type { UsageCustomer } from '@/api/observability'
import { formatUsd } from '@/lib/usd'

export function Settlement({ record }: { record: UsageCustomer }) {
  const { t, i18n } = useTranslation()
  const state = record.retailState
  if (!state) return <span className='text-muted-foreground'>—</span>
  return (
    <div className='space-y-1 text-xs'>
      <div>{t(`usage.settlementStates.${state}`, { defaultValue: state })}</div>
      {record.fundingSource && (
        <div className='text-muted-foreground'>
          {t(`usage.fundingSources.${record.fundingSource}`, {
            defaultValue: record.fundingSource,
          })}
        </div>
      )}
      {record.pendingChargeUsd && (
        <div className='tabular-nums'>
          {t('usage.pendingCharge')}{' '}
          {formatUsd(record.pendingChargeUsd, i18n.language)}
        </div>
      )}
    </div>
  )
}
