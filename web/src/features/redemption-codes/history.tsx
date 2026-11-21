import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { useCommercePage } from '@/hooks/use-commerce-page'
import { useRecordFormat } from '@/hooks/use-record-format'
import { DataTableFrame } from '@/components/data-table'
import { QueryState } from '@/components/query-state'
import type { Redemption, RedemptionCode } from './data'

export function RedemptionHistory({ code }: { code: RedemptionCode }) {
  const { t } = useTranslation()
  const format = useRecordFormat()
  const result = useCommercePage('code-history', { plan: code.id }, 10)
  const columns: ColumnDef<Redemption>[] = [
    {
      accessorKey: 'user',
      header: t('subscriptions.user'),
      cell: ({ row }) => (
        <div>
          <p>{row.original.user}</p>
          <p className='text-xs text-muted-foreground'>{row.original.email}</p>
        </div>
      ),
    },
    {
      accessorKey: 'at',
      header: t('orders.created'),
      cell: ({ row }) => format.date(row.original.at),
    },
  ]
  if (!result.ready)
    return <QueryState error={result.error} retry={result.refresh} />
  return (
    <div className='flex min-h-0 flex-col gap-4'>
      <DataTableFrame
        data={result.history ?? []}
        columns={columns}
        server={result.tableState}
        label={t('redemption.history')}
        mobile={(row) => (
          <div className='space-y-1'>
            <p>{row.user}</p>
            <p className='text-xs text-muted-foreground'>{row.email}</p>
            <p className='text-xs'>{format.date(row.at)}</p>
          </div>
        )}
      />
    </div>
  )
}
