import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { FileText, KeyRound, ShieldCheck, UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FeatureSettingsValues } from '@/api/workspace-settings'
import { useEngagement } from '@/hooks/use-engagement'
import { useSettingsGroups } from '@/hooks/use-settings-options'
import {
  useWorkspaceSettings,
  useWorkspaceVisibility,
} from '@/hooks/use-workspace-settings'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { defaultAuditDraft } from '@/features/feature-settings/audit-draft'
import { defaultReferralDraft } from '@/features/feature-settings/referral-draft'
import { filterAuditRecords, type AuditRecord } from './data'

function Metric({
  label,
  value,
  status,
  icon,
}: {
  label: string
  value: ReactNode
  status: ReactNode
  icon: ReactNode
}) {
  return (
    <Card className='flex-row items-center gap-3 rounded-lg px-4 py-4 shadow-none'>
      <div className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'>
        {icon}
      </div>
      <div className='min-w-0 space-y-1'>
        <h2 className='text-xs text-muted-foreground'>{label}</h2>
        <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1'>
          <span className='text-xl font-semibold tabular-nums'>{value}</span>
          <span className='text-xs text-muted-foreground'>{status}</span>
        </div>
      </div>
    </Card>
  )
}

const highest = (record: AuditRecord) =>
  record.risks.length
    ? Math.max(...record.risks.map((risk) => risk.score))
    : null

