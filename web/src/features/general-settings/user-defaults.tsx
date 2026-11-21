import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfigurationSection } from '@/components/configuration-section'

export type UserDefaults = {
  defaultBalance: string
  defaultConcurrency: string
  defaultRpm: string
}

export function UserDefaultsSettings({
  value,
  onChange,
  errors,
}: {
  value: UserDefaults
  onChange: (key: keyof UserDefaults, value: string) => void
  errors: Record<string, string>
}) {
  const { t } = useTranslation()
  return (
    <ConfigurationSection title={t('generalSettings.userDefaults')}>
      <div className='grid gap-4 @lg/settings:grid-cols-3'>
        {(
          [
            {
              key: 'defaultBalance',
              min: 0,
              max: '9999999999.9999999999',
              step: '0.0000000001',
            },
            { key: 'defaultConcurrency', min: 1, max: 10000, step: 1 },
            { key: 'defaultRpm', min: 1, max: 1000000, step: 1 },
          ] as const
        ).map(({ key, min, max, step }) => (
          <div key={key} className='min-w-0 space-y-2'>
            <Label htmlFor={'user-default-' + key}>
              {t('generalSettings.' + key)}
            </Label>
            <div className='relative'>
              {key === 'defaultBalance' && (
                <span
                  aria-hidden='true'
                  className='pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-muted-foreground'
                >
                  $
                </span>
              )}
              <Input
                id={'user-default-' + key}
                name={key}
                aria-invalid={!!errors[key]}
                aria-describedby={errors[key] ? key + '-error' : undefined}
                type='number'
                inputMode={key === 'defaultBalance' ? 'decimal' : 'numeric'}
                autoComplete='off'
                min={min}
                max={max}
                step={step}
                value={value[key]}
                className={
                  'scroll-mt-24 scroll-mb-24 tabular-nums' +
                  (key === 'defaultBalance' ? ' ps-7' : '')
                }
                onChange={(event) => onChange(key, event.target.value)}
              />
              {errors[key] && (
                <p id={key + '-error'} className='sr-only'>
                  {errors[key]}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ConfigurationSection>
  )
}
