import { Clock3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useClock } from '@/hooks/use-clock'
import { Progress } from '@/components/ui/progress'
import { type Subscription, day, money, nextReset, statusOf } from './data'

export function Quota({ row }: { row: Subscription }) {
  const { t } = useTranslation()
  const now = useClock()
  const active = statusOf(row, now) === 'active'
  return (
    <div className='space-y-2'>
      {(['daily', 'weekly', 'monthly'] as const).map((period) => {
        const used =
          period === 'daily'
            ? row.dailyUsed
            : period === 'weekly'
              ? (row.weeklyUsed ?? 0)
              : row.monthlyUsed
        const limit = row.plan[`${period}Cents`]
        const unlimited = row.plan.unlimited[period]
        const limitText = unlimited
          ? t('subscriptions.unlimited')
          : money(limit)
        const ratio = unlimited ? 0 : Math.min(100, (used / limit) * 100)
        const reset = nextReset(row, period, now)
        const remaining = reset - now
        const resetText =
          remaining >= day
            ? t('subscriptions.resetDays', {
                count: Math.ceil(remaining / day),
              })
            : t('subscriptions.resetHours', {
                count: Math.ceil(remaining / 3_600_000),
              })
        return (
          <div key={period} className='space-y-1'>
            <div className='flex items-center justify-between gap-3 text-xs'>
              <span className='text-muted-foreground'>
                {t('subscriptions.' + period)}
              </span>
              {active && reset < Date.parse(row.end) && (
                <span className='flex items-center gap-1 text-muted-foreground'>
                  <Clock3 aria-hidden className='size-3' />
                  {resetText}
                </span>
              )}
              <span className='whitespace-nowrap tabular-nums'>
                {money(used)}{' '}
                <span className='text-muted-foreground'>/ {limitText}</span>
              </span>
            </div>
            <Progress
              value={ratio}
              aria-label={t('subscriptions.' + period)}
              aria-valuetext={`${money(used)} / ${limitText}`}
              className={cn(
                'h-1.5 bg-muted',
                !active
                  ? '[&>[data-slot=progress-indicator]]:bg-muted-foreground/40'
                  : ratio >= 100
                    ? '[&>[data-slot=progress-indicator]]:bg-destructive'
                    : ratio >= 80
                      ? '[&>[data-slot=progress-indicator]]:bg-[var(--telemetry-4)]'
                      : '[&>[data-slot=progress-indicator]]:bg-[var(--telemetry-2)]'
              )}
            />
          </div>
        )
      })}
    </div>
  )
}
