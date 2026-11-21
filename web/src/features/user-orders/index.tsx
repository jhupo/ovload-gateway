import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { type ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIdentitySession } from '@/stores/identity-session'
import { useCommercePage } from '@/hooks/use-commerce-page'
import { useRecordFormat } from '@/hooks/use-record-format'
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTableColumnHeader, DataTableFrame } from '@/components/data-table'
import type { ServerFilters } from '@/components/data-table/server-state'
import { QueryState } from '@/components/query-state'
import { ContentSection } from '@/features/settings/components/content-section'
import {
  personalOrderStatuses,
  type PersonalOrder,
  type PersonalOrderStatus,
} from './data'

function OrderStatus({ status }: { status: PersonalOrderStatus }) {
  const { t } = useTranslation()
  const colors = {
    paid: 'bg-badge-success text-badge-success-foreground',
    pending: 'bg-badge-warning text-badge-warning-foreground',
    cancelled: 'bg-badge-neutral text-badge-neutral-foreground',
    refunded: 'bg-badge-info text-badge-info-foreground',
    expired: 'bg-badge-neutral text-badge-neutral-foreground',
    failed: 'bg-badge-destructive text-badge-destructive-foreground',
  }
  return (
    <Badge
      variant='outline'
      className={`border-transparent font-normal ${colors[status]}`}
    >
      {['expired', 'failed'].includes(status)
        ? t(`integrationSettings.status.${status}`)
        : t(`orders.${status}`)}
    </Badge>
  )
}

