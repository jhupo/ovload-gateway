import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  CircleAlert,
  CircleCheck,
  CirclePause,
  Layers,
  MoreHorizontal,
  Pencil,
  Trash2,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ApiError } from '@/api/errors'
import {
  settingsFor,
  upstreamAccounts,
  type UpstreamAccount,
} from '@/api/upstream-accounts'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { accountProviders, isAccountPlatform } from '@/lib/upstream-platforms'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  DataTableColumnHeader,
  DataTableFrame,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { RequestErrorToast } from '@/components/request-error-toast'
import { AccountBatchEditor } from './batch-editor'
import { AccountConcurrencyDialog } from './concurrency-dialog'
import { AccountConnectionTest } from './connection-test'
import { AccountDetails } from './details'
import { AccountEditor } from './editor'
import { AccountOnboarding } from './onboarding'
import { accountPanels, type AccountPanel } from './panels'
import {
  AccountGroups,
  AccountIdentity,
  AccountPlan,
  AccountStatus,
  QuotaSummary,
  QuotaWindows,
  AccountProvider,
} from './presentation'
import { invalidateAccountQueries } from './query-cache'

type Command = {
  action: 'toggle' | 'delete' | 'refresh' | 'quota'
  account: UpstreamAccount
  owner: string
}
const route = getRouteApi('/_authenticated/accounts/')
function focusAccount(id?: string) {
  requestAnimationFrame(() =>
    (
      document.getElementById(`account-actions-${id}`) ??
      document.getElementById('account-add')
    )?.focus()
  )
}
export function Accounts() {
  const owner = useIdentitySession((state) => state.session?.id)
  return <AccountsContent key={owner ?? 'signed-out'} />
}
function AccountsContent() {
  const routeSearch = route.useSearch()
  const navigate = route.useNavigate()
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t(`upstreamAccounts.${key}`)
  const owner = useIdentitySession((state) => state.session?.id)
  useIdentitySession((state) => state.grants)
  const canRead = allows('provider_accounts.read')
  const canManage = allows('provider_accounts.manage')
  const client = useQueryClient()
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  })
  const filters: ColumnFiltersState = [
    ...(routeSearch.provider !== 'all'
      ? [{ id: 'provider', value: [routeSearch.provider] }]
      : []),
    ...(routeSearch.status !== 'all'
      ? [{ id: 'status', value: [routeSearch.status] }]
      : []),
  ]
  const [sorting, setSorting] = useState<SortingState>([])
  const [visibility, setVisibility] = useState<VisibilityState>({
    planType: true,
    expiresAt: false,
  })
  const search = routeSearch.query
  const [editor, setEditor] = useState<UpstreamAccount | null>(null)
  const [onboarding, setOnboarding] = useState<{
    account?: UpstreamAccount
  } | null>(null)
  const [detail, setDetail] = useState<{
    account: UpstreamAccount
    panel: AccountPanel
  } | null>(null)
  const showDetail = (
    account: UpstreamAccount,
    panel: AccountPanel = 'usage'
  ) => setDetail({ account, panel })
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [testing, setTesting] = useState<UpstreamAccount | null>(null)
  const [concurrency, setConcurrency] = useState<UpstreamAccount | null>(null)
  const [batch, setBatch] = useState<{
    accounts: UpstreamAccount[]
    revision: number
  } | null>(null)
  const [deleting, setDeleting] = useState<UpstreamAccount | null>(null)
  const params = new URLSearchParams({
    page: String(pagination.pageIndex + 1),
    pageSize: String(pagination.pageSize),
  })
  if (search.trim()) params.set('search', search.trim())
  if (routeSearch.group !== 'all') params.set('groupId', routeSearch.group)
  for (const filter of filters) {
    const values = filter.value as string[]
    if (values.length === 1) params.set(filter.id, values[0])
  }
  if (sorting[0]) {
    params.set('sortBy', sorting[0].id)
    params.set('sortDirection', sorting[0].desc ? 'desc' : 'asc')
  }
  const selectionScope = params.toString()
  useEffect(() => {
    setRowSelection({})
  }, [selectionScope])
  const directory = useQuery({
    queryKey: ['upstream-accounts', owner, params.toString()],
    queryFn: ({ signal }) => upstreamAccounts.list(params, signal),
    enabled: !!owner && canRead,
    retry: false,
    gcTime: 0,
  })
  const counts = directory.data?.summary
  const summary = counts
    ? {
        total: counts.total,
        normal: counts.normal,
        limited: counts.quotaExhausted + counts.rateLimited,
        attention: counts.disabled + counts.error,
      }
    : undefined
  const refresh = () => invalidateAccountQueries(client, owner)
  const mutation = useMutation({
    mutationFn: (command: Command) => {
      if (useIdentitySession.getState().session?.id !== command.owner)
        throw new Error(tr('sessionChanged'))
      switch (command.action) {
        case 'delete':
          return upstreamAccounts.remove(command.account)
        case 'refresh':
          return upstreamAccounts.refresh(command.account.id)
        case 'quota':
          return upstreamAccounts.refreshQuota(command.account.id)
        case 'toggle':
          return upstreamAccounts.update(
            command.account,
            {
              ...settingsFor(command.account),
              enabled: !command.account.enabled,
            },
            command.account.outboundProxyId ?? ''
          )
      }
    },
    retry: false,
    onSuccess: async (_, command) => {
      if (useIdentitySession.getState().session?.id !== command.owner) return
      await invalidateAccountQueries(client, command.owner)
      if (useIdentitySession.getState().session?.id !== command.owner) return
      setDeleting(null)
      if (command.action === 'delete') focusAccount()
      toast.success(tr('saved'))
    },
    onError: (error, command) => {
      if (useIdentitySession.getState().session?.id === command.owner)
        toast.error(
          error instanceof ApiError && error.status === 409
            ? tr('conflict')
            : error.message,
          { id: 'upstream-account-command' }
        )
    },
  })
  const send = (action: Command['action'], account: UpstreamAccount) => {
    if (owner && !mutation.isPending)
      mutation.mutate({ action, account, owner })
  }
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'UTC',
        }).format(new Date(value))
      : tr('unknown')
  const number = (value: number | null) =>
    value === null
      ? tr('unknown')
      : new Intl.NumberFormat(i18n.language).format(value)
  const pinnedColumnClass = (id: string) => {
    if (id === 'select')
      return 'sticky left-0 z-10 w-10 min-w-10 max-w-10 bg-background'
    if (id === 'identity')
      return cn(
        'sticky z-10 w-48 max-w-48 min-w-48 border-r bg-background',
        canManage ? 'left-10' : 'left-0'
      )
    if (id === 'actions')
      return 'sticky right-0 z-10 w-28 min-w-28 border-l bg-background'
    return undefined
  }
  const columns: ColumnDef<UpstreamAccount>[] = [
    ...(canManage
      ? [
          {
            id: 'select',
            enableSorting: false,
            enableHiding: false,
            header: ({ table }) => (
              <Checkbox
                aria-label={tr('selectPage')}
                checked={
                  table.getIsAllPageRowsSelected() ||
                  (table.getIsSomePageRowsSelected() && 'indeterminate')
                }
                onCheckedChange={(checked) =>
                  table.toggleAllPageRowsSelected(!!checked)
                }
              />
            ),
            cell: ({ row }) => (
              <Checkbox
                aria-label={t('upstreamAccounts.selectAccount', {
                  name: row.original.name,
                })}
                checked={row.getIsSelected()}
                onCheckedChange={(checked) => row.toggleSelected(!!checked)}
              />
            ),
          } satisfies ColumnDef<UpstreamAccount>,
        ]
      : []),
    {
      id: 'identity',
      header: tr('account'),
      enableSorting: false,
      cell: ({ row: { original: a } }) => (
        <div className='w-44 text-left'>
          <AccountIdentity account={a} />
        </div>
      ),
    },
    {
      accessorKey: 'provider',
      header: tr('provider'),
      enableSorting: false,
      cell: ({ row }) => <AccountProvider account={row.original} />,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('status')} />
      ),
      cell: ({ row }) => <AccountStatus account={row.original} />,
    },
    {
      id: 'planType',
      accessorKey: 'planType',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('plan')} />
      ),
      cell: ({ row }) => <AccountPlan account={row.original} />,
    },
    {
      id: 'groups',
      header: tr('groups'),
      enableSorting: false,
      cell: ({ row }) => <AccountGroups account={row.original} />,
    },
    {
      id: 'capacity',
      header: tr('capacity'),
      enableSorting: false,
      cell: ({ row }) => {
        const account = row.original
        return (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-8 px-2 font-normal tabular-nums'
            aria-label={`${tr('concurrencyDetails')}: ${account.name}`}
            onClick={(event) => {
              event.stopPropagation()
              setConcurrency(account)
            }}
          >
            {number(account.capacity.usedSlots)} /{' '}
            {account.capacity.totalSlots === null
              ? tr('unlimited')
              : number(account.capacity.totalSlots)}
          </Button>
        )
      },
    },
    {
      id: 'quota',
      header: tr('quotaWindow'),
      enableSorting: false,
      cell: ({ row }) => (
        <div className='max-w-48 min-w-36'>
          {row.original.authenticationKind === 'oauth' &&
          row.original.quota.windows.length ? (
            <QuotaWindows account={row.original} compact />
          ) : (
            <span className='text-muted-foreground'>—</span>
          )}
        </div>
      ),
    },
    {
      id: 'usage',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('tokens')} />
      ),
      cell: ({ row }) => <QuotaSummary account={row.original} />,
    },
    {
      id: 'lastUsedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('lastUsed')} />
      ),
      cell: ({ row }) => date(row.original.usage.lastUsedAt),
    },
    {
      id: 'expiresAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('expires')} />
      ),
      cell: ({ row }) => date(row.original.accessTokenExpiresAt),
    },
    {
      id: 'actions',
      enableHiding: false,
      enableSorting: false,
      header: tr('actions'),
      cell: ({ row: { original: a } }) => (
        <div className='flex items-center gap-1'>
          {canManage && (
            <>
              <Button
                size='icon-sm'
                variant='ghost'
                title={tr('edit')}
                aria-label={tr('edit')}
                disabled={mutation.isPending}
                onClick={() => setEditor(a)}
              >
                <Pencil className='size-4' />
              </Button>
              <Button
                size='icon-sm'
                variant='ghost'
                title={tr('delete')}
                aria-label={tr('delete')}
                disabled={mutation.isPending}
                onClick={() => setDeleting(a)}
              >
                <Trash2 className='size-4' />
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size='icon-sm'
                variant='ghost'
                aria-label={tr('moreActions')}
                title={tr('moreActions')}
                id={`account-actions-${a.id}`}
              >
                <MoreHorizontal className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {accountPanels(a).map((panel) => (
                <DropdownMenuItem
                  key={panel}
                  onSelect={() => showDetail(a, panel)}
                >
                  {t(
                    panel === 'models'
                      ? 'upstreamAccounts.models'
                      : `accounts.${panel}`
                  )}
                </DropdownMenuItem>
              ))}
              {canManage && (
                <>
                  <DropdownMenuItem onSelect={() => setTesting(a)}>
                    {tr('testConnection')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={mutation.isPending}
                    onSelect={() => send('toggle', a)}
                  >
                    {tr(a.enabled ? 'disable' : 'enable')}
                  </DropdownMenuItem>
                  {a.authenticationKind === 'oauth' &&
                    isAccountPlatform(a.provider) && (
                      <DropdownMenuItem
                        disabled={mutation.isPending}
                        onSelect={() => setOnboarding({ account: a })}
                      >
                        {tr('reauthorize')}
                      </DropdownMenuItem>
                    )}
                  {a.authenticationKind === 'oauth' && a.hasRefreshToken && (
                    <DropdownMenuItem
                      disabled={mutation.isPending}
                      onSelect={() => send('refresh', a)}
                    >
                      {tr('refreshCredential')}
                    </DropdownMenuItem>
                  )}
                  {a.authenticationKind === 'oauth' &&
                    a.capabilities.quotaRefresh && (
                      <DropdownMenuItem
                        disabled={mutation.isPending}
                        onSelect={() => send('quota', a)}
                      >
                        {tr('refreshQuota')}
                      </DropdownMenuItem>
                    )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: directory.data?.items ?? [],
    columns,
    getRowId: (account) => account.id,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    rowCount: directory.data?.page.total ?? 0,
    enableRowSelection: canManage,
    onRowSelectionChange: setRowSelection,
    enableMultiSort: false,
    state: {
      rowSelection,
      pagination,
      sorting,
      columnFilters: filters,
      columnVisibility: visibility,
      globalFilter: search,
    },
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setVisibility,
    onSortingChange: (update) => {
      setSorting(update)
      setPagination((current) => ({ ...current, pageIndex: 0 }))
    },
    onColumnFiltersChange: (update) => {
      const next = (
        typeof update === 'function' ? update(filters) : update
      ).map((filter) => ({
        ...filter,
        value: (filter.value as string[]).slice(-1),
      }))
      void navigate({
        search: (previous) => ({
          ...previous,
          provider: (next.find((filter) => filter.id === 'provider')
            ?.value[0] ?? 'all') as typeof previous.provider,
          status: (next.find((filter) => filter.id === 'status')?.value[0] ??
            'all') as typeof previous.status,
        }),
        replace: true,
      })
      setPagination((current) => ({ ...current, pageIndex: 0 }))
    },
    onGlobalFilterChange: (value: string) => {
      void navigate({
        search: (previous) => ({ ...previous, query: value.slice(0, 200) }),
        replace: true,
      })
      setPagination((current) => ({ ...current, pageIndex: 0 }))
    },
  })
  return (
    <>
      <Header fixed className='bg-background'>
        <ProfileDropdown />
      </Header>
      <Main fixed id='content' className='min-h-0'>
        <div
          data-slot='page-heading'
          className='flex flex-wrap items-center justify-between gap-3'
        >
          {/* ai-design-check-ignore-next-line use-shared-looks -- Existing shadcn-admin semantic heading; this project has no Heading component. */}
          <h1 className='text-2xl font-semibold'>{t('accounts.title')}</h1>
          <div className='flex gap-2'>
            <Button
              size='icon-sm'
              variant='outline'
              aria-label={tr('refresh')}
              disabled={!canRead || directory.isFetching}
              onClick={() => void refresh()}
            >
              <RefreshCw className='size-4' />
            </Button>
            {canManage && (
              <Button
                id='account-add'
                size='sm'
                onClick={() => setOnboarding({})}
              >
                <Plus className='size-4' />
                {tr('add')}
              </Button>
            )}
          </div>
        </div>
        {canRead && (
          <div className='grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4'>
            {(
              [
                { key: 'total', icon: Layers },
                { key: 'normal', icon: CircleCheck },
                { key: 'limited', icon: CirclePause },
                { key: 'attention', icon: CircleAlert },
              ] as const
            ).map(({ key, icon: Icon }) => (
              // ai-design-check-ignore-next-line no-style-overrides -- Existing account summary cards retain their established compact layout.
              <Card key={key} className='gap-0 rounded-lg py-0 shadow-sm'>
                <CardContent className='p-3 sm:p-5'>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='text-xs font-medium text-muted-foreground'>
                      {t(`accounts.summary.${key}`)}
                    </span>
                    <Icon className='size-4 text-muted-foreground' />
                  </div>
                  <div className='mt-2 flex items-end justify-between gap-3 sm:mt-3'>
                    <span className='text-2xl leading-none font-semibold tabular-nums sm:text-3xl'>
                      {summary ? number(summary[key]) : tr('unknown')}
                    </span>
                    <span className='text-xs text-muted-foreground tabular-nums'>
                      {summary && summary.total > 0
                        ? `${Math.round((summary[key] / summary.total) * 100)}%`
                        : ''}
                    </span>
                  </div>
                  <div className='mt-4 hidden h-1 overflow-hidden rounded-full bg-muted sm:block'>
                    {summary && (
                      <div
                        className='h-full rounded-full bg-primary/60'
                        style={{
                          width: `${summary.total ? (summary[key] / summary.total) * 100 : 0}%`,
                        }}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {!canRead ? (
          <p role='alert'>{tr('forbidden')}</p>
        ) : (
          <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-4'>
            {routeSearch.group !== 'all' && (
              <div className='flex flex-wrap items-center gap-2 text-sm'>
                <Badge variant='outline'>
                  {tr('groups')}: {routeSearch.group}
                </Badge>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => {
                    setPagination((current) => ({ ...current, pageIndex: 0 }))
                    void navigate({
                      search: (previous) => ({ ...previous, group: 'all' }),
                      replace: true,
                    })
                  }}
                >
                  {tr('clearGroup')}
                </Button>
              </div>
            )}
            <DataTableToolbar
              table={table}
              searchPlaceholder={tr('search')}
              actions={
                canManage &&
                table.getSelectedRowModel().rows.length > 0 && (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() =>
                      setBatch({
                        accounts: table
                          .getSelectedRowModel()
                          .rows.map((row) => row.original),
                        revision: directory.data!.configRevision,
                      })
                    }
                  >
                    {t('upstreamAccounts.batchCount', {
                      count: table.getSelectedRowModel().rows.length,
                    })}
                  </Button>
                )
              }
              filters={[
                {
                  columnId: 'provider',
                  title: tr('provider'),
                  options: accountProviders,
                },
                {
                  columnId: 'status',
                  title: tr('status'),
                  options: [
                    'normal',
                    'quota_exhausted',
                    'rate_limited',
                    'disabled',
                    'error',
                  ].map((value) => ({ value, label: tr(`statuses.${value}`) })),
                },
              ]}
            />
            <DataTableFrame
              data={directory.data?.items ?? []}
              columns={columns}
              label={tr('title')}
              loading={directory.isPending}
              error={
                directory.isError ? (
                  <RequestErrorToast
                    message={directory.error.message}
                    retry={() => void directory.refetch()}
                  />
                ) : undefined
              }
              empty={tr('empty')}
              viewportClassName='@container'
              pagination={
                <DataTablePagination table={table} className='shrink-0' />
              }
            >
              <>
                <Table
                  aria-label={tr('title')}
                  className='hidden min-w-[1280px] xl:table'
                  containerClassName='overflow-x-scroll'
                >
                  <TableHeader>
                    {table.getHeaderGroups().map((group) => (
                      <TableRow key={group.id}>
                        {group.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            className={cn(
                              'sticky top-0 z-10 bg-background',
                              pinnedColumnClass(header.column.id),
                              ['select', 'identity', 'actions'].includes(
                                header.column.id
                              ) && 'z-20'
                            )}
                          >
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
                            className={cn(
                              'py-3 whitespace-nowrap',
                              pinnedColumnClass(cell.column.id)
                            )}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {!directory.data?.items.length && (
                      <TableRow>
                        <TableCell
                          colSpan={table.getVisibleLeafColumns().length}
                          className='h-32 text-center text-muted-foreground'
                        >
                          {tr(directory.isPending ? 'loading' : 'empty')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <div className='divide-y xl:hidden'>
                  {table.getRowModel().rows.map((row) => (
                    <article key={row.id} className='space-y-3 p-4'>
                      <div className='flex items-center justify-between gap-2'>
                        {canManage && (
                          <Checkbox
                            aria-label={t('upstreamAccounts.selectAccount', {
                              name: row.original.name,
                            })}
                            checked={row.getIsSelected()}
                            onCheckedChange={(checked) =>
                              row.toggleSelected(!!checked)
                            }
                          />
                        )}
                        <div className='min-w-0 text-start'>
                          <AccountIdentity account={row.original} />
                        </div>
                        {row
                          .getVisibleCells()
                          .filter((cell) => cell.column.id === 'actions')
                          .map((cell) => (
                            <div key={cell.id}>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </div>
                          ))}
                      </div>
                      <div className='flex flex-wrap items-center gap-2 text-xs'>
                        {table.getColumn('status')?.getIsVisible() && (
                          <AccountStatus account={row.original} />
                        )}
                        {table.getColumn('provider')?.getIsVisible() && (
                          <AccountProvider account={row.original} />
                        )}
                        {table.getColumn('planType')?.getIsVisible() && (
                          <AccountPlan account={row.original} />
                        )}
                      </div>
                      {table.getColumn('groups')?.getIsVisible() && (
                        <AccountGroups account={row.original} />
                      )}
                      {table.getColumn('capacity')?.getIsVisible() &&
                        row
                          .getVisibleCells()
                          .filter((cell) => cell.column.id === 'capacity')
                          .map((cell) => (
                            <div
                              key={cell.id}
                              className='flex items-center gap-2 text-sm'
                            >
                              <span className='text-muted-foreground'>
                                {tr('capacity')}
                              </span>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </div>
                          ))}
                      {table.getColumn('quota')?.getIsVisible() &&
                        row.original.authenticationKind === 'oauth' &&
                        row.original.quota.windows.length > 0 && (
                          <QuotaWindows account={row.original} compact />
                        )}
                      {table.getColumn('usage')?.getIsVisible() && (
                        <QuotaSummary account={row.original} />
                      )}
                      {table.getColumn('lastUsedAt')?.getIsVisible() && (
                        <p className='text-xs text-muted-foreground'>
                          {tr('lastUsed')}:{' '}
                          {date(row.original.usage.lastUsedAt)}
                        </p>
                      )}
                    </article>
                  ))}
                  {!directory.data?.items.length && (
                    <div className='grid min-h-40 place-items-center text-sm text-muted-foreground'>
                      {tr(directory.isPending ? 'loading' : 'empty')}
                    </div>
                  )}
                </div>
              </>
            </DataTableFrame>
          </div>
        )}
        {testing && (
          <AccountConnectionTest
            account={testing}
            onClose={() => {
              setTesting(null)
              void invalidateAccountQueries(client, owner)
              focusAccount(testing.id)
            }}
          />
        )}
        <AccountConcurrencyDialog
          account={concurrency}
          onOpenChange={(open) => {
            if (!open) setConcurrency(null)
          }}
        />
        {batch && (
          <AccountBatchEditor
            accounts={batch.accounts}
            revision={batch.revision}
            onClose={() => setBatch(null)}
            onSaved={async () => {
              await refresh()
              if (useIdentitySession.getState().session?.id !== owner) return
              setBatch(null)
              setRowSelection({})
            }}
          />
        )}
        {editor && (
          <AccountEditor
            key={editor.id}
            account={editor}
            onClose={() => {
              setEditor(null)
              focusAccount(editor.id)
            }}
            onSaved={async () => {
              await refresh()
              if (useIdentitySession.getState().session?.id !== owner) return
              setEditor(null)
              focusAccount(editor.id)
            }}
          />
        )}
        {onboarding && (
          <AccountOnboarding
            account={onboarding.account}
            onClose={() => {
              setOnboarding(null)
              focusAccount(onboarding.account?.id)
            }}
            onSaved={async (accountId) => {
              if (useIdentitySession.getState().session?.id !== owner) return
              if (!onboarding.account) {
                setPagination((current) => ({ ...current, pageIndex: 0 }))
                setSorting([])
                setRowSelection({})
                await navigate({
                  search: {
                    query: '',
                    provider: 'all',
                    status: 'all',
                    group: 'all',
                  },
                  replace: true,
                  // Saving is complete; the onboarding form no longer needs a leave guard.
                  ignoreBlocker: true,
                })
              }
              await refresh()
              if (useIdentitySession.getState().session?.id !== owner) return
              setOnboarding(null)
              focusAccount(accountId ?? onboarding.account?.id)
            }}
          />
        )}
        {detail && (
          <AccountDetails
            key={`${detail.account.id}-${detail.panel}`}
            account={detail.account}
            panel={detail.panel}
            onClose={() => {
              setDetail(null)
            }}
            restoreFocus={() => focusAccount(detail.account.id)}
          />
        )}
        <ConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => {
            if (!open && !mutation.isPending) setDeleting(null)
          }}
          title={tr('delete')}
          desc={tr('deleteConfirmation')}
          destructive
          isLoading={mutation.isPending}
          handleConfirm={() => {
            if (deleting) send('delete', deleting)
          }}
        />
      </Main>
    </>
  )
}
