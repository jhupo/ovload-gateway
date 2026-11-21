import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Download,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { procurementPricingApi } from '@/api/procurement-pricing'
import { allows, useIdentitySession } from '@/stores/identity-session'
import {
  accountPlatform,
  accessMethodLabel,
  platformOptions,
  providerConnectionLabel,
  requiresStandardPricingBand,
} from '@/lib/upstream-platforms'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfigurationSection } from '@/components/configuration-section'
import {
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { RequestErrorToast } from '@/components/request-error-toast'
import { UpstreamPlatformSelect } from '@/components/upstream-platform-select'
import {
  emptyPrices,
  newPricingEntry,
  normalizedPrice,
  priceBands,
  priceFields,
  pricingErrors,
  pricingRows,
  priceEditorEntry,
  supportedBands,
  type PriceBand,
  type PricingEntry,
  type PricingRow,
} from './pricing-draft'
import { PricingSyncDialog } from './pricing-sync-dialog'

function PriceEditor({
  entry,
  entries,
  providers,
  pending,
  available,
  onApply,
  onClose,
  onRestoreFocus,
}: {
  entry: PricingEntry
  entries: PricingRow[]
  providers: string[]
  pending: boolean
  available: boolean
  onApply: (entry: PricingEntry) => Promise<void>
  onClose: () => void
  onRestoreFocus: () => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('modelPricing.' + key)
  const [draft, setDraft] = useState(() => structuredClone(entry))
  const [band, setBand] = useState<PriceBand>(
    () => priceBands.find((key) => entry.bands[key]) ?? 'standard'
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const formRef = useRef<HTMLFormElement>(null)
  const id = useId()
  const existing = entries.some((item) => item.id === entry.id)
  const dirty = JSON.stringify(draft) !== JSON.stringify(entry)
  const patch = (next: Partial<PricingEntry>) => {
    setDraft((current) => ({ ...current, ...next }))
    setErrors({})
  }
  async function apply() {
    if (pending || !available) return
    const knownModel = entries.some(
      (item) =>
        item.provider === draft.provider &&
        item.model === draft.model &&
        item.knownModel
    )
    const issues = pricingErrors(draft, knownModel)
    if (!providers.includes(draft.provider)) issues.provider = 'providerError'
    if (
      !existing &&
      entries.some(
        (item) =>
          item.id !== entry.id &&
          item.provider === draft.provider &&
          item.model === draft.model
      )
    ) {
      issues.model = 'duplicateError'
    }
    if (Object.keys(issues).length) {
      setErrors(issues)
      const firstPath = Object.keys(issues)[0].split('.')
      if (firstPath[0] === 'bands') setBand(firstPath[1] as PriceBand)
      toast.error(t('procurementPricing.' + Object.values(issues)[0]), {
        id: 'model-pricing-validation',
      })
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus()
      )
      return
    }
    await onApply(draft)
  }
  const field = (
    path: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    money = false
  ) => (
    <div className='min-w-0 space-y-2' key={path}>
      <Label htmlFor={id + path}>{label}</Label>
      <Input
        id={id + path}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={money ? 'decimal' : 'text'}
        maxLength={money ? 16 : 160}
        spellCheck={false}
        autoComplete='off'
        disabled={pending || (existing && path === 'model')}
        aria-invalid={!!errors[path]}
        aria-describedby={errors[path] ? id + path + '-error' : undefined}
      />
      {errors[path] && (
        <span id={id + path + '-error'} className='sr-only'>
          {t('procurementPricing.' + errors[path])}
        </span>
      )}
    </div>
  )
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return
        if (pending) return
        if (dirty)
          toast.warning(tr('unsavedEditor'), { id: 'model-pricing-dirty' })
        else onClose()
      }}
    >
      <DialogContent
        className='max-h-[85dvh] overflow-y-auto overscroll-contain sm:max-w-xl'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onRestoreFocus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {tr(entries.some((item) => item.id === entry.id) ? 'edit' : 'add')}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {tr('catalog')}
          </DialogDescription>
        </DialogHeader>
        <form
          ref={formRef}
          noValidate
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault()
            void apply()
          }}
        >
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor={id + 'provider'}>{tr('provider')}</Label>
              <UpstreamPlatformSelect
                id={id + 'provider'}
                className='w-full'
                value={accountPlatform(draft.provider)}
                disabled={pending || existing}
                options={platformOptions(providers)}
                aria-invalid={!!errors.provider}
                aria-describedby={
                  errors.provider ? id + 'provider-error' : undefined
                }
                onValueChange={(platform) => {
                  const provider = providers.find(
                    (value) => accountPlatform(value) === platform
                  )
                  if (!provider) return
                  patch({
                    provider: provider as PricingEntry['provider'],
                    bands: { standard: emptyPrices() },
                  })
                  setBand('standard')
                }}
              />
              {errors.provider && (
                <span id={id + 'provider-error'} className='sr-only'>
                  {t('procurementPricing.providerError')}
                </span>
              )}
            </div>
            {field('model', tr('model'), draft.model, (model) =>
              patch({ model })
            )}
          </div>
          {providers.filter(
            (value) =>
              accountPlatform(value) === accountPlatform(draft.provider)
          ).length > 1 && (
            <div className='space-y-2'>
              <Label htmlFor={id + 'access-method'}>
                {t('upstreamAccounts.accessMethod')}
              </Label>
              <Select
                value={draft.provider}
                disabled={pending || existing}
                onValueChange={(provider) => {
                  patch({
                    provider: provider as PricingEntry['provider'],
                    bands: { standard: emptyPrices() },
                  })
                  setBand('standard')
                }}
              >
                <SelectTrigger id={id + 'access-method'} className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providers
                    .filter(
                      (value) =>
                        accountPlatform(value) ===
                        accountPlatform(draft.provider)
                    )
                    .map((value) => (
                      <SelectItem key={value} value={value}>
                        {accessMethodLabel(
                          value === accountPlatform(value) ? 'oauth' : 'api_key'
                        )}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Separator />
          <div className='space-y-2'>
            <Label htmlFor={id + 'band'}>{tr('band')}</Label>
            <div className='flex min-w-0 items-center gap-3'>
              <Select
                value={Object.values(draft.bands).some(Boolean) ? band : ''}
                disabled={pending}
                onValueChange={(next) => {
                  if (!next) return
                  if (!draft.bands[next as PriceBand])
                    patch({ bands: { ...draft.bands, [next]: emptyPrices() } })
                  setBand(next as PriceBand)
                }}
              >
                <SelectTrigger
                  type='button'
                  id={id + 'band'}
                  className='h-9 min-w-0 flex-1'
                  aria-invalid={
                    !!errors['bands.standard.input'] && !draft.bands.standard
                  }
                  aria-describedby={
                    errors['bands.standard.input'] && !draft.bands.standard
                      ? id + 'standard-error'
                      : undefined
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priceBands
                    .filter(
                      (key) =>
                        draft.bands[key] ||
                        supportedBands(draft.provider).includes(key)
                    )
                    .map((key) => (
                      <SelectItem key={key} value={key}>
                        {tr('bands.' + key)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {draft.bands[band] &&
                (band !== 'standard' ||
                  (!requiresStandardPricingBand(draft.provider) &&
                    entries.some(
                      (item) => item.id === entry.id && item.knownModel
                    ))) && (
                  <Button
                    type='button'
                    variant='outline'
                    className='h-9 shrink-0'
                    disabled={pending}
                    onClick={() => {
                      const bands = { ...draft.bands }
                      delete bands[band]
                      patch({ bands })
                      setBand(
                        priceBands.find((key) => bands[key]) ?? 'standard'
                      )
                    }}
                  >
                    {tr('removeBand')}
                  </Button>
                )}
            </div>
          </div>
          {draft.bands[band] && (
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              {priceFields.map((key) =>
                field(
                  'bands.' + band + '.' + key,
                  tr(key),
                  draft.bands[band]?.[key] ?? '',
                  (next) =>
                    patch({
                      bands: {
                        ...draft.bands,
                        [band]: { ...draft.bands[band], [key]: next },
                      },
                    }),
                  true
                )
              )}
            </div>
          )}
          {errors['bands.standard.input'] && !draft.bands.standard && (
            <span id={id + 'standard-error'} className='sr-only'>
              {t('procurementPricing.standardRequired')}
            </span>
          )}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={pending}
              onClick={onClose}
            >
              {t('common.cancel')}
            </Button>
            <Button type='submit' disabled={pending || !available}>
              {t('gatewayModels:save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function PricingSettings({
  onDirtyChange,
  onPendingChange,
  onWritten,
}: {
  onDirtyChange: (dirty: boolean) => void
  onPendingChange: (pending: boolean) => void
  onWritten: () => Promise<void>
}) {
  const { t } = useTranslation()
  const tr = useCallback((key: string) => t('modelPricing.' + key), [t])
  const sessionId = useIdentitySession((state) => state.session?.id)
  const canManage = useIdentitySession(
    (state) =>
      state.session?.audience === 'management' &&
      allows('security.settings.manage')
  )
  const query = useQuery({
    queryKey: ['procurement-pricing', sessionId],
    queryFn: ({ signal }) => procurementPricingApi.load(signal),
    enabled: canManage,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const entries = useMemo(
    () => (query.data ? pricingRows(query.data) : []),
    [query.data]
  )
  const providers = useMemo(
    () => Object.keys(query.data?.defaults ?? {}).sort(),
    [query.data]
  )
  const [pending, setPending] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [editor, setEditor] = useState<PricingEntry | null>(null)
  const [removing, setRemoving] = useState<PricingRow | null>(null)
  const [removalAction, setRemovalAction] = useState<'reset' | 'delete'>(
    'delete'
  )
  const trigger = useRef<HTMLElement | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const unavailable = !canManage || query.isPending || query.isError || pending
  useEffect(() => {
    onDirtyChange(!!editor || syncOpen || pending)
    onPendingChange(pending)
  }, [editor, syncOpen, pending, onDirtyChange, onPendingChange])
  useEffect(
    () => () => {
      onDirtyChange(false)
      onPendingChange(false)
    },
    [onDirtyChange, onPendingChange]
  )
  async function write(
    entry: PricingEntry,
    action: 'replace' | 'reset' | 'delete'
  ) {
    if (unavailable || query.isFetching) return
    setPending(true)
    try {
      const result =
        action === 'delete'
          ? await procurementPricingApi.remove(entry.provider, entry.model)
          : action === 'reset'
            ? await procurementPricingApi.reset(entry.provider, entry.model)
            : await procurementPricingApi.replace(
                entry.provider,
                entry.model,
                normalizedPrice(entry)
              )
      if (!result.saved) throw new Error(t('gatewayModels:saveFailed'))
      setEditor(null)
      setRemoving(null)
      toast.success(
        t(
          'gatewayModels:' +
            (action === 'delete'
              ? 'deleted'
              : action === 'reset'
                ? 'resetSaved'
                : 'saved')
        )
      )
      await onWritten()
      const refreshed = await query.refetch()
      if (refreshed.isError)
        toast.warning(t('procurementPricing.savedRefreshFailed'), {
          id: 'procurement-pricing-refresh',
        })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('gatewayModels:saveFailed'),
        {
          id: 'procurement-pricing-save',
        }
      )
    } finally {
      setPending(false)
    }
  }
  function restoreFocus() {
    if (trigger.current?.isConnected) trigger.current.focus()
    else addRef.current?.focus()
  }
  const columns = useMemo<ColumnDef<PricingRow>[]>(
    () => [
      {
        accessorKey: 'model',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={tr('model')} />
        ),
        enableHiding: false,
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
        header: tr('provider'),
        cell: ({ row }) => providerConnectionLabel(row.original.provider),
        filterFn: (row, id, values: string[]) =>
          values.includes(accountPlatform(row.getValue(id))),
      },
      ...priceFields.map(
        (field): ColumnDef<PricingRow> => ({
          id: field,
          meta: { label: tr(field) },
          accessorFn: (entry) => entry.effective.bands.standard?.[field],
          sortingFn: (a, b) => {
            const left = a.original.effective.bands.standard?.[field]
            const right = b.original.effective.bands.standard?.[field]
            if (left === undefined || right === undefined)
              return left === right ? 0 : left === undefined ? 1 : -1
            const ticks = (value: string) => {
              const [whole, fraction = ''] = value.split('.')
              return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'))
            }
            const delta = ticks(left) - ticks(right)
            return delta === 0n ? 0 : delta > 0n ? 1 : -1
          },
          header: ({ column }) => (
            <DataTableColumnHeader
              column={column}
              title={tr(field)}
              className='justify-start'
            />
          ),
          cell: ({ row }) => (
            <span className='block text-left tabular-nums'>
              {row.original.effective.bands.standard?.[field] ?? '\u2014'}
            </span>
          ),
        })
      ),
      {
        id: 'source',
        header: t('procurementPricing.source'),
        cell: ({ row }) => (
          <Badge variant='outline'>
            {t('procurementPricing.' + row.original.source)}
          </Badge>
        ),
      },
      {
        id: 'bands',
        header: t('gatewayModels:modelType'),
        accessorFn: (entry) =>
          Object.keys(entry.effective.bands)
            .map((band) => tr('bands.' + band))
            .join(' / '),
        cell: ({ getValue }) => (
          <span className='block max-w-52 truncate' title={getValue<string>()}>
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => (
          <span className='block text-left'>{t('common.actions')}</span>
        ),
        enableHiding: false,
        cell: ({ row }) => (
          <div className='flex justify-start gap-1'>
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className='size-8'
              aria-label={tr('editEntry') + ' ' + row.original.model}
              title={tr('editEntry') + ' ' + row.original.model}
              disabled={unavailable || query.isFetching}
              onClick={() => {
                trigger.current = document.activeElement as HTMLElement
                setEditor(priceEditorEntry(row.original))
              }}
            >
              <Pencil className='size-4' />
            </Button>
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className='size-8'
              aria-label={
                t('procurementPricing.reset') + ' ' + row.original.model
              }
              title={t('procurementPricing.reset') + ' ' + row.original.model}
              disabled={
                unavailable ||
                query.isFetching ||
                row.original.source !== 'override'
              }
              onClick={() => {
                trigger.current = document.activeElement as HTMLElement
                setRemovalAction('reset')
                setRemoving(row.original)
              }}
            >
              <RotateCcw className='size-4' />
            </Button>
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className='size-8'
              aria-label={t('gatewayModels:deleteNamed', {
                model: row.original.model,
              })}
              title={t('gatewayModels:deleteNamed', {
                model: row.original.model,
              })}
              disabled={unavailable || query.isFetching}
              onClick={() => {
                trigger.current = document.activeElement as HTMLElement
                setRemovalAction('delete')
                setRemoving(row.original)
              }}
            >
              <Trash2 className='size-4' />
            </Button>
          </div>
        ),
      },
    ],
    [tr, t, unavailable, query.isFetching]
  )
  // The table owns mutable state and is intentionally not compiler-memoized.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: entries,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _id, query: string) =>
      row.original.model.toLowerCase().includes(query.trim().toLowerCase()),
  })
  const { pagination, sorting, columnFilters, globalFilter } = table.getState()
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [
    pagination.pageIndex,
    pagination.pageSize,
    sorting,
    columnFilters,
    globalFilter,
  ])
  return (
    <ConfigurationSection
      id='model-pricing-catalog'
      title={t('gatewayModels:catalog')}
      className='min-h-0 flex-1'
      contentClassName='flex min-h-0 flex-1 flex-col gap-4 space-y-0'
    >
      <DataTableToolbar
        actions={
          <>
            <Button
              type='button'
              variant='outline'
              size='icon-sm'
              title={t('identity.refresh')}
              aria-label={t('identity.refresh')}
              disabled={!canManage || query.isFetching || pending || !!editor}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className='size-4' />
            </Button>
            <Button
              type='button'
              variant='outline'
              size='icon-sm'
              title={t('gatewayModels:sync')}
              aria-label={t('gatewayModels:sync')}
              disabled={unavailable || query.isFetching || !!editor}
              onClick={() => setSyncOpen(true)}
            >
              <Download aria-hidden='true' className='size-4' />
            </Button>
            <Button
              ref={addRef}
              type='button'
              size='sm'
              disabled={unavailable || query.isFetching || !providers.length}
              onClick={() => {
                trigger.current = addRef.current
                setEditor(
                  newPricingEntry(
                    providers.includes('openai_api')
                      ? 'openai_api'
                      : providers[0]
                  )
                )
              }}
            >
              <Plus className='size-4' />
              {tr('add')}
            </Button>
          </>
        }
        table={table}
        searchPlaceholder={tr('search')}
        filters={[
          {
            columnId: 'provider',
            title: tr('provider'),
            options: platformOptions(providers),
          },
        ]}
      />
      {!canManage && <div role='alert'>{t('identity.permissionRequired')}</div>}
      {canManage && query.isError && (
        <RequestErrorToast
          message={query.error.message}
          retry={() => void query.refetch()}
        />
      )}
      {canManage && query.isPending && (
        <div role='status'>{t('identity.loading')}</div>
      )}
      <div
        ref={scrollRef}
        data-testid='model-pricing-table-scroll'
        className='min-h-0 flex-1 overflow-auto rounded-md border [&>[data-slot=table-container]]:overflow-visible'
      >
        <Table aria-label={tr('catalog')} className='min-w-200'>
          <TableHeader className='sticky top-0 z-10 bg-card'>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      header.column.id === 'actions'
                        ? 'sticky right-0 z-20 bg-card'
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
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={
                        cell.column.id === 'actions'
                          ? 'sticky right-0 bg-card'
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
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className='h-28 text-left text-muted-foreground lg:text-center'
                >
                  {tr(entries.length ? 'noResults' : 'empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} className='shrink-0' />
      {syncOpen && query.data && (
        <PricingSyncDialog
          catalog={query.data}
          pending={pending}
          onPendingChange={setPending}
          onClose={() => setSyncOpen(false)}
          onSynced={async () => {
            setSyncOpen(false)
            await onWritten()
            const refreshed = await query.refetch()
            if (refreshed.isError)
              toast.warning(t('gatewayModels:syncRefreshFailed'), {
                id: 'model-pricing-sync-refresh',
              })
          }}
        />
      )}
      {editor && (
        <PriceEditor
          key={editor.id}
          entry={editor}
          entries={entries}
          providers={providers}
          pending={pending}
          available={!unavailable && !query.isFetching}
          onClose={() => {
            if (!pending) setEditor(null)
          }}
          onRestoreFocus={restoreFocus}
          onApply={(entry) => write(entry, 'replace')}
        />
      )}
      <AlertDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !pending) setRemoving(null)
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            restoreFocus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                removalAction === 'delete'
                  ? 'gatewayModels:delete'
                  : 'procurementPricing.reset'
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                removalAction === 'delete'
                  ? 'gatewayModels:deleteConfirm'
                  : 'procurementPricing.resetConfirm',
                { model: removing?.model }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <Button
              type='button'
              variant='destructive'
              disabled={pending}
              onClick={() => {
                if (!removing) return
                trigger.current = addRef.current
                void write(removing, removalAction)
              }}
            >
              {t(
                removalAction === 'delete'
                  ? 'gatewayModels:delete'
                  : 'procurementPricing.reset'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfigurationSection>
  )
}
