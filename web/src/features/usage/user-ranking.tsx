import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { apiRequest } from '@/api/client'
import { useIdentitySession } from '@/stores/identity-session'
import { formatUsd } from '@/lib/usd'
import { useErrorToast } from '@/hooks/use-error-toast'
import { Button } from '@/components/ui/button'
import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableFrame } from '@/components/data-table'
import { QueryState } from '@/components/query-state'

export type RankingRow = {
  user_id: string
  tenant_id: string
  user: string
  email: string
  requests: number
  tokens: number | null
  charge_usd: string | null
  cost_usd: string | null
}

export function UserRanking({
  params,
  onSelect,
}: {
  params: URLSearchParams
  onSelect: (row: RankingRow) => void
}) {
  const { t, i18n } = useTranslation()
  const owner = useIdentitySession((state) => state.session?.id)
  const result = useQuery({
    queryKey: ['user-usage-ranking', owner, params.toString()],
    queryFn: ({ signal }) =>
      apiRequest<{ items: RankingRow[] }>(
        'management',
        `/usage/ranking?${params}`,
        { signal }
      ).then((r) => r.data.items),
    retry: false,
  })
  useErrorToast(result.error?.message, 'usage-ranking')
  const rows = (result.data ?? []).map((row, index) => ({
    ...row,
    id: `${row.tenant_id}:${row.user_id}`,
    rank: index + 1,
  }))
  const tr = (key: string) => t(`usage.${key}`)
  const user = (row: RankingRow) => (
    <div className='min-w-0'>
      <Button
        variant='link'
        onClick={() => onSelect(row)}
        className='h-auto max-w-full p-0 text-sm'
      >
        <span className='truncate'>{row.user}</span>
      </Button>
      <p className='truncate text-xs text-muted-foreground'>{row.email}</p>
    </div>
  )
  const fields = [
    {
      id: 'rank',
      size: 70,
      value: (row: (typeof rows)[number]) => row.rank,
      cell: (row: (typeof rows)[number]) => row.rank,
    },
    { id: 'user', size: 230, value: (row: RankingRow) => row.user, cell: user },
    {
      id: 'requests',
      size: 100,
      value: (row: RankingRow) => row.requests,
      cell: (row: RankingRow) => row.requests.toLocaleString(i18n.language),
    },
    {
      id: 'token',
      size: 120,
      value: (row: RankingRow) => row.tokens,
      cell: (row: RankingRow) =>
        row.tokens?.toLocaleString(i18n.language) ?? '-',
    },
    {
      id: 'charge',
      size: 120,
      value: (row: RankingRow) => row.charge_usd,
      cell: (row: RankingRow) =>
        row.charge_usd === null
          ? '-'
          : formatUsd(row.charge_usd, i18n.language),
    },
    {
      id: 'cost',
      size: 120,
      value: (row: RankingRow) => row.cost_usd,
      cell: (row: RankingRow) =>
        row.cost_usd === null ? '-' : formatUsd(row.cost_usd, i18n.language),
    },
  ]
  const columns: ColumnDef<(typeof rows)[number]>[] = fields.map((field) => ({
    id: field.id,
    size: field.size,
    meta: { label: tr(field.id) },
    accessorFn: field.value,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={tr(field.id)} />
    ),
    cell: ({ row }) => (
      <div className='tabular-nums'>{field.cell(row.original)}</div>
    ),
  }))
  if (!result.data)
    return <QueryState error={result.error} retry={result.refetch} />
  return (
    <div
      aria-busy={result.isFetching}
      className='relative flex h-[max(500px,calc(100svh-390px))] min-h-0 flex-col gap-4'
    >
      <DataTableFrame
        data={rows}
        columns={columns}
        label={tr('ranking')}
        mobile={(row) => (
          <div className='space-y-3 text-xs'>
            <div className='flex items-center gap-3'>
              <span className='text-muted-foreground tabular-nums'>
                #{row.rank}
              </span>
              {user(row)}
            </div>
            <dl className='grid grid-cols-2 gap-3'>
              {fields.slice(2).map((field) => (
                <div key={field.id}>
                  <dt className='text-muted-foreground'>{tr(field.id)}</dt>
                  <dd className='mt-1 font-medium tabular-nums'>
                    {field.cell(row)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      />
    </div>
  )
}
