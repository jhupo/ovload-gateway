import { useQuery } from '@tanstack/react-query'
import {
  Cpu,
  Database,
  ListChecks,
  MemoryStick,
  Network,
  Workflow,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { monitoringApi } from '@/api/monitoring'
import type { DashboardSummary } from '@/api/observability'
import { useIdentitySession } from '@/stores/identity-session'
import { Progress } from '@/components/ui/progress'
import { RequestErrorToast } from '@/components/request-error-toast'

export function SystemStatus({
  capacity,
}: {
  capacity: DashboardSummary['capacityInfo'] | undefined
}) {
  const { t, i18n } = useTranslation()
  const unknown = '—'
  const owner = useIdentitySession((s) => s.session?.id)
  const resources = useQuery({
    queryKey: ['monitoring-resources', owner],
    queryFn: ({ signal }) => monitoringApi.resources(signal),
    refetchInterval: 15000,
    retry: false,
  })
  const data = resources.data
  const memory = data?.process.memory
  const memoryPercent =
    memory?.total && memory.used != null
      ? (memory.used / memory.total) * 100
      : null
  const tr = (key: string) => t(`monitoring.systemLogs.${key}`)
  const n = (value: number | null | undefined) =>
    value == null
      ? unknown
      : new Intl.NumberFormat(i18n.language, {
          maximumFractionDigits: 1,
        }).format(value)
  const values: Record<string, string> = {
    cpu:
      data?.process.cpuPercent == null
        ? unknown
        : `${n(data.process.cpuPercent)}%`,
    memory: memoryPercent == null ? unknown : `${n(memoryPercent)}%`,
    database: `${n(data?.database.size)} / ${n(data?.database.max)}`,
    redis: `${n(data?.redis.connected)} / ${n(data?.redis.max)}`,
    concurrency: n(capacity?.usedSlots),
    jobs: n(data?.process.jobs.total),
  }
  const details: Record<string, string[]> = {
    cpu: [],
    memory: [
      `${n(memory?.used == null ? null : memory.used / 1073741824)} / ${n(memory?.total == null ? null : memory.total / 1073741824)} GiB`,
    ],
    database: [
      `${tr('dbActive')}: ${n(data ? data.database.size - data.database.idle : null)}`,
      `${tr('dbIdle')}: ${n(data?.database.idle)}`,
    ],
    redis: [`${tr('redisBlocked')}: ${n(data?.redis.blocked)}`],
    concurrency: [
      `${t('adminObservability.slotsTotal')}: ${n(capacity?.totalSlots)}`,
      `${t('adminObservability.slotsAvailable')}: ${n(capacity?.availableSlots)}`,
    ],
    jobs: [
      `${tr('jobsRunning')}: ${n(data?.process.jobs.running)}`,
      `${tr('jobsFailed')}: ${n(data?.process.jobs.failed)}`,
    ],
  }
  const cards = [
    { key: 'cpu', icon: Cpu },
    { key: 'memory', icon: MemoryStick },
    { key: 'database', icon: Database },
    { key: 'redis', icon: Network },
    { key: 'concurrency', icon: Workflow },
    { key: 'jobs', icon: ListChecks },
  ]
  return (
    <section data-testid='system-status' aria-labelledby='system-status-title'>
      <h2 id='system-status-title' className='sr-only'>
        {t('monitoring.systemStatus')}
      </h2>
      {resources.isError && (
        <RequestErrorToast
          message={resources.error.message}
          retry={() => void resources.refetch()}
        />
      )}
      <div aria-hidden className='mb-3 h-px bg-border/70 sm:mb-4' />
      <div className='grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6'>
        {cards.map(({ key, icon: Icon }) => (
          // ai-design-check-ignore-next-line use-shared-looks -- Reuse the existing compact monitoring metric-card layout.
          <article
            key={key}
            data-testid='system-card'
            className='group col-span-1 flex min-h-24 min-w-0 flex-col rounded-xl border border-border/70 bg-card p-3'
          >
            <div className='flex items-center gap-2 text-xs font-medium text-muted-foreground'>
              <span className='flex size-6 shrink-0 items-center justify-center rounded-md bg-muted group-hover:text-foreground'>
                <Icon aria-hidden className='size-3' />
              </span>
              <h3 className='min-w-0 truncate'>
                {t(`monitoring.system.${key}`)}
              </h3>
            </div>
            <div className='mt-2 text-lg leading-none font-semibold break-all tabular-nums sm:text-xl'>
              {values[key]}
            </div>
            {(key === 'cpu' || key === 'memory') && (
              <Progress
                value={
                  (key === 'cpu' ? data?.process.cpuPercent : memoryPercent) ??
                  null
                }
                aria-label={t(`monitoring.system.${key}`)}
                className='mt-2 h-1 bg-muted'
              />
            )}
            <div className='mt-auto pt-2 text-xs leading-4 text-muted-foreground tabular-nums'>
              {details[key].map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
