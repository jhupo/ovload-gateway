import { useRef, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Eye, Download, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { calendarDayStart, addCalendarDays } from '@/lib/calendar'
import { useCommercePage } from '@/hooks/use-commerce-page'
import { useErrorToast } from '@/hooks/use-error-toast'
import { useSiteTimezone } from '@/hooks/use-site-timezone'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  DataTableSingleFilter,
  DataTableColumnHeader,
} from '@/components/data-table'
import { DataTableFrame } from '@/components/data-table'
import { QueryState } from '@/components/query-state'
import { amount, type Order } from './data'
import { OrderDate, OrderShell } from './shared'

export function OrderRecords() {
  const timeZone = useSiteTimezone()
  const { t, i18n } = useTranslation()
  const tr = (k: string) => t('orders.' + k)
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [method, setMethod] = useState('all'),
    [type, setType] = useState('all'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [selected, setSelected] = useState<Order | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const invalid = Boolean(from && to && from > to)
  const {
    orders: rows,
    ready,
    error,
    refresh,
    tableState,
    exportAll,
  } = useCommercePage('orders', {
    search: query,
    status,
    method,
    type,
    from: from ? new Date(calendarDayStart(from, timeZone)).toISOString() : '',
    to: to
      ? new Date(
          calendarDayStart(addCalendarDays(to, 1), timeZone)
        ).toISOString()
      : '',
  })
  const date = (v: string | null) =>
    v
      ? new Intl.DateTimeFormat(i18n.language, {
          timeZone,
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(v))
      : '—'
  const badge = (r: Order) => (
    <Badge
      variant='secondary'
      className={
        r.status === 'paid'
          ? 'bg-badge-success font-normal text-badge-success-foreground'
          : 'font-normal'
      }
    >
      {tr(r.status)}
    </Badge>
  )
  const user = (r: Order) => (
    <div className='min-w-0'>
      <div className='truncate font-medium'>{r.user}</div>
      <div className='truncate text-xs text-muted-foreground' title={r.email}>
        {r.email}
      </div>
    </div>
  )
  const purchase = (r: Order) => (
    <div>
      <div>{r.type === 'balance' ? amount(r.credited, 'USD') : r.plan}</div>
      <div className='text-xs text-muted-foreground'>{tr(r.type)}</div>
    </div>
  )
  const action = (r: Order) => (
    <Button
      variant='ghost'
      size='icon'
      aria-label={tr('view') + ' #' + r.id}
      onClick={(e) => {
        trigger.current = e.currentTarget
        setSelected(r)
      }}
    >
      <Eye className='size-4' />
    </Button>
  )
  const fields: {
    key: string
    size: number
    value: (r: Order) => string | number
    cell: (r: Order) => React.ReactNode
  }[] = [
    {
      key: 'id',
      size: 70,
      value: (r) => r.id,
      cell: (r) => <span className='text-xs tabular-nums'>#{r.id}</span>,
    },
    {
      key: 'number',
      size: 160,
      value: (r) => r.number,
      cell: (r) => (
        <span className='font-mono text-xs break-all'>{r.number}</span>
      ),
    },
    { key: 'user', size: 175, value: (r) => r.user, cell: user },
    { key: 'purchase', size: 120, value: (r) => r.type, cell: purchase },
    {
      key: 'paidAmount',
      size: 100,
      value: (r) => r.paid,
      cell: (r) => (
        <span className='font-medium tabular-nums'>
          {amount(r.paid, r.currency ?? 'CNY')}
        </span>
      ),
    },
    {
      key: 'method',
      size: 90,
      value: (r) => r.method,
      cell: (r) => tr(r.method),
    },
    { key: 'status', size: 85, value: (r) => r.status, cell: badge },
    {
      key: 'time',
      size: 150,
      value: (r) => r.created,
      cell: (r) => (
        <div className='space-y-1 text-xs text-muted-foreground'>
          <div>
            {tr('created')} {date(r.created)}
          </div>
          <div>
            {tr('settled')} {date(r.settled)}
          </div>
        </div>
      ),
    },
  ]
  const columns: ColumnDef<Order>[] = [
    ...fields.map((f) => ({
      id: f.key,
      accessorFn: f.value,
      size: f.size,
      meta: { label: tr(f.key) },
      header: ({
        column,
      }: {
        column: import('@tanstack/react-table').Column<Order>
      }) => <DataTableColumnHeader column={column} title={tr(f.key)} />,
      cell: ({ row }: { row: import('@tanstack/react-table').Row<Order> }) =>
        f.cell(row.original),
    })),
    {
      id: 'actions',
      size: 65,
      header: () => <div className='text-center'>{tr('actions')}</div>,
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex justify-center'>{action(row.original)}</div>
      ),
    },
  ]
  const tableFilters = (
    <div className='contents'>
      <Input
        className='h-8 w-full sm:w-60'
        aria-label={tr('search')}
        placeholder={tr('search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {[
        {
          value: status,
          set: setStatus,
          label: 'status',
          options: ['all', 'paid', 'pending', 'cancelled', 'refunded'],
        },
        {
          value: method,
          set: setMethod,
          label: 'method',
          options: ['all', 'alipay', 'wechat', 'wallet'],
        },
        {
          value: type,
          set: setType,
          label: 'purchase',
          options: ['all', 'balance', 'plan'],
        },
      ].map((f) => (
        <div key={f.label}>
          <DataTableSingleFilter
            title={tr(f.label)}
            value={f.value}
            onValueChange={f.set}
            options={f.options.map((value) => ({
              value,
              label: tr(value === 'all' ? 'all' + f.label : value),
            }))}
          />
        </div>
      ))}
      <OrderDate value={from} onChange={setFrom} label={tr('from')} />
      <OrderDate value={to} onChange={setTo} label={tr('to')} />
      {(query ||
        from ||
        to ||
        status !== 'all' ||
        method !== 'all' ||
        type !== 'all') && (
        <Button
          variant='ghost'
          size='icon'
          className='size-8'
          aria-label={tr('clear')}
          onClick={() => {
            setQuery('')
            setFrom('')
            setTo('')
            setStatus('all')
            setMethod('all')
            setType('all')
          }}
        >
          <X />
        </Button>
      )}
    </div>
  )
  useErrorToast(invalid ? tr('invalidRange') : undefined, 'order-range')
  if (!ready) return <QueryState error={error} retry={refresh} />
  return (
    <OrderShell
      fixed
      title='sidebar.order_management'
      actions={
        <Button
          variant='outline'
          disabled={invalid || !rows.length}
          onClick={() => {
            void exportAll()
              .then(({ orders: rows }) => {
                const cell = (v: unknown) =>
                  '"' +
                  String(v ?? '')
                    .replace(/^[=+@-]/, "'$&")
                    .replaceAll('"', '""') +
                  '"'
                const csv = [
                  [
                    tr('number'),
                    tr('user'),
                    tr('purchase'),
                    tr('paidAmount'),
                    tr('method'),
                    tr('status'),
                    tr('created'),
                  ],
                  ...rows.map((r) => [
                    r.number,
                    r.email,
                    r.plan || tr(r.type),
                    amount(r.paid, r.currency ?? 'CNY'),
                    tr(r.method),
                    tr(r.status),
                    date(r.created),
                  ]),
                ]
                  .map((row) => row.map(cell).join(','))
                  .join('\r\n')
                const url = URL.createObjectURL(
                  new Blob(['\ufeff' + csv], {
                    type: 'text/csv;charset=utf-8',
                  })
                )
                const link = document.createElement('a')
                link.href = url
                link.download = 'orders.csv'
                link.click()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
              })
              .catch((error: Error) => toast.error(error.message))
          }}
        >
          <Download />
          {tr('export')}
        </Button>
      }
    >
      {invalid && (
        <p role='alert' className='sr-only'>
          {tr('invalidRange')}
        </p>
      )}
      <div className='relative flex min-h-0 flex-1 flex-col gap-4'>
        <DataTableFrame
          server={tableState}
          toolbar={tableFilters}
          data={invalid ? [] : rows}
          columns={columns}
          label={tr('records')}
          mobile={(r) => (
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <span className='font-mono text-xs'>#{r.id}</span>
                <div className='flex items-center gap-2'>
                  {badge(r)}
                  {action(r)}
                </div>
              </div>
              <div className='grid grid-cols-2 gap-3'>
                {user(r)}
                <div className='text-right font-semibold'>
                  {amount(r.paid, r.currency ?? 'CNY')}
                  <div className='text-xs font-normal text-muted-foreground'>
                    {tr(r.method)}
                  </div>
                </div>
                {purchase(r)}
                <div className='space-y-1 text-right text-xs text-muted-foreground'>
                  <div>
                    {tr('created')} {date(r.created)}
                  </div>
                  <div>
                    {tr('settled')} {date(r.settled)}
                  </div>
                </div>
              </div>
            </div>
          )}
        />
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(v) => {
          if (!v) setSelected(null)
        }}
      >
        <DialogContent
          className='flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl'
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            trigger.current?.focus()
          }}
        >
          <DialogHeader className='border-b p-5 text-left'>
            <DialogTitle>{tr('detail')}</DialogTitle>
            <DialogDescription className='sr-only'>
              {tr('detail')}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className='min-h-0 space-y-5 overflow-auto p-5'>
              <div className='flex items-center gap-3'>
                <span className='font-semibold'>#{selected.id}</span>
                {badge(selected)}
              </div>
              <dl className='grid grid-cols-2 gap-x-6 gap-y-4'>
                {[
                  [
                    'user',
                    <>
                      {selected.user}
                      <br />
                      {selected.email}
                    </>,
                  ],
                  ['number', selected.number],
                  ['purchase', purchase(selected)],
                  [
                    'paidAmount',
                    amount(selected.paid, selected.currency ?? 'CNY'),
                  ],
                  ['method', tr(selected.method)],
                  [
                    'fee',
                    amount(selected.fee ?? 0, selected.currency ?? 'CNY'),
                  ],
                  ['created', date(selected.created)],
                  ['settled', date(selected.settled)],
                ].map(([key, value]) => (
                  <div key={String(key)} className='min-w-0'>
                    <dt className='mb-1 text-xs text-muted-foreground'>
                      {tr(String(key))}
                    </dt>
                    <dd className='text-sm break-all'>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className='border-t pt-4'>
                <h3 className='mb-4 text-sm font-semibold'>{tr('events')}</h3>
                <ol className='ml-2 space-y-5 border-l pl-5'>
                  {[
                    'created',
                    ...(selected.settled
                      ? ['paymentReceived', 'delivered']
                      : []),
                    ...(selected.status === 'refunded' ? ['refunded'] : []),
                    ...(selected.status === 'cancelled' ? ['cancelled'] : []),
                  ].map((event, i) => (
                    <li
                      key={event}
                      className='relative flex flex-wrap justify-between gap-2 text-sm'
                    >
                      <span className='absolute top-1.5 -left-[25px] size-2 rounded-full bg-foreground' />
                      <span>{tr(event)}</span>
                      <time className='text-xs text-muted-foreground'>
                        {date(
                          i === 0
                            ? selected.created
                            : selected.settled || selected.created
                        )}
                      </time>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
          <div className='flex justify-end border-t p-4'>
            <Button variant='outline' onClick={() => setSelected(null)}>
              {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </OrderShell>
  )
}
