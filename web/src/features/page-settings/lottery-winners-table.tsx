import { useMemo, type ReactNode } from 'react'
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

type Winner = {
  id: string
  round: number
  username: string
  email: string
  rewardCents: number
  drawnAt: string
}

export function LotteryWinnersTable({ actions }: { actions: ReactNode }) {
  const state = useEngagement<LotteryState>('lottery')
  const winners: Winner[] = state.data?.winners ?? []
  const { t, i18n } = useTranslation()
  const columns = useMemo<ColumnDef<Winner>[]>(
    () => [
      {
        accessorKey: 'round',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('lottery.round')} />
        ),
        cell: ({ row }) => (
          <span className='font-medium tabular-nums'>
            #{row.original.round}
          </span>
        ),
        filterFn: (row, id, values: string[]) =>
          values.includes(String(row.getValue(id))),
        meta: { label: t('lottery.round') },
      },
      {
        accessorKey: 'username',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('lotterySettings.winner')}
          />
        ),
        cell: ({ row }) => (
          <div className='min-w-44 space-y-1'>
            <div className='font-medium'>{row.original.username}</div>
            <div className='text-xs text-muted-foreground'>
              {row.original.email}
            </div>
          </div>
        ),
        meta: { label: t('lotterySettings.winner') },
      },
      {
        accessorKey: 'rewardCents',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('lottery.reward')} />
        ),
        cell: ({ row }) => (
          <span className='font-medium text-badge-success-foreground tabular-nums'>
            +
            {new Intl.NumberFormat(i18n.language, {
              style: 'currency',
              currency: 'USD',
              currencyDisplay: 'narrowSymbol',
            }).format(row.original.rewardCents / 100)}
          </span>
        ),
        meta: { label: t('lottery.reward') },
      },
      {
        id: 'status',
        header: t('lotterySettings.creditStatus'),
        cell: () => (
          <Badge
            variant='outline'
            className='border-transparent bg-badge-success text-badge-success-foreground'
          >
            {t('lotterySettings.credited')}
          </Badge>
        ),
        enableSorting: false,
        meta: { label: t('lotterySettings.creditStatus') },
      },
      {
        accessorKey: 'drawnAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('lottery.drawnAt')} />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground tabular-nums'>
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
    ],
    [t, i18n.language]
  )
  // The table owns mutable state and is intentionally not compiler-memoized.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: winners,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, query: string) =>
      `${row.original.round} ${row.original.username} ${row.original.email}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
    },
  })
  return (
    <div className='min-w-0 space-y-4' data-testid='lottery-winners'>
      <DataTableToolbar
        table={table}
        searchPlaceholder={t('lotterySettings.searchWinners')}
        filters={[
          {
            columnId: 'round',
            title: t('lottery.round'),
            options: [],
          },
        ]}
        actions={actions}
      />
      <div className='overflow-x-auto rounded-lg border'>
        <Table
          aria-label={t('lotterySettings.winnerRecords')}
          className='min-w-2xl'
        >
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
                    <TableCell key={cell.id}>
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
                  className='h-32 text-center text-muted-foreground'
                >
                  {t('lotterySettings.noWinners')}
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
