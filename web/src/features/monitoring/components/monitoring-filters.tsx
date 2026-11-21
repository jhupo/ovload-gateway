import { useTranslation } from 'react-i18next'
import { accountProviders } from '@/lib/upstream-platforms'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type MonitoringWindow = '1h' | '24h' | '7d' | '30d'

export function MonitoringFilters({
  provider,
  group,
  groups,
  onProviderChange,
  onGroupChange,
  window,
  onWindowChange,
}: {
  provider: string
  group: string
  groups: { id: string; name: string }[]
  onProviderChange: (value: string) => void
  onGroupChange: (value: string) => void
  window: MonitoringWindow
  onWindowChange: (value: MonitoringWindow) => void
}) {
  const { t } = useTranslation()
  return (
    <div
      data-testid='monitoring-filters'
      className='grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto'
    >
      {(['provider', 'group'] as const).map((key) => (
        <Select
          key={key}
          value={key === 'provider' ? provider : group}
          onValueChange={key === 'provider' ? onProviderChange : onGroupChange}
        >
          <SelectTrigger
            aria-label={t(`monitoring.filters.${key}`)}
            className='h-9 w-full min-w-0 bg-card text-xs sm:w-32'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>
              {t(
                `monitoring.filters.${key === 'provider' ? 'providers' : 'groups'}.all`
              )}
            </SelectItem>
            {(key === 'group'
              ? groups.map((item) => ({ value: item.id, label: item.name }))
              : accountProviders
            ).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      <Select
        value={window}
        onValueChange={(value: MonitoringWindow) => onWindowChange(value)}
      >
        <SelectTrigger
          aria-label={t('monitoring.filters.time')}
          className='h-9 w-full min-w-0 bg-card text-xs sm:w-32'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(['1h', '24h', '7d', '30d'] as const).map((value) => (
            <SelectItem key={value} value={value}>
              {t(`monitoring.filters.windows.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
