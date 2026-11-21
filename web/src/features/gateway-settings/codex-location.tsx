import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useIdentitySession } from '@/stores/identity-session'
import { ConfigurationSection } from '@/components/configuration-section'
import { SettingsToggle } from '@/components/settings-toggle'
import { codexSettingsApi } from './codex-api'
import { CodexTextField } from './codex-controls'

export function CodexLocation({
  enabled,
  disabled,
  onEnabledChange,
}: {
  enabled: boolean
  disabled: boolean
  onEnabledChange: (value: boolean) => void
}) {
  const { t } = useTranslation('gatewayCodex')
  const owner = useIdentitySession((state) => state.session?.id)
  const query = useQuery({
    queryKey: ['server-egress-location', owner],
    queryFn: ({ signal }) => codexSettingsApi.localLocation(signal),
    enabled: !!owner,
    staleTime: 300000,
    retry: false,
  })
  const location =
    query.data?.status === 'detected' ? query.data.location : null
  return (
    <ConfigurationSection
      title={t('location')}
      description={t('localLocationDescription')}
      action={
        <SettingsToggle
          label={t('requestLocationEnabled')}
          checked={enabled}
          disabled={disabled}
          onCheckedChange={onEnabledChange}
        />
      }
    >
      <div className='grid min-w-0 grid-cols-1 gap-4 @xl/gateway:grid-cols-2'>
        {(['country', 'region', 'city', 'timezone'] as const).map((key) => (
          <CodexTextField
            key={key}
            label={t(key)}
            name={'requestLocation.' + key}
            value={location?.[key] ?? ''}
            placeholder={t(
              query.isPending ? 'localLocationLoading' : 'localLocationUnknown'
            )}
            readOnly
          />
        ))}
      </div>
    </ConfigurationSection>
  )
}
