import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Download, Eye, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  listAccountGroupOptions,
  type AccountGroupOption,
} from '@/api/account-groups'
import {
  observability,
  observationWindow,
  type ObservationRange,
  type UsageRecord,
  type UsageSummary,
} from '@/api/observability'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { calendarDate, calendarDayStart, addCalendarDays } from '@/lib/calendar'
import { downloadCsv } from '@/lib/csv'
import {
  accountProviderLabel as providerLabel,
  accountProviders as usageProviders,
} from '@/lib/upstream-platforms'
import { formatUsd } from '@/lib/usd'
import { useErrorToast } from '@/hooks/use-error-toast'
import { useSiteTimezone } from '@/hooks/use-site-timezone'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DataTablePagination,
  DataTableSingleFilter,
} from '@/components/data-table'
import { DataTableToolbarLayout } from '@/components/data-table/toolbar-layout'
import { DataTableViewOptions } from '@/components/data-table/view-options'
import { TableViewport } from '@/components/data-table/viewport'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { QueryState } from '@/components/query-state'
import { RequestErrorToast } from '@/components/request-error-toast'
import { OrderDate } from '@/features/orders/shared'
import { RecordMetric } from './record-metric'
import { RequestDetail } from './request-detail'
import { Settlement } from './settlement'
import { UserRanking, type RankingRow } from './user-ranking'

const providerOptions = usageProviders

export function UsageStatistics() {
  const owner = useIdentitySession((state) => state.session?.id)
  return <UsageContent key={owner ?? 'signed-out'} />
}

