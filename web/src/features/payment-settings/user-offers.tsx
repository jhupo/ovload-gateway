import { useRef, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettingsUsers } from '@/hooks/use-settings-options'
import { Button } from '@/components/ui/button'
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
import {
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { UserIdentity } from '@/features/users/components/user-identity'
import { type UserOffer } from './draft'
import { UserOfferEditor } from './user-offer-editor'

export function UserOffers({
  rows,
  onChange,
  onEditorDirtyChange,
  error,
}: {
  error?: string
  rows: UserOffer[]
  onChange: (rows: UserOffer[]) => void
  onEditorDirtyChange: (dirty: boolean) => void
}) {
  const { t } = useTranslation()
  const users = useSettingsUsers()
  const tr = (key: string) => t('paymentSettings.' + key)
  const [editing, setEditing] = useState<{
    row: UserOffer
    existing: boolean
  } | null>(null)
  const [removing, setRemoving] = useState<UserOffer | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const add = useRef<HTMLButtonElement>(null)
  const root = useRef<HTMLDivElement>(null)
  function restoreFocus() {
    const previous = opener.current
    const id = previous?.dataset.offerId
    const action = previous?.dataset.offerAction
    const target = previous?.isConnected
      ? previous
      : id && action
        ? root.current?.querySelector<HTMLElement>(
            `[data-offer-id="${id}"][data-offer-action="${action}"]`
          )
        : add.current
    ;(target ?? add.current)?.focus()
  }
  const columns: ColumnDef<UserOffer>[] = [
    {
      id: 'user',
      accessorFn: (row) => {
        const user = users.find((user) => user.id === row.userId)
        return user ? user.username + ' ' + user.email : row.userId
      },
      meta: { label: tr('user') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('user')} />
      ),
      cell: ({ row }) => {
        const user = users.find((user) => user.id === row.original.userId)
        return user ? (
          <UserIdentity user={user} />
        ) : (
          <span className='break-all'>{row.original.userId}</span>
        )
      },
    },
    ...(['amount', 'percent'] as const).map(
      (key): ColumnDef<UserOffer> => ({
        id: key,
        accessorFn: (row) => Number(row[key]),
        meta: { label: tr(key === 'amount' ? 'tierAmount' : 'bonusPercent') },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={tr(key === 'amount' ? 'tierAmount' : 'bonusPercent')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap tabular-nums'>
            {key === 'amount' ? '$' : ''}
            {row.original[key]}
            {key === 'percent' ? '%' : ''}
          </span>
        ),
      })
    ),
    {
      id: 'actions',
      enableHiding: false,
      header: () => <span className='sr-only'>{tr('actions')}</span>,
      cell: ({ row }) => (
        <div className='flex justify-end gap-1'>
          <Button
            type='button'
            size='icon'
            variant='ghost'
            className='size-8'
            aria-label={tr('editUserOffer')}
            data-offer-id={row.original.id}
            data-offer-action='edit'
            onClick={(event) => {
              opener.current = event.currentTarget
              setEditing({ row: row.original, existing: true })
            }}
          >
            <Pencil className='size-4' />
          </Button>
          <Button
            type='button'
            size='icon'
            variant='ghost'
            className='size-8 text-destructive'
            aria-label={tr('deleteUserOffer')}
            data-offer-id={row.original.id}
            data-offer-action='delete'
            onClick={(event) => {
              opener.current = event.currentTarget
              setRemoving(row.original)
            }}
          >
            <Trash2 className='size-4' />
          </Button>
        </div>
      ),
    },
  ]
  // TanStack Table owns a mutable instance, consumed directly in this render.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  })
  return (
    <div ref={root}>
      <ConfigurationSection title={tr('userOffers')}>
        <DataTableToolbar
          table={table}
          searchPlaceholder={tr('searchUsers')}
          actions={
            <Button
              type='button'
              size='sm'
              className='h-8'
              name='userOffers'
              aria-invalid={!!error}
              aria-describedby={error ? 'payment-user-offers-error' : undefined}
              ref={add}
              disabled={rows.length >= 100 || rows.length >= users.length}
              onClick={(event) => {
                opener.current = event.currentTarget
                setEditing({
                  row: {
                    id: crypto.randomUUID(),
                    userId: '',
                    amount: '',
                    percent: '',
                  },
                  existing: false,
                })
              }}
            >
              <Plus className='size-4' />
              {tr('addUserOffer')}
            </Button>
          }
        />
        {error && (
          <span id='payment-user-offers-error' className='sr-only'>
            {tr(error)}
          </span>
        )}
        <div className='overflow-hidden rounded-md border'>
          <Table aria-label={tr('userOffers')}>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead key={header.id} className='whitespace-nowrap'>
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
                    colSpan={table.getVisibleLeafColumns().length}
                    className='h-32 text-center text-muted-foreground'
                  >
                    {tr(rows.length ? 'noMatches' : 'noUserOffers')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {rows.length > 10 && <DataTablePagination table={table} />}
        {editing && (
          <UserOfferEditor
            initial={editing.row}
            existing={editing.existing}
            entries={rows}
            restoreFocus={restoreFocus}
            onDirtyChange={onEditorDirtyChange}
            onClose={() => setEditing(null)}
            onSave={(value) => {
              onChange(
                editing.existing
                  ? rows.map((row) => (row.id === value.id ? value : row))
                  : [...rows, value]
              )
              setEditing(null)
            }}
          />
        )}
        <ConfirmDialog
          open={!!removing}
          onOpenChange={(open) => {
            if (!open) setRemoving(null)
          }}
          title={tr('deleteUserOffer')}
          desc={t('paymentSettings.deleteUserOfferDescription', {
            name: users.find((user) => user.id === removing?.userId)?.username,
          })}
          destructive
          confirmText={tr('delete')}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            restoreFocus()
          }}
          handleConfirm={() => {
            onChange(rows.filter((row) => row.id !== removing?.id))
            setRemoving(null)
            opener.current = add.current
          }}
        />
      </ConfigurationSection>
    </div>
  )
}
