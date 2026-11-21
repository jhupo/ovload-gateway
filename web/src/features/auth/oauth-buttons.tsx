import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiRequest } from '@/api/client'
import { Button } from '@/components/ui/button'
import { useAuthPolicy } from './use-auth-policy'

export function OAuthButtons({
  consent,
  email,
  displayName,
}: {
  consent: number | null
  email?: string
  displayName?: string
}) {
  const { t } = useTranslation()
  const policy = useAuthPolicy()
  const [pending, setPending] = useState(false)
  const providers = policy.data?.oauth_providers ?? []
  if (!providers.length) return null
  return (
    <div className='flex flex-wrap gap-2'>
      {providers.map((provider) => (
        <Button
          type='button'
          variant='outline'
          key={provider}
          disabled={
            pending ||
            !!(
              policy.data?.agreement?.enabled &&
              consent !== policy.data.revision
            )
          }
          onClick={async () => {
            setPending(true)
            try {
              const { data } = await apiRequest<{ authorization_url: string }>(
                'customer',
                `/auth/oauth/${provider}/start`,
                {
                  method: 'POST',
                  public: true,
                  body: {
                    email: email || undefined,
                    display_name: displayName || undefined,
                    consent_revision: consent,
                    invitation_code:
                      new URLSearchParams(window.location.search).get('ref') ||
                      undefined,
                  },
                }
              )
              window.location.assign(data.authorization_url)
            } catch (e) {
              setPending(false)
              toast.error(e instanceof Error ? e.message : t('auth.error'))
            }
          }}
        >
          {provider === 'github'
            ? 'GitHub'
            : provider === 'google'
              ? 'Google'
              : 'LinuxDo'}
        </Button>
      ))}
    </div>
  )
}
