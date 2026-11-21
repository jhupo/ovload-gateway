import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type RowSelectionState,
  useReactTable,
} from '@tanstack/react-table'
import { Download, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  procurementPricingApi,
  type ProcurementCatalog,
  type ProcurementPrice,
  type PricingSyncPreview,
} from '@/api/procurement-pricing'
import { useIdentitySession } from '@/stores/identity-session'
import {
  accountPlatform,
  accountProviderLabel,
  providerConnectionLabel,
} from '@/lib/upstream-platforms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { DataTablePagination } from '@/components/data-table'
import { RequestErrorToast } from '@/components/request-error-toast'
import { priceBands, priceFields } from './pricing-draft'

type SyncRow = {
  id: string
  provider: string
  model: string
  previous: ProcurementPrice | undefined
  next: ProcurementPrice | undefined
  overridden: boolean
  change: 'new' | 'updated' | 'unchanged' | 'removed' | 'unsupported'
}

function syncRows(
  preview: PricingSyncPreview,
  catalog: ProcurementCatalog
): SyncRow[] {
  const rows: SyncRow[] = []
  for (const provider of Object.keys(catalog.defaults)) {
    const models = new Set([
      ...Object.keys(preview.prices[provider] ?? {}),
      ...Object.keys(catalog.synced[provider] ?? {}),
    ])
    for (const model of models) {
      const previous = catalog.synced[provider]?.[model]
      const next = preview.prices[provider]?.[model]
      rows.push({
        id: JSON.stringify([provider, model]),
        provider,
        model,
        previous,
        next,
        overridden:
          !!catalog.overrides[provider]?.[model] &&
          !catalog.overrides[provider]?.[model].deleted,
        change: !next
          ? 'removed'
          : !previous
            ? 'new'
            : JSON.stringify(previous) === JSON.stringify(next)
              ? 'unchanged'
              : 'updated',
      })
    }
  }
  for (const skipped of preview.skipped) {
    const separator = skipped.indexOf('/')
    rows.push({
      id: 'unsupported:' + skipped,
      provider: skipped.slice(0, separator),
      model: skipped.slice(separator + 1),
      previous: undefined,
      next: undefined,
      overridden: false,
      change: 'unsupported',
    })
  }
  return rows.sort(
    (left, right) =>
      left.provider.localeCompare(right.provider) ||
      left.model.localeCompare(right.model)
  )
}

