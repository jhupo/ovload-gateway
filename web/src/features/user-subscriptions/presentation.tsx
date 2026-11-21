import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { type SubscriptionStatus } from './data'

export function SubscriptionStatusBadge({
  status,
}: {
  status: SubscriptionStatus
}) {
  const { t } = useTranslation()
  const classes = {
    active: 'bg-badge-success text-badge-success-foreground',
    scheduled: 'bg-badge-info text-badge-info-foreground',
    expired: 'bg-badge-neutral text-badge-neutral-foreground',
    revoked: 'bg-badge-danger text-badge-danger-foreground',
  }
  return (
    <Badge
      variant='outline'
      className={`shrink-0 border-transparent font-normal whitespace-nowrap ${classes[status]}`}
    >
      {t(`userSubscriptions.${status}`)}
    </Badge>
  )
}
