import { ArrowUpRight, CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  type UserSubscription,
  personalSubscriptionStatus,
  quotaPeriods,
  quotaState,
} from './data'
import { useSubscriptionFormat } from './format'
import { SubscriptionStatusBadge } from './presentation'

export function SubscriptionCard({
  record,
  onDetails,
}: {
  record: UserSubscription
  onDetails: (record: UserSubscription, trigger: HTMLElement) => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`userSubscriptions.${key}`)
  const format = useSubscriptionFormat()
  return (
    <Card
      className='gap-5 rounded-lg p-4 shadow-none sm:p-5'
      data-testid='owned-subscription'
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 space-y-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <h4 className='text-base font-semibold'>{record.plan}</h4>
            <SubscriptionStatusBadge
              status={personalSubscriptionStatus(record)}
            />
          </div>
          <div className='flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground'>
            <CalendarDays className='size-3.5' aria-hidden='true' />
            <span className='sr-only'>{tr('period')}</span>
            <time dateTime={record.startsAt}>
              {format.date(record.startsAt)}
            </time>
            <span>–</span>
            <time dateTime={record.expiresAt}>
              {format.date(record.expiresAt)}
            </time>
          </div>
        </div>
        <Button
          size='icon'
          variant='ghost'
          className='size-8 shrink-0'
          data-subscription-detail={record.id}
          aria-label={`${tr('details')} · ${record.id}`}
          title={tr('details')}
          onClick={(event) => onDetails(record, event.currentTarget)}
        >
          <ArrowUpRight className='size-4' />
        </Button>
      </div>
      <div className='grid min-w-0 gap-5 @xl/subscriptions:grid-cols-3'>
        {quotaPeriods.map((period) => {
          const quota = record.quotas[period],
            state = quotaState(quota)
          return (
            <div key={period} className='min-w-0 space-y-2.5'>
              <div className='text-xs text-muted-foreground'>{tr(period)}</div>
              <div className='flex flex-wrap items-baseline gap-x-1 text-sm tabular-nums'>
                <span className='font-semibold'>
                  {format.micros(quota.usedMicros)}
                </span>
                <span className='text-xs text-muted-foreground'>
                  /{' '}
                  {quota.limitMicros === null
                    ? tr('unlimited')
                    : format.micros(quota.limitMicros)}
                </span>
              </div>
              {state.percent !== null ? (
                <Progress
                  className={`h-1.5 ${state.exhausted ? '[&>[data-slot=progress-indicator]]:bg-badge-warning-foreground' : ''}`}
                  value={state.percent}
                  aria-label={`${record.plan} · ${tr(period)}`}
                  aria-valuetext={`${format.micros(quota.usedMicros)} / ${format.micros(quota.limitMicros!)}`}
                />
              ) : (
                <div className='flex h-1.5 items-center' aria-hidden='true'>
                  <div className='h-px w-full bg-border' />
                </div>
              )}
              <div
                className={`text-xs ${state.exhausted ? 'text-badge-warning-foreground' : 'text-muted-foreground'}`}
              >
                {state.remainingMicros === null
                  ? tr('unlimited')
                  : state.exhausted
                    ? tr('quotaReached')
                    : `${tr('remaining')} ${format.micros(state.remainingMicros)}`}
              </div>
            </div>
          )
        })}
      </div>
      <div className='flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs'>
        <span className='font-mono text-muted-foreground'>{record.id}</span>
        <span className='text-muted-foreground'>
          {tr('paid')}{' '}
          <span className='text-foreground tabular-nums'>
            {format.cents(record.priceCents)}
          </span>
        </span>
      </div>
    </Card>
  )
}
