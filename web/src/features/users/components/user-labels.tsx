import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { type User } from '../data/schema'

export function UserRoleLabel({ role }: { role: User['role'] }) {
  const { t } = useTranslation()
  return (
    <span className='inline-flex items-center gap-1.5 text-xs text-muted-foreground'>
      {t(`users.roles.${role}`)}
    </span>
  )
}

export function UserStatusLabel({ status }: { status: User['status'] }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap',
        status === 'active' ? 'text-[var(--telemetry-2)]' : 'text-destructive'
      )}
    >
      <span className='size-1.5 rounded-full bg-current' aria-hidden='true' />
      {t(`users.statuses.${status}`)}
    </span>
  )
}
