import { useMemo, useRef, useState } from 'react'
import {
  type ColumnDef,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Copy, Download, MoreHorizontal, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useClockValue } from '@/hooks/use-clock'
import { useCommercePage } from '@/hooks/use-commerce-page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DataTableSingleFilter,
  DataTableColumnHeader,
  DataTablePagination,
} from '@/components/data-table'
import { DataTableBulkActions } from '@/components/data-table/bulk-actions'
import { MetricList } from '@/components/data-table/metric-list'
import { DataTableToolbarLayout } from '@/components/data-table/toolbar-layout'
import { DataTableViewOptions } from '@/components/data-table/view-options'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { QueryState } from '@/components/query-state'
import { type RedemptionCode, codeStatus } from './data'
import { CodeGenerator } from './generator'
import { RedemptionHistory } from './history'

function CodeStatusBadge({ code }: { code: RedemptionCode }) {
  const { t } = useTranslation()
  const status = useClockValue((now) => codeStatus(code, now))
  return (
    <Badge
      variant='secondary'
      className={`font-normal transition-none ${['unused', 'partial'].includes(status) ? 'bg-badge-success text-badge-success-foreground' : 'bg-badge-neutral text-badge-neutral-foreground'}`}
    >
      {t(`redemption.${status}`)}
    </Badge>
  )
}