export function UserOrders() {
  const { t } = useTranslation()
  const tr = (key: string) => t(`personalOrders.${key}`)
  const format = useRecordFormat()
  const owner = useIdentitySession((s) => s.session?.id)
  const [tableFilters, setTableFilters] = useState<ServerFilters>({
    search: '',
    columns: [],
  })
  const filter = (id: string) =>
    (
      tableFilters.columns.find((c) => c.id === id)?.value as
        | string[]
        | undefined
    )?.join(',') ?? 'all'
  const { orders, ready, error, refresh, tableState } = useCommercePage(
    'orders',
    {
      search: tableFilters.search,
      status: filter('status'),
      type: filter('type'),
    }
  )

  const personalOrders: PersonalOrder[] = orders.map((o) => ({
    id: o.id,
    type: o.type,
    plan: o.plan || null,
    amountCents: o.paid - (o.fee ?? 0),
    feeCents: o.fee ?? 0,
    creditCents: o.type === 'balance' ? o.credited : null,
    method: o.method,
    status: o.status,
    createdAt: o.created,
    paidAt: o.settled,
    subscriptionId: o.subscriptionId ?? null,
    currency: o.currency ?? 'CNY',
  }))
  const cny = (cents: number, currency = 'CNY') =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
      cents / 100
    )
  const [selected, setSelected] = useState<PersonalOrder | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const columns: ColumnDef<PersonalOrder>[] = [
    {
      accessorKey: 'id',
      enableHiding: false,
      header: tr('number'),
      cell: ({ row }) => (
        <span className='font-mono text-xs'>{row.original.id}</span>
      ),
    },
    {
      accessorKey: 'type',
      meta: { label: tr('purchase') },
      header: tr('purchase'),
      filterFn: (row, id, values: string[]) =>
        values.includes(row.getValue(id)),
      cell: ({ row }) => (
        <div className='space-y-1'>
          <div className='font-medium'>
            {row.original.plan ?? tr('balance')}
          </div>
          {row.original.plan && (
            <div className='text-xs text-muted-foreground'>{tr('plan')}</div>
          )}
        </div>
      ),
    },
    {
      id: 'total',
      accessorFn: (order) => order.amountCents + order.feeCents,
      meta: { label: tr('amount') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('amount')} />
      ),
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {cny(
            row.original.amountCents + row.original.feeCents,
            row.original.currency
          )}
        </span>
      ),
    },
    {
      accessorKey: 'method',
      meta: { label: tr('method') },
      header: tr('method'),
      filterFn: (row, id, values: string[]) =>
        values.includes(row.getValue(id)),
      cell: ({ row }) => t(`orders.${row.original.method}`),
    },
    {
      accessorKey: 'status',
      meta: { label: tr('status') },
      header: tr('status'),
      filterFn: (row, id, values: string[]) =>
        values.includes(row.getValue(id)),
      cell: ({ row }) => <OrderStatus status={row.original.status} />,
    },
    {
      accessorKey: 'createdAt',
      meta: { label: tr('created') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('created')} />
      ),
      cell: ({ row }) => (
        <time
          dateTime={row.original.createdAt}
          className='text-xs text-muted-foreground tabular-nums'
        >
          {format.date(row.original.createdAt)}
        </time>
      ),
    },
    {
      id: 'details',
      enableHiding: false,
      header: () => <span className='sr-only'>{tr('details')}</span>,
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size='icon'
              variant='ghost'
              className='size-8'
              aria-label={`${tr('details')} · ${row.original.id}`}
              onClick={(event) => {
                trigger.current = event.currentTarget
                setSelected(row.original)
              }}
            >
              <Eye className='size-4' />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tr('details')}</TooltipContent>
        </Tooltip>
      ),
    },
  ]
  const fields = selected
    ? [
        [tr('number'), selected.id],
        [tr('purchase'), selected.plan ?? tr('balance')],
        [tr('method'), t(`orders.${selected.method}`)],
        [tr('subtotal'), cny(selected.amountCents, selected.currency)],
        [tr('fee'), cny(selected.feeCents, selected.currency)],
        [
          tr('amount'),
          cny(selected.amountCents + selected.feeCents, selected.currency),
        ],
        ...(selected.creditCents !== null
          ? [
              [
                tr('credit'),
                new Intl.NumberFormat(undefined, {
                  style: 'currency',
                  currency: 'USD',
                  currencyDisplay: 'narrowSymbol',
                }).format(selected.creditCents / 100),
              ],
            ]
          : []),
        ...(selected.subscriptionId
          ? [[tr('subscriptionId'), selected.subscriptionId]]
          : []),
        [tr('created'), format.date(selected.createdAt)],
        [tr('paidAt'), selected.paidAt ? format.date(selected.paidAt) : '—'],
      ]
    : []
  if (!ready) return <QueryState error={error} retry={refresh} />
  return (
    <ContentSection title={t('userWorkspace.orders')}>
      <DataTableFrame
        server={tableState}
        onFilterChange={setTableFilters}
        filterState={tableFilters}
        data={personalOrders}
        columns={columns}
        label={t('userWorkspace.orders')}
        searchPlaceholder={tr('search')}
        searchText={(order) => `${order.id} ${order.plan ?? ''}`}
        initialSorting={[{ id: 'createdAt', desc: true }]}
        facetedFilters={[
          {
            columnId: 'status',
            title: tr('status'),
            options: personalOrderStatuses.map((value) => ({
              value,
              label: ['expired', 'failed'].includes(value)
                ? t(`integrationSettings.status.${value}`)
                : t(`orders.${value}`),
            })),
          },
          {
            columnId: 'type',
            title: tr('purchase'),
            options: ['balance', 'plan'].map((value) => ({
              value,
              label: tr(value),
            })),
          },
        ]}
      />
      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent
          className='flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md'
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            trigger.current?.focus()
          }}
        >
          <DialogHeader className='border-b px-5 py-4 text-left'>
            <DialogTitle>{tr('details')}</DialogTitle>
            <DialogDescription className='sr-only'>
              {tr('detailsDescription')}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className='min-h-0 space-y-5 overflow-y-auto p-5'>
              <OrderStatus status={selected.status} />
              <dl className='space-y-4 text-sm'>
                {fields.map(([label, value]) => (
                  <div
                    key={label}
                    className='flex items-baseline justify-between gap-4'
                  >
                    <dt className='shrink-0 text-muted-foreground'>{label}</dt>
                    <dd className='min-w-0 text-end break-all tabular-nums'>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <DialogFooter className='border-t px-5 py-4'>
            {selected?.status === 'pending' && (
              <Button
                asChild
                onClick={() => {
                  try {
                    sessionStorage.setItem(
                      'ovload.payment-order.' + owner,
                      selected.id
                    )
                  } catch {
                    /* Retained on server. */
                  }
                }}
              >
                <Link to='/user/recharge'>{t('userRecharge.pay')}</Link>
              </Button>
            )}
            <Button variant='outline' onClick={() => setSelected(null)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentSection>
  )
}
