import { type ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { useEngagement, type ReferralState } from '@/hooks/use-engagement'
import { useRecordFormat } from '@/hooks/use-record-format'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader, DataTableFrame } from '@/components/data-table'

export function InvitationRecords() {
  const { data } = useEngagement<ReferralState>('referrals')
  const personalInvitations = (data?.invitations ?? []).map((r) => ({
    ...r,
    invitee: r.inviteeName,
  }))
  const { t } = useTranslation()
  const tr = (key: string) => t(`personalReferrals.${key}`)
  const format = useRecordFormat()
  const columns: ColumnDef<(typeof personalInvitations)[number]>[] = [
    {
      accessorKey: 'invitee',
      enableHiding: false,
      header: tr('invitee'),
      cell: ({ row }) => (
        <span className='font-medium'>{row.original.invitee}</span>
      ),
    },
    {
      accessorKey: 'id',
      meta: { label: tr('invitationId') },
      header: tr('invitationId'),
      cell: ({ row }) => (
        <span className='font-mono text-xs text-muted-foreground'>
          {row.original.id}
        </span>
      ),
    },
    {
      accessorKey: 'registeredAt',
      meta: { label: tr('registered') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('registered')} />
      ),
      cell: ({ row }) => (
        <time
          dateTime={row.original.registeredAt}
          className='text-xs text-muted-foreground tabular-nums'
        >
          {format.date(row.original.registeredAt)}
        </time>
      ),
    },
  ]
  return (
    <DataTableFrame
      data={personalInvitations}
      columns={columns}
      label={tr('invitations')}
      searchPlaceholder={tr('searchInvitations')}
      searchText={(record) => `${record.invitee} ${record.id}`}
      initialSorting={[{ id: 'registeredAt', desc: true }]}
    />
  )
}

export function RebateRecords() {
  const { data } = useEngagement<ReferralState>('referrals')
  const personalRebates = (data?.rebates ?? []).map((r) => ({
    ...r,
    invitee: r.inviteeName,
  }))
  const { t } = useTranslation()
  const tr = (key: string) => t(`personalReferrals.${key}`)
  const format = useRecordFormat()
  const columns: ColumnDef<(typeof personalRebates)[number]>[] = [
    {
      accessorKey: 'id',
      enableHiding: false,
      header: tr('rebateId'),
      cell: ({ row }) => (
        <span className='font-mono text-xs'>{row.original.id}</span>
      ),
    },
    {
      accessorKey: 'invitee',
      meta: { label: tr('invitee') },
      header: tr('invitee'),
    },
    {
      accessorKey: 'purchaseCents',
      meta: { label: tr('purchase') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('purchase')} />
      ),
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {format.money(row.original.purchaseCents)}
        </span>
      ),
    },
    {
      accessorKey: 'rebateCents',
      meta: { label: tr('rebate') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('rebate')} />
      ),
      cell: ({ row }) => (
        <span className='font-medium tabular-nums'>
          +{format.money(row.original.rebateCents)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      meta: { label: tr('status') },
      header: tr('status'),
      filterFn: (row, id, values: string[]) =>
        values.includes(row.getValue(id)),
      cell: ({ row }) => (
        <Badge
          variant='outline'
          className={`border-transparent font-normal ${row.original.status === 'frozen' ? 'bg-badge-warning text-badge-warning-foreground' : 'bg-badge-success text-badge-success-foreground'}`}
        >
          {tr(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdAt',
      meta: { label: tr('time') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('time')} />
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
  ]
  return (
    <DataTableFrame
      data={personalRebates}
      columns={columns}
      label={tr('rebates')}
      searchPlaceholder={tr('searchRebates')}
      searchText={(record) => `${record.invitee} ${record.id}`}
      initialSorting={[{ id: 'createdAt', desc: true }]}
      facetedFilters={[
        {
          columnId: 'status',
          title: tr('status'),
          options: ['frozen', 'released'].map((value) => ({
            value,
            label: tr(value),
          })),
        },
      ]}
    />
  )
}

export function TransferRecords() {
  const { data } = useEngagement<ReferralState>('referrals')
  const personalTransfers = data?.withdrawals ?? []
  const { t } = useTranslation()
  const tr = (key: string) => t(`personalReferrals.${key}`)
  const format = useRecordFormat()
  const columns: ColumnDef<(typeof personalTransfers)[number]>[] = [
    {
      accessorKey: 'id',
      enableHiding: false,
      header: tr('transferId'),
      cell: ({ row }) => (
        <span className='font-mono text-xs'>{row.original.id}</span>
      ),
    },
    {
      accessorKey: 'amountCents',
      meta: { label: tr('transferAmount') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('transferAmount')} />
      ),
      cell: ({ row }) => (
        <span className='font-medium tabular-nums'>
          {format.money(row.original.amountCents)}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      meta: { label: tr('time') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('time')} />
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
  ]
  return (
    <DataTableFrame
      data={personalTransfers}
      columns={columns}
      label={tr('transfers')}
      searchPlaceholder={tr('searchTransfers')}
      searchText={(record) => record.id}
      initialSorting={[{ id: 'createdAt', desc: true }]}
    />
  )
}
