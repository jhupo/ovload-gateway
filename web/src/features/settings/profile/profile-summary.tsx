import { useTranslation } from 'react-i18next'
import { formatUsd } from '@/lib/usd'
import { useWallet } from '@/hooks/use-wallet'
import { useWorkspaceProfile } from '@/hooks/use-workspace-profile'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ProfileAvatar } from './profile-avatar'

export function ProfileSummary() {
  const { t, i18n } = useTranslation()
  const { profile } = useWorkspaceProfile()
  const wallet = useWallet()
  const unknown = t('featureAvailability.unknown')
  const stats = [
    [
      t('personalProfile.balance'),
      formatUsd(wallet.data?.available_usd, i18n.language),
    ],
    [
      t('personalProfile.concurrency'),
      profile.concurrencyLimit == null
        ? unknown
        : String(profile.concurrencyLimit),
    ],
    [
      t('personalProfile.registered'),
      profile.registeredAt
        ? `${new Intl.DateTimeFormat(i18n.language, { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(profile.registeredAt))} UTC`
        : unknown,
    ],
  ]
  return (
    <section
      aria-label={t('personalProfile.account')}
      data-testid='profile-summary'
      className='grid min-w-0 items-center gap-6 @3xl/profile:grid-cols-[minmax(0,14rem)_max-content] @3xl/profile:gap-8'
    >
      <div className='flex min-w-0 items-center gap-4'>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type='button'
              aria-label={t('personalProfile.chooseAvatar')}
              aria-disabled='true'
              className='size-14 shrink-0 cursor-not-allowed rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
            >
              <ProfileAvatar
                username={profile.username}
                avatar={null}
                className='size-14 text-base'
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {t('personalProfile.chooseAvatar')} ·{' '}
            {t('featureAvailability.unavailable')}
          </TooltipContent>
        </Tooltip>
        <div className='min-w-0 space-y-1'>
          <h2 className='text-base font-semibold break-all'>
            {profile.username}
          </h2>
          <p className='text-sm break-all text-muted-foreground'>
            {profile.email}
          </p>
        </div>
      </div>
      <dl className='grid min-w-0 gap-x-8 gap-y-4 @xl/profile:grid-cols-[auto_auto_auto]'>
        {stats.map(([label, value]) => (
          <div
            key={label}
            className='flex min-w-0 items-center justify-between gap-4 @xl/profile:block @xl/profile:space-y-2'
          >
            <dt className='shrink-0 text-xs text-muted-foreground'>{label}</dt>
            <dd className='min-w-0 text-end text-sm font-semibold break-all tabular-nums @xl/profile:max-w-64 @xl/profile:text-start @xl/profile:text-base'>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
