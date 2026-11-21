import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCommercePage } from '@/hooks/use-commerce-page'
import { useSiteTimezone } from '@/hooks/use-site-timezone'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { QueryState } from '@/components/query-state'
import { amount } from './data'

export function PaymentHistory({
  email,
  onClose,
  restoreFocus,
}: {
  email: string | null
  onClose: () => void
  restoreFocus: () => void
}) {
  return (
    <Dialog
      open={email !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {email && (
        <HistoryContent key={email} email={email} restoreFocus={restoreFocus} />
      )}
    </Dialog>
  )
}

function HistoryContent({
  email,
  restoreFocus,
}: {
  email: string
  restoreFocus: () => void
}) {
  const timeZone = useSiteTimezone()
  const { orders, ready, error, refresh, tableState } = useCommercePage(
    'orders',
    { email, status: 'paid', type: 'balance' },
    5
  )
  const content = useRef<HTMLDivElement>(null)
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t('orders.' + key)
  const page = tableState.pagination.pageIndex
  const setPage = (change: (page: number) => number) =>
    tableState.onPaginationChange((p) => ({
      ...p,
      pageIndex: change(p.pageIndex),
    }))
  const rows = orders.filter(
    (row) =>
      row.email === email && row.status === 'paid' && row.method !== 'wallet'
  )
  const pages = Math.max(1, Math.ceil(tableState.total / 5))
  if (!ready) return <QueryState error={error} retry={refresh} />
  return (
    <DialogContent
      ref={content}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        content.current
          ?.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')
          ?.focus()
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault()
        restoreFocus()
      }}
      className='max-h-[90dvh] overflow-auto sm:max-w-2xl'
    >
      <DialogHeader>
        <DialogTitle>{tr('history')}</DialogTitle>
        <DialogDescription className='sr-only'>{email}</DialogDescription>
      </DialogHeader>
      <div>
        <p className='font-medium'>{rows[0]?.user}</p>
        <p className='truncate text-sm text-muted-foreground'>{email}</p>
      </div>
      <div className='grid grid-cols-2 gap-4 rounded-lg border p-4'>
        <div>
          <p className='text-xs text-muted-foreground'>{tr('lifetimePaid')}</p>
          <p className='mt-1 text-xl font-semibold tabular-nums'>
            {amount(
              rows.reduce((sum, row) => sum + row.paid, 0),
              'CNY'
            )}
          </p>
        </div>
        <div>
          <p className='text-xs text-muted-foreground'>{tr('paidOrders')}</p>
          <p className='mt-1 text-xl font-semibold tabular-nums'>
            {rows.length}
          </p>
        </div>
      </div>
      <Table className='table-fixed'>
        <TableHeader>
          <TableRow>
            <TableHead>{tr('number')}</TableHead>
            <TableHead className='w-24'>{tr('purchase')}</TableHead>
            <TableHead className='w-20 text-left'>{tr('paidAmount')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <p className='truncate text-xs' title={row.number}>
                  {row.number}
                </p>
                <time
                  className='text-xs text-muted-foreground'
                  dateTime={row.settled!}
                >
                  {new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                    timeZone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  }).format(new Date(row.settled!))}
                </time>
              </TableCell>
              <TableCell className='text-xs'>
                {row.type === 'plan' ? row.plan : tr('balance')}
              </TableCell>
              <TableCell className='text-left text-xs tabular-nums'>
                {amount(row.paid, row.currency ?? 'CNY')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className='flex items-center justify-end gap-3'>
        <span className='text-xs text-muted-foreground'>
          {page + 1} / {pages}
        </span>
        <Button
          variant='outline'
          size='sm'
          disabled={page === 0}
          onClick={() => setPage((v) => v - 1)}
        >
          {t('users.previous_page')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          disabled={page + 1 === pages}
          onClick={() => setPage((v) => v + 1)}
        >
          {t('users.next_page')}
        </Button>
      </div>
    </DialogContent>
  )
}