function SyncPreviewTable({
  preview,
  catalog,
  disabled,
  onSync,
  onClose,
  onRefresh,
}: {
  preview: PricingSyncPreview
  catalog: ProcurementCatalog
  disabled: boolean
  onSync: (models: Record<string, string[]>) => void
  onClose: () => void
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const tr = useCallback((key: string) => t('gatewayModels:' + key), [t])
  const rows = useMemo(() => syncRows(preview, catalog), [preview, catalog])
  const changes = useMemo(
    () =>
      Object.fromEntries(
        rows
          .filter(
            (row) => row.change !== 'unchanged' && row.change !== 'unsupported'
          )
          .slice(0, 10_000)
          .map((row) => [row.id, true])
      ),
    [rows]
  )
  const [selection, setSelection] = useState<RowSelectionState>(() => changes)
  const [band, setBand] = useState('standard')
  const columns = useMemo<ColumnDef<SyncRow>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            aria-label={tr('selectPage')}
            disabled={disabled}
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(checked === true)
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t('gatewayModels:selectModel', {
              model: row.original.model,
            })}
            disabled={disabled || !row.getCanSelect()}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(checked === true)}
          />
        ),
      },
      {
        accessorKey: 'model',
        header: t('modelPricing.model'),
        cell: ({ row }) => (
          <span
            className='block max-w-52 truncate font-medium'
            title={row.original.model}
          >
            {row.original.model}
          </span>
        ),
      },
      {
        id: 'provider',
        accessorFn: (row) => accountPlatform(row.provider),
        header: t('modelPricing.provider'),
        cell: ({ row }) => providerConnectionLabel(row.original.provider),
        filterFn: (row, id, values: string[]) =>
          values.includes(accountPlatform(row.getValue(id))),
      },
      {
        accessorKey: 'change',
        header: tr('change'),
        cell: ({ row }) => (
          <div className='flex flex-wrap gap-1'>
            <Badge
              variant={
                row.original.change === 'removed' ? 'destructive' : 'outline'
              }
            >
              {tr(row.original.change)}
            </Badge>
            {row.original.overridden && (
              <Badge variant='secondary'>{tr('overridden')}</Badge>
            )}
          </div>
        ),
      },
      {
        id: 'modelType',
        header: tr('modelType'),
        cell: ({ row }) => {
          const bands = Object.keys(
            row.original.next?.bands ?? row.original.previous?.bands ?? {}
          )
          return bands.length
            ? bands.map((band) => t('modelPricing.bands.' + band)).join(' / ')
            : tr('unknownType')
        },
      },
      ...priceFields.map(
        (field): ColumnDef<SyncRow> => ({
          id: field,
          header: t('modelPricing.' + field),
          cell: ({ row }) => {
            const previous = row.original.previous?.bands[band]?.[field]
            const next = row.original.next?.bands[band]?.[field]
            return (
              <div className='space-y-1 text-left tabular-nums'>
                <div>{next ?? '\u2014'}</div>
                {previous !== next && previous !== undefined && (
                  <div className='text-xs text-muted-foreground'>
                    {t('gatewayModels:previous', { price: previous })}
                  </div>
                )}
              </div>
            )
          },
        })
      ),
    ],
    [band, disabled, t, tr]
  )
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    state: { rowSelection: selection },
    onRowSelectionChange: setSelection,
    enableRowSelection: (row) => row.original.change !== 'unsupported',
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _id, search: string) =>
      `${row.original.model}\n${row.original.provider}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  })
  const selected = table.getSelectedRowModel().rows

  return (
    <>
      <div className='flex min-h-0 flex-1 flex-col gap-3 overflow-hidden'>
        <div
          className='flex shrink-0 flex-wrap items-center gap-2'
          data-testid='sync-toolbar'
        >
          <Input
            className='h-8 w-48 min-w-0 flex-1'
            aria-label={tr('searchSync')}
            placeholder={tr('searchSync')}
            value={table.getState().globalFilter ?? ''}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
          />
          <Select
            value={
              (
                table.getColumn('provider')?.getFilterValue() as
                  | string[]
                  | undefined
              )?.[0] ?? 'all'
            }
            onValueChange={(value) =>
              table
                .getColumn('provider')
                ?.setFilterValue(value === 'all' ? undefined : [value])
            }
          >
            <SelectTrigger size='sm' aria-label={t('modelPricing.provider')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{tr('allProviders')}</SelectItem>
              {[
                ...new Set(rows.map((row) => accountPlatform(row.provider))),
              ].map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {accountProviderLabel(provider)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={band} onValueChange={setBand} disabled={disabled}>
            <SelectTrigger size='sm' aria-label={t('modelPricing.band')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {priceBands.map((key) => (
                <SelectItem key={key} value={key}>
                  {t('modelPricing.bands.' + key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={disabled}
            onClick={() => setSelection(changes)}
          >
            {tr('selectChanges')}
          </Button>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={disabled}
            onClick={onRefresh}
          >
            <RefreshCw className='size-4' />
            {tr('syncPreview')}
          </Button>
        </div>
        <div className='min-h-0 flex-1 overflow-auto rounded-md border [&>[data-slot=table-container]]:overflow-visible'>
          <Table className='min-w-220' aria-label={tr('syncTitle')}>
            <TableHeader className='sticky top-0 z-10 bg-card'>
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
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                  >
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
                    colSpan={columns.length}
                    className='h-24 text-center text-muted-foreground'
                  >
                    {tr('syncEmpty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <DataTablePagination table={table} className='shrink-0' />
      </div>
      <DialogFooter className='shrink-0 items-center gap-2'>
        <span className='me-auto text-sm text-muted-foreground'>
          {t('gatewayModels:selectedCount', { count: selected.length })}
        </span>
        <Button
          type='button'
          variant='outline'
          disabled={disabled}
          onClick={onClose}
        >
          {tr('cancel')}
        </Button>
        <Button
          type='button'
          disabled={disabled || !selected.length || selected.length > 10_000}
          onClick={() => {
            const models: Record<string, string[]> = {}
            for (const row of selected)
              (models[row.original.provider] ??= []).push(row.original.model)
            onSync(models)
          }}
        >
          <Download aria-hidden='true' className='size-4' />
          {tr('syncSelected')}
        </Button>
      </DialogFooter>
    </>
  )
}

export function PricingSyncDialog({
  catalog,
  pending,
  onPendingChange,
  onClose,
  onSynced,
}: {
  catalog: ProcurementCatalog
  pending: boolean
  onPendingChange: (pending: boolean) => void
  onClose: () => void
  onSynced: () => Promise<void>
}) {
  const { t } = useTranslation('gatewayModels')
  const owner = useIdentitySession((state) => state.session?.id)
  const [error, setError] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['pricing-sync-preview', owner],
    queryFn: ({ signal }) => procurementPricingApi.previewSync(signal),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  async function sync(models: Record<string, string[]>) {
    if (!query.data || query.isFetching || pending) return
    onPendingChange(true)
    setError(null)
    try {
      const result = await procurementPricingApi.sync(query.data, models)
      if (!result.saved) throw new Error(t('syncFailed'))
      toast.success(t('syncSaved'))
      await onSynced()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('syncFailed'))
    } finally {
      onPendingChange(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <DialogContent
        className='flex max-h-[90dvh] min-h-0 flex-col overflow-hidden sm:max-w-5xl'
        onInteractOutside={(event) => {
          if (pending) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault()
        }}
      >
        <DialogHeader className='shrink-0'>
          <DialogTitle>{t('syncTitle')}</DialogTitle>
          <DialogDescription className='sr-only'>
            {t('syncTitle')}
          </DialogDescription>
        </DialogHeader>
        {!query.data && (
          <div className='flex shrink-0 flex-wrap items-center justify-end gap-3'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={pending || query.isFetching}
              onClick={() => {
                setError(null)
                void query.refetch()
              }}
            >
              <RefreshCw
                aria-hidden='true'
                className={query.isFetching ? 'size-4 animate-spin' : 'size-4'}
              />
              {t('syncPreview')}
            </Button>
          </div>
        )}
        {(error || query.isError) && (
          <RequestErrorToast message={error ?? query.error?.message} />
        )}
        {query.isPending && (
          <div
            role='status'
            className='flex min-h-28 items-center justify-center'
          >
            <RefreshCw
              aria-label={t('syncPreview')}
              className='size-5 animate-spin text-muted-foreground'
            />
          </div>
        )}
        {query.data && (
          <SyncPreviewTable
            key={query.dataUpdatedAt}
            preview={query.data}
            catalog={catalog}
            disabled={pending || query.isFetching}
            onClose={onClose}
            onRefresh={() => {
              setError(null)
              void query.refetch()
            }}
            onSync={(models) => void sync(models)}
          />
        )}
        {!query.data && !query.isPending && (
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              {t('cancel')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
