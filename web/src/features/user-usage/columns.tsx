import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import type { CustomerUsageRecord } from '@/api/customer-usage'
import { Badge } from '@/components/ui/badge'
import { useUsageFormat } from './format'
import { MetricPreview, MetricRows } from './metric-preview'

export function useUsageColumns(): ColumnDef<CustomerUsageRecord>[] {
  const { t } = useTranslation()
  const tr = (key: string) => t(`liveUsage.${key}`)
  const format = useUsageFormat()
  return [
    {
      accessorKey: 'started_at',
      enableHiding: false,
      header: tr('time'),
      cell: ({ row: { original: record } }) => (
        <MetricPreview
          label={tr('request')}
          details={
            <MetricRows
              entries={[
                [tr('requestId'), record.request_id],
                [
                  tr('completed'),
                  record.completed_at
                    ? format.date(record.completed_at)
                    : '\u2014',
                ],
              ]}
            />
          }
        >
          <time
            dateTime={record.started_at}
            className='text-xs whitespace-nowrap text-muted-foreground tabular-nums'
          >
            {format.date(record.started_at)}
          </time>
        </MetricPreview>
      ),
    },
    {
      accessorKey: 'public_model_id',
      enableHiding: false,
      meta: { label: tr('model') },
      header: tr('model'),
      cell: ({ getValue }) => (
        <span className='font-medium whitespace-nowrap'>
          {getValue<string | null>() ?? '\u2014'}
        </span>
      ),
    },
    {
      accessorKey: 'api_key_id',
      meta: { label: tr('key') },
      header: tr('key'),
      cell: ({ getValue }) => (
        <span
          title={getValue<string>()}
          className='block max-w-44 truncate font-mono text-xs text-muted-foreground'
        >
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: 'operation',
      meta: { label: tr('operation') },
      header: tr('operation'),
      cell: ({ getValue }) => (
        <span className='text-xs'>{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'outcome',
      meta: { label: tr('outcome') },
      header: tr('outcome'),
      cell: ({ row: { original: record } }) => (
        <div className='flex items-center gap-2'>
          <Badge
            variant='secondary'
            className={
              record.outcome === 'succeeded'
                ? 'bg-badge-success text-badge-success-foreground'
                : record.outcome === 'failed'
                  ? 'bg-badge-danger text-badge-danger-foreground'
                  : record.outcome === 'running'
                    ? 'bg-badge-info text-badge-info-foreground'
                    : 'bg-badge-warning text-badge-warning-foreground'
            }
          >
            {tr(`outcomes.${record.outcome}`)}
          </Badge>
          {record.client_status_code !== null && (
            <span className='text-xs text-muted-foreground tabular-nums'>
              {record.client_status_code}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'total_tokens',
      meta: { label: tr('tokens') },
      header: tr('tokens'),
      cell: ({ row: { original: record } }) => (
        <MetricPreview
          label={tr('tokenDetails')}
          details={
            <MetricRows
              entries={[
                [tr('input'), format.number(record.input_tokens)],
                [tr('output'), format.number(record.output_tokens)],
                [tr('cacheRead'), format.number(record.cached_input_tokens)],
                [
                  tr('cacheWrite'),
                  format.number(record.cache_write_input_tokens),
                ],
                [
                  tr('reasoning'),
                  format.number(record.reasoning_output_tokens),
                ],
                [tr('totalTokens'), format.number(record.total_tokens)],
              ]}
            />
          }
        >
          <MetricRows
            entries={[
              [tr('input'), format.number(record.input_tokens)],
              [tr('output'), format.number(record.output_tokens)],
              [tr('totalTokens'), format.number(record.total_tokens)],
            ]}
          />
        </MetricPreview>
      ),
    },
    {
      accessorKey: 'retail_charge_usd',
      meta: { label: tr('charge') },
      header: tr('charge'),
      cell: ({ row: { original: record } }) => (
        <div className='space-y-1'>
          <div className='font-medium whitespace-nowrap tabular-nums'>
            {format.money(record.retail_charge_usd)}
          </div>
          <div className='text-xs text-muted-foreground'>
            {record.retail_state
              ? tr(`billingStates.${record.retail_state}`)
              : '\u2014'}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'latency_ms',
      meta: { label: tr('latency') },
      header: tr('latency'),
      cell: ({ row: { original: record } }) => (
        <MetricRows
          entries={[
            [tr('firstToken'), format.duration(record.first_token_ms)],
            [tr('duration'), format.duration(record.latency_ms)],
          ]}
        />
      ),
    },
  ]
}
