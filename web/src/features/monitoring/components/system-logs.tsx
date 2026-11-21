import { useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  type ColumnDef,
  type PaginationState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Eye, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { monitoringApi, type SystemLog } from '@/api/monitoring'
import { accountProviderLabel as providerLabel } from '@/lib/upstream-platforms'
import { useRecordFormat } from '@/hooks/use-record-format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination } from '@/components/data-table'
import { DataTableToolbarLayout } from '@/components/data-table/toolbar-layout'
import { DataTableViewOptions } from '@/components/data-table/view-options'
import { QueryState } from '@/components/query-state'
import { RequestErrorToast } from '@/components/request-error-toast'
import { LogControls } from './log-controls'
import { logMessage } from './log-message'

export function SystemLogs({
  owner,
  params,
  enabled,
}: {
  owner: string | undefined
  params: URLSearchParams
  enabled: boolean
}) {
  const { t } = useTranslation()
  const format = useRecordFormat()
  const tr = (key: string) => t(`monitoring.systemLogs.${key}`)
  const [search, setSearch] = useState('')
  const [requestId, setRequestId] = useState('')
  const [level, setLevel] = useState('all')
  const [component, setComponent] = useState('')
  const [accountId, setAccountId] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const [visibility, setVisibility] = useState<VisibilityState>({
    provider: false,
    accountId: false,
  })
  const [selected, setSelected] = useState<SystemLog | null>(null)
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  const query = new URLSearchParams({
    from: params.get('startTime')!,
    to: params.get('endTime')!,
  })
  for (const name of ['provider', 'groupId']) {
    const value = params.get(name)
    if (value) query.set(name, value)
  }
  if (level !== 'all') query.set('level', level)
  if (component.trim()) query.set('component', component.trim())
  if (accountId.trim()) query.set('accountId', accountId.trim())
  query.set('page', String(pagination.pageIndex + 1))
  query.set('pageSize', String(pagination.pageSize))
  if (search.trim()) query.set('search', search.trim())
  if (requestId.trim()) query.set('requestId', requestId.trim())
  const logs = useQuery({
    queryKey: ['admin-observability', owner, 'system-logs', query.toString()],
    queryFn: ({ signal }) => monitoringApi.logs(query, signal),
    enabled,
    retry: false,
    gcTime: 0,
    placeholderData: keepPreviousData,
  })
  const showDetail = (row: SystemLog, button: HTMLButtonElement) => {
    returnFocus.current = button
    setSelected(row)
  }
  const columns: ColumnDef<SystemLog>[] = [
    {
      id: 'occurredAt',
      header: tr('table.time'),
      cell: ({ row }) => format.date(row.original.occurredAt),
    },
    {
      id: 'component',
      header: tr('fields.component'),
      accessorKey: 'component',
      cell: ({ row }) => (
        <span
          className='block max-w-48 truncate'
          title={row.original.component}
        >
          {row.original.component}
        </span>
      ),
    },
    {
      id: 'level',
      header: tr('level'),
      accessorKey: 'level',
      cell: ({ row }) => (
        <Badge variant='secondary'>{row.original.level}</Badge>
      ),
    },
    {
      id: 'message',
      header: t('adminObservability.message'),
      cell: ({ row }) => (
        <span
          className='block max-w-lg truncate'
          title={logMessage(row.original.message)}
        >
          {logMessage(row.original.message)}
        </span>
      ),
    },
    {
      id: 'requestId',
      header: t('usage.requestId'),
      accessorKey: 'requestId',
      cell: ({ row }) => (
        <span
          className='block max-w-48 truncate font-mono text-xs'
          title={row.original.requestId ?? undefined}
        >
          {row.original.requestId ?? '—'}
        </span>
      ),
    },
    {
      id: 'provider',
      header: t('usage.provider'),
      cell: ({ row }) => providerLabel(row.original.provider),
    },
    {
      id: 'accountId',
      header: t('usage.account'),
      accessorKey: 'accountId',
    },
    {
      id: 'actions',
      header: t('common.actions'),
      enableHiding: false,
      cell: ({ row }) => (
        <Button
          variant='ghost'
          size='icon'
          aria-label={tr('table.details')}
          onClick={(e) => showDetail(row.original, e.currentTarget)}
        >
          <Eye />
        </Button>
      ),
    },
  ]
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: logs.data?.items ?? [],
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualFiltering: true,
    enableSorting: false,
    rowCount: logs.data?.total ?? 0,
    state: { pagination, columnVisibility: visibility },
    onColumnVisibilityChange: setVisibility,
    onPaginationChange: (update) =>
      setPagination((current) => {
        const next = typeof update === 'function' ? update(current) : update
        return next.pageSize === current.pageSize
          ? next
          : { ...next, pageIndex: 0 }
      }),
  })
  const filter = (value: string, setter: (value: string) => void) => {
    setter(value.slice(0, 200))
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }
  const detailFields = selected
    ? [
        [tr('table.time'), format.date(selected.occurredAt)],
        [tr('fields.component'), selected.component],
        [tr('level'), selected.level],
        [t('usage.requestId'), selected.requestId],
        [
          t('usage.provider'),
          selected.provider ? providerLabel(selected.provider) : null,
        ],
        [t('usage.account'), selected.accountId],
      ].filter(([, value]) => value != null && value !== '')
    : []
  return (
    <section
      data-testid='system-logs'
      aria-labelledby='system-logs-title'
      className='min-w-0 space-y-4'
    >
      {/* ai-design-check-ignore-next-line use-shared-looks -- Existing section-heading style; this project has no shared Heading component. */}
      <h2 id='system-logs-title' className='text-sm font-semibold'>
        {tr('title')}
      </h2>
      <DataTableToolbarLayout
        actions={
          <>
            <Button
              variant='outline'
              size='icon'
              aria-label={t('adminObservability.refresh')}
              disabled={logs.isFetching || !enabled}
              onClick={() => void logs.refetch()}
            >
              <RefreshCw />
            </Button>
            <LogControls owner={owner} refresh={() => void logs.refetch()} />
            <DataTableViewOptions table={table} />
          </>
        }
      >
        <Input
          className='w-full sm:w-64'
          aria-label={tr('searchPlaceholder')}
          placeholder={tr('searchPlaceholder')}
          value={search}
          onChange={(e) => filter(e.target.value, setSearch)}
        />
        <Input
          className='w-full sm:w-56'
          aria-label={t('usage.requestId')}
          placeholder={t('usage.requestId')}
          value={requestId}
          onChange={(e) => filter(e.target.value, setRequestId)}
        />
        <Select
          value={level}
          onValueChange={(value) => filter(value, setLevel)}
        >
          <SelectTrigger aria-label={tr('level')} className='w-full sm:w-36'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{tr('allLevels')}</SelectItem>
            {['DEBUG', 'INFO', 'WARN', 'ERROR'].map((value) => (
              <SelectItem value={value} key={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant='outline' onClick={() => setAdvanced(true)}>
          {tr('advanced')}
        </Button>
        {(search || requestId || level !== 'all' || component || accountId) && (
          <Button
            variant='ghost'
            onClick={() => {
              filter('', setSearch)
              setRequestId('')
              setLevel('all')
              setComponent('')
              setAccountId('')
            }}
          >
            {tr('reset')}
          </Button>
        )}
      </DataTableToolbarLayout>
      {logs.isError && (
        <RequestErrorToast
          message={logs.error.message}
          retry={() => void logs.refetch()}
        />
      )}
      {logs.isError || !logs.data ? (
        <QueryState error={logs.error} retry={() => logs.refetch()} />
      ) : (
        <>
          <div
            className='hidden overflow-hidden rounded-lg border md:block'
            aria-busy={logs.isFetching}
          >
            <Table aria-label={tr('title')} className='min-w-[900px]'>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead key={header.id}>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className='py-3 text-left whitespace-nowrap'
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        ) ?? '—'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!logs.data.items.length && (
                  <TableRow>
                    <TableCell
                      colSpan={table.getVisibleLeafColumns().length}
                      className='h-24 text-center text-muted-foreground'
                    >
                      {t('data_table.no_results')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className='space-y-3 md:hidden'>
            {logs.data.items.map((row) => (
              <article key={row.id} className='space-y-2 rounded-lg border p-4'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-xs text-muted-foreground'>
                    {format.date(row.occurredAt)}
                  </span>
                  <Button
                    size='icon'
                    variant='ghost'
                    aria-label={tr('table.details')}
                    onClick={(e) => showDetail(row, e.currentTarget)}
                  >
                    <Eye />
                  </Button>
                </div>
                <p className='text-xs break-all text-muted-foreground'>
                  {row.component} · {row.level}
                </p>
                <p className='text-sm break-words'>{logMessage(row.message)}</p>
                {row.requestId && (
                  <p className='font-mono text-xs break-all'>{row.requestId}</p>
                )}
              </article>
            ))}
            {!logs.data.items.length && (
              <p className='py-6 text-center text-sm text-muted-foreground'>
                {t('data_table.no_results')}
              </p>
            )}
          </div>
          <DataTablePagination table={table} />
        </>
      )}
      <Dialog open={advanced} onOpenChange={setAdvanced}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr('advanced')}</DialogTitle>
            <DialogDescription className='sr-only'>
              {tr('title')}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label={tr('fields.component')}
            placeholder={tr('fields.component')}
            value={component}
            onChange={(e) => filter(e.target.value, setComponent)}
          />
          <Input
            aria-label={t('usage.account')}
            placeholder={t('usage.account')}
            value={accountId}
            onChange={(e) => filter(e.target.value, setAccountId)}
          />
          <Button onClick={() => setAdvanced(false)}>{tr('apply')}</Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <DialogContent
          className='max-h-[85dvh] overflow-y-auto sm:max-w-2xl'
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocus.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{tr('table.details')}</DialogTitle>
            <DialogDescription className='sr-only'>
              {selected ? format.date(selected.occurredAt) : ''}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <dl className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                {detailFields.map(([label, value]) => (
                  <div key={label}>
                    <dt className='text-xs text-muted-foreground'>{label}</dt>
                    <dd className='mt-1 text-sm break-all'>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className='text-sm whitespace-pre-wrap'>
                {logMessage(selected.message)}
              </p>
              {Object.keys(selected.fields).length > 0 && (
                <pre className='max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap'>
                  {JSON.stringify(selected.fields, null, 2)}
                </pre>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
