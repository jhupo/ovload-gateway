import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/password-input'

export function AccountConnectionFields({
  baseUrl,
  apiKey,
  onBaseUrlChange,
  onApiKeyChange,
  invalid,
  validationId,
  replacement = false,
}: {
  baseUrl: string
  apiKey: string
  onBaseUrlChange: (value: string) => void
  onApiKeyChange: (value: string) => void
  invalid: string | null
  validationId: string
  replacement?: boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className='space-y-2'>
        <Label htmlFor='account-baseUrl'>{t('upstreamAccounts.baseUrl')}</Label>
        <Input
          id='account-baseUrl'
          type='url'
          maxLength={2048}
          autoComplete='off'
          spellCheck={false}
          value={baseUrl}
          aria-invalid={invalid === 'baseUrl'}
          aria-describedby={invalid === 'baseUrl' ? validationId : undefined}
          onChange={(e) => onBaseUrlChange(e.target.value)}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='account-apiKey'>
          {replacement ? t('upstreamAccounts.replacementKey') : 'API Key'}
        </Label>
        <PasswordInput
          id='account-apiKey'
          maxLength={16384}
          autoComplete='new-password'
          spellCheck={false}
          value={apiKey}
          placeholder={replacement ? t('upstreamAccounts.keepKey') : undefined}
          aria-invalid={invalid === 'apiKey'}
          aria-describedby={invalid === 'apiKey' ? validationId : undefined}
          onChange={(e) => onApiKeyChange(e.target.value)}
        />
      </div>
    </>
  )
}
