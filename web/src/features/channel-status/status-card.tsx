import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfigurationSection } from '@/components/configuration-section'
import { statusIntervals, type StatusGroup, type StatusWindow } from './data'
import { HealthBadge } from './health'

export function StatusCard({
  group,
  window,
}: {
  group: StatusGroup
  window: StatusWindow
}) {
  const { t } = useTranslation()
  const intervals = statusIntervals[window]
  return (
    <ConfigurationSection
      title={group.name}
      action={
        <HealthBadge health={group.enabled ? 'insufficient' : 'paused'} />
      }
      className='h-full'
    >
      <dl className='grid grid-cols-3 gap-3 px-2 py-1 sm:px-4'>
        {['cacheRate', 'availability', 'firstToken'].map((key, index) => (
          <div
            key={key}
            className={cn(
              'min-w-0',
              index === 1 && 'text-center',
              index === 2 && 'text-right'
            )}
          >
            <dt className='text-[11px] text-muted-foreground'>
              {t(`channelStatus.${key}`)}
            </dt>
            <dd className='mt-1.5 text-xl font-semibold tabular-nums'>-</dd>
          </div>
        ))}
      </dl>
      <div>
        <div className='mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground'>
          <span>{t('channelStatus.intervals', { count: intervals })}</span>
          <span>{t(`channelStatus.windows.${window}`)}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              role='img'
              tabIndex={0}
              aria-label={t('channelStatus.noHistory', { group: group.name })}
              className='flex h-3 gap-1 rounded-xs outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring'
            >
              {Array.from({ length: intervals }, (_, index) => (
                <span
                  key={index}
                  aria-hidden
                  className='min-w-0 flex-1 rounded-xs bg-muted-foreground/20'
                />
              ))}
            </div>
          </TooltipTrigger>
          <TooltipContent>{t('channelStatus.noData')}</TooltipContent>
        </Tooltip>
        <div className='mt-2 flex items-center justify-between text-[10px] text-muted-foreground'>
          <span>{t(`channelStatus.starts.${window}`)}</span>
          <span>{t('channelStatus.now')}</span>
        </div>
      </div>
    </ConfigurationSection>
  )
}
