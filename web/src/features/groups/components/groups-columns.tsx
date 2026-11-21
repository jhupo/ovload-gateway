import type { ColumnDef } from '@tanstack/react-table'
import { Globe2, LockKeyhole, Grid2X2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AccountGroup } from '@/api/account-groups'
import {
  accountProviderLabel,
  aggregatePlatformCounts,
} from '@/lib/upstream-platforms'
import { formatUsd } from '@/lib/usd'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/data-table'
import { MetricList } from '@/components/data-table/metric-list'
import { retailMultiplierText } from '../data/retail-multiplier'
import { GroupActions, type GroupActionsOptions } from './group-actions'

export function useGroupsColumns(
  actions: GroupActionsOptions
): ColumnDef<AccountGroup>[] {
  const { t, i18n } = useTranslation()
  const unknown = t('featureAvailability.unknown')
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('groups.name')} />
      ),
      cell: ({ row }) => (
        <div className='w-44'>
          <span
            className='flex items-center gap-2 truncate font-medium text-foreground'
            title={row.original.name}
          >
            <span className='truncate'>{row.original.name}</span>
          </span>
          {row.original.description && (
            <span
              className='mt-0.5 block truncate text-xs text-muted-foreground'
              title={row.original.description}
            >
              {row.original.description}
            </span>
          )}
        </div>
      ),
      enableHiding: false,
      meta: { label: t('groups.name'), className: 'min-w-48' },
    },
    {
      id: 'platform',
      header: t('groups.platform'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='text-xs text-muted-foreground'>
          {row.original.platform
            ? accountProviderLabel(row.original.platform)
            : Object.entries(
                aggregatePlatformCounts(row.original.providerCounts)
              )
                .map(
                  ([provider, count]) =>
                    `${accountProviderLabel(provider)}: ${count}`
                )
                .join(', ') || t('channelGroups.none')}
        </span>
      ),
      meta: { label: t('groups.platform'), className: 'min-w-28' },
    },
    {
      id: 'multiplier',
      header: t('groups.rate'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='text-sm text-foreground tabular-nums'>
          {retailMultiplierText(row.original.retailMultiplierBps)}×
        </span>
      ),
      meta: { label: t('groups.rate'), className: 'min-w-20' },
    },
    {
      accessorKey: 'visibility',
      header: t('groups.type'),
      enableSorting: false,
      cell: ({ row }) => {
        const Icon = row.original.visibility === 'public' ? Globe2 : LockKeyhole
        return (
          <span className='flex items-center gap-2 text-sm'>
            <Icon
              className='size-3.5 text-muted-foreground'
              aria-hidden='true'
            />
            <span>{t(`groups.${row.original.visibility}`)}</span>
          </span>
        )
      },
      meta: { label: t('groups.type'), className: 'min-w-24' },
    },
    {
      id: 'accounts',
      header: t('groups.accounts'),
      enableSorting: false,
      cell: ({ row }) => (
        <MetricList className='gap-x-3 gap-y-0 leading-4'>
          {(['available', 'limited', 'total'] as const).map((key) => (
            <div key={key} className='contents'>
              <dt className='text-muted-foreground'>{t(`groups.${key}`)}</dt>
              <dd
                className={`text-left tabular-nums ${key === 'available' ? 'text-foreground' : key === 'limited' ? 'text-badge-warning-foreground' : 'text-muted-foreground'}`}
              >
                {row.original.accountSummary[key]}
              </dd>
            </div>
          ))}
        </MetricList>
      ),
      meta: { label: t('groups.accounts'), className: 'min-w-28' },
    },
    {
      id: 'capacity',
      header: t('groups.capacity'),
      enableSorting: false,
      cell: ({ row }) => {
        const { usedSlots: used, totalSlots: capacity } = row.original.capacity
        return (
          <Badge
            variant='warning'
            className='tabular-nums'
            aria-label={t('groups.capacity_label', {
              name: row.original.name,
              used: used ?? unknown,
              capacity: capacity ?? '∞',
            })}
          >
            <Grid2X2 className='size-3' aria-hidden='true' />
            {used ?? '—'} / {capacity ?? '∞'}
          </Badge>
        )
      },
      meta: { label: t('groups.capacity'), className: 'min-w-32' },
    },
    {
      id: 'usage',
      header: t('groups.usage'),
      enableSorting: false,
      cell: ({ row }) => (
        <MetricList className='gap-x-3 gap-y-0 py-0.5 leading-4'>
          {[
            [t('groups.today'), row.original.usage.todayUsd],
            [t('groups.yesterday'), row.original.usage.yesterdayUsd],
            [t('groups.lifetime'), row.original.usage.retainedTotalUsd],
          ].map(([label, value], index) => (
            <div key={label} className='contents'>
              <dt className='text-muted-foreground'>{label}</dt>
              <dd
                className={`text-start tabular-nums ${index === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
              >
                {formatUsd(value, i18n.language)}
              </dd>
            </div>
          ))}
        </MetricList>
      ),
      meta: { label: t('groups.usage'), className: 'min-w-40' },
    },
    {
      id: 'status',
      header: t('groups.status'),
      accessorFn: (row) => (row.enabled ? 'active' : 'disabled'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='flex items-center gap-2 text-sm'>
          <span
            className={`size-2 rounded-full ${row.original.enabled ? 'bg-badge-success-foreground' : 'bg-muted-foreground/40'}`}
            aria-hidden='true'
          />
          <span
            className={
              row.original.enabled ? 'text-foreground' : 'text-muted-foreground'
            }
          >
            {t(row.original.enabled ? 'groups.active' : 'groups.disabled')}
          </span>
        </span>
      ),
      meta: { label: t('groups.status'), className: 'min-w-24' },
    },
    {
      id: 'actions',
      header: () => (
        <span className='block pr-2 text-end'>{t('groups.actions')}</span>
      ),
      cell: ({ row }) => <GroupActions group={row.original} {...actions} />,
      enableHiding: false,
      enableSorting: false,
      meta: { label: t('groups.actions'), className: 'w-36 min-w-36' },
    },
  ]
}
