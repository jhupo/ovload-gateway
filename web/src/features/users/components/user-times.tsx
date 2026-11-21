import { useTranslation } from 'react-i18next'
import { type User } from '../data/schema'

export function UserTimes({ user }: { user: User }) {
  const { t, i18n } = useTranslation()
  const dateTime = new Intl.DateTimeFormat(
    i18n.resolvedLanguage === 'zh' ? 'zh-CN' : 'en-GB',
    {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }
  )
  return (
    <dl className='grid gap-1.5 text-[11px]'>
      {(
        [
          ['created', user.createdAt],
          ['last_active', user.lastActiveAt],
          ['last_called', user.lastCalledAt],
        ] as const
      ).map(([key, value]) => (
        <div key={key} className='grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3'>
          <dt className='text-muted-foreground'>{t('users.' + key)}</dt>
          <dd className='whitespace-nowrap tabular-nums'>
            {value ? (
              <time dateTime={value.toISOString()}>
                {dateTime.format(value)} UTC
              </time>
            ) : (
              t('featureAvailability.unknown')
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
