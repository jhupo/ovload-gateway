import { useMemo } from 'react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { useEngagement, type LotteryState } from '@/hooks/use-engagement'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { type LotteryRound } from './data'

export function RoundsTable() {
  const { data } = useEngagement<LotteryState>('lottery')
  const pastRounds = data?.rounds ?? []
  const { t, i18n } = useTranslation()
  const columns = useMemo<ColumnDef<LotteryRound>[]>(
    () => [
      {
        accessorKey: 'id',
        filterFn: (row, id, query: string) =>
          String(row.getValue(id)).includes(query.trim()),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('lottery.round')} />
        ),
        cell: ({ row }) => (
          <span className='font-medium tabular-nums'>#{row.original.id}</span>
        ),
        meta: { label: t('lottery.round') },
      },
      {
        accessorKey: 'participants',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('lottery.participants')}
          />
        ),
        meta: { label: t('lottery.participants') },
      },
      {
        accessorKey: 'winners',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('lottery.winners')} />
        ),
        meta: { label: t('lottery.winners') },
      },
      {
        accessorKey: 'rewardCents',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('lottery.reward')} />
        ),
        cell: ({ row }) =>
          new Intl.NumberFormat(i18n.language, {
            style: 'currency',
            currency: 'USD',
            currencyDisplay: 'narrowSymbol',
          }).format(row.original.rewardCents / 100),
        meta: { label: t('lottery.reward') },
      },
      {
        accessorKey: 'drawnAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('lottery.drawnAt')} />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {new Intl.DateTimeFormat(i18n.language, {
              timeZone: 'UTC',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hourCycle: 'h23',
            }).format(new Date(row.original.drawnAt))}{' '}
            UTC
          </span>
        ),
        meta: { label: t('lottery.drawnAt') },
      },
      {
        id: 'status',
        header: t('lottery.status'),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge
            variant='outline'
            className={
              row.original.status === 'cancelled'
                ? 'border-transparent bg-muted text-muted-foreground'
                : 'border-transparent bg-badge-success text-badge-success-foreground'
            }
          >
            {row.original.status === 'cancelled'
              ? t('lottery.cancelled')
              : t('lottery.completed')}
          </Badge>
        ),
        meta: { label: t('lottery.status') },
      },
    ],
    [t, i18n.language]
  )
  // The table owns mutable state and is intentionally not compiler-memoized.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: pastRounds,
    columns,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  })
  return (
    <div className='min-w-0 space-y-4' data-testid='lottery-rounds'>
      <DataTableToolbar
        table={table}
        searchKey='id'
        searchPlaceholder={t('lottery.searchRounds')}
      />
      <div className='overflow-x-auto rounded-lg border'>
        <Table aria-label={t('lottery.pastRounds')}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className='tabular-nums'>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className='h-24 text-center text-muted-foreground'
                >
                  {data ? t('liveInfrastructure.empty') : null}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  )
}
