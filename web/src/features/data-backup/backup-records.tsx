import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ColumnDef,
  type PaginationState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Download, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  backups,
  type BackupRecord,
  type BackupSettings,
  type BackupStatus,
} from '@/api/backups'
import { useIdentitySession } from '@/stores/identity-session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfigurationSection } from '@/components/configuration-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTablePagination } from '@/components/data-table'
import { DataTableFacetedFilter } from '@/components/data-table/faceted-filter'
import { DataTableToolbarLayout } from '@/components/data-table/toolbar-layout'
import { DataTableViewOptions } from '@/components/data-table/view-options'
import { RequestErrorToast } from '@/components/request-error-toast'
import { trackDatabaseRestore } from './restore-state'

const statuses: BackupStatus[] = [
  'queued',
  'dumping',
  'uploading',
  'completed',
  'failed',
  'deleting',
]
type Command = {
  action: 'create' | 'delete' | 'download' | 'restore'
  record?: BackupRecord
  owner: string
}
export function BackupRecords({
  owner,
  settings,
  disabled,
  onBusyChange,
}: {
  owner: string
  settings: BackupSettings
  disabled: boolean
  onBusyChange: (pending: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t(`liveInfrastructure.${key}`)
  const client = useQueryClient()
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const [visibility, setVisibility] = useState({})
  const [status, setStatus] = useState('')
  const [trigger, setTrigger] = useState('')
  const [expires, setExpires] = useState('0')
  const [confirmation, setConfirmation] = useState<Command | null>(null)
  const [restoreConfirmation, setRestoreConfirmation] = useState('')
  const params = new URLSearchParams({
    page: String(pagination.pageIndex + 1),
    pageSize: String(pagination.pageSize),
  })
  if (status) params.set('status', status)
  if (trigger) params.set('trigger', trigger)
  const query = useQuery({
    queryKey: ['backup-records', owner, params.toString()],
    queryFn: ({ signal }) => backups.records(params, signal),
    retry: false,
    gcTime: 0,
    refetchInterval: (current) =>
      current.state.data?.items.some((item) =>
        ['queued', 'dumping', 'uploading', 'deleting'].includes(item.status)
      )
        ? 5000
        : false,
  })
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: async (command: Command) => {
      if (useIdentitySession.getState().session?.id !== command.owner)
        throw new Error(tr('sessionChanged'))
      if (command.action === 'create') {
        if (!/^\d{1,5}$/.test(expires) || Number(expires) > 36500)
          throw new Error(tr('invalid'))
        await backups.create(Number(expires))
      } else if (command.action === 'restore' && command.record) {
        const job = await backups.restore(
          command.record.id,
          restoreConfirmation
        )
        if (useIdentitySession.getState().session?.id === command.owner)
          trackDatabaseRestore(job)
      } else if (command.action === 'delete' && command.record)
        await backups.delete(command.record.id)
      else if (command.record) {
        const grant = await backups.download(command.record.id)
        if (useIdentitySession.getState().session?.id !== command.owner) return
        const url = new URL(grant.url)
        if (
          !['https:', 'http:'].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error(tr('invalidDownload'))
        const link = document.createElement('a')
        link.href = url.toString()
        link.download = grant.fileName
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.referrerPolicy = 'no-referrer'
        document.body.append(link)
        link.click()
        link.remove()
      }
    },
    onMutate: () => onBusyChange(true),
    onSuccess: (_result, command) => {
      if (useIdentitySession.getState().session?.id !== command.owner) return
      setConfirmation(null)
      void client.invalidateQueries({ queryKey: ['backup-records', owner] })
      if (command.action !== 'download' && command.action !== 'restore')
        toast.success(tr(command.action === 'create' ? 'queued' : 'saved'))
    },
    onError: (error, command) => {
      if (useIdentitySession.getState().session?.id === command.owner)
        toast.error(error.message, { id: 'backup-command' })
    },
    onSettled: () => onBusyChange(false),
  })
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: settings.scheduleTimezone || 'UTC',
        }).format(new Date(value))
      : '\u2014'
  const columns: ColumnDef<BackupRecord>[] = [
    {
      accessorKey: 'id',
      header: t('dataBackup.id'),
      cell: ({ row }) => (
        <code
          className='block max-w-40 truncate text-xs'
          title={row.original.id}
        >
          {row.original.id}
        </code>
      ),
    },
    {
      accessorKey: 'objectKey',
      header: t('dataBackup.fileName'),
      cell: ({ row }) => (
        <span className='block w-64 truncate' title={row.original.objectKey}>
          {row.original.objectKey}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('dataBackup.status'),
      cell: ({ row }) => (
        <div className='space-y-1'>
          <Badge variant='secondary'>{tr(row.original.status)}</Badge>
          {row.original.errorCode && (
            <div className='text-xs text-destructive'>
              {row.original.errorCode}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'sizeBytes',
      header: tr('sizeBytes'),
      cell: ({ row }) =>
        row.original.sizeBytes === null
          ? '\u2014'
          : new Intl.NumberFormat(i18n.language).format(row.original.sizeBytes),
    },
    {
      id: 'partitions',
      header: t('dataBackup.partitions'),
      cell: ({ row }) => (row.original.sizeBytes === null ? '\u2014' : '1'),
    },
    {
      accessorKey: 'triggerKind',
      header: t('dataBackup.trigger'),
      cell: ({ row }) => tr(row.original.triggerKind),
    },
    { accessorKey: 'attemptCount', header: tr('attempts') },
    {
      accessorKey: 'expiresAt',
      header: t('dataBackup.expiresAt'),
      cell: ({ row }) => date(row.original.expiresAt),
    },
    {
      accessorKey: 'startedAt',
      header: t('dataBackup.startedAt'),
      cell: ({ row }) => date(row.original.startedAt),
    },
    {
      id: 'actions',
      header: tr('actions'),
      enableHiding: false,
      cell: ({ row: { original: item } }) => (
        <div className='flex gap-1'>
          <Button
            variant='outline'
            size='icon-sm'
            aria-label={t('dataBackup.download')}
            title={t('dataBackup.download')}
            disabled={
              disabled ||
              mutation.isPending ||
              item.status !== 'completed' ||
              (!!item.expiresAt && Date.parse(item.expiresAt) <= Date.now())
            }
            onClick={() =>
              mutation.mutate({ action: 'download', record: item, owner })
            }
          >
            <Download />
          </Button>
          <Button
            variant='outline'
            size='icon-sm'
            disabled={
              disabled ||
              mutation.isPending ||
              item.status !== 'completed' ||
              (!!item.expiresAt && new Date(item.expiresAt) <= new Date())
            }
            aria-label={t('dataBackup.restore')}
            title={t('dataBackup.restore')}
            onClick={() => {
              setRestoreConfirmation('')
              setConfirmation({ action: 'restore', record: item, owner })
            }}
          >
            <RotateCcw />
          </Button>
          <Button
            variant='outline'
            size='icon-sm'
            aria-label={t('dataBackup.delete')}
            title={t('dataBackup.delete')}
            disabled={
              disabled ||
              mutation.isPending ||
              !['completed', 'failed'].includes(item.status)
            }
            onClick={() =>
              setConfirmation({ action: 'delete', record: item, owner })
            }
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ]
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: query.data?.items ?? [],
    columns,
    defaultColumn: { enableSorting: false },
    getRowId: (item) => item.id,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: query.data?.page.totalPages ?? 0,
    state: { pagination, columnVisibility: visibility },
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setVisibility,
  })
  return (
    <ConfigurationSection
      title={t('dataBackup.recordsTitle')}
      action={
        <div className='flex gap-2'>
          <Button
            size='sm'
            variant='outline'
            aria-label={tr('refresh')}
            disabled={query.isFetching || mutation.isPending}
            onClick={() => void query.refetch()}
          >
            <RefreshCw />
          </Button>
          <Button
            size='sm'
            disabled={
              disabled ||
              mutation.isPending ||
              !settings.verified ||
              !settings.storageEnabled
            }
            onClick={() => setConfirmation({ action: 'create', owner })}
          >
            <Plus />
            {t('dataBackup.createBackup')}
          </Button>
        </div>
      }
    >
      <DataTableToolbarLayout actions={<DataTableViewOptions table={table} />}>
        <div className='flex flex-wrap gap-2'>
          <DataTableFacetedFilter
            title={t('dataBackup.status')}
            selectionMode='single'
            selected={status ? [status] : []}
            options={statuses.map((value) => ({ value, label: tr(value) }))}
            onSelectedChange={(values) => {
              setStatus(values[0] ?? '')
              setPagination((value) => ({ ...value, pageIndex: 0 }))
            }}
          />
          <DataTableFacetedFilter
            title={t('dataBackup.trigger')}
            selectionMode='single'
            selected={trigger ? [trigger] : []}
            options={['manual', 'scheduled'].map((value) => ({
              value,
              label: tr(value),
            }))}
            onSelectedChange={(values) => {
              setTrigger(values[0] ?? '')
              setPagination((value) => ({ ...value, pageIndex: 0 }))
            }}
          />
        </div>
      </DataTableToolbarLayout>
      {query.isError && <RequestErrorToast message={query.error.message} />}
      <div className='overflow-auto rounded-lg border'>
        <Table
          aria-label={t('dataBackup.recordsTitle')}
          className='min-w-[1000px]'
        >
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
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!table.getRowModel().rows.length && (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className='h-28 text-center text-muted-foreground'
                >
                  {tr(
                    query.isPending
                      ? 'loading'
                      : query.isError
                        ? 'unavailable'
                        : 'empty'
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
      <ConfirmDialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setConfirmation(null)
        }}
        title={
          confirmation?.action === 'restore'
            ? t('dataBackup.restoreConfirm')
            : tr(
                confirmation?.action === 'create'
                  ? 'createBackupConfirm'
                  : 'deleteConfirm'
              )
        }
        desc={
          confirmation?.action === 'restore' ? (
            t('dataBackup.restoreWarning')
          ) : (
            <span className='sr-only'>
              {confirmation?.record?.objectKey ?? tr('createBackupConfirm')}
            </span>
          )
        }
        confirmText={
          confirmation?.action === 'restore'
            ? t('dataBackup.restore')
            : tr(confirmation?.action === 'create' ? 'create' : 'delete')
        }
        destructive={
          confirmation?.action === 'delete' ||
          confirmation?.action === 'restore'
        }
        disabled={
          confirmation?.action === 'restore' &&
          restoreConfirmation !== 'RESTORE'
        }
        isLoading={mutation.isPending}
        handleConfirm={() => {
          if (confirmation && !disabled) mutation.mutate(confirmation)
        }}
      >
        {confirmation?.action === 'restore' && (
          <div className='space-y-2'>
            <code
              className='block truncate text-xs'
              title={confirmation.record?.objectKey}
            >
              {confirmation.record?.objectKey}
            </code>
            <Label htmlFor='backup-restore-confirm'>
              {t('dataBackup.restoreType')}
            </Label>
            <Input
              id='backup-restore-confirm'
              autoComplete='off'
              value={restoreConfirmation}
              disabled={mutation.isPending}
              onChange={(event) => setRestoreConfirmation(event.target.value)}
            />
          </div>
        )}
        {confirmation?.action === 'create' && (
          <div className='space-y-2'>
            <Label htmlFor='backup-create-expiry'>
              {t('dataBackup.expirationDays')}
            </Label>
            <Input
              id='backup-create-expiry'
              type='number'
              min={0}
              max={36500}
              step={1}
              value={expires}
              disabled={mutation.isPending}
              onChange={(event) => setExpires(event.target.value)}
            />
          </div>
        )}
      </ConfirmDialog>
    </ConfigurationSection>
  )
}