function UsageContent() {
  const queryClient = useQueryClient()
  const timeZone = useSiteTimezone()
  const { t } = useTranslation()
  const tr = (key: string) => t(`usage.${key}`)
  const session = useIdentitySession((state) => state.session)
  useIdentitySession((state) => state.grants)
  const canRead = session?.audience === 'management' && allows('usage.read')
  const [range, setRange] = useState<ObservationRange | 'custom'>('7d')
  const [asOf, setAsOf] = useState(Date.now)
  const [from, setFrom] = useState(() => calendarDate(Date.now(), timeZone))
  const [to, setTo] = useState(from)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<ColumnFiltersState>([])
  const [visibility, setVisibility] = useState<VisibilityState>({
    id: false,
    clientIp: false,
    route: false,
  })
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState('requests')
  const [rankingUser, setRankingUser] = useState<RankingRow | null>(null)
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  const fromMs = calendarDayStart(from, timeZone)
  const toMs = to ? calendarDayStart(addCalendarDays(to, 1), timeZone) : NaN
  const invalid =
    range === 'custom' &&
    (!Number.isFinite(fromMs) ||
      !Number.isFinite(toMs) ||
      fromMs >= toMs ||
      Date.parse(to) - Date.parse(from) >= 31 * 86_400_000)
  useErrorToast(invalid ? tr('invalidRange') : undefined, 'usage-range')
  const time =
    range === 'custom'
      ? new URLSearchParams(
          invalid
            ? {}
            : {
                startTime: new Date(fromMs).toISOString(),
                endTime: new Date(toMs).toISOString(),
              }
        )
      : observationWindow(range, asOf)
  const provider = (
    filters.find((filter) => filter.id === 'provider')?.value as
      | string[]
      | undefined
  )?.[0]
  const filterValue = (id: string) =>
    (filters.find((f) => f.id === id)?.value as string[] | undefined)?.[0] ??
    'all'
  const groups = useQuery({
    queryKey: ['usage-group-options', session?.id],
    queryFn: async ({ signal }) => {
      const items: AccountGroupOption[] = []
      for (let page = 1; ; page++) {
        const result = await listAccountGroupOptions(
          { page, pageSize: 100 },
          signal
        )
        items.push(...result.items)
        if (page >= result.page.totalPages) return items
      }
    },
    enabled: canRead && allows('provider_accounts.read'),
    retry: false,
  })
  useErrorToast(groups.error?.message, 'usage-group-options')
  const summaryParams = new URLSearchParams(time)
  if (provider) summaryParams.set('provider', provider)
  const rankingParams = new URLSearchParams(summaryParams)
  if (tab !== 'ranking') {
    if (search.trim()) summaryParams.set('userEmail', search.trim())
    if (filterValue('group') !== 'all')
      summaryParams.set('groupId', filterValue('group'))
    if (filterValue('billingMode') !== 'all')
      summaryParams.set('billingMode', filterValue('billingMode'))
    if (rankingUser) {
      summaryParams.set('userId', rankingUser.user_id)
      summaryParams.set('tenantId', rankingUser.tenant_id)
    }
  }
  const params = new URLSearchParams(summaryParams)
  params.set('status', tab === 'errors' ? 'error' : 'all')
  params.set('currentPage', String(pagination.pageIndex + 1))
  params.set('pageSize', String(pagination.pageSize))
  if (search.trim()) params.set('userEmail', search.trim())
  if (filterValue('group') !== 'all')
    params.set('groupId', filterValue('group'))
  if (filterValue('billingMode') !== 'all')
    params.set('billingMode', filterValue('billingMode'))
  if (rankingUser) {
    params.set('userId', rankingUser.user_id)
    params.set('tenantId', rankingUser.tenant_id)
  }
  const records = useQuery({
    queryKey: [
      'admin-observability',
      session?.id,
      'records',
      params.toString(),
    ],
    queryFn: ({ signal }) => observability.records(params, signal),
    enabled: canRead && !invalid && tab !== 'ranking',
    retry: false,
    gcTime: 0,
  })
  const summary = useQuery({
    queryKey: [
      'admin-observability',
      session?.id,
      'usage-summary',
      summaryParams.toString(),
    ],
    queryFn: ({ signal }) => observability.summary(summaryParams, signal),
    enabled: canRead && !invalid,
    retry: false,
    gcTime: 0,
  })
  const exportRecords = useMutation({
    mutationFn: async () => {
      const owner = session?.id
      const exportParams = new URLSearchParams(params)
      exportParams.set('pageSize', '100')
      const rows: UsageRecord[] = []
      for (let page = 1; ; page++) {
        exportParams.set('currentPage', String(page))
        const result = await observability.records(
          exportParams,
          new AbortController().signal
        )
        if (useIdentitySession.getState().session?.id !== owner) return
        if (result.total > 10000) throw new Error(t('usage.exportTooLarge'))
        rows.push(...result.items)
        if (rows.length >= result.total || !result.items.length) break
      }
      downloadCsv('usage.csv', [
        [
          'ID',
          tr('user'),
          tr('userEmail'),
          tr('group'),
          tr('credential'),
          tr('provider'),
          tr('account'),
          tr('model'),
          t('adminObservability.requestedModel'),
          t('adminObservability.upstreamModel'),
          tr('endpoint'),
          tr('status'),
          tr('errorCode'),
          tr('error'),
          tr('input'),
          tr('output'),
          tr('cacheRead'),
          tr('cacheWrite'),
          t('adminObservability.reasoningTokens'),
          tr('imageInput'),
          tr('imageOutput'),
          t('dashboard.totalTokens'),
          tr('charge'),
          tr('pendingCharge'),
          tr('cost'),
          tr('settlement'),
          tr('billingMode'),
          tr('firstToken'),
          tr('duration'),
          tr('time'),
        ],
        ...rows.map((r) => [
          r.id,
          r.userName ?? '',
          r.userEmail ?? '',
          r.routingGroupNamesSnapshot.join(' / '),
          r.clientApiKeyName ?? '',
          providerLabel(r.provider),
          r.accountName ?? r.accountId ?? '',
          r.model ?? '',
          r.requestedModel ?? '',
          r.upstreamModel ?? '',
          r.route,
          r.logicalOutcome,
          r.errorCode ?? '',
          r.errorMessage ?? '',
          r.tokenDetails.inputTokens,
          r.tokenDetails.outputTokens,
          r.tokenDetails.cachedInputTokens,
          r.tokenDetails.cacheWriteInputTokens,
          r.tokenDetails.reasoningOutputTokens,
          r.tokenDetails.imageInputTokens,
          r.tokenDetails.imageOutputTokens,
          r.tokenDetails.totalTokens,
          r.retailChargeUsd,
          r.pendingChargeUsd,
          r.billing?.totalAmountDisplay ?? '',
          r.retailState ?? '',
          r.fundingSource ?? '',
          r.firstTokenLatencyMs,
          r.latencyMs,
          r.createdAt,
        ]),
      ])
    },
    onError: (error) => toast.error(error.message),
  })
  const resetPage = () =>
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  const setFilter = (id: string, value: string) => {
    setFilters((current) => [
      ...current.filter((filter) => filter.id !== id),
      ...(value === 'all' ? [] : [{ id, value: [value] }]),
    ])
    resetPage()
  }
  const columns: ColumnDef<UsageRecord>[] = [
    {
      id: 'user',
      accessorKey: 'userName',
      header: tr('user'),
      cell: ({ row: { original: r } }) => (
        <div className='max-w-44 space-y-1'>
          <div className='truncate' title={r.userName ?? r.userId ?? undefined}>
            {r.userName ?? r.userId ?? '—'}
          </div>
          <div
            className='truncate text-xs text-muted-foreground'
            title={r.userEmail ?? undefined}
          >
            {r.userEmail}
          </div>
        </div>
      ),
    },
    {
      id: 'group',
      header: tr('group'),
      accessorFn: (r) => r.routingGroupNamesSnapshot.join(', '),
      cell: ({ row: { original: r } }) => (
        <span
          className='block max-w-40 truncate'
          title={r.routingGroupNamesSnapshot.join(', ')}
        >
          {r.routingGroupNamesSnapshot.join(', ') || '—'}
        </span>
      ),
    },
    {
      id: 'credential',
      accessorKey: 'clientApiKeyName',
      header: tr('credential'),
      cell: ({ row: { original: r } }) => (
        <span
          className='block max-w-44 truncate'
          title={r.clientApiKeyName ?? undefined}
        >
          {r.clientApiKeyName ?? t('adminObservability.unknown')}
        </span>
      ),
    },
    {
      id: 'account',
      accessorKey: 'accountName',
      header: tr('account'),
      cell: ({ row: { original: r } }) => (
        <span
          className='block max-w-44 truncate'
          title={r.accountName ?? r.accountId ?? undefined}
        >
          {r.accountName ?? r.accountId ?? t('adminObservability.unknown')}
        </span>
      ),
    },
    {
      id: 'provider',
      accessorKey: 'provider',
      header: tr('provider'),
      cell: ({ row }) =>
        providerLabel(row.original.provider, t('adminObservability.unknown')),
    },
    {
      id: 'model',
      accessorKey: 'model',
      header: tr('model'),
      cell: ({ row: { original: r } }) => (
        <span
          className='block max-w-44 truncate'
          title={r.upstreamModel ?? r.model ?? undefined}
        >
          {r.upstreamModel ?? r.model ?? t('adminObservability.unknown')}
        </span>
      ),
    },
    {
      id: 'route',
      accessorKey: 'route',
      header: tr('endpoint'),
      cell: ({ row }) => (
        <span className='font-mono text-xs'>{row.original.route}</span>
      ),
    },
    {
      id: 'tokens',
      header: tr('token'),
      cell: ({ row }) => <RecordMetric record={row.original} kind='token' />,
    },
    {
      id: 'billing',
      header: tr('billing'),
      cell: ({ row }) => <RecordMetric record={row.original} kind='billing' />,
    },
    {
      id: 'latency',
      header: tr('latency'),
      cell: ({ row }) => <RecordMetric record={row.original} kind='latency' />,
    },
    {
      id: 'settlement',
      header: tr('settlement'),
      cell: ({ row }) => <Settlement record={row.original} />,
    },
    {
      id: 'status',
      accessorKey: 'logicalOutcome',
      header: tr('status'),
      cell: ({ row }) => (
        <div className='max-w-56 space-y-1'>
          <Badge variant='secondary'>
            {t(`adminObservability.outcomes.${row.original.logicalOutcome}`, {
              defaultValue: row.original.logicalOutcome,
            })}
          </Badge>
          {(row.original.errorCode || row.original.errorMessage) && (
            <p
              className='line-clamp-2 text-xs text-muted-foreground'
              title={[row.original.errorCode, row.original.errorMessage]
                .filter(Boolean)
                .join(' · ')}
            >
              {row.original.errorCode ?? row.original.errorMessage}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'time',
      accessorKey: 'createdAt',
      header: t('adminObservability.recordedAt'),
      cell: ({ row }) => (
        <span className='text-xs tabular-nums'>
          {row.original.createdAtDisplay}
        </span>
      ),
    },
    { id: 'id', accessorKey: 'id', header: tr('requestId') },
    { id: 'clientIp', accessorKey: 'clientIp', header: tr('ip') },
    {
      id: 'actions',
      enableHiding: false,
      header: '',
      cell: ({ row }) => (
        <Button
          size='icon'
          variant='ghost'
          className='size-8'
          aria-label={`${tr('viewRecord')} ${row.id}`}
          data-request-id={row.id}
          onClick={(event) => {
            returnFocus.current = event.currentTarget
            setSelected(row.id)
          }}
        >
          <Eye className='size-4' />
        </Button>
      ),
    },
  ]
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: records.data?.items ?? [],
    columns,
    getRowId: (record) => record.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    rowCount: records.data?.total ?? 0,
    enableSorting: false,
    state: {
      pagination,
      columnFilters: filters,
      globalFilter: search,
      columnVisibility: visibility,
    },
    onPaginationChange: (update) =>
      setPagination((current) => {
        const next = typeof update === 'function' ? update(current) : update
        return next.pageSize === current.pageSize
          ? next
          : { ...next, pageIndex: 0 }
      }),
    onColumnVisibilityChange: setVisibility,
    onGlobalFilterChange: (value: string) => {
      setSearch(value.slice(0, 200))
      resetPage()
    },
    onColumnFiltersChange: (update) => {
      setFilters((current) =>
        (typeof update === 'function' ? update(current) : update).map(
          (filter) => ({
            ...filter,
            value: (filter.value as string[]).slice(-1),
          })
        )
      )
      resetPage()
    },
  })
  return (
    <>
      <Header fixed className='bg-background'>
        <ProfileDropdown />
      </Header>
      <Main id='content'>
        <div
          data-slot='page-heading'
          className='flex flex-wrap items-center justify-between gap-3'
        >
          <h1 className='text-2xl font-semibold'>{tr('title')}</h1>
          <div className='flex items-center gap-2'>
            <Select
              value={range}
              onValueChange={(value: ObservationRange | 'custom') => {
                setRange(value)
                setAsOf(Date.now())
                resetPage()
              }}
            >
              <SelectTrigger aria-label={tr('time')} className='h-8 w-36'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['today', '24h', '7d', '30d', 'custom'] as const).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {value === 'custom'
                        ? tr('custom')
                        : t(`dashboard.ranges.${value}`)}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <Button
              size='icon'
              variant='outline'
              className='size-8'
              aria-label={t('adminObservability.refresh')}
              disabled={
                !canRead || invalid || records.isFetching || summary.isFetching
              }
              onClick={() => {
                if (range === 'custom') {
                  if (tab === 'ranking')
                    void queryClient.invalidateQueries({
                      queryKey: ['user-usage-ranking', session?.id],
                    })
                  else void records.refetch()
                  void summary.refetch()
                } else setAsOf(Date.now())
              }}
            >
              <RefreshCw className='size-4' />
            </Button>
            <Button
              variant='outline'
              disabled={
                !canRead ||
                invalid ||
                tab === 'ranking' ||
                exportRecords.isPending
              }
              onClick={() => exportRecords.mutate()}
            >
              <Download className='size-4' />
              {tr('export')}
            </Button>
          </div>
        </div>
        {!canRead ? (
          <p role='alert'>{t('adminObservability.forbidden')}</p>
        ) : (
          <>
            {range === 'custom' && (
              <div className='flex flex-wrap gap-2'>
                <OrderDate
                  value={from}
                  label={tr('from')}
                  onChange={(value) => {
                    setFrom(value)
                    resetPage()
                  }}
                />
                <OrderDate
                  value={to}
                  label={tr('to')}
                  onChange={(value) => {
                    setTo(value)
                    resetPage()
                  }}
                />
              </div>
            )}
            {invalid ? (
              <p role='alert' className='sr-only'>
                {tr('invalidRange')}
              </p>
            ) : (
              <>
                <section
                  className='space-y-3'
                  aria-label={t('adminObservability.periodTotals')}
                >
                  {summary.isError ? (
                    <LoadError
                      message={summary.error.message}
                      retry={() => void summary.refetch()}
                    />
                  ) : summary.data ? (
                    <UsageTotals data={summary.data} />
                  ) : (
                    <p role='status'>{t('adminObservability.loading')}</p>
                  )}
                </section>
                <Tabs
                  value={tab}
                  onValueChange={(value) => {
                    setTab(value)
                    if (value === 'errors')
                      setFilters((current) =>
                        current.filter((filter) => filter.id !== 'status')
                      )
                    resetPage()
                  }}
                  className='gap-4'
                >
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <TabsList
                      aria-label={tr('title')}
                      className='h-11 rounded-none border-b bg-transparent p-0 [&>button]:rounded-none [&>button]:border-0 [&>button]:border-b-2 [&>button]:border-transparent [&>button]:bg-transparent [&>button]:shadow-none [&>button[data-state=active]]:border-foreground'
                    >
                      <TabsTrigger value='requests'>
                        {tr('requestDetails')}
                      </TabsTrigger>
                      <TabsTrigger value='errors'>
                        {t('adminObservability.nonSuccess')}
                      </TabsTrigger>
                      <TabsTrigger value='ranking'>{tr('ranking')}</TabsTrigger>
                    </TabsList>
                    <span className='text-xs text-muted-foreground'>
                      {summary.data?.analytics.generatedAtDisplay ??
                        t('adminObservability.unknown')}
                    </span>
                  </div>
                  <TabsContent value='ranking'>
                    <UserRanking
                      params={rankingParams}
                      onSelect={(row) => {
                        setRankingUser(row)
                        setSearch(row.email)
                        setTab('requests')
                        resetPage()
                      }}
                    />
                  </TabsContent>
                  <TabsContent value={tab === 'errors' ? 'errors' : 'requests'}>
                    <div className='relative flex h-[max(500px,calc(100svh-390px))] min-h-0 flex-col gap-4 [&_td]:px-2 [&_td]:py-3 [&_th]:px-2'>
                      <DataTableToolbarLayout
                        actions={<DataTableViewOptions table={table} />}
                      >
                        <Input
                          aria-label={tr('userEmail')}
                          placeholder={tr('userEmail')}
                          value={search}
                          onChange={(event) => {
                            setSearch(event.target.value.slice(0, 200))
                            setRankingUser(null)
                            resetPage()
                          }}
                          className='h-8 w-60'
                        />
                        <DataTableSingleFilter
                          title={tr('group')}
                          value={filterValue('group')}
                          onValueChange={(v) => setFilter('group', v)}
                          options={(groups.data ?? []).map((g) => ({
                            value: g.id,
                            label: g.name,
                          }))}
                        />
                        <DataTableSingleFilter
                          title={tr('billingMode')}
                          value={filterValue('billingMode')}
                          onValueChange={(v) => setFilter('billingMode', v)}
                          options={['wallet', 'subscription'].map((v) => ({
                            value: v,
                            label: tr(`fundingSources.${v}`),
                          }))}
                        />
                        <DataTableSingleFilter
                          title={tr('provider')}
                          value={provider ?? 'all'}
                          onValueChange={(v) => setFilter('provider', v)}
                          options={providerOptions}
                        />
                      </DataTableToolbarLayout>
                      {records.isError ? (
                        <LoadError
                          message={records.error.message}
                          retry={() => void records.refetch()}
                        />
                      ) : (
                        <>
                          <TableViewport
                            className='hidden md:block'
                            aria-busy={records.isFetching}
                          >
                            <Table
                              aria-label={tr(
                                tab === 'errors'
                                  ? 'errorDetails'
                                  : 'requestDetails'
                              )}
                              className='min-w-[1100px]'
                            >
                              <TableHeader className='sticky top-0 z-10 bg-card'>
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
                                        className='py-3 whitespace-nowrap'
                                      >
                                        {flexRender(
                                          cell.column.columnDef.cell,
                                          cell.getContext()
                                        )}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                                {!records.data?.items.length && (
                                  <TableRow>
                                    <TableCell
                                      colSpan={
                                        table.getVisibleLeafColumns().length
                                      }
                                      className='h-32 text-center text-muted-foreground'
                                    >
                                      {records.isPending
                                        ? t('adminObservability.loading')
                                        : tr('empty')}
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </TableViewport>
                          <TableViewport
                            className='md:hidden'
                            aria-busy={records.isFetching}
                          >
                            {records.data?.items.map((record) => (
                              <article
                                key={record.id}
                                className='space-y-3 border-b p-4 text-xs last:border-b-0'
                              >
                                <div className='flex items-start justify-between gap-2'>
                                  <div className='min-w-0'>
                                    <p className='truncate font-medium'>
                                      {record.clientApiKeyName ??
                                        t('adminObservability.unknown')}
                                    </p>
                                    <p className='mt-1 truncate text-muted-foreground'>
                                      {record.accountName ??
                                        record.accountId ??
                                        t('adminObservability.unknown')}
                                    </p>
                                  </div>
                                  <Badge variant='secondary'>
                                    {t(
                                      `adminObservability.outcomes.${record.logicalOutcome}`,
                                      { defaultValue: record.logicalOutcome }
                                    )}
                                  </Badge>
                                </div>
                                <div className='space-y-1 break-words'>
                                  <p>
                                    {tr('user')}:{' '}
                                    {record.userName ?? record.userEmail ?? '—'}
                                  </p>
                                  <p>
                                    {tr('group')}:{' '}
                                    {record.routingGroupNamesSnapshot.join(
                                      ', '
                                    ) || '—'}
                                  </p>
                                  <Settlement record={record} />
                                </div>
                                <div className='space-y-1.5'>
                                  <p className='font-medium'>
                                    {record.upstreamModel ??
                                      record.model ??
                                      t('adminObservability.unknown')}
                                  </p>
                                  <p className='truncate font-mono text-muted-foreground'>
                                    {record.route}
                                  </p>
                                </div>
                                <div className='grid grid-cols-3 gap-3 border-y py-3'>
                                  {(
                                    ['token', 'billing', 'latency'] as const
                                  ).map((kind) => (
                                    <div key={kind} className='min-w-0'>
                                      <p className='mb-1 text-muted-foreground'>
                                        {tr(kind)}
                                      </p>
                                      <RecordMetric
                                        record={record}
                                        kind={kind}
                                        mobile
                                      />
                                    </div>
                                  ))}
                                </div>
                                <div className='flex items-center justify-between text-muted-foreground tabular-nums'>
                                  <span>{record.createdAtDisplay}</span>
                                  <Button
                                    variant='link'
                                    size='icon'
                                    className='size-8'
                                    aria-label={`${tr('viewRecord')} ${record.id}`}
                                    data-request-id={record.id}
                                    onClick={(event) => {
                                      returnFocus.current = event.currentTarget
                                      setSelected(record.id)
                                    }}
                                  >
                                    <Eye className='size-4' />
                                  </Button>
                                </div>
                              </article>
                            ))}
                            {!records.data?.items.length && (
                              <div className='flex h-32 items-center justify-center text-muted-foreground'>
                                {records.isPending
                                  ? t('adminObservability.loading')
                                  : tr('empty')}
                              </div>
                            )}
                          </TableViewport>
                          {records.data && (
                            <DataTablePagination table={table} />
                          )}
                        </>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </>
        )}
        <RequestDetail
          id={selected}
          owner={session?.id}
          canRead={canRead}
          onClose={() => setSelected(null)}
          returnFocus={returnFocus}
        />
      </Main>
    </>
  )
}

function UsageTotals({ data }: { data: UsageSummary }) {
  const { t, i18n } = useTranslation()
  const costs = data.attempts.costs.map((cost) =>
    cost.currency === 'USD'
      ? formatUsd(cost.estimatedAmount, i18n.language)
      : `${cost.currency} ${cost.estimatedAmount}`
  )
  const cards = [
    {
      title: 'billing',
      items: [
        {
          key: 'charge',
          value: formatUsd(data.retailChargeUsd, i18n.language),
        },
        {
          key: 'cost',
          value: costs.length
            ? costs.join(' / ')
            : t('adminObservability.unknown'),
        },
      ],
    },
    {
      title: 'latency',
      items: [
        { key: 'averageDuration', value: data.averageLatencyMs },
        { key: 'averageFirstToken', value: data.averageFirstTokenMs },
      ],
    },
  ]
  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-2 gap-3'>
        {cards.map((card) => (
          <Card
            key={card.title}
            className='gap-3 px-4 py-4 shadow-sm transition-shadow hover:shadow-md'
          >
            <h2 className='text-sm font-semibold'>
              {t(`usage.${card.title}`)}
            </h2>
            <div className='grid gap-3 sm:grid-cols-2 sm:divide-x'>
              {card.items.map((item) => (
                <div key={item.key} className='min-w-0 sm:px-4 sm:first:pl-0'>
                  <p className='text-xs text-muted-foreground'>
                    {t(`usage.${item.key}`)}
                  </p>
                  <p className='mt-1 text-lg font-semibold break-all tabular-nums sm:text-xl'>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <>
      <RequestErrorToast message={message} retry={retry} />
      <QueryState error={message} retry={retry} />
    </>
  )
}
