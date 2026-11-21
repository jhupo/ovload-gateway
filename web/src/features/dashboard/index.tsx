import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  observability,
  observationWindow,
  type ObservationRange,
  type TrendKind,
} from '@/api/observability'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { useErrorToast } from '@/hooks/use-error-toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { RequestErrorToast } from '@/components/request-error-toast'
import {
  OverviewCards,
  SummaryCards,
  UsageTrend,
} from './components/operations'

export function Dashboard() {
  const owner = useIdentitySession((state) => state.session?.id)
  return <DashboardContent key={owner ?? 'signed-out'} />
}

function DashboardContent() {
  const { t } = useTranslation()
  const session = useIdentitySession((state) => state.session)
  useIdentitySession((state) => state.grants)
  const canRead = session?.audience === 'management' && allows('usage.read')
  const [range, setRange] = useState<ObservationRange>('today')
  const [granularity, setGranularity] = useState<'hour' | 'day'>('hour')
  const [kind, setKind] = useState<TrendKind>('usage')
  const [asOf, setAsOf] = useState(Date.now)
  const params = observationWindow(range, asOf)
  const trendParams = new URLSearchParams(params)
  trendParams.set('kind', kind)
  trendParams.set('granularity', granularity)
  const summary = useQuery({
    queryKey: [
      'admin-observability',
      session?.id,
      'dashboard',
      params.toString(),
    ],
    queryFn: ({ signal }) => observability.dashboard(params, signal),
    enabled: canRead,
    retry: false,
    gcTime: 0,
    placeholderData: keepPreviousData,
  })
  const trend = useQuery({
    queryKey: [
      'admin-observability',
      session?.id,
      'trend',
      trendParams.toString(),
    ],
    queryFn: ({ signal }) => observability.trend(trendParams, signal),
    enabled: canRead,
    retry: false,
    gcTime: 0,
    placeholderData: keepPreviousData,
  })
  const metrics = useQuery({
    queryKey: [
      'admin-observability',
      session?.id,
      'usage-summary',
      params.toString(),
    ],
    queryFn: ({ signal }) => observability.summary(params, signal),
    enabled: canRead,
    retry: false,
    gcTime: 0,
    placeholderData: keepPreviousData,
  })
  useErrorToast(metrics.error?.message, 'dashboard-metrics')
  return (
    <>
      <Header>
        <ProfileDropdown />
      </Header>
      <Main id='content' className='flex-1'>
        <div
          data-slot='page-heading'
          data-testid='dashboard-heading-row'
          className='flex flex-wrap items-center justify-between gap-3'
        >
          <h1 className='text-2xl font-semibold'>{t('dashboard.title')}</h1>
          <div
            data-testid='dashboard-filters'
            className='flex items-center gap-2'
          >
            <Select
              value={range}
              onValueChange={(value: ObservationRange) => {
                setRange(value)
                setGranularity(
                  value === 'today' || value === '24h' ? 'hour' : 'day'
                )
                setAsOf(Date.now())
              }}
            >
              <SelectTrigger
                aria-label={t('dashboard.range')}
                className='h-8 w-36'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['today', '24h', '7d', '30d'] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`dashboard.ranges.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={granularity}
              onValueChange={(value: 'hour' | 'day') => setGranularity(value)}
            >
              <SelectTrigger
                aria-label={t('dashboard.granularity')}
                className='h-8 w-28 bg-card text-xs'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='hour'>{t('dashboard.hour')}</SelectItem>
                <SelectItem
                  value='day'
                  disabled={range === 'today' || range === '24h'}
                >
                  {t('dashboard.day')}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              size='icon'
              variant='outline'
              className='size-8'
              aria-label={t('adminObservability.refresh')}
              disabled={
                !canRead ||
                summary.isFetching ||
                trend.isFetching ||
                metrics.isFetching
              }
              onClick={() => setAsOf(Date.now())}
            >
              <RefreshCw className='size-4' />
            </Button>
          </div>
        </div>
        {!canRead ? (
          <p role='alert'>{t('adminObservability.forbidden')}</p>
        ) : (
          <div
            data-testid='dashboard-content'
            className='space-y-4 sm:space-y-5'
          >
            {summary.isError && (
              <QueryError
                message={summary.error.message}
                retry={() => void summary.refetch()}
              />
            )}
            <OverviewCards data={summary.data} />
            <SummaryCards
              data={summary.data}
              averageLatency={metrics.data?.averageLatencyMs}
            />
            <Card
              data-testid='analytics-card'
              className='min-w-0 gap-4 overflow-hidden border-border/60 bg-card p-4 shadow-sm transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:transform-none dark:shadow-black/30 dark:hover:shadow-black/50'
            >
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <h2 className='text-sm font-semibold'>
                  {t('dashboard.operations')}
                </h2>
                <Select
                  value={kind}
                  onValueChange={(value: TrendKind) => setKind(value)}
                >
                  <SelectTrigger
                    aria-label={t('adminObservability.metric')}
                    className='h-8 w-36'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['usage', 'latency', 'errors'] as const).map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`adminObservability.trends.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {trend.isError && (
                <QueryError
                  message={trend.error.message}
                  retry={() => void trend.refetch()}
                />
              )}
              <UsageTrend data={trend.data} kind={trend.data?.kind ?? kind} />
            </Card>
            {summary.data && (
              <div className='flex flex-wrap justify-between gap-2 text-xs text-muted-foreground'>
                <span>
                  {summary.data.analytics.coverageStartDisplay ??
                    t('adminObservability.unknown')}{' '}
                  -{' '}
                  {summary.data.analytics.coverageEndDisplay ??
                    t('adminObservability.unknown')}
                </span>
                <span>
                  {t('adminObservability.updated', {
                    time: summary.data.analytics.generatedAtDisplay,
                  })}{' '}
                  · {summary.data.analytics.state}
                </span>
              </div>
            )}
          </div>
        )}
      </Main>
    </>
  )
}

function QueryError({
  message,
  retry,
}: {
  message: string
  retry: () => void
}) {
  return <RequestErrorToast message={message} retry={retry} />
}
