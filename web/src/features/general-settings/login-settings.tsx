import { useTranslation } from 'react-i18next'
import { loginProviders } from '@/lib/login-providers'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfigurationSection } from '@/components/configuration-section'
import { SettingsControlCard } from '@/components/settings-control-card'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import { type LoginSettings } from './login'

function CapabilitySwitch({
  available,
  reason,
  ...props
}: React.ComponentProps<typeof SwitchLabeled> & {
  available: boolean
  reason: string
}) {
  if (available || props.checked) return <SwitchLabeled {...props} />
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className='inline-flex' tabIndex={0} aria-label={reason}>
          <SwitchLabeled {...props} disabled />
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}

export function RegistrationSettings({
  value,
  onChange,
  errors,
  mailAvailable,
}: {
  value: LoginSettings
  onChange: (value: LoginSettings) => void
  errors: Record<string, string>
  mailAvailable: boolean
}) {
  const { t } = useTranslation()
  const labelKey = (
    key: 'openRegistration' | 'emailVerification' | 'passwordRecoveryEnabled'
  ) => (key === 'passwordRecoveryEnabled' ? 'passwordRecovery' : key)
  return (
    <ConfigurationSection title={t('generalSettings.registration')}>
      <div className='grid gap-3 @md/settings:grid-cols-3'>
        {(
          [
            'openRegistration',
            'emailVerification',
            'passwordRecoveryEnabled',
          ] as const
        ).map((key) => (
          <SettingsControlCard
            key={key}
            compact
            title={t('generalSettings.' + labelKey(key))}
          >
            <CapabilitySwitch
              available={key === 'openRegistration' || mailAvailable}
              reason={t('generalSettings.mailRequired')}
              size='sm'
              containedMotion
              aria-label={t('generalSettings.' + labelKey(key))}
              checked={value[key]}
              onCheckedChange={(checked) =>
                onChange({ ...value, [key]: checked })
              }
            />
          </SettingsControlCard>
        ))}
      </div>
      <Separator />
      <div className='min-w-0 space-y-2'>
        <Label htmlFor='registration-email-whitelist'>
          {t('generalSettings.emailWhitelist')}
        </Label>
        <Textarea
          id='registration-email-whitelist'
          name='emailWhitelist'
          rows={3}
          autoComplete='off'
          spellCheck={false}
          value={value.emailWhitelist}
          placeholder={t('generalSettings.emailWhitelistPlaceholder')}
          aria-invalid={!!errors.emailWhitelist}
          aria-describedby={
            errors.emailWhitelist
              ? 'registration-email-whitelist-error'
              : undefined
          }
          className='scroll-mt-24 scroll-mb-24'
          onChange={(event) =>
            onChange({ ...value, emailWhitelist: event.target.value })
          }
        />
        {errors.emailWhitelist && (
          <p id='registration-email-whitelist-error' className='sr-only'>
            {errors.emailWhitelist}
          </p>
        )}
      </div>
    </ConfigurationSection>
  )
}
export function QuickLoginSettings({
  value,
  onChange,
  available,
}: {
  value: LoginSettings
  onChange: (value: LoginSettings) => void
  available: string[]
}) {
  const { t } = useTranslation()
  const names = { github: 'GitHub', google: 'Google', linuxdo: 'LinuxDo' }
  return (
    <ConfigurationSection title={t('generalSettings.quickLogin')}>
      <div className='grid gap-3 @md/settings:grid-cols-3'>
        {loginProviders.map((key) => (
          <SettingsControlCard key={key} title={names[key]} compact>
            <CapabilitySwitch
              available={available.includes(key)}
              reason={t('generalSettings.oauthRequired', {
                provider: names[key],
              })}
              size='sm'
              containedMotion
              aria-label={names[key] + ' ' + t('generalSettings.quickLogin')}
              checked={value.providers[key].enabled}
              onCheckedChange={(enabled) =>
                onChange({
                  ...value,
                  providers: { ...value.providers, [key]: { enabled } },
                })
              }
            />
          </SettingsControlCard>
        ))}
      </div>
    </ConfigurationSection>
  )
}
