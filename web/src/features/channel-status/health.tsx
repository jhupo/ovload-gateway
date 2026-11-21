import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { healthStyles, type ChannelHealth } from './health-styles'

export function HealthBadge({
  health,
  className,
}: {
  health: ChannelHealth
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <Badge
      variant='outline'
      className={cn(
        'gap-1.5 text-[11px]',
        healthStyles[health].badge,
        className
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', healthStyles[health].bar)}
      />
      {t(
        health === 'unavailable'
          ? 'featureAvailability.unavailable'
          : `channelStatus.health.${health}`
      )}
    </Badge>
  )
}
