import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Gift } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCommercePage } from '@/hooks/use-commerce-page'
import { useRecordFormat } from '@/hooks/use-record-format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DataTableColumnHeader, DataTableFrame } from '@/components/data-table'
import type { ServerFilters } from '@/components/data-table/server-state'
import { QueryState } from '@/components/query-state'
import { ContentSection } from '@/features/settings/components/content-section'
import { type PersonalRedemption } from './data'

export function UserRedeem() {
  const { t } = useTranslation()
  const tr = (key: string) => t(`personalRedeem.${key}`)
  const format = useRecordFormat()
  const [tableFilters, setTableFilters] = useState<ServerFilters>({
    search: '',
    columns: [],
  })
  const filter = (id: string) =>
    (
      tableFilters.columns.find((c) => c.id === id)?.value as
        | string[]
        | undefined
    )
      ?.map((v) => (id === 'type' && v === 'plan' ? 'subscription' : v))
      .join(',') ?? 'all'
  const { redemptions, execute, busy, ready, error, refresh, tableState } =
    useCommercePage('redemptions', {
      search: tableFilters.search,
      status: filter('status'),
      type: filter('type'),
    })

  const [code, setCode] = useState('')
  const personalRedemptions: PersonalRedemption[] = redemptions.map((r) => ({
    id: r.id,
    maskedCode: r.code.slice(0, 4) + '…' + r.code.slice(-4),
    type: r.type === 'subscription' ? 'plan' : r.type,
    creditCents: r.type === 'balance' ? r.value : null,
    plan:
      r.type === 'concurrency'
        ? '+' + r.value + ' ' + t('redemption.concurrency')
        : r.planName,
    days: null,
    redeemedAt: r.at,
  }))
  const columns: ColumnDef<PersonalRedemption>[] = [
    {
      accessorKey: 'maskedCode',
      enableHiding: false,
      header: tr('code'),
      cell: ({ row }) => (
        <span className='font-mono text-xs'>{row.original.maskedCode}</span>
      ),
    },
    {
      accessorKey: 'type',
      meta: { label: tr('type') },
      header: tr('type'),
      filterFn: (row, id, values: string[]) =>
        values.includes(row.getValue(id)),
      cell: ({ row }) => (
        <Badge variant='secondary' className='font-normal'>
          {tr(row.original.type)}
        </Badge>
      ),
    },
    {
      id: 'benefit',
      accessorFn: (record) => record.plan ?? String(record.creditCents),
      meta: { label: tr('benefit') },
      header: tr('benefit'),
      cell: ({ row }) =>
        row.original.creditCents !== null ? (
          <span className='font-medium tabular-nums'>
            +{format.money(row.original.creditCents)}
          </span>
        ) : (
          <div className='space-y-1'>
            <div className='font-medium'>{row.original.plan}</div>
            <div className='text-xs text-muted-foreground'>
              {row.original.days
                ? t('personalRedeem.days', { count: row.original.days })
                : ''}
            </div>
          </div>
        ),
    },
    {
      accessorKey: 'redeemedAt',
      meta: { label: tr('time') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={tr('time')} />
      ),
      cell: ({ row }) => (
        <time
          dateTime={row.original.redeemedAt}
          className='text-xs text-muted-foreground tabular-nums'
        >
          {format.date(row.original.redeemedAt)}
        </time>
      ),
    },
  ]
  if (!ready) return <QueryState error={error} retry={refresh} />
  return (
    <ContentSection title={t('userWorkspace.redeem')}>
      <div className='space-y-8'>
        <form
          className='max-w-xl space-y-3'
          onSubmit={(event) => {
            event.preventDefault()
            if (!code.trim() || busy) return
            void execute({ action: 'redeem', code: code.trim() })
              .then(() => {
                setCode('')
                toast.success(t('commerce.redeemed'))
              })
              .catch(() => {})
          }}
        >
          <Label htmlFor='personal-redemption-code'>{tr('code')}</Label>
          <div className='flex flex-wrap items-center gap-3'>
            <Input
              id='personal-redemption-code'
              disabled={busy}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              maxLength={128}
              autoComplete='off'
              spellCheck={false}
              placeholder={tr('placeholder')}
              className='min-w-0 flex-1 basis-56 font-mono'
            />
            <Button type='submit' disabled={busy || !code.trim()}>
              <Gift className='size-4' />
              {tr('submit')}
            </Button>
          </div>
        </form>
        <section
          className='min-w-0 space-y-4'
          aria-labelledby='personal-redemption-history'
        >
          <h4
            id='personal-redemption-history'
            className='text-base font-semibold'
          >
            {tr('history')}
          </h4>
          <DataTableFrame
            server={tableState}
            onFilterChange={setTableFilters}
            filterState={tableFilters}
            data={personalRedemptions}
            columns={columns}
            label={tr('history')}
            searchPlaceholder={tr('search')}
            searchText={(record) => `${record.maskedCode} ${record.plan ?? ''}`}
            initialSorting={[{ id: 'redeemedAt', desc: true }]}
            facetedFilters={[
              {
                columnId: 'type',
                title: tr('type'),
                options: ['balance', 'plan'].map((value) => ({
                  value,
                  label: tr(value),
                })),
              },
            ]}
          />
        </section>
      </div>
    </ContentSection>
  )
}