export function RedemptionCodes() {
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t(`redemption.${key}`)
  const [query, setQuery] = useState(''),
    [type, setType] = useState('all'),
    [status, setStatus] = useState('all')
  const [columnVisibility, setVisibility] = useState<VisibilityState>({})
  const [selection, setSelection] = useState({})
  const [generator, setGenerator] = useState(false),
    [history, setHistory] = useState<RedemptionCode | null>(null)
  const [confirmation, setConfirmation] = useState<{
    ids: string[]
    action: 'disable' | 'enable' | 'delete'
  } | null>(null)
  const trigger = useRef<HTMLElement | null>(null),
    create = useRef<HTMLButtonElement>(null)
  const restoreFocus = () =>
    requestAnimationFrame(() =>
      (trigger.current?.isConnected ? trigger.current : create.current)?.focus()
    )
  const {
    codes: records,
    execute,
    busy,
    ready,
    error,
    refresh,
    tableState,
    exportAll,
  } = useCommercePage('codes', { search: query, type, status })
  const {
    sorting,
    onSortingChange: setSorting,
    pagination,
    onPaginationChange,
    total,
  } = tableState
  const matchingCodes = useClockValue((now) =>
    status === 'all'
      ? ''
      : records.map((row) => (codeStatus(row, now) === status ? '1' : '0')).join('')
  )
  const data = useMemo(
    () =>
      status === 'all'
        ? records
        : records.filter((_, index) => matchingCodes[index] === '1'),
    [records, status, matchingCodes]
  )
  const date = (v: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(v))
  const benefit = (r: RedemptionCode) =>
    r.type === 'balance'
      ? new Intl.NumberFormat(i18n.language, {
          style: 'currency',
          currency: 'USD',
          currencyDisplay: 'narrowSymbol',
        }).format(r.value / 100)
      : r.type === 'subscription'
        ? r.planName
        : r.type === 'concurrency'
          ? `+${r.value}`
          : tr('registration')
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(tr('copied'))
    } catch {
      toast.error(tr('copyFailed'))
    }
  }
  const identity = (r: RedemptionCode) => (
    <div className='min-w-0'>
      <div className='flex items-center gap-1'>
        <span className='truncate font-mono text-xs font-medium' title={r.code}>
          {r.code}
        </span>
        <Button
          size='icon'
          variant='ghost'
          className='size-8 shrink-0'
          aria-label={`${tr('copy')} ${r.code}`}
          onClick={() => void copy(r.code)}
        >
          <Copy className='size-3.5' />
        </Button>
      </div>
      <p className='truncate text-xs text-muted-foreground'>
        {r.notes || `#${r.id.slice(0, 8)}`}
      </p>
    </div>
  )
  const times = (r: RedemptionCode) => (
    <MetricList className='gap-x-3'>
      <dt className='text-muted-foreground'>{tr('created')}</dt>
      <dd>{date(r.createdAt)}</dd>
      <dt className='text-muted-foreground'>{tr('expires')}</dt>
      <dd>{r.expiresAt ? date(r.expiresAt) : tr('never')}</dd>
    </MetricList>
  )
  const menu = (r: RedemptionCode) => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          size='icon'
          variant='ghost'
          aria-label={`${tr('more')} ${r.code}`}
          onClick={(e) => {
            trigger.current = e.currentTarget
          }}
        >
          <MoreHorizontal className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        onCloseAutoFocus={(e) => {
          if (history || confirmation) e.preventDefault()
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            setHistory(r)
          }}
        >
          {tr('history')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onSelect={() =>
            setConfirmation({
              ids: [r.id],
              action: r.disabled ? 'enable' : 'disable',
            })
          }
        >
          {tr(r.disabled ? 'enable' : 'disable')}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant='destructive'
          disabled={busy}
          onSelect={() => setConfirmation({ ids: [r.id], action: 'delete' })}
        >
          {tr('delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const columns: ColumnDef<RedemptionCode>[] = [
    {
      id: 'select',
      size: 44,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          aria-label={tr('selectAll')}
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(v === true)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`${tr('select')} ${row.original.code}`}
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(v === true)}
        />
      ),
    },
    {
      accessorKey: 'code',
      size: 245,
      enableHiding: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('code')} />
      ),
      cell: ({ row }) => identity(row.original),
    },
    {
      accessorKey: 'type',
      size: 105,
      meta: { label: tr('type') },
      header: tr('type'),
      cell: ({ row }) => (
        <span className='text-muted-foreground'>{tr(row.original.type)}</span>
      ),
    },
    {
      accessorKey: 'value',
      size: 110,
      meta: { label: tr('benefit') },
      header: tr('benefit'),
      cell: ({ row }) => (
        <span className='font-medium tabular-nums'>
          {benefit(row.original)}
        </span>
      ),
    },
    {
      id: 'usage',
      size: 135,
      meta: { label: tr('usage') },
      header: tr('usage'),
      cell: ({ row: { original: r } }) => (
        <div className='space-y-1 text-xs'>
          <div className='tabular-nums'>
            {r.used ?? r.history.length} / {r.maxUses || '∞'}
          </div>
          <div className='text-muted-foreground'>
            {t('redemption.userLimit', { count: r.perUser })}
          </div>
        </div>
      ),
    },
    {
      id: 'status',
      size: 100,
      meta: { label: tr('status') },
      header: tr('status'),
      cell: ({ row }) => <CodeStatusBadge code={row.original} />,
    },
    {
      accessorKey: 'createdAt',
      size: 215,
      meta: { label: tr('time') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('time')} />
      ),
      cell: ({ row }) => times(row.original),
    },
    {
      id: 'actions',
      size: 64,
      enableHiding: false,
      header: tr('actions'),
      cell: ({ row }) => menu(row.original),
    },
  ]
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, rowSelection: selection, pagination },
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    onPaginationChange,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setSelection,
    getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })
  const selected = table.getSelectedRowModel().rows.map((r) => r.original)
  const filter = (
    value: string,
    change: (v: string) => void,
    key: string,
    options: string[]
  ) => (
    <DataTableSingleFilter
      title={tr(key)}
      value={value}
      options={options.map((value) => ({ value, label: tr(value) }))}
      onValueChange={(value) => {
        change(value)
        table.setPageIndex(0)
        setSelection({})
      }}
    />
  )
  const exportCodes = async () => {
    const rows = selected.length ? selected : (await exportAll()).codes
    const now = Date.now()
    const escape = (v: string) =>
      '"' + (/^[=+\-@\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""') + '"'
    const csv = [
      ['code', 'type', 'benefit', 'max_uses', 'per_user', 'status', 'notes'],
      ...rows.map((r) => [
        r.code,
        r.type,
        benefit(r),
        String(r.maxUses),
        String(r.perUser),
        codeStatus(r, now),
        r.notes,
      ]),
    ]
      .map((r) => r.map(escape).join(','))
      .join('\r\n')
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'redemption-codes.csv'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (!ready) return <QueryState error={error} retry={refresh} />
  return (
    <>
      <Header>
        <ProfileDropdown />
      </Header>
      <Main fixed id='content' className='min-h-0'>
        <div
          data-slot='page-heading'
          className='flex shrink-0 flex-wrap items-center justify-between gap-3'
        >
          <div className='flex items-center gap-2'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {tr('title')}
            </h1>
          </div>
          <Button
            ref={create}
            disabled={busy}
            onClick={(e) => {
              trigger.current = e.currentTarget
              setGenerator(true)
            }}
          >
            <Plus />
            {tr('generate')}
          </Button>
        </div>
        <DataTableToolbarLayout
          actions={
            <>
              <Button
                variant='outline'
                size='sm'
                disabled={!data.length}
                onClick={() =>
                  void exportCodes().catch((error: Error) =>
                    toast.error(error.message)
                  )
                }
              >
                <Download className='size-4' />
                {tr('export')}
              </Button>
              <DataTableViewOptions table={table} />
            </>
          }
        >
          <Input
            className='h-8 w-full sm:w-60'
            aria-label={tr('search')}
            placeholder={tr('search')}
            value={query}
            maxLength={100}
            onChange={(e) => {
              setQuery(e.target.value)
              table.setPageIndex(0)
              setSelection({})
            }}
          />
          <div className='flex flex-wrap gap-2'>
            {filter(type, setType, 'type', [
              'balance',
              'concurrency',
              'subscription',
              'invitation',
            ])}
            {filter(status, setStatus, 'status', [
              'unused',
              'partial',
              'exhausted',
              'expired',
              'disabled',
            ])}
          </div>
        </DataTableToolbarLayout>
        <div className='relative min-h-0 flex-1'>
          <div className='h-full overflow-auto rounded-md border bg-card'>
            <div className='hidden xl:block [&>[data-slot=table-container]]:overflow-visible'>
              <Table className='table-fixed' aria-label={tr('title')}>
                <TableHeader className='sticky top-0 z-10 bg-background'>
                  {table.getHeaderGroups().map((g) => (
                    <TableRow key={g.id} className='transition-none'>
                      {g.headers.map((h) => (
                        <TableHead
                          key={h.id}
                          className='px-3'
                          style={{
                            width: `${(h.getSize() / table.getTotalSize()) * 100}%`,
                          }}
                        >
                          {flexRender(
                            h.column.columnDef.header,
                            h.getContext()
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((r) => (
                    <TableRow
                      key={r.id}
                      data-state={r.getIsSelected() && 'selected'}
                      className='transition-none'
                    >
                      {r.getVisibleCells().map((c) => (
                        <TableCell
                          key={c.id}
                          className='px-3 py-4 whitespace-normal'
                        >
                          {flexRender(c.column.columnDef.cell, c.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className='divide-y xl:hidden'>
              {table.getRowModel().rows.map((row) => {
                const r = row.original
                return (
                  <article key={r.id} className='space-y-3 p-4'>
                    <div className='flex items-center gap-3'>
                      <Checkbox
                        aria-label={`${tr('select')} ${r.code}`}
                        checked={row.getIsSelected()}
                        onCheckedChange={(v) => row.toggleSelected(v === true)}
                      />
                      <div className='min-w-0 flex-1'>{identity(r)}</div>
                      {menu(r)}
                    </div>
                    <div className='flex flex-wrap items-center gap-2 text-xs'>
                      {table.getColumn('type')?.getIsVisible() && (
                        <span className='text-muted-foreground'>
                          {tr(r.type)}
                        </span>
                      )}
                      {table.getColumn('value')?.getIsVisible() && (
                        <strong>{benefit(r)}</strong>
                      )}
                      {table.getColumn('status')?.getIsVisible() && (
                        <CodeStatusBadge code={r} />
                      )}
                    </div>
                    {table.getColumn('usage')?.getIsVisible() && (
                      <div className='flex justify-between text-xs'>
                        <span>
                          {tr('usage')} {r.used ?? r.history.length}/
                          {r.maxUses || '∞'}
                        </span>
                        <span className='text-muted-foreground'>
                          {t('redemption.userLimit', { count: r.perUser })}
                        </span>
                      </div>
                    )}
                    {table.getColumn('createdAt')?.getIsVisible() && times(r)}
                  </article>
                )
              })}
            </div>
            {!data.length && (
              <div className='grid h-40 place-items-center text-sm text-muted-foreground'>
                {t('data_table.no_results')}
              </div>
            )}
          </div>
        </div>
        <DataTablePagination
          table={table}
          className='shrink-0'
          actions={
            selected.length ? (
              <DataTableBulkActions
                table={table}
                entityName={tr('title')}
                className='relative bottom-auto left-auto mx-auto translate-x-0'
              >
                <Button
                  size='sm'
                  variant='outline'
                  disabled={busy}
                  onClick={() =>
                    setConfirmation({
                      ids: selected.map((r) => r.id),
                      action: 'disable',
                    })
                  }
                >
                  {tr('disable')}
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={busy}
                  onClick={() =>
                    setConfirmation({
                      ids: selected.map((r) => r.id),
                      action: 'delete',
                    })
                  }
                >
                  {tr('delete')}
                </Button>
              </DataTableBulkActions>
            ) : undefined
          }
        />
      </Main>
      {generator && (
        <CodeGenerator
          onClose={() => setGenerator(false)}
          restoreFocus={restoreFocus}
        />
      )}
      <Dialog open={!!history} onOpenChange={(v) => !v && setHistory(null)}>
        <DialogContent
          className='max-h-[85dvh] overflow-y-auto sm:max-w-xl'
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            restoreFocus()
          }}
        >
          <DialogHeader className='text-left'>
            <DialogTitle>{tr('history')}</DialogTitle>
            <DialogDescription className='sr-only'>
              {tr('preview')}
            </DialogDescription>
          </DialogHeader>
          {history && (
            <>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <code className='text-xs'>{history.code}</code>
                <CodeStatusBadge code={history} />
              </div>
              <RedemptionHistory code={history} />
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!confirmation}
        onOpenChange={(v) => {
          if (!v) {
            setConfirmation(null)
            restoreFocus()
          }
        }}
        title={
          confirmation
            ? t('redemption.confirm', {
                action: tr(confirmation.action),
                count: confirmation.ids.length,
              })
            : ''
        }
        desc={<span className='sr-only'>{tr('preview')}</span>}
        confirmText={t('common.confirm')}
        destructive={confirmation?.action === 'delete'}
        disabled={busy}
        handleConfirm={() => {
          if (!confirmation) return
          void (async () => {
            for (const id of confirmation.ids) {
              const row = records.find((r) => r.id === id)
              if (!row) continue
              await execute(
                confirmation.action === 'delete'
                  ? { action: 'delete_code', id, revision: row.revision }
                  : {
                      action: 'update_code',
                      id,
                      revision: row.revision,
                      disabled: confirmation.action === 'disable',
                    }
              )
            }
            setConfirmation(null)
          })().catch(() => {})
        }}
      />
    </>
  )
}
