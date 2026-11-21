import { useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  exportCustomerUsage,
  getCustomerUsageSummary,
  getCustomerUsageTrend,
  listCustomerUsage,
  type CustomerUsageFilter,
  type UsageOutcome,
} from '@/api/customer-usage'
import { useIdentitySession } from '@/stores/identity-session'
import { calendarDate, calendarDayStart } from '@/lib/calendar'
import { useSiteTimezone } from '@/hooks/use-site-timezone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTableFacetedFilter } from '@/components/data-table/faceted-filter'
import { DataTableToolbarLayout } from '@/components/data-table/toolbar-layout'
import { DataTableViewOptions } from '@/components/data-table/view-options'
import { Main } from '@/components/layout/main'
import { RequestErrorToast } from '@/components/request-error-toast'
import { useUsageColumns } from './columns'
import { useUsageFormat } from './format'
import { UsageTrend } from './trend'

type Range = 'today' | '24h' | '7d' | '30d'
const ranges: Range[] = ['today', '24h', '7d', '30d']
const outcomes: UsageOutcome[] = [
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'incomplete',
]
function windowFor(range: Range, now: number, timeZone: string) {
  const end = new Date(now)
  const start = new Date(
    now - (range === '30d' ? 30 : range === '7d' ? 7 : 1) * 86_400_000
  )
  if (range === 'today')
    start.setTime(calendarDayStart(calendarDate(now, timeZone), timeZone))
  return { from: start.toISOString(), to: end.toISOString() }
}
function Action({
  label,
  children,
  ...props
}: {
  label: string
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  'aria-pressed'?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='icon'
          className='size-8'
          aria-label={label}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function UserUsage() {
  const timeZone = useSiteTimezone()
  return <UserUsageContent key={timeZone} timeZone={timeZone} />
}
function UserUsageContent({ timeZone }: { timeZone: string }) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`liveUsage.${key}`)
  const format = useUsageFormat()
  const sessionId = useIdentitySession((state) => state.session?.id)
  const [range, setRange] = useState<Range>('today')
  const [filter, setFilter] = useState<CustomerUsageFilter>(() =>
    windowFor('today', Date.now(), timeZone)
  )
  const [model, setModel] = useState('')
  const [key, setKey] = useState('')
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [limit, setLimit] = useState(50)
  const [showTrend, setShowTrend] = useState(false)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const cursor = cursors.at(-1)
  const list = useQuery({
    queryKey: ['customer-usage', sessionId, filter, cursor, limit],
    queryFn: ({ signal }) => listCustomerUsage(filter, cursor, limit, signal),
    enabled: !!sessionId,
    retry: false,
  })
  const summary = useQuery({
    queryKey: ['customer-usage-summary', sessionId, filter],
    queryFn: ({ signal }) => getCustomerUsageSummary(filter, signal),
    enabled: !!sessionId,
    retry: false,
  })
  const trend = useQuery({
    queryKey: ['customer-usage-trend', sessionId, filter],
    queryFn: ({ signal }) => getCustomerUsageTrend(filter, signal),
    enabled: !!sessionId && showTrend,
    retry: false,
  })
  const columns = useUsageColumns()
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: list.data?.items ?? [],
    columns,
    getRowId: (row) => row.request_id,
    defaultColumn: { enableSorting: false },
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  })
  const exportCsv = useMutation({
    mutationFn: (command: { filter: CustomerUsageFilter; owner: string }) =>
      exportCustomerUsage(command.filter),
    onSuccess: (blob, command) => {
      if (useIdentitySession.getState().session?.id !== command.owner) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `usage-${command.filter.from.slice(0, 10)}.csv`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    onError: (error, command) => {
      if (useIdentitySession.getState().session?.id === command.owner)
        toast.error(error.message, { id: 'usage-export' })
    },
  })
  const updateFilter = (next: CustomerUsageFilter) => {
    setFilter(next)
    setCursors([undefined])
  }
  const refresh = () => {
    const next = { ...filter, ...windowFor(range, Date.now(), timeZone) }
    updateFilter(next)
  }
  const error = list.error ?? summary.error ?? (showTrend ? trend.error : null)
  const busy =
    list.isFetching || summary.isFetching || (showTrend && trend.isFetching)
  const metrics = [
    ['requests', format.number(summary.data?.requests)],
    ['totalTokens', format.number(summary.data?.total_tokens)],
    ['charge', format.money(summary.data?.retail_charge_usd)],
    ['settledRequests', format.number(summary.data?.settled_requests)],
  ]
  return (
    <Main id='content'>
      <div
        data-slot='page-heading'
        className='flex flex-wrap items-center justify-between gap-3'
      >
        <h1 className='text-2xl font-semibold'>{t('userWorkspace.usage')}</h1>
        <div className='flex flex-wrap items-center gap-2'>
          <Select
            value={range}
            onValueChange={(value) => {
              const next = value as Range
              setRange(next)
              updateFilter({
                ...filter,
                ...windowFor(next, Date.now(), timeZone),
              })
            }}
          >
            <SelectTrigger aria-label={tr('range')} className='h-8 w-36'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ranges.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`dashboard.ranges.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Action
            label={tr('trend')}
            aria-pressed={showTrend}
            onClick={() => setShowTrend((shown) => !shown)}
          >
            <ChartNoAxesCombined className='size-4' />
          </Action>
          <Action label={tr('refresh')} disabled={busy} onClick={refresh}>
            <RefreshCw className={busy ? 'size-4 animate-spin' : 'size-4'} />
          </Action>
          <Action
            label={exportCsv.isPending ? tr('exporting') : tr('export')}
            disabled={exportCsv.isPending || !sessionId}
            onClick={() => {
              if (sessionId) exportCsv.mutate({ filter, owner: sessionId })
            }}
          >
            <Download className='size-4' />
          </Action>
        </div>
      </div>
      <dl
        className='grid grid-cols-2 gap-x-6 gap-y-4 border-b pb-5'
        data-testid='usage-summary'
      >
        {metrics.map(([name, value]) => (
          <div key={name} className='min-w-0 space-y-1.5'>
            <dt className='text-xs text-muted-foreground'>{tr(name)}</dt>
            <dd
              className='text-xl font-semibold break-words tabular-nums'
              data-testid={`usage-total-${name}`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {error && <RequestErrorToast message={error.message} retry={refresh} />}
      {showTrend &&
        (trend.isPending ? (
          <div
            role='status'
            className='flex h-48 items-center justify-center text-sm text-muted-foreground'
          >
            {tr('loading')}
          </div>
        ) : trend.data ? (
          <UsageTrend items={trend.data} filter={filter} />
        ) : null)}
      <div className='min-w-0 space-y-4'>
        <DataTableToolbarLayout
          actions={<DataTableViewOptions table={table} />}
        >
          <form
            className='flex min-w-0 flex-wrap items-center gap-2'
            onSubmit={(event) => {
              event.preventDefault()
              updateFilter({
                ...filter,
                public_model_id: model.trim() || undefined,
                api_key_id: key.trim() || undefined,
              })
            }}
          >
            <Input
              aria-label={tr('modelFilter')}
              placeholder={tr('modelFilter')}
              className='h-8 w-44'
              value={model}
              maxLength={256}
              onChange={(event) => setModel(event.target.value)}
            />
            <Input
              aria-label={tr('keyFilter')}
              placeholder={tr('keyFilter')}
              className='h-8 w-44'
              value={key}
              maxLength={256}
              onChange={(event) => setKey(event.target.value)}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type='submit'
                  variant='outline'
                  size='icon'
                  className='size-8'
                  aria-label={tr('apply')}
                >
                  <Search className='size-4' />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tr('apply')}</TooltipContent>
            </Tooltip>
            <DataTableFacetedFilter
              title={tr('outcome')}
              selectionMode='single'
              selected={filter.outcome ? [filter.outcome] : []}
              onSelectedChange={(values) =>
                updateFilter({
                  ...filter,
                  outcome: values[0] as UsageOutcome | undefined,
                })
              }
              options={outcomes.map((value) => ({
                value,
                label: tr(`outcomes.${value}`),
              }))}
            />
            {(filter.public_model_id ||
              filter.api_key_id ||
              filter.outcome ||
              model ||
              key) && (
              <Action
                label={tr('reset')}
                onClick={() => {
                  setModel('')
                  setKey('')
                  updateFilter(windowFor(range, Date.now(), timeZone))
                }}
              >
                <X className='size-4' />
              </Action>
            )}
          </form>
        </DataTableToolbarLayout>
        <div
          className='@container max-h-[640px] overflow-auto rounded-lg border'
          aria-busy={list.isFetching}
          data-testid='usage-viewport'
        >
          <Table
            aria-label={t('userWorkspace.usage')}
            className='min-w-[1000px]'
          >
            <TableHeader className='sticky top-0 z-10 bg-background'>
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
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className='py-3 whitespace-nowrap'
                      >
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
                  <TableCell colSpan={table.getVisibleLeafColumns().length}>
                    <div
                      role='status'
                      className='sticky left-0 flex h-32 w-[calc(100cqw-2rem)] items-center justify-center text-sm text-muted-foreground'
                    >
                      {list.isPending
                        ? tr('loading')
                        : list.isError
                          ? tr('unavailable')
                          : tr('empty')}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <span className='text-sm text-muted-foreground'>
            {t('liveUsage.pageRows', { count: list.data?.items.length ?? 0 })}
          </span>
          <div className='flex flex-wrap items-center gap-2'>
            <Select
              value={String(limit)}
              onValueChange={(value) => {
                setLimit(Number(value))
                setCursors([undefined])
              }}
            >
              <SelectTrigger aria-label={tr('pageSize')} className='h-8 w-20'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={cursors.length < 2 || list.isFetching}
              onClick={() => setCursors((previous) => previous.slice(0, -1))}
            >
              <ChevronLeft className='size-4' />
              {tr('previous')}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={!list.data?.next_cursor || list.isFetching}
              onClick={() =>
                setCursors((previous) => [
                  ...previous.slice(-63),
                  list.data?.next_cursor ?? undefined,
                ])
              }
            >
              {tr('next')}
              <ChevronRight className='size-4' />
            </Button>
          </div>
        </div>
      </div>
    </Main>
  )
}
