import { useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { CalendarDays, Download, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEngagement, type ReferralState } from '@/hooks/use-engagement'
import { useErrorToast } from '@/hooks/use-error-toast'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
} from '@/components/data-table'
import { DataTableToolbarLayout } from '@/components/data-table/toolbar-layout'
import { DataTableViewOptions } from '@/components/data-table/view-options'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { MonthAndYearCalendar } from '@/components/shadcn-space/calendar/calendar-05'
import {
  ledgers as emptyLedgers,
  type RecordKind,
  type Person,
  type LedgerRow,
} from './data'

function DateFilter({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (v: string) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          className='h-8 min-w-0 justify-between font-normal'
          aria-label={label}
        >
          {value || label}
          <CalendarDays className='size-4' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0' align='start'>
        <MonthAndYearCalendar
          mode='single'
          selected={value ? new Date(value + 'T00:00') : undefined}
          onSelect={(d) => {
            onChange(d ? format(d, 'yyyy-MM-dd') : '')
            setOpen(false)
          }}
          startMonth={new Date(2020, 0)}
          endMonth={new Date(2100, 11)}
        />
      </PopoverContent>
    </Popover>
  )
}
function Records({
  kind,
  person,
  onPerson,
}: {
  kind: RecordKind
  person?: Person
  onPerson: (p: Person) => void
}) {
  const { t, i18n } = useTranslation()
  const tr = (k: string) => t(`referrals.${k}`)
  const [query, setQuery] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('')
  const [sorting, setSorting] = useState<SortingState>([]),
    [visibility, setVisibility] = useState<VisibilityState>({})
  const invalid = Boolean(from && to && from > to)
  const state = useEngagement<ReferralState>(
    person ? `referrals-${person.id}` : 'referrals'
  )
  const ledgers = state.data ?? emptyLedgers
  useErrorToast(invalid ? tr('invalidRange') : undefined, 'referral-range')
  const money = (n: number, currency = 'USD') =>
    new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(n / 100)
  const date = (s: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(s))
  const data = useMemo(
    () =>
      ledgers[kind].filter(
        (r) =>
          (!person || r.user.id === person.id) &&
          (!from || format(new Date(r.at), 'yyyy-MM-dd') >= from) &&
          (!to || format(new Date(r.at), 'yyyy-MM-dd') <= to) &&
          `${r.id} ${r.user.name} ${r.user.email} ${r.user.id} ${r.invitee?.name} ${r.invitee?.email} ${r.invitee?.id} ${r.code}`
            .toLowerCase()
            .includes(query.toLowerCase())
      ),
    [ledgers, kind, person, from, to, query]
  )
  const identity = (p: Person) => (
    <div className='min-w-0 space-y-1'>
      <button
        type='button'
        data-referral-person={p.id}
        onClick={() => onPerson(p)}
        className='block max-w-full truncate text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2'
        title={p.name}
      >
        {p.name}
      </button>
      <div className='truncate text-xs text-muted-foreground' title={p.email}>
        {p.email}
      </div>
      <div className='text-xs text-muted-foreground'>#{p.id}</div>
    </div>
  )
  const columns: ColumnDef<LedgerRow>[] = []
  const add = (
    id: string,
    label: string,
    cell: (r: LedgerRow) => React.ReactNode,
    size = 140
  ) =>
    columns.push({
      id,
      accessorFn: (r) =>
        id === 'user'
          ? r.user.name
          : id === 'invitee'
            ? r.invitee?.name
            : id === 'payment'
              ? r.credited
              : id === 'status'
                ? 'completed'
                : id === 'order'
                  ? r.id
                  : r[id as keyof LedgerRow],
      size,
      meta: { label },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={label} />
      ),
      cell: ({ row }) => cell(row.original),
    })
  if (kind === 'rebates')
    add(
      'order',
      tr('order'),
      (r) => <span className='font-mono text-xs break-all'>{r.id}</span>,
      170
    )
  if (!person)
    add(
      'user',
      tr(kind === 'withdrawals' ? 'user' : 'inviter'),
      (r) => identity(r.user),
      190
    )
  if (kind !== 'withdrawals')
    add('invitee', tr('invitee'), (r) => identity(r.invitee!), 190)
  if (kind === 'invitations') {
    add('code', tr('code'), (r) => (
      <span className='font-mono text-xs'>{r.code}</span>
    ))
    add('amount', tr('total'), (r) => (
      <span className='font-medium tabular-nums'>{money(r.amount)}</span>
    ))
  }
  if (kind === 'rebates') {
    add(
      'payment',
      tr('payment'),
      (r) => (
        <div className='space-y-1 text-xs tabular-nums'>
          <div>
            {tr('credited')} {money(r.credited)}
          </div>
          <div className='text-muted-foreground'>
            {tr('paid')} {money(r.paid, 'CNY')}
          </div>
        </div>
      ),
      160
    )
    add('amount', tr('rebate'), (r) => (
      <div className='space-y-1 tabular-nums'>
        <div className='font-medium'>{money(r.amount)}</div>
        <div className='text-xs text-muted-foreground'>{r.rate ?? '0'}%</div>
      </div>
    ))
    add(
      'status',
      tr('status'),
      (r) => (
        <Badge
          variant='secondary'
          className='bg-badge-success font-normal text-badge-success-foreground'
        >
          {r.status === 'frozen'
            ? t('personalReferrals.frozen')
            : tr('completed')}
        </Badge>
      ),
      100
    )
  }
  if (kind === 'withdrawals')
    for (const key of [
      'amount',
      'balance',
      'available',
      'frozen',
      'total',
    ] as const)
      add(
        key,
        tr(key),
        (r) => <span className='tabular-nums'>{money(r[key])}</span>,
        125
      )
  add(
    'at',
    tr('time'),
    (r) => (
      <span className='text-xs text-muted-foreground tabular-nums'>
        {date(r.at)}
      </span>
    ),
    180
  )
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (r) => r.id,
  })
  return (
    <div className='flex min-h-0 flex-1 flex-col gap-4'>
      <DataTableToolbarLayout
        actions={
          <>
            <Button
              size='sm'
              variant='outline'
              disabled={!data.length || invalid}
            >
              <Download className='size-4' />
              {tr('export')}
            </Button>
            <DataTableViewOptions table={table} />
          </>
        }
      >
        <Input
          className='h-8 w-full sm:w-64'
          aria-label={tr('search')}
          placeholder={tr('search')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            table.setPageIndex(0)
          }}
        />
        <DateFilter
          label={tr('from')}
          value={from}
          onChange={(v) => {
            setFrom(v)
            table.setPageIndex(0)
          }}
        />
        <DateFilter
          label={tr('to')}
          value={to}
          onChange={(v) => {
            setTo(v)
            table.setPageIndex(0)
          }}
        />
        {(from || to || query) && (
          <Button
            size='icon'
            className='size-8'
            variant='ghost'
            aria-label={tr('clear')}
            onClick={() => {
              setFrom('')
              setTo('')
              setQuery('')
            }}
          >
            <X className='size-4' />
          </Button>
        )}
      </DataTableToolbarLayout>
      {invalid && (
        <p role='alert' className='sr-only'>
          {tr('invalidRange')}
        </p>
      )}
      <div className='min-h-0 flex-1 overflow-auto rounded-md border bg-card'>
        <div
          className={
            person
              ? 'hidden sm:block [&>[data-slot=table-container]]:overflow-visible'
              : 'hidden xl:block [&>[data-slot=table-container]]:overflow-visible'
          }
        >
          <Table className='table-fixed'>
            <TableHeader className='sticky top-0 z-10 bg-background'>
              {table.getHeaderGroups().map((g) => (
                <TableRow key={g.id}>
                  {g.headers.map((h) => (
                    <TableHead
                      key={h.id}
                      style={{
                        width: `${(h.getSize() / table.getTotalSize()) * 100}%`,
                      }}
                      className='px-3'
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {!invalid &&
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className='transition-none'>
                    {row.getVisibleCells().map((c) => (
                      <TableCell key={c.id} className='px-3 py-4'>
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
        <div className={person ? 'divide-y sm:hidden' : 'divide-y xl:hidden'}>
          {!invalid &&
            table.getRowModel().rows.map((row) => (
              <div
                key={row.id}
                className='grid grid-cols-2 gap-x-4 gap-y-3 p-4'
              >
                {row.getVisibleCells().map((c) => (
                  <div key={c.id} className='min-w-0'>
                    <div className='mb-1 text-xs text-muted-foreground'>
                      {c.column.columnDef.meta?.label}
                    </div>
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </div>
                ))}
              </div>
            ))}
        </div>
        {(!data.length || invalid) && (
          <div className='p-12 text-center text-sm text-muted-foreground'>
            {t('featureAvailability.unavailable')}
          </div>
        )}
      </div>
      <DataTablePagination table={table} />
    </div>
  )
}
export function ReferralPage({ kind }: { kind: RecordKind }) {
  const state = useEngagement<ReferralState>('referrals')
  const ledgers = state.data ?? emptyLedgers
  const { t, i18n } = useTranslation()
  const trigger = useRef<HTMLElement | null>(null)
  const [person, setPerson] = useState<Person | null>(null)
  const detail = useEngagement<ReferralState>(
    person ? `referrals-${person.id}` : 'referrals',
    !!person
  )
  const open = (p: Person) => {
    if (!person) trigger.current = document.activeElement as HTMLElement
    setPerson(p)
  }
  return (
    <>
      <Header>
        <ProfileDropdown />
      </Header>
      <Main fixed id='content' className='min-h-0'>
        <div data-slot='page-heading' className='flex items-center gap-2'>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t(`referrals.${kind}`)}
          </h1>
        </div>
        <Records key={kind} kind={kind} onPerson={open} />
      </Main>
      <Dialog
        open={Boolean(person)}
        onOpenChange={(v) => {
          if (!v) setPerson(null)
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const original = trigger.current
            const target = original?.isConnected
              ? original
              : Array.from(
                  document.querySelectorAll<HTMLButtonElement>(
                    'main button[data-referral-person]'
                  )
                ).find(
                  (button) =>
                    button.dataset.referralPerson ===
                      original?.dataset.referralPerson &&
                    button.getClientRects().length > 0
                )
            target?.focus()
          }}
          className='max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-lg'
        >
          <DialogHeader className='border-b px-5 py-5 pr-12 text-left sm:px-6'>
            <DialogTitle>{t('referrals.detail')}</DialogTitle>
            <DialogDescription className='sr-only'>
              {t('referrals.preview')}
            </DialogDescription>
          </DialogHeader>
          {person &&
            (() => {
              const invitations = ledgers.invitations.filter(
                (r) => r.user.id === person.id
              )
              const rebates = ledgers.rebates.filter(
                (r) => r.user.id === person.id
              )
              const total = rebates.reduce((sum, r) => sum + r.amount, 0)
              const transferred = ledgers.withdrawals
                .filter((r) => r.user.id === person.id)
                .reduce((sum, r) => sum + r.amount, 0)
              const money = (cents: number) =>
                new Intl.NumberFormat(i18n.language, {
                  style: 'currency',
                  currency: 'USD',
                  currencyDisplay: 'narrowSymbol',
                }).format(cents / 100)
              const metrics = [
                ['code', detail.data?.summary.code ?? '—'],
                ['rate', `${detail.data?.rate ?? '0'}%`],
                [
                  'invited',
                  String(detail.data?.summary.invited ?? invitations.length),
                ],
                [
                  'rewarded',
                  String(
                    detail.data?.summary.rewarded ??
                      new Set(
                        rebates
                          .filter((r) => r.amount > 0)
                          .map((r) => r.invitee?.id)
                      ).size
                  ),
                ],
                [
                  'withdrawable',
                  money(
                    detail.data?.summary.available
                      ? Number(detail.data.summary.available) * 100
                      : Math.max(0, total - transferred)
                  ),
                ],
                [
                  'historical',
                  money(
                    detail.data?.summary.total
                      ? Number(detail.data.summary.total) * 100
                      : total
                  ),
                ],
              ]
              return (
                <div className='space-y-4 p-5 sm:p-6'>
                  <div className='space-y-1 rounded-lg border px-4 py-4'>
                    <div className='text-xs font-medium tabular-nums'>
                      #{person.id}
                    </div>
                    <div className='text-sm font-medium break-all'>
                      {person.email}
                    </div>
                    <div className='text-sm break-words text-muted-foreground'>
                      {person.name}
                    </div>
                  </div>
                  <dl className='grid grid-cols-2 gap-3'>
                    {metrics.map(([key, value]) => (
                      <div
                        key={key}
                        className='min-w-0 rounded-lg border bg-muted/30 px-3 py-3 sm:px-4'
                      >
                        <dt className='text-xs text-muted-foreground'>
                          {t(`referrals.${key}`)}
                        </dt>
                        <dd
                          className={`mt-2 font-semibold break-all tabular-nums ${key === 'code' ? 'font-mono text-sm' : 'text-base'}`}
                        >
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )
            })()}
        </DialogContent>
      </Dialog>
    </>
  )
}
