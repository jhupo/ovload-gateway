import type { ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTableColumnHeader, DataTableFrame } from '@/components/data-table'
import type {
  ServerTableState,
  ServerFilters,
} from '@/components/data-table/server-state'
import { type UserSubscription, personalSubscriptionStatus } from './data'
import { useSubscriptionFormat } from './format'
import { SubscriptionStatusBadge } from './presentation'

export function SubscriptionHistory({
  records,
  onDetails,
  server,
  onFilterChange,
  filters,
}: {
  records: UserSubscription[]
  onDetails: (record: UserSubscription, trigger: HTMLElement) => void
  server: ServerTableState
  filters: ServerFilters
  onFilterChange: (filters: ServerFilters) => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`userSubscriptions.${key}`)
  const format = useSubscriptionFormat()
  const columns: ColumnDef<UserSubscription>[] = [
    {
      accessorKey: 'plan',
      enableHiding: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('plan')} />
      ),
      cell: ({ row }) => (
        <span className='font-medium whitespace-nowrap'>
          {row.original.plan}
        </span>
      ),
    },
    {
      accessorKey: 'id',
      meta: { label: tr('id') },
      header: tr('id'),
      cell: ({ row }) => (
        <span className='font-mono text-xs text-muted-foreground'>
          {row.original.id}
        </span>
      ),
    },
    {
      accessorKey: 'startsAt',
      meta: { label: tr('startsAt') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('startsAt')} />
      ),
      cell: ({ row }) => (
        <time
          className='text-xs whitespace-nowrap text-muted-foreground tabular-nums'
          dateTime={row.original.startsAt}
        >
          {format.date(row.original.startsAt)}
        </time>
      ),
    },
    {
      accessorKey: 'expiresAt',
      meta: { label: tr('expiresAt') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('expiresAt')} />
      ),
      cell: ({ row }) => (
        <time
          className='text-xs whitespace-nowrap text-muted-foreground tabular-nums'
          dateTime={row.original.expiresAt}
        >
          {format.date(row.original.expiresAt)}
        </time>
      ),
    },
    {
      accessorKey: 'priceCents',
      meta: { label: tr('paid') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('paid')} />
      ),
      cell: ({ row }) => (
        <span className='text-sm whitespace-nowrap tabular-nums'>
          {format.cents(row.original.priceCents)}
        </span>
      ),
    },
    {
      id: 'status',
      accessorFn: (record) => personalSubscriptionStatus(record),
      meta: { label: tr('status') },
      header: tr('status'),
      filterFn: (row, id, values: string[]) =>
        values.includes(row.getValue(id)),
      cell: ({ row }) => (
        <SubscriptionStatusBadge
          status={personalSubscriptionStatus(row.original)}
        />
      ),
    },
    {
      id: 'details',
      enableHiding: false,
      header: () => <span className='sr-only'>{tr('details')}</span>,
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size='icon'
              variant='ghost'
              className='size-8'
              data-subscription-detail={row.original.id}
              aria-label={`${tr('details')} · ${row.original.id}`}
              onClick={(event) => onDetails(row.original, event.currentTarget)}
            >
              <Eye className='size-4' />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tr('details')}</TooltipContent>
        </Tooltip>
      ),
    },
  ]
  return (
    <DataTableFrame
      data={records}
      columns={columns}
      label={tr('history')}
      searchPlaceholder={tr('search')}
      searchText={(r) => `${r.plan} ${r.id}`}
      initialVisibility={{ id: false }}
      server={server}
      onFilterChange={onFilterChange}
      filterState={filters}
      facetedFilters={[
        {
          columnId: 'status',
          title: tr('status'),
          options: ['expired', 'revoked'].map((value) => ({
            value,
            label: tr(value),
          })),
        },
      ]}
    />
  )
}
