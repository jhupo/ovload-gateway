import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiRequest } from '@/api/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/password-input'
import { RequestErrorToast } from '@/components/request-error-toast'
import { HumanVerification } from '@/features/auth/human-verification'
import { useAuthPolicy } from '../../use-auth-policy'

export function ForgotPasswordForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(() =>
    window.location.hash.startsWith('#confirm')
  )
  const [pending, setPending] = useState(false)
  const policy = useAuthPolicy()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.reportValidity()) return
    const values = new FormData(form)
    setPending(true)
    try {
      await apiRequest(
        'customer',
        confirming ? '/auth/password-reset/confirm' : '/auth/password-reset',
        {
          method: 'POST',
          public: true,
          body: confirming
            ? {
                token: values.get('token'),
                new_password: values.get('new_password'),
              }
            : { email: values.get('email') },
        }
      )
      form.reset()
      if (confirming) {
        toast.success(t('identity.passwordChanged'))
        await navigate({ to: '/sign-in' })
      } else {
        toast.success(t('identity.passwordResetSent'))
        setConfirming(true)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('auth.error'))
    } finally {
      setPending(false)
    }
  }
  return (
    <form onSubmit={submit} className={cn('grid gap-4', className)} {...props}>
      {policy.isError ? (
        <RequestErrorToast
          message={policy.error.message}
          retry={() => void policy.refetch()}
        />
      ) : policy.isPending ? (
        <div role='status'>{t('identity.loading')}</div>
      ) : (
        !policy.data.recovery_enabled && (
          <div role='status' className='text-sm text-muted-foreground'>
            {t('identity.recoveryDisabled')}
          </div>
        )
      )}
      {!confirming ? (
        <div className='space-y-2'>
          <Label htmlFor='recovery-email'>{t('auth.email')}</Label>
          <Input
            id='recovery-email'
            name='email'
            type='email'
            autoComplete='email'
            required
          />
        </div>
      ) : (
        <>
          <div className='space-y-2'>
            <Label htmlFor='recovery-token'>{t('identity.token')}</Label>
            <Input
              id='recovery-token'
              name='token'
              defaultValue={
                new URLSearchParams(
                  window.location.hash.split('&').slice(1).join('&')
                ).get('token') ?? ''
              }
              required
              pattern='[A-Za-z0-9_\-]{43}'
              autoComplete='off'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='recovery-password'>
              {t('identity.newPassword')}
            </Label>
            <PasswordInput
              id='recovery-password'
              name='new_password'
              required
              minLength={12}
              maxLength={256}
              autoComplete='new-password'
            />
          </div>
        </>
      )}
      <HumanVerification />
      <Button disabled={pending || !policy.data?.recovery_enabled}>
        {t('identity.resetPasswordConfirm')}
      </Button>
    </form>
  )
}
