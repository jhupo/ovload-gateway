import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  Users,
  Wifi,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { proxies, type ProxyRecord } from '@/api/proxies'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
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
import { DataTableToolbar } from '@/components/data-table'
import { TableViewport } from '@/components/data-table/viewport'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { RequestErrorToast } from '@/components/request-error-toast'
import { ProxyAccounts } from './accounts'
import {
  ProxyExit,
  ProxyLatency,
  ProxyLocationCell,
  ProxyPagination,
  ProxyStatus,
} from './components'
import { ProxyEditor } from './editor'

const route = getRouteApi('/_authenticated/proxies/')
export function Proxies() {
  const owner = useIdentitySession((s) => s.session?.id)
  return <ProxyDirectory key={owner ?? 'signed-out'} />
}
function ProxyDirectory() {
  const { t, i18n } = useTranslation()
  const owner = useIdentitySession((s) => s.session?.id)
  useIdentitySession((s) => s.grants)
  const canRead = allows('provider_accounts.read'),
    canManage = allows('provider_accounts.manage')
  const search = route.useSearch(),
    navigate = route.useNavigate(),
    client = useQueryClient()
  const [page, setPage] = useState(1),
    [pageSize, setSize] = useState(50)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [selected, setSelected] = useState<string[]>([])
  const [editor, setEditor] = useState<{ item?: ProxyRecord } | null>(null)
  const [associated, setAssociated] = useState<ProxyRecord | null>(null)
  const [confirmation, setConfirmation] = useState<ProxyRecord[]>([])
  const trigger = useRef<HTMLElement | null>(null)
  const add = useRef<HTMLButtonElement>(null)
  const remember = (e: React.MouseEvent<HTMLElement>) => {
    trigger.current = e.currentTarget
  }
  const restoreFocus = () =>
    requestAnimationFrame(() =>
      (trigger.current?.isConnected ? trigger.current : add.current)?.focus()
    )
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    search: search.query,
  })
  const protocols = columnFilters.find((f) => f.id === 'endpoint')?.value as
    | string[]
    | undefined
  const statuses = columnFilters.find((f) => f.id === 'enabled')?.value as
    | string[]
    | undefined
  if (protocols?.length) params.set('protocols', protocols.join(','))
  if (statuses?.length === 1)
    params.set('enabled', String(statuses[0] === 'enabled'))
  const directory = useQuery({
    queryKey: ['proxies', owner, params.toString()],
    queryFn: ({ signal }) => proxies.list(params, signal),
    enabled: !!owner && canRead,
    retry: false,
    gcTime: 0,
  })
  const items = directory.data?.items ?? []
  const refresh = () => {
    for (const key of [
      'proxies',
      'proxy-accounts',
      'proxy-assign-accounts',
      'upstream-accounts',
      'account-proxy-options',
    ])
      void client.invalidateQueries({ queryKey: [key, owner] })
  }
  const mutation = useMutation({
    mutationFn: async ({
      records,
      action,
    }: {
      records: ProxyRecord[]
      action: 'delete' | 'toggle' | 'test'
    }) => {
      let failed = 0
      for (const record of records) {
        if (useIdentitySession.getState().session?.id !== owner)
          throw new Error(t('liveInfrastructure.sessionChanged'))
        if (action === 'delete') await proxies.delete(record)
        else if (action === 'toggle')
          await proxies.update(record, {
            name: record.name,
            enabled: !record.enabled,
          })
        else {
          const [result] = await proxies.test(record, true)
          if (result?.status !== 'succeeded' || !result.data.lastTest?.success)
            failed++
        }
      }
      if (failed)
        throw new Error(t('proxyDesign.testsFailed', { count: failed }))
    },
    onSuccess: (_, command) => {
      if (useIdentitySession.getState().session?.id !== owner) return
      setConfirmation([])
      setSelected([])
      refresh()
      if (
        command.action === 'delete' &&
        command.records.length === items.length &&
        page > 1
      )
        setPage(page - 1)
      toast.success(
        t(
          command.action === 'test'
            ? 'liveInfrastructure.testPassed'
            : 'liveInfrastructure.saved'
        )
      )
    },
    onError: (error) => {
      if (useIdentitySession.getState().session?.id === owner) {
        setConfirmation([])
        setSelected([])
        refresh()
        toast.error(error.message)
      }
    },
  })
  const busy = mutation.isPending
  function changePage(next: number) {
    setSelected([])
    setPage(next)
  }
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(value))
      : '—'
  function showAccounts(record: ProxyRecord, e: React.MouseEvent<HTMLElement>) {
    remember(e)
    setAssociated(record)
  }
  function actions(item: ProxyRecord) {
    return (
      <div className='flex items-center justify-end gap-1'>
        <Button
          variant='ghost'
          size='icon'
          aria-label={t('proxyDesign.testFor', { name: item.name })}
          title={t('proxies.test')}
          disabled={!canManage || busy}
          onClick={() => mutation.mutate({ records: [item], action: 'test' })}
        >
          <Wifi />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          aria-label={t('proxies.editFor', { name: item.name })}
          title={t('proxies.edit')}
          disabled={!canManage || busy}
          onClick={(e) => {
            remember(e)
            setEditor({ item })
          }}
        >
          <Pencil />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              aria-label={t('proxies.actionsFor', { name: item.name })}
              onClick={remember}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onSelect={() => setAssociated(item)}>
              <Users />
              {t('proxies.accounts')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canManage || busy}
              onSelect={() =>
                mutation.mutate({ records: [item], action: 'toggle' })
              }
            >
              <Power />
              {t(`liveInfrastructure.${item.enabled ? 'disable' : 'enable'}`)}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                try {
                  await navigator.clipboard.writeText(item.endpoint)
                  toast.success(t('proxies.copied'))
                } catch {
                  toast.error(t('proxies.copyFailed'))
                }
              }}
            >
              <Copy />
              {t('proxyDesign.copyAddress')}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant='destructive'
              disabled={!canManage || busy}
              onSelect={() => setConfirmation([item])}
            >
              <Trash2 />
              {t('proxies.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }
  const select = (item: ProxyRecord) => (
    <Checkbox
      aria-label={t('proxies.selectRow', { name: item.name })}
      disabled={busy}
      checked={selected.includes(item.id)}
      onCheckedChange={(checked) =>
        setSelected((old) =>
          checked ? [...old, item.id] : old.filter((id) => id !== item.id)
        )
      }
    />
  )
  const selectedRecords = items.filter((item) => selected.includes(item.id))
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const columns: ColumnDef<ProxyRecord>[] = [
    {
      id: 'select',
      enableHiding: false,
      header: () => (
        <Checkbox
          aria-label={t('proxies.selectPage')}
          disabled={!items.length || busy}
          checked={
            items.length > 0 &&
            (selected.length === items.length
              ? true
              : selected.length > 0
                ? 'indeterminate'
                : false)
          }
          onCheckedChange={(checked) =>
            setSelected(checked ? items.map((item) => item.id) : [])
          }
        />
      ),
      cell: ({ row }) => select(row.original),
    },
    {
      accessorKey: 'name',
      header: t('proxyDesign.name'),
      cell: ({ row }) => (
        <div className='max-w-56 min-w-32 py-3 font-medium break-words whitespace-normal'>
          {row.original.name}
        </div>
      ),
    },
    {
      accessorKey: 'endpoint',
      header: t('proxyDesign.address'),
      cell: ({ row }) => (
        <span
          title={row.original.endpoint}
          className='block max-w-56 truncate font-mono text-xs text-muted-foreground'
        >
          {row.original.endpoint}
        </span>
      ),
    },
    {
      accessorKey: 'enabled',
      header: t('proxyDesign.status'),
      cell: ({ row }) => <ProxyStatus enabled={row.original.enabled} />,
    },
    {
      id: 'exitIp',
      accessorFn: (r) => r.lastTest?.exitIp,
      header: t('proxyDesign.exitIp'),
      cell: ({ row }) => <ProxyExit record={row.original} />,
    },
    {
      id: 'region',
      accessorFn: (r) => r.detectedLocation?.location.city ?? r.location?.city,
      header: t('proxyDesign.region'),
      cell: ({ row }) => <ProxyLocationCell record={row.original} />,
    },
    {
      id: 'latency',
      accessorFn: (r) => r.lastTest?.latencyMs,
      header: t('proxyDesign.latency'),
      cell: ({ row }) => <ProxyLatency record={row.original} />,
    },
    {
      accessorKey: 'accountCount',
      header: t('proxyDesign.accounts'),
      cell: ({ row }) => (
        <Button
          variant='ghost'
          size='sm'
          aria-label={t('proxyDesign.accountsFor', { name: row.original.name })}
          onClick={(e) => showAccounts(row.original, e)}
        >
          <Users />
          {row.original.accountCount}
        </Button>
      ),
    },
    {
      accessorKey: 'lastTestAt',
      header: t('proxyDesign.testedAt'),
      cell: ({ row }) => (
        <span className='text-xs text-muted-foreground tabular-nums'>
          {date(row.original.lastTestAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('proxyDesign.actions'),
      enableHiding: false,
      cell: ({ row }) => actions(row.original),
    },
  ]
  // Server search and pagination stay authoritative; the shared table controls column visibility.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: items,
    columns,
    getRowId: (item) => item.id,
    state: { columnVisibility, globalFilter: search.query, columnFilters },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: (update) => {
      setColumnFilters(update)
      changePage(1)
    },
    onGlobalFilterChange: (update) => {
      const query = typeof update === 'function' ? update(search.query) : update
      changePage(1)
      void navigate({ search: (old) => ({ ...old, query }), replace: true })
    },
    manualFiltering: true,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <>
      <Header>
        <ProfileDropdown />
      </Header>
      <Main fixed id='content' className='min-h-0'>
        <div
          data-slot='page-heading'
          className='flex shrink-0 flex-wrap items-center justify-between gap-2'
        >
          {/* ai-design-check-ignore-next-line use-shared-looks -- Match the existing Main page-heading convention; the project has no Heading component. */}
          <h1 className='text-2xl font-semibold'>{t('proxies.title')}</h1>

          <div className='flex items-center gap-2'>
            <Button
              variant='ghost'
              size='icon'
              aria-label={t('proxies.refresh')}
              disabled={directory.isFetching}
              onClick={refresh}
            >
              <RefreshCw />
            </Button>
            <Button
              ref={add}
              disabled={!owner || !canManage}
              onClick={(e) => {
                remember(e)
                setEditor({})
              }}
            >
              <Plus />
              {t('proxies.add')}
            </Button>
          </div>
        </div>
        <DataTableToolbar
          table={table}
          searchPlaceholder={t('proxies.search')}
          filters={[
            {
              columnId: 'endpoint',
              title: t('proxies.protocol'),
              options: ['http', 'https', 'socks5', 'socks5h'].map((value) => ({
                value,
                label: value.toUpperCase(),
              })),
            },
            {
              columnId: 'enabled',
              title: t('proxyDesign.status'),
              options: [
                { value: 'enabled', label: t('liveInfrastructure.enabled') },
                { value: 'disabled', label: t('liveInfrastructure.disabled') },
              ],
            },
          ]}
        />
        {directory.error && (
          <RequestErrorToast message={directory.error.message} />
        )}
        {selected.length > 0 && (
          <div
            className='flex shrink-0 flex-wrap items-center gap-2 text-sm'
            aria-live='polite'
          >
            <span>{t('proxies.selected', { count: selected.length })}</span>
            <Button
              size='sm'
              variant='outline'
              disabled={busy || !canManage}
              onClick={() =>
                mutation.mutate({ records: selectedRecords, action: 'test' })
              }
            >
              <Wifi />
              {t('proxies.test')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={busy || !canManage}
              onClick={() => setConfirmation(selectedRecords)}
            >
              <Trash2 />
              {t('proxies.delete')}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              disabled={busy}
              onClick={() => setSelected([])}
            >
              {t('proxies.clearSelection')}
            </Button>
          </div>
        )}
        <TableViewport>
          <div className='hidden md:block'>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={
                          header.id === 'select'
                            ? 'w-12 ps-4'
                            : header.id === 'actions'
                              ? 'pe-4 text-end'
                              : undefined
                        }
                      >
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
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={
                      selected.includes(row.id) ? 'selected' : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={
                          cell.column.id === 'select'
                            ? 'ps-4'
                            : cell.column.id === 'actions'
                              ? 'pe-4'
                              : undefined
                        }
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className='divide-y md:hidden'>
            {items.map((item) => (
              <article key={item.id} className='space-y-4 p-4'>
                <div className='flex items-start gap-3'>
                  {select(item)}
                  <div className='min-w-0 flex-1 space-y-2'>
                    <div className='font-medium break-words'>{item.name}</div>
                    <div className='font-mono text-xs break-all text-muted-foreground'>
                      {item.endpoint}
                    </div>
                  </div>
                  <ProxyStatus enabled={item.enabled} />
                </div>
                <div className='grid grid-cols-2 gap-4'>
                  <ProxyLocationCell record={item} />
                  <div className='space-y-1 text-end text-sm'>
                    <ProxyLatency record={item} />
                    <div className='text-xs text-muted-foreground'>
                      {date(item.lastTestAt)}
                    </div>
                  </div>
                </div>
                <ProxyExit record={item} />
                <div className='flex items-center justify-between'>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={(e) => showAccounts(item, e)}
                  >
                    <Users />
                    {t('proxies.accountCount', { count: item.accountCount })}
                  </Button>
                  {actions(item)}
                </div>
              </article>
            ))}
          </div>
          {!items.length && (
            <p className='p-12 text-center text-sm text-muted-foreground'>
              {!canRead
                ? t('liveInfrastructure.permissionRequired')
                : directory.isPending
                  ? t('liveInfrastructure.loading')
                  : directory.isError
                    ? '—'
                    : t('proxies.empty')}
            </p>
          )}
        </TableViewport>
        <ProxyPagination
          page={page}
          pageSize={pageSize}
          total={directory.data?.page.total ?? 0}
          busy={directory.isFetching || busy}
          onPage={changePage}
          onSize={(size) => {
            setSize(size)
            changePage(1)
          }}
        />
        {editor && owner && (
          <ProxyEditor
            item={editor.item}
            owner={owner}
            onClose={() => setEditor(null)}
            onSaved={refresh}
            restoreFocus={restoreFocus}
          />
        )}
        {associated && owner && (
          <ProxyAccounts
            record={associated}
            owner={owner}
            canManage={canManage}
            onClose={() => setAssociated(null)}
            onChanged={refresh}
            restoreFocus={restoreFocus}
          />
        )}
        <ConfirmDialog
          open={confirmation.length > 0}
          onOpenChange={(open) => {
            if (!open && !busy) setConfirmation([])
          }}
          title={t('proxies.deleteTitle', { count: confirmation.length })}
          desc={confirmation.map((item) => item.name).join('、')}
          confirmText={t('proxies.delete')}
          destructive
          isLoading={busy}
          handleConfirm={() =>
            mutation.mutate({ records: confirmation, action: 'delete' })
          }
        />
      </Main>
    </>
  )
}
