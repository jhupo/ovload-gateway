import { useCallback, useId, useMemo, useRef, useState } from 'react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
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
import { ConfigurationSection } from '@/components/configuration-section'
import {
  DataTableColumnHeader,
  DataTableToolbar,
} from '@/components/data-table'

export type SelectionOption = {
  id: string
  name: string
  detail: string
  status?: string
  visibility?: string
  accountCount?: number
  rate?: string
}

export function SettingsSelectionTable({
  title,
  addLabel,
  selectLabel,
  detailLabel,
  options,
  selected,
  onChange,
  testId,
  filterDetail = false,
  rateLabel,
  error,
  fieldName,
}: {
  title: string
  addLabel: string
  selectLabel: string
  detailLabel: string
  options: SelectionOption[]
  selected: string[]
  onChange: (ids: string[]) => void
  testId: string
  filterDetail?: boolean
  rateLabel?: string
  error?: string
  fieldName?: string
}) {
  const { t } = useTranslation()
  const tr = useCallback((key: string) => t('settingsSelection.' + key), [t])
  const id = useId()
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState('')
  const [removing, setRemoving] = useState<SelectionOption | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const removeTrigger = useRef<HTMLButtonElement | null>(null)
  const available = options.filter((item) => !selected.includes(item.id))
  const rows = useMemo(
    () =>
      selected.map(
        (id) =>
          options.find((item) => item.id === id) ?? {
            id,
            name: id,
            detail: '-',
          }
      ),
    [options, selected]
  )
  const columns = useMemo<ColumnDef<SelectionOption>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={tr('name')} />
        ),
        cell: ({ row }) => (
          <span
            className='block truncate font-medium'
            title={row.original.name}
          >
            {row.original.name}
          </span>
        ),
        meta: { label: tr('name') },
        enableHiding: false,
      },
      {
        accessorKey: 'detail',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={detailLabel} />
        ),
        meta: { label: detailLabel },
        filterFn: (row, key, values: string[]) =>
          values.includes(row.getValue(key)),
      },
      ...(rateLabel
        ? [
            {
              accessorKey: 'rate',
              header: ({ column }) => (
                <DataTableColumnHeader column={column} title={rateLabel} />
              ),
              cell: ({ row }) => (
                <span className='tabular-nums'>{row.original.rate}</span>
              ),
              meta: { label: rateLabel },
            } satisfies ColumnDef<SelectionOption>,
          ]
        : []),
      ...(filterDetail
        ? [
            {
              accessorKey: 'visibility',
              header: ({ column }) => (
                <DataTableColumnHeader
                  column={column}
                  title={t('groups.type')}
                />
              ),
              cell: ({ row }) => row.original.visibility,
              meta: { label: t('groups.type') },
            } satisfies ColumnDef<SelectionOption>,
            {
              accessorKey: 'status',
              header: ({ column }) => (
                <DataTableColumnHeader
                  column={column}
                  title={t('groups.status')}
                />
              ),
              cell: ({ row }) => (
                <Badge variant='outline'>{row.original.status}</Badge>
              ),
              meta: { label: t('groups.status') },
            } satisfies ColumnDef<SelectionOption>,
          ]
        : []),
      ...(filterDetail
        ? [
            {
              accessorKey: 'accountCount',
              header: ({ column }) => (
                <DataTableColumnHeader
                  column={column}
                  title={t('groups.accounts')}
                  className='justify-start'
                />
              ),
              cell: ({ row }) => (
                <span className='block text-left tabular-nums'>
                  {row.original.accountCount}
                </span>
              ),
              meta: { label: t('groups.accounts') },
            } satisfies ColumnDef<SelectionOption>,
          ]
        : []),
      {
        id: 'actions',
        header: () => <span className='sr-only'>{t('groups.actions')}</span>,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className='text-end'>
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className='size-8'
              aria-label={t('settingsSelection.remove', {
                name: row.original.name,
              })}
              onClick={(event) => {
                removeTrigger.current = event.currentTarget
                setRemoving(row.original)
              }}
            >
              <Trash2 aria-hidden='true' className='size-4' />
            </Button>
          </div>
        ),
      },
    ],
    [detailLabel, filterDetail, rateLabel, t, tr]
  )
  // TanStack Table owns mutable state and cannot be compiler-memoized.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  const changeOpen = (next: boolean) => {
    if (!next && choice) {
      toast.warning(tr('unsavedSelection'), {
        id: 'settings-selection-dirty',
      })
      return
    }
    setOpen(next)
    setChoice('')
  }
  return (
    <section data-testid={testId} className='min-w-0 space-y-4'>
      <ConfigurationSection title={title}>
        <div className='space-y-4'>
          <DataTableToolbar
            actions={
              <Dialog open={open} onOpenChange={changeOpen}>
                <DialogTrigger asChild>
                  <Button
                    ref={addRef}
                    type='button'
                    size='sm'
                    className='h-8'
                    disabled={!available.length}
                  >
                    <Plus aria-hidden='true' className='size-4' />
                    {addLabel}
                  </Button>
                </DialogTrigger>
                <DialogContent
                  onCloseAutoFocus={(event) => {
                    if (addRef.current?.disabled) {
                      event.preventDefault()
                      tableRef.current?.focus()
                    }
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>{addLabel}</DialogTitle>
                    <DialogDescription className='sr-only'>
                      {selectLabel}
                    </DialogDescription>
                  </DialogHeader>
                  <div className='space-y-2'>
                    <Label htmlFor={id + '-choice'}>{selectLabel}</Label>
                    <Select value={choice} onValueChange={setChoice}>
                      <SelectTrigger
                        id={id + '-choice'}
                        className='w-full min-w-0'
                      >
                        <SelectValue placeholder={selectLabel} />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => {
                        setChoice('')
                        setOpen(false)
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      type='button'
                      disabled={!available.some((item) => item.id === choice)}
                      onClick={() => {
                        if (!available.some((item) => item.id === choice))
                          return
                        onChange([...selected, choice])
                        setChoice('')
                        setOpen(false)
                      }}
                    >
                      {tr('apply')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            }
            table={table}
            searchKey='name'
            searchPlaceholder={t('settingsSelection.search', {
              name: title,
            })}
            filters={
              filterDetail
                ? [
                    {
                      columnId: 'detail',
                      title: detailLabel,
                      options: [
                        ...new Set(options.map((item) => item.detail)),
                      ].map((detail) => ({ value: detail, label: detail })),
                    },
                  ]
                : []
            }
          />
          <div
            ref={tableRef}
            className='max-h-80 overflow-auto rounded-md border aria-invalid:border-destructive [&>[data-slot=table-container]]:overflow-visible'
            role='group'
            aria-label={title}
            tabIndex={-1}
            aria-invalid={!!error}
            aria-describedby={error ? id + '-error' : undefined}
            data-audit-field={fieldName}
          >
            <Table
              aria-label={title}
              className={
                filterDetail
                  ? 'min-w-[720px] table-fixed'
                  : 'min-w-[520px] table-fixed'
              }
            >
              <TableHeader className='sticky top-0 z-10 bg-card'>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={
                          header.id === 'actions'
                            ? 'w-16'
                            : header.id === 'name'
                              ? filterDetail
                                ? 'w-[28%]'
                                : 'w-[42%]'
                              : header.id === 'detail'
                                ? filterDetail
                                  ? 'w-[22%]'
                                  : undefined
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
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
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
                      className='h-24 text-muted-foreground sm:text-center'
                    >
                      {selected.length ? t('common.no_data') : tr('empty')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        {error && (
          <span id={id + '-error'} className='sr-only'>
            {error}
          </span>
        )}
      </ConfigurationSection>
      <AlertDialog
        open={!!removing}
        onOpenChange={(next) => {
          if (!next) setRemoving(null)
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const target = removeTrigger.current?.isConnected
              ? removeTrigger.current
              : addRef.current
            target?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settingsSelection.removeConfirm', {
                name: removing?.name,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription className='sr-only'>
              {title}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <Button
              type='button'
              variant='destructive'
              onClick={() => {
                if (!removing) return
                onChange(selected.filter((item) => item !== removing.id))
                removeTrigger.current = null
                setRemoving(null)
              }}
            >
              {tr('removeAction')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
