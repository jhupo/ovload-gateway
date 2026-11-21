import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { loadMonitoring } from '@/api/monitoring'
import { observability } from '@/api/observability'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { useSettingsGroups } from '@/hooks/use-settings-options'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { RequestErrorToast } from '@/components/request-error-toast'
import { ActiveRequests } from './components/active-requests'
import {
  MonitoringFilters,
  type MonitoringWindow,
} from './components/monitoring-filters'
import { ProviderThroughput } from './components/provider-throughput'
import { RequestOverview } from './components/request-overview'
import { SystemLogs } from './components/system-logs'
import { SystemStatus } from './components/system-status'

export function Monitoring() {
  const owner = useIdentitySession((state) => state.session?.id)
  return <MonitoringContent key={owner ?? 'signed-out'} />
}

function MonitoringContent() {
  const { t } = useTranslation()
  const session = useIdentitySession((state) => state.session)
  useIdentitySession((state) => state.grants)
  const canRead = session?.audience === 'management' && allows('usage.read')
  const [window, setWindow] = useState<MonitoringWindow>('1h')
  const [asOf, setAsOf] = useState(Date.now)
  const [provider, setProvider] = useState('all')
  const [group, setGroup] = useState('all')
  const [activePage, setActivePage] = useState(0)
  const [activePageSize, setActivePageSize] = useState(20)
  const groups = useSettingsGroups()
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setAsOf(Date.now())
    }, 15_000)
    return () => clearInterval(timer)
  }, [])
  const snapshotParams = new URLSearchParams({
    from: new Date(
      asOf -
        { '1h': 3600, '24h': 86400, '7d': 604800, '30d': 2592000 }[window] *
          1000
    ).toISOString(),
    to: new Date(asOf).toISOString(),
  })
  if (provider !== 'all') snapshotParams.set('provider', provider)
  if (group !== 'all') snapshotParams.set('group_id', group)
  snapshotParams.set('active_page', String(activePage + 1))
  snapshotParams.set('active_page_size', String(activePageSize))
  const snapshot = useQuery({
    queryKey: ['monitoring-snapshot', session?.id, snapshotParams.toString()],
    queryFn: ({ signal }) => loadMonitoring(snapshotParams, signal),
    enabled: canRead,
    retry: false,
    placeholderData: keepPreviousData,
    gcTime: 0,
  })
  const params = new URLSearchParams({
    startTime: snapshotParams.get('from')!,
    endTime: snapshotParams.get('to')!,
  })
  params.set('kind', 'errors')
  const summary = useQuery({
    queryKey: [
      'admin-observability',
      session?.id,
      'monitoring',
      params.toString(),
    ],
    queryFn: ({ signal }) => observability.dashboard(params, signal),
    enabled: canRead,
    retry: false,
    placeholderData: keepPreviousData,
    gcTime: 0,
  })
  const errorParams = new URLSearchParams(params)
  errorParams.delete('kind')
  if (provider !== 'all') errorParams.set('provider', provider)
  if (group !== 'all') errorParams.set('groupId', group)
  const usage = useQuery({
    queryKey: [
      'admin-observability',
      session?.id,
      'usage-summary',
      errorParams.toString(),
    ],
    queryFn: ({ signal }) => observability.summary(errorParams, signal),
    enabled: canRead,
    retry: false,
    placeholderData: keepPreviousData,
    gcTime: 0,
  })
  return (
    <>
      <Header>
        <ProfileDropdown />
      </Header>
      <Main id='content' className='flex flex-1 flex-col'>
        <div
          data-slot='page-heading'
          className='flex flex-wrap items-center justify-between gap-3'
        >
          <div className='flex items-center gap-3'>
            {/* ai-design-check-ignore-next-line use-shared-looks -- Existing page heading; the project has no shared Heading component. */}
            <h1 className='text-2xl font-bold tracking-tight text-balance'>
              {t('monitoring.title')}
            </h1>
          </div>
          <div className='flex items-center gap-2'>
            <MonitoringFilters
              provider={provider}
              group={group}
              groups={groups}
              onProviderChange={(value) => {
                setActivePage(0)
                setProvider(value)
                setAsOf(Date.now())
              }}
              onGroupChange={(value) => {
                setActivePage(0)
                setGroup(value)
                setAsOf(Date.now())
              }}
              window={window}
              onWindowChange={(value) => {
                setWindow(value)
                setAsOf(Date.now())
              }}
            />
            <Button
              size='icon'
              variant='outline'
              aria-label={t('adminObservability.refresh')}
              disabled={!canRead || summary.isFetching || usage.isFetching}
              onClick={() => setAsOf(Date.now())}
            >
              <RefreshCw className='size-4' />
            </Button>
          </div>
        </div>
        {!canRead ? (
          <p role='alert'>{t('adminObservability.forbidden')}</p>
        ) : (
          <div data-testid='monitoring-content' className='grid gap-4 sm:gap-5'>
            {snapshot.isError && (
              <LoadError
                message={snapshot.error.message}
                retry={() => void snapshot.refetch()}
              />
            )}
            {usage.isError && (
              <LoadError
                message={usage.error.message}
                retry={() => void usage.refetch()}
              />
            )}
            {summary.isError && (
              <LoadError
                message={summary.error.message}
                retry={() => void summary.refetch()}
              />
            )}
            <div className='min-w-0 xl:col-span-2'>
              <RequestOverview data={usage.data} snapshot={snapshot.data} />
            </div>
            <div className='grid min-w-0 gap-4 sm:gap-5 xl:col-span-2 xl:grid-cols-[minmax(360px,1fr)_minmax(460px,1.65fr)]'>
              <ActiveRequests
                rows={snapshot.data?.active}
                summary={snapshot.data?.activeSummary}
                page={
                  snapshot.data
                    ? snapshot.data.activeSummary.page - 1
                    : activePage
                }
                size={activePageSize}
                onPageChange={setActivePage}
                onPageSizeChange={(value) => {
                  setActivePageSize(value)
                  setActivePage(0)
                }}
              />
              <ProviderThroughput data={snapshot.data} />
            </div>
            <div className='min-w-0 xl:col-span-2'>
              <SystemStatus capacity={summary.data?.capacityInfo} />
            </div>
            <div className='min-w-0 xl:col-span-2'>
              <SystemLogs
                key={`${window}:${provider}:${group}`}
                owner={session?.id}
                params={errorParams}
                enabled={canRead}
              />
            </div>
          </div>
        )}
      </Main>
    </>
  )
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <RequestErrorToast message={message} retry={retry} />
}
