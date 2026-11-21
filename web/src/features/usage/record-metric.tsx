import { useTranslation } from 'react-i18next'
import type { UsageRecord } from '@/api/observability'
import { formatUsd } from '@/lib/usd'
import { MetricList } from '@/components/data-table/metric-list'

export function RecordMetric({
  record: r,
  kind,
  mobile = false,
}: {
  record: UsageRecord
  kind: 'token' | 'billing' | 'latency'
  mobile?: boolean
}) {
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t(`usage.${key}`)
  const unknown = t('adminObservability.unknown')
  const number = (value: number | null, digits = 0) =>
    value === null
      ? unknown
      : new Intl.NumberFormat(i18n.language, {
          maximumFractionDigits: digits,
        }).format(value)
  const duration = (value: number | null) =>
    value === null
      ? unknown
      : value < 1000
        ? `${number(value)}ms`
        : `${number(value / 1000, 2)}s`
  const speed =
    r.firstTokenLatencyMs !== null &&
    r.latencyMs !== null &&
    r.latencyMs > r.firstTokenLatencyMs &&
    r.tokenDetails.outputTokens !== null
      ? `${number(r.tokenDetails.outputTokens / ((r.latencyMs - r.firstTokenLatencyMs) / 1000), 1)}t/s`
      : unknown
  const entries =
    kind === 'token'
      ? [
          {
            key: 'input',
            value: number(r.tokenDetails.inputTokens),
            tone: 'text-badge-success-foreground',
          },
          {
            key: 'output',
            value: number(r.tokenDetails.outputTokens),
            tone: 'text-badge-premium-foreground',
          },
          {
            key: 'shortCache',
            value: number(r.tokenDetails.cachedInputTokens),
            tone: 'text-badge-info-foreground',
          },
        ]
      : kind === 'billing'
        ? [
            {
              key: 'shortCharge',
              value: formatUsd(r.retailChargeUsd, i18n.language),
              tone: 'text-badge-success-foreground',
            },
            {
              key: 'shortCost',
              value: r.billing?.totalAmountDisplay ?? unknown,
              tone: 'text-badge-warning-foreground',
            },
          ]
        : [
            {
              key: 'firstToken',
              value: duration(r.firstTokenLatencyMs),
              tone: '',
            },
            { key: 'duration', value: duration(r.latencyMs), tone: '' },
            { key: 'shortSpeed', value: speed, tone: '' },
          ]
  return (
    <MetricList
      data-mobile={mobile || undefined}
      stacked={mobile}
      className={mobile ? 'leading-4' : 'min-w-32 leading-4'}
    >
      {entries.map(({ key, value, tone }) => (
        <div key={key} className={mobile ? 'min-w-0 space-y-0.5' : 'contents'}>
          <dt
            className={`text-muted-foreground ${mobile ? 'break-words' : 'whitespace-nowrap'}`}
          >
            {tr(key)}
          </dt>
          <dd
            className={`min-w-0 text-left font-medium ${mobile ? 'break-all whitespace-normal' : 'whitespace-nowrap'} ${tone}`}
          >
            {value}
          </dd>
        </div>
      ))}
    </MetricList>
  )
}
