import { useState } from 'react'
import { z } from 'zod'
import { useForm, useWatch, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Mail, UserRound, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiRequest } from '@/api/client'
import { Button } from '@/components/ui/button'
import { RequestErrorToast } from '@/components/request-error-toast'
import { FloatingLabelField } from '@/components/shadcn-space/label/label-06'
import { HumanVerification } from '@/features/auth/human-verification'
import '../../auth.css'
import { Consent } from '../../consent'
import { OAuthButtons } from '../../oauth-buttons'
import { useAuthPolicy } from '../../use-auth-policy'
import { EmailVerification } from './email-verification'

type Registration = {
  email: string
  display_name: string
  password: string
  confirmPassword: string
}

export function SignUpForm() {
  const { t } = useTranslation()
  const [verifying, setVerifying] = useState(
    () => window.location.hash === '#verify-email'
  )
  const policy = useAuthPolicy()
  const [invitation, setInvitation] = useState(
    () => new URLSearchParams(window.location.search).get('ref') ?? ''
  )
  const [consent, setConsent] = useState<number | null>(null)
  const schema = z
    .object({
      email: z.email(t('auth.email_invalid')),
      display_name: z.string().trim().min(1).max(160),
      password: z
        .string()
        .min(12, t('identity.passwordLength'))
        .max(256, t('identity.passwordLength')),
      confirmPassword: z
        .string()
        .min(1, t('validation.confirm_password_required')),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('validation.passwords_not_match'),
      path: ['confirmPassword'],
    })
  const {
    register,
    control,
    handleSubmit,
    getValues,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<Registration>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      display_name: '',
      password: '',
      confirmPassword: '',
    },
  })
  const oauthEmail = useWatch({ control, name: 'email' })
  const oauthDisplayName = useWatch({ control, name: 'display_name' })
  function onInvalid(errors: FieldErrors<Registration>) {
    toast.error(
      Object.values(errors)
        .map((error) => error?.message)
        .filter(Boolean)
        .join(' '),
      { id: 'sign-up-error' }
    )
  }
  async function submit(data: Registration) {
    try {
      await apiRequest('customer', '/auth/registrations', {
        method: 'POST',
        public: true,
        body: {
          email: data.email,
          display_name: data.display_name,
          password: data.password,
          invitation_code: invitation.trim() || undefined,
          ...(policy.data?.supports_consent
            ? { consent_revision: consent }
            : {}),
        },
      })
      resetField('password')
      resetField('confirmPassword')
      toast.success(t('identity.requestAccepted'))
      if (policy.data?.verification_required) setVerifying(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('auth.error'), {
        id: 'sign-up-error',
      })
    }
  }
  if (verifying)
    return (
      <EmailVerification
        email={getValues('email')}
        onBack={() => setVerifying(false)}
      />
    )
  return (
    <form
      noValidate
      onSubmit={handleSubmit(submit, onInvalid)}
      className='auth-step grid gap-6'
    >
      {policy.isError ? (
        <RequestErrorToast
          message={policy.error.message}
          retry={() => void policy.refetch()}
        />
      ) : policy.isPending ? (
        <div role='status'>{t('identity.loading')}</div>
      ) : (
        !policy.data.registration_enabled && (
          <div role='status' className='text-sm text-muted-foreground'>
            {t('identity.registrationDisabled')}
          </div>
        )
      )}
      <FloatingLabelField
        label={t('identity.displayName')}
        icon={UserRound}
        type='text'
        autoComplete='nickname'
        aria-invalid={!!errors.display_name}
        {...register('display_name')}
      />
      <FloatingLabelField
        label={t('auth.email')}
        icon={Mail}
        type='email'
        autoComplete='username'
        aria-invalid={!!errors.email}
        {...register('email')}
      />
      <FloatingLabelField
        label={t('auth.password')}
        icon={KeyRound}
        type='password'
        autoComplete='new-password'
        aria-invalid={!!errors.password}
        {...register('password')}
      />
      <FloatingLabelField
        label={t('auth.confirm_password')}
        icon={KeyRound}
        type='password'
        autoComplete='new-password'
        aria-invalid={!!errors.confirmPassword}
        {...register('confirmPassword')}
      />
      <FloatingLabelField
        label={t('commerce.invitationCode')}
        icon={KeyRound}
        type='text'
        autoComplete='off'
        maxLength={32}
        value={invitation}
        onChange={(event) => setInvitation(event.target.value)}
      />
      <Consent revision={consent} onChange={setConsent} />
      {policy.data?.registration_enabled && (
        <OAuthButtons
          consent={consent}
          email={oauthEmail}
          displayName={oauthDisplayName}
        />
      )}
      <HumanVerification />
      <Button
        type='submit'
        className='auth-submit mt-2 h-11 w-full'
        disabled={
          isSubmitting ||
          (!policy.data?.registration_enabled && !invitation.trim()) ||
          (policy.data?.agreement?.enabled && consent !== policy.data.revision)
        }
        data-invalid={Object.keys(errors).length > 0}
      >
        <UserPlus className='size-4' aria-hidden='true' />
        {t('auth.register_btn')}
      </Button>
    </form>
  )
}
