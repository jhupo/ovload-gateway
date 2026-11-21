import { CircleAlert, CloudAlert, Gauge, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MonitoringSnapshot } from '@/api/monitoring'
import type { UsageSummary } from '@/api/observability'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'

export function RequestOverview({
  data,
  snapshot,
}: {
  data: UsageSummary | undefined
  snapshot?: MonitoringSnapshot
}) {
  const { t, i18n } = useTranslation()
  const unknown = t('adminObservability.unknown')
  const points = snapshot?.points ?? []
  const firstMeasured = points.filter((point) => point.firstTokenMs !== null)
  const firstRequests = firstMeasured.reduce(
    (sum, point) => sum + point.firstTokenSamples,
    0
  )
  const firstToken = firstRequests
    ? `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(firstMeasured.reduce((sum, point) => sum + point.firstTokenMs! * point.firstTokenSamples, 0) / firstRequests)} ms`
    : unknown
  const number = (value: number | undefined) =>
    value === undefined
      ? unknown
      : new Intl.NumberFormat(i18n.language, {
          maximumFractionDigits: 2,
        }).format(value)
  const total = data?.logicalRequests.requestCount
  const successRate = total
    ? (data!.logicalRequests.successCount / total) * 100
    : null
  const failureRate = total
    ? (data!.logicalRequests.failureCount / total) * 100
    : null
  const cards = [
    {
      key: 'success',
      icon: ShieldCheck,
      label: t('dashboard.success'),
      value: successRate === null ? unknown : `${number(successRate)}%`,
      progress: successRate,
      rows: [
        [
          t('adminObservability.successfulRequests'),
          number(data?.logicalRequests.successCount),
        ],
        [t('usage.requests'), number(total)],
      ],
    },
    {
      key: 'request-errors',
      icon: CircleAlert,
      label: t('monitoring.requests.requestErrorsShort'),
      value: failureRate === null ? unknown : `${number(failureRate)}%`,
      progress: null,
      rows: [
        [
          t('adminObservability.failedRequests'),
          number(data?.logicalRequests.failureCount),
        ],
        [
          t('usage.callerError'),
          number(data?.logicalRequests.callerErrorCount),
        ],
      ],
    },
    {
      key: 'firstByte',
      icon: Gauge,
      label: t('monitoring.requests.firstByte'),
      value: firstToken,
      progress: null,
      rows: [
        [t('usage.averageDuration'), data?.averageLatencyMs ?? unknown],
        [t('usage.cancelled'), number(data?.logicalRequests.cancelledCount)],
      ],
    },
    {
      key: 'upstream-errors',
      icon: CloudAlert,
      label: t('monitoring.requests.upstreamErrorsShort'),
      value: number(data?.attempts.failureCount),
      progress: null,
      rows: [
        [t('usage.attempts'), number(data?.attempts.attemptCount)],
        [
          t('monitoring.requests.rateLimits'),
          number(data?.attempts.rateLimitedCount),
        ],
      ],
    },
  ]
  return (
    <section
      data-testid='request-overview'
      aria-labelledby='request-overview-title'
      className='min-w-0'
    >
      <h2 id='request-overview-title' className='sr-only'>
        {t('monitoring.requests.title')}
      </h2>
      <div className='grid grid-cols-2 gap-3 xl:grid-cols-4'>
        {cards.map(({ key, icon: Icon, label, value, progress, rows }) => (
          // ai-design-check-ignore-next-line use-shared-looks -- Reuse the existing compact monitoring metric-card layout.
          <article
            key={key}
            data-testid='request-metric'
            data-kind={key}
            className='flex min-h-36 min-w-0 flex-col rounded-xl border border-border/70 bg-card p-3 shadow-sm hover:border-border hover:bg-muted/20 sm:min-h-40 sm:p-4'
          >
            <div className='-my-1 flex min-w-0 items-center justify-between gap-1'>
              <div className='flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground'>
                <Icon aria-hidden className='size-3.5 shrink-0' />
                <h3>{label}</h3>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    type='button'
                    variant='link'
                    size='xs'
                    aria-label={`${t('monitoring.requests.details')}: ${label}`}
                  >
                    {t('monitoring.requests.details')}
                  </Button>
                </DialogTrigger>
                <DialogContent className='sm:max-w-md'>
                  <DialogHeader>
                    <DialogTitle>{label}</DialogTitle>
                    <DialogDescription className='sr-only'>
                      {t('monitoring.requests.detailDescription')}
                    </DialogDescription>
                  </DialogHeader>
                  <dl className='grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border bg-muted/20 p-4 text-sm'>
                    {rows.map(([title, detail]) => (
                      <div key={title}>
                        <dt className='text-xs text-muted-foreground'>
                          {title}
                        </dt>
                        <dd className='mt-1 font-medium tabular-nums'>
                          {detail}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </DialogContent>
              </Dialog>
            </div>
            <strong className='mt-2 text-2xl leading-none font-semibold break-all tabular-nums'>
              {value}
            </strong>
            {progress !== null && (
              <Progress
                value={progress}
                aria-label={label}
                className='mt-3 h-1.5 bg-muted [&_[data-slot=progress-indicator]]:bg-[var(--telemetry-2)]'
              />
            )}
            <dl className='mt-auto space-y-1.5 pt-3 text-xs'>
              {rows.map(([title, detail]) => (
                <div key={title} className='flex justify-between gap-3'>
                  <dt className='text-muted-foreground'>{title}</dt>
                  <dd className='font-medium tabular-nums'>{detail}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}
