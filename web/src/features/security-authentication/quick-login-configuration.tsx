import { useTranslation } from 'react-i18next'
import { loginProviders, type QuickLoginConfig } from '@/lib/login-providers'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ConfigurationSection } from '@/components/configuration-section'
import { SettingsControlCard } from '@/components/settings-control-card'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'

export function QuickLoginConfiguration({
  value,
  onChange,
  errors,
  secrets = {},
  hasSecrets = {},
  onSecretChange,
}: {
  value: QuickLoginConfig
  onChange: (value: QuickLoginConfig) => void
  errors: Record<string, string>
  secrets?: Record<string, string>
  hasSecrets?: Record<string, boolean>
  onSecretChange?: (name: string, value: string) => void
}) {
  const { t } = useTranslation()
  const names = { github: 'GitHub', google: 'Google', linuxdo: 'LinuxDo' }
  return (
    <ConfigurationSection title={t('generalSettings.quickLogin')}>
      <div className='grid items-end gap-4 @lg/security:grid-cols-2'>
        <SettingsControlCard
          title={t('generalSettings.identityBinding')}
          compact
        >
          <SwitchLabeled
            size='sm'
            containedMotion
            aria-label={t('generalSettings.identityBinding')}
            checked={value.identityBindingEnabled}
            onCheckedChange={(identityBindingEnabled) =>
              onChange({ ...value, identityBindingEnabled })
            }
          />
        </SettingsControlCard>
        <div className='min-w-0 space-y-2'>
          <Label htmlFor='pending-identity-hours'>
            {t('generalSettings.pendingIdentityLifetime')}
          </Label>
          <div className='flex items-center gap-2'>
            <Input
              id='pending-identity-hours'
              name='pendingIdentityHours'
              type='number'
              inputMode='numeric'
              min={1}
              max={168}
              step={1}
              value={value.pendingIdentityHours}
              aria-invalid={!!errors.pendingIdentityHours}
              aria-describedby={
                errors.pendingIdentityHours
                  ? 'pending-identity-error'
                  : undefined
              }
              className='scroll-mt-24 scroll-mb-24'
              onChange={(event) =>
                onChange({ ...value, pendingIdentityHours: event.target.value })
              }
            />
            <span className='shrink-0 text-xs text-muted-foreground'>
              {t('generalSettings.hours')}
            </span>
          </div>
          {errors.pendingIdentityHours && (
            <p id='pending-identity-error' className='sr-only'>
              {errors.pendingIdentityHours}
            </p>
          )}
        </div>
      </div>
      <Separator />
      <div className='grid gap-3'>
        {loginProviders.map((key) => {
          const provider = value.providers[key]
          const patch = (next: Partial<typeof provider>) =>
            onChange({
              ...value,
              providers: {
                ...value.providers,
                [key]: { ...provider, ...next },
              },
            })
          return (
            <ConfigurationSection
              key={key}
              title={names[key]}
              contentClassName='@container/provider'
            >
              <div className='grid gap-4 @lg/provider:grid-cols-2'>
                <div className='min-w-0 space-y-2'>
                  <Label htmlFor={key + '-client-id'}>Client ID</Label>
                  <Input
                    id={key + '-client-id'}
                    name={key + '-client-id'}
                    value={provider.clientId}
                    autoComplete='off'
                    spellCheck={false}
                    maxLength={200}
                    aria-invalid={!!errors[key + 'ClientId']}
                    aria-describedby={
                      errors[key + 'ClientId']
                        ? key + '-client-error'
                        : undefined
                    }
                    onChange={(event) =>
                      patch({ clientId: event.target.value })
                    }
                  />
                  {errors[key + 'ClientId'] && (
                    <p id={key + '-client-error'} className='sr-only'>
                      {errors[key + 'ClientId']}
                    </p>
                  )}
                </div>
                <div className='min-w-0 space-y-2'>
                  <Label htmlFor={key + '-secret'}>Client Secret</Label>
                  <Input
                    id={key + '-secret'}
                    type='password'
                    autoComplete='new-password'
                    value={secrets[key] ?? ''}
                    onChange={(e) => onSecretChange?.(key, e.target.value)}
                    placeholder={
                      hasSecrets[key] ? '已配置，留空保留' : 'Client Secret'
                    }
                  />
                </div>
              </div>
              <div className='space-y-2'>
                <Label htmlFor={key + '-callback'}>
                  {t('generalSettings.callbackUrl')}
                </Label>
                <Input
                  id={key + '-callback'}
                  name={key + '-callback'}
                  type='url'
                  value={provider.callbackUrl}
                  autoComplete='off'
                  spellCheck={false}
                  maxLength={2048}
                  placeholder='https://example.com/callback'
                  aria-invalid={!!errors[key + 'Callback']}
                  aria-describedby={
                    errors[key + 'Callback']
                      ? key + '-callback-error'
                      : undefined
                  }
                  onChange={(event) =>
                    patch({ callbackUrl: event.target.value })
                  }
                />
                {errors[key + 'Callback'] && (
                  <p id={key + '-callback-error'} className='sr-only'>
                    {errors[key + 'Callback']}
                  </p>
                )}
              </div>
            </ConfigurationSection>
          )
        })}
      </div>
    </ConfigurationSection>
  )
}
