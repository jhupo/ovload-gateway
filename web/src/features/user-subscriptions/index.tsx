import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useClock } from '@/hooks/use-clock'
import { useCommercePage } from '@/hooks/use-commerce-page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ServerPagination } from '@/components/data-table/server-pagination'
import type { ServerFilters } from '@/components/data-table/server-state'
import { QueryState } from '@/components/query-state'
import { ContentSection } from '@/features/settings/components/content-section'
import { type UserSubscription } from './data'
import { SubscriptionDetails } from './details'
import { SubscriptionHistory } from './history-table'
import { SubscriptionCard } from './subscription-card'

export function UserSubscriptions() {
  const { t } = useTranslation()
  const tr = (key: string) => t(`userSubscriptions.${key}`)
  const [view, setView] = useState('current')
  const [filters, setFilters] = useState<ServerFilters>({
    search: '',
    columns: [],
  })
  const status =
    (
      filters.columns.find((c) => c.id === 'status')?.value as
        | string[]
        | undefined
    )?.join(',') || 'history'
  const { records, ready, error, refresh, tableState } = useCommercePage(
    'records',
    {
      search: view === 'current' ? '' : filters.search,
      status: view === 'current' ? 'current' : status,
    }
  )
  const now = useClock()
  const personalSubscriptions = useMemo<UserSubscription[]>(
    () =>
      records.map((r) => ({
        id: r.id,
        plan: r.plan.name,
        priceCents: r.plan.priceCents,
        startsAt: r.start,
        expiresAt: r.end,
        revoked: r.revoked,
        quotas: {
          daily: {
            limitMicros: r.plan.unlimited.daily
              ? null
              : r.plan.dailyCents * 10000,
            usedMicros: r.dailyUsed * 10000,
          },
          weekly: {
            limitMicros: r.plan.unlimited.weekly
              ? null
              : r.plan.weeklyCents * 10000,
            usedMicros: (r.weeklyUsed ?? 0) * 10000,
          },
          monthly: {
            limitMicros: r.plan.unlimited.monthly
              ? null
              : r.plan.monthlyCents * 10000,
            usedMicros: r.monthlyUsed * 10000,
          },
        },
      })),
    [records]
  )
  const [selected, setSelected] = useState<UserSubscription | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const statusKey = personalSubscriptions
    .map((r) =>
      r.revoked
        ? 'revoked'
        : Date.parse(r.expiresAt) <= now
          ? 'expired'
          : Date.parse(r.startsAt) > now
            ? 'scheduled'
            : 'active'
    )
    .join('|')
  const { current, history } = useMemo(() => {
    const statuses = statusKey.split('|')
    const current = personalSubscriptions.filter((_, index) =>
      ['active', 'scheduled'].includes(statuses[index])
    )
    const history = personalSubscriptions.filter(
      (_, index) => !['active', 'scheduled'].includes(statuses[index])
    )
    return { current, history }
  }, [personalSubscriptions, statusKey])
  function showDetails(record: UserSubscription, element: HTMLElement) {
    trigger.current = element
    setSelected(record)
  }
  if (!ready) return <QueryState error={error} retry={refresh} />
  return (
    <ContentSection title={t('userWorkspace.subscriptions')}>
      <Tabs
        value={view}
        onValueChange={setView}
        className='@container/subscriptions min-w-0 gap-5'
      >
        <TabsList
          aria-label={tr('views')}
          className='h-auto max-w-full flex-wrap justify-start'
        >
          <TabsTrigger value='current'>{tr('current')}</TabsTrigger>
          <TabsTrigger value='history'>{tr('history')}</TabsTrigger>
        </TabsList>
        <TabsContent value='current' className='m-0 space-y-4'>
          {current.length ? (
            current.map((record) => (
              <SubscriptionCard
                key={record.id}
                record={record}
                onDetails={showDetails}
              />
            ))
          ) : (
            <div className='flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground'>
              {t('commerce.noSubscriptions')}
            </div>
          )}
        </TabsContent>
        <TabsContent value='history' className='m-0'>
          <SubscriptionHistory
            records={history}
            onDetails={showDetails}
            server={tableState}
            onFilterChange={setFilters}
            filters={filters}
          />
        </TabsContent>
      </Tabs>
      {view === 'current' && <ServerPagination state={tableState} />}
      {selected && (
        <SubscriptionDetails
          record={selected}
          onClose={() => setSelected(null)}
          restoreFocus={() =>
            requestAnimationFrame(() => {
              const element = document.querySelector<HTMLElement>(
                `[data-subscription-detail="${selected.id}"]`
              )
              ;(element ?? trigger.current)?.focus()
            })
          }
        />
      )}
    </ContentSection>
  )
}
