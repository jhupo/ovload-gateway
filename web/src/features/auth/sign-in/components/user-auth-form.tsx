import { useState } from 'react'
import { useForm, type FieldErrors } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { KeyRound, LogIn, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiRequest } from '@/api/client'
import { ApiError } from '@/api/errors'
import type { IdentitySession } from '@/api/types'
import { useIdentitySession } from '@/stores/identity-session'
import { managementHomePath } from '@/lib/route-authority'
import { Button } from '@/components/ui/button'
import { FloatingLabelField } from '@/components/shadcn-space/label/label-06'
import { HumanVerification } from '@/features/auth/human-verification'
import '../../auth.css'
import { Consent } from '../../consent'
import { OAuthButtons } from '../../oauth-buttons'
import { useAuthPolicy } from '../../use-auth-policy'

type Credentials = { login: string; password: string }

export function UserAuthForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const policy = useAuthPolicy()
  const [consent, setConsent] = useState<number | null>(null)
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<Credentials>({
    defaultValues: { login: '', password: '' },
  })
  function onInvalid(formErrors: FieldErrors<Credentials>) {
    toast.error(
      Object.values(formErrors)
        .map((error) => error?.message)
        .filter(Boolean)
        .join(' '),
      { id: 'sign-in-error' }
    )
  }
  async function onSubmit(data: Credentials) {
    const login = data.login.trim()
    let owner = useIdentitySession.getState().session?.id
    let authenticated = false
    try {
      const { data: session } = await apiRequest<IdentitySession>(
        'customer',
        '/auth/sessions',
        {
          method: 'POST',
          public: true,
          body: {
            login,
            password: data.password,
            consent_revision: policy.data?.supports_consent
              ? consent
              : undefined,
          },
        }
      )
      authenticated = true
      if (useIdentitySession.getState().session?.id !== owner) return
      queryClient.clear()
      useIdentitySession.getState().setSession(session)
      owner = session.id
      if (session.audience === 'management') {
        await useIdentitySession.getState().refreshPermissions()
        if (useIdentitySession.getState().session?.id !== session.id) return
      }
      await useIdentitySession.getState().refreshProfile()
      if (useIdentitySession.getState().session?.id !== session.id) return
      resetField('password')
      await navigate({
        to:
          session.audience === 'customer'
            ? '/user/dashboard'
            : managementHomePath(),
        replace: true,
      })
    } catch (error) {
      if (useIdentitySession.getState().session?.id !== owner) return
      if (authenticated) useIdentitySession.getState().clear()
      const message =
        !authenticated &&
        error instanceof ApiError &&
        error.status === 401 &&
        error.code === 'identity.unauthorized'
          ? t('auth.invalid_credentials')
          : authenticated
            ? t('auth.session_init_failed')
            : error instanceof Error
              ? error.message
              : t('auth.error')
      const diagnostic =
        error instanceof ApiError && error.requestId
          ? `${message} (${error.status}, ${t('auth.request_id')}: ${error.requestId})`
          : error instanceof ApiError
            ? `${message} (${error.status})`
            : message
      toast.error(diagnostic, { id: 'sign-in-error' })
    }
  }
  return (
    <form
      noValidate
      onSubmit={(event) => void handleSubmit(onSubmit, onInvalid)(event)}
      className='grid gap-6'
    >
      <FloatingLabelField
        label={t('auth.login')}
        icon={UserRound}
        type='text'
        autoComplete='username'
        aria-invalid={!!errors.login}
        {...register('login', {
          validate: (value) =>
            value.trim() ? true : t('identity.usernameRequired'),
        })}
      />
      <FloatingLabelField
        label={t('auth.password')}
        icon={KeyRound}
        type='password'
        autoComplete='current-password'
        aria-invalid={!!errors.password}
        {...register('password', {
          validate: (value) => {
            if (!value) return t('validation.password_required')
            if (value.length > 256) return t('validation.password_too_long')
            return true
          },
        })}
      />
      <Link
        to='/forgot-password'
        className='justify-self-end text-sm text-muted-foreground underline underline-offset-4 hover:text-primary'
      >
        {t('auth.forgot_password_link')}
      </Link>
      <Consent revision={consent} onChange={setConsent} />
      <OAuthButtons consent={consent} />
      <HumanVerification />
      <Button
        type='submit'
        className='auth-submit mt-2 h-11 w-full'
        disabled={isSubmitting}
        data-invalid={Object.keys(errors).length > 0}
      >
        <LogIn className='size-4' aria-hidden='true' />
        {t('auth.sign_in_btn')}
      </Button>
    </form>
  )
}