export function SecurityAudit() {
  const state = useEngagement<AuditRecord[]>('audit')
  const records = state.data ?? []
  const groups = useSettingsGroups()
  const groupName = useCallback(
    (id: string) => groups.find((group) => group.id === id)?.name ?? '—',
    [groups]
  )
  const visibility = useWorkspaceVisibility()
  const settings = useWorkspaceSettings<FeatureSettingsValues>('features', {
    audit: defaultAuditDraft,
    referral: defaultReferralDraft,
  })
  const { t, i18n } = useTranslation()
  const tr = useCallback(
    (key: string, values?: { count: number }) =>
      t('auditRecords.' + key, values),
    [t]
  )
  const [query, setQuery] = useState('')
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    stage: false,
  })
  const [selected, setSelected] = useState<AuditRecord | null>(null)
  const [removing, setRemoving] = useState<AuditRecord | null>(null)
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  const tableViewport = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const visibleGroups = groups.filter((group) =>
    records.some((record) => record.groupId === group.id)
  )
  const date = useCallback(
    (value: string) =>
      new Intl.DateTimeFormat(i18n.language, {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(value)),
    [i18n.language]
  )
  const score = useCallback(
    (value: number) =>
      new Intl.NumberFormat(i18n.language, {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(value),
    [i18n.language]
  )
  const resultBadge = useCallback(
    (record: AuditRecord) => (
      <Badge
        variant='secondary'
        className={
          record.result === 'pass'
            ? 'bg-badge-success text-badge-success-foreground'
            : record.result === 'flagged'
              ? 'bg-badge-warning text-badge-warning-foreground'
              : record.result === 'blocked' || record.result === 'error'
                ? 'bg-destructive/10 text-destructive'
                : ''
        }
      >
        {tr('results.' + record.result)}
      </Badge>
    ),
    [tr]
  )
  const open = useCallback((record: AuditRecord, button: HTMLButtonElement) => {
    returnFocus.current = button
    setSelected(record)
  }, [])
  const columns = useMemo<ColumnDef<AuditRecord>[]>(
    () => [
      {
        id: 'time',
        size: 200,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={tr('time')} />
        ),
        meta: { label: tr('time') },
        enableSorting: true,
        accessorFn: (record) => record.at,
        enableHiding: false,
        cell: ({ row }) => {
          const record = row.original
          return (
            <div className='min-w-0 text-xs'>
              <Button
                variant='link'
                className='h-auto justify-start p-0 text-xs font-normal'
                onClick={(event) => open(record, event.currentTarget)}
                aria-label={tr('view') + ' ' + record.id}
              >
                {date(record.at)}
              </Button>
              <div className='mt-1 text-xs text-muted-foreground'>
                {tr('stages.' + record.stage)}
              </div>
            </div>
          )
        },
      },
      {
        id: 'group',
        size: 140,
        header: tr('group'),
        meta: { label: tr('group') },
        enableSorting: false,
        accessorFn: (record) => record.groupId,
        filterFn: (row, id, values: string[]) =>
          values.includes(row.getValue(id)),
        cell: ({ row }) => {
          const record = row.original
          return (
            <div className='min-w-0 text-xs'>{groupName(record.groupId)}</div>
          )
        },
      },
      {
        id: 'identity',
        size: 190,
        header: tr('identity'),
        meta: { label: tr('identity') },
        enableSorting: false,
        accessorFn: (record) => record.user,
        cell: ({ row }) => {
          const record = row.original
          return (
            <div className='min-w-0 space-y-1 text-xs'>
              <div className='font-medium'>{record.user}</div>
              <div className='truncate text-muted-foreground'>
                {record.email}
              </div>
              <div className='truncate text-muted-foreground'>
                {record.keyName}
              </div>
            </div>
          )
        },
      },
      {
        id: 'endpoint',
        size: 180,
        header: tr('endpoint'),
        meta: { label: tr('endpoint') },
        enableSorting: false,
        accessorFn: (record) => record.endpoint,
        cell: ({ row }) => {
          const record = row.original
          return (
            <div className='min-w-0 text-xs'>
              <div className='font-medium'>{record.endpoint}</div>
              <div className='mt-1 truncate text-muted-foreground'>
                {record.model}
              </div>
            </div>
          )
        },
      },
      {
        id: 'result',
        size: 100,
        header: tr('result'),
        meta: { label: tr('result') },
        enableSorting: false,
        accessorFn: (record) => record.result,
        filterFn: (row, id, values: string[]) =>
          values.includes(row.getValue(id)),
        cell: ({ row }) => {
          const record = row.original
          return <div className='min-w-0 text-xs'>{resultBadge(record)}</div>
        },
      },
      {
        id: 'highestScore',
        size: 130,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={tr('highestScore')} />
        ),
        meta: { label: tr('highestScore') },
        enableSorting: true,
        accessorFn: (record) => highest(record),
        cell: ({ row }) => {
          const record = row.original
          return (
            <div className='min-w-0 text-xs'>
              {highest(record) === null ? '—' : score(highest(record)!)}
            </div>
          )
        },
      },
      {
        id: 'action',
        size: 110,
        header: tr('action'),
        meta: { label: tr('action') },
        enableSorting: false,
        accessorFn: (record) => record.action,
        cell: ({ row }) => {
          const record = row.original
          return (
            <div className='min-w-0 text-xs'>
              {tr('actions.' + record.action)}
            </div>
          )
        },
      },
      {
        id: 'latency',
        size: 140,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={tr('latency')} />
        ),
        meta: { label: tr('latency') },
        enableSorting: true,
        accessorFn: (record) => record.latencyMs,
        cell: ({ row }) => {
          const record = row.original
          return <div className='min-w-0 text-xs'>{record.latencyMs}ms</div>
        },
      },
      {
        id: 'preview',
        size: 180,
        header: tr('preview'),
        meta: { label: tr('preview') },
        enableSorting: false,
        accessorFn: (record) => record.summary,
        cell: ({ row }) => {
          const record = row.original
          return <div className='min-w-0 text-xs'>{record.summary}</div>
        },
      },
      {
        id: 'operations',
        size: 170,
        header: tr('operations'),
        meta: { label: tr('operations') },
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const record = row.original
          return (
            <div className='min-w-0 text-xs'>
              <div className='flex gap-1'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={(event) => open(record, event.currentTarget)}
                  aria-label={tr('details') + ' ' + record.id}
                >
                  {tr('view')}
                </Button>
                <Button
                  variant='ghost'
                  size='sm'
                  className='text-muted-foreground'
                  onClick={(event) => {
                    returnFocus.current = event.currentTarget
                    setRemoving(record)
                  }}
                  aria-label={tr('delete') + ' ' + record.id}
                >
                  {tr('delete')}
                </Button>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'stage',
        header: tr('stage'),
        enableHiding: false,
        enableSorting: false,
        filterFn: (row, id, values: string[]) =>
          values.includes(row.getValue(id)),
      },
    ],
    [date, open, resultBadge, score, tr, groupName]
  )
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: records,
    columns,
    getRowId: (record) => record.id,
    state: { sorting, columnVisibility, columnFilters, globalFilter: query },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setQuery,
    globalFilterFn: (row, _id, value: string) =>
      filterAuditRecords([row.original], {
        query: value,
        stage: 'all',
        result: 'all',
        group: 'all',
      }).length > 0,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })
  const { pageIndex, pageSize } = table.getState().pagination
  useEffect(() => {
    tableViewport.current
      ?.querySelector('[data-slot="table-container"]')
      ?.scrollTo({ top: 0 })
  }, [pageIndex, pageSize, sorting, columnFilters, query])
  useEffect(() => {
    const maxPage = Math.max(0, table.getPageCount() - 1)
    if (pageIndex > maxPage) table.setPageIndex(maxPage)
  }, [table, pageIndex])
  return (
    <>
      <Header fixed className='bg-background'>
        <ProfileDropdown />
      </Header>
      <Main id='content' fixed>
        <div
          data-slot='page-heading'
          className='flex flex-wrap items-center gap-3'
        >
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t('sidebar.security_audit')}
          </h1>
        </div>
        <div className='flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto lg:overflow-hidden'>
          <div className='grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'>
            <Metric
              label={tr('runtime')}
              value={
                visibility.data
                  ? tr(visibility.data.securityAudit ? 'enabled' : 'disabled')
                  : '—'
              }
              status=''
              icon={<ShieldCheck className='size-4' aria-hidden='true' />}
            />
            <Metric
              label='API Key'
              value={new Set(records.map((r) => r.keyId ?? r.keyName)).size}
              status=''
              icon={<KeyRound className='size-4' aria-hidden='true' />}
            />
            <Metric
              label={tr('scope')}
              value={
                settings.ready
                  ? settings.draft.audit.shared.groupIds.length
                  : '—'
              }
              status=''
              icon={<UsersRound className='size-4' aria-hidden='true' />}
            />
            <Metric
              label={tr('records')}
              value={records.length}
              status=''
              icon={<FileText className='size-4' aria-hidden='true' />}
            />
          </div>
          <section
            aria-labelledby='audit-records-title'
            className='flex min-h-0 flex-1 flex-col gap-4'
          >
            <h2
              id='audit-records-title'
              className='shrink-0 text-base font-semibold'
            >
              {tr('records')}
            </h2>
            <div ref={toolbarRef} className='shrink-0'>
              <DataTableToolbar
                table={table}
                searchPlaceholder={tr('search')}
                filters={[
                  {
                    columnId: 'stage',
                    title: tr('stage'),
                    options: ['input', 'output'].map((value) => ({
                      value,
                      label: tr('stages.' + value),
                    })),
                  },
                  {
                    columnId: 'result',
                    title: tr('result'),
                    options: ['pass', 'flagged', 'blocked', 'error'].map(
                      (value) => ({ value, label: tr('results.' + value) })
                    ),
                  },
                  {
                    columnId: 'group',
                    title: tr('group'),
                    options: visibleGroups.map((group) => ({
                      value: group.id,
                      label: group.name,
                    })),
                  },
                ]}
              />
            </div>
            <div
              ref={tableViewport}
              className='@container min-h-56 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm lg:min-h-0 lg:flex-1 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto'
            >
              <Table
                aria-label={tr('records')}
                className='table-fixed border-separate border-spacing-0'
                style={{
                  minWidth: table
                    .getVisibleLeafColumns()
                    .reduce((sum, column) => sum + column.getSize(), 0),
                }}
              >
                <TableHeader className='sticky top-0 z-10 bg-background'>
                  {table.getHeaderGroups().map((group) => (
                    <TableRow key={group.id} className='group/row'>
                      {group.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          style={{ width: header.getSize() }}
                          className='bg-background px-4 group-hover/row:bg-muted'
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
                    <TableRow
                      key={row.id}
                      className='group/row border-border/60 transition-[background-color] hover:bg-muted/25'
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className='bg-card px-4 py-2.5 group-hover/row:bg-muted/25'
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {!table.getRowModel().rows.length && (
                    <TableRow>
                      <TableCell
                        colSpan={table.getVisibleLeafColumns().length}
                        className='p-0'
                      >
                        <div className='sticky left-0 flex h-24 w-[100cqw] max-w-full items-center justify-center text-muted-foreground'>
                          {t('data_table.no_results')}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <DataTablePagination table={table} className='shrink-0' />
          </section>
        </div>
      </Main>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <DialogContent
          className='max-h-[85dvh] overflow-y-auto sm:max-w-3xl'
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocus.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              {tr('details')}
            </DialogTitle>
            <DialogDescription className='sr-only'>
              {tr('details')}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className='space-y-5'>
              <div className='flex flex-wrap items-center gap-2'>
                {resultBadge(selected)}
                <span className='font-mono text-xs text-muted-foreground'>
                  {selected.id}
                </span>
              </div>
              <dl className='grid grid-cols-1 gap-4 text-sm sm:grid-cols-2'>
                {(
                  [
                    ['time', date(selected.at)],
                    ['stage', tr('stages.' + selected.stage)],
                    ['user', selected.user],
                    ['email', selected.email],
                    ['keyName', selected.keyName],
                    ['group', groupName(selected.groupId)],
                    ['endpoint', selected.endpoint],
                    ['model', selected.model],
                    ['action', tr('actions.' + selected.action)],
                    ['latency', selected.latencyMs + 'ms'],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key} className='min-w-0'>
                    <dt className='text-xs text-muted-foreground'>{tr(key)}</dt>
                    <dd className='mt-1 break-words'>{value}</dd>
                  </div>
                ))}
              </dl>
              <section
                className='space-y-3'
                aria-labelledby='audit-risk-detail'
              >
                <h3 id='audit-risk-detail' className='text-sm font-semibold'>
                  {tr('risks')}
                </h3>
                <div className='overflow-hidden rounded-lg border'>
                  <Table aria-label={tr('risks')}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tr('category')}</TableHead>
                        <TableHead>{tr('score')}</TableHead>
                        <TableHead>{tr('threshold')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.risks.map((risk) => (
                        <TableRow key={risk.name ?? risk.category}>
                          <TableCell>
                            {risk.name ??
                              (risk.category === 'keyword'
                                ? t('auditSettings.keywords')
                                : tr('categories.' + risk.category))}
                          </TableCell>
                          <TableCell className='tabular-nums'>
                            {score(risk.score)}
                          </TableCell>
                          <TableCell className='tabular-nums'>
                            {score(risk.threshold)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!selected.risks.length && (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className='text-muted-foreground'
                          >
                            {tr('noRiskResult')}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
              <section
                className='space-y-3'
                aria-labelledby='audit-payload-detail'
              >
                <h3 id='audit-payload-detail' className='text-sm font-semibold'>
                  {tr('payload')}
                </h3>
                <pre className='rounded-lg border bg-muted/30 p-3 font-mono text-xs break-all whitespace-pre-wrap'>
                  {selected?.summary}
                </pre>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (returnFocus.current?.isConnected) returnFocus.current.focus()
            else toolbarRef.current?.querySelector('input')?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{tr('deleteSample')}</AlertDialogTitle>
            <AlertDialogDescription className='sr-only'>
              {removing?.id}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <Button
              variant='destructive'
              disabled={state.busy}
              onClick={async () => {
                if (!removing) return
                try {
                  await state.execute({
                    op: 'delete_audit',
                    ids: [removing.id],
                  })
                  setRemoving(null)
                  setSelected(null)
                } catch {
                  /* The request hook displays the error. */
                }
              }}
            >
              {tr('delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
