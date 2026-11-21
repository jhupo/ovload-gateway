import { useContext, useId, useRef, useState, type FormEvent } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { Save } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiRequest } from '@/api/client'
import type { CustomerProfile } from '@/api/types'
import {
  hasIdentitySession,
  useIdentitySession,
} from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PasswordInput } from '@/components/password-input'
import { RequestErrorToast } from '@/components/request-error-toast'
import { SettingsActionTargetContext } from '../action-target'
import { ProfileSummary } from './profile-summary'

export function ProfileForm() {
  const session = useIdentitySession((state) => state.session)
  const owner = session
    ? `${session.audience}:${session.tenant_id}:${session.user_id ?? session.principal_id}`
    : 'signed-out'
  return <ProfileFormContent key={owner} />
}

function ProfileFormContent() {
  const { t } = useTranslation()
  const id = useId()
  const actionTarget = useContext(SettingsActionTargetContext)
  const profile = useIdentitySession((s) => s.profile)
  const session = useIdentitySession((s) => s.session)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [passwordDirty, setPasswordDirty] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const skipBlock = useRef(false)
  const customer =
    session?.audience === 'customer' && profile && 'display_name' in profile
      ? profile
      : null
  const name = nameDraft ?? customer?.display_name ?? ''
  const dirty = !!customer && name !== customer.display_name
  const blocker = useBlocker({
    shouldBlockFn: () =>
      hasIdentitySession() &&
      !skipBlock.current &&
      (dirty || passwordDirty || pending),
    enableBeforeUnload: dirty || passwordDirty,
    withResolver: true,
  })
  if (!profile || !session)
    return <RequestErrorToast message={t('identity.profileUnavailable')} />
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !customer || !event.currentTarget.reportValidity()) return
    const sessionId = session!.id
    setPending(true)
    try {
      const { data } = await apiRequest<CustomerProfile>(
        'customer',
        '/profile',
        {
          method: 'PATCH',
          revision: customer.revision,
          body: { display_name: name.trim() },
        }
      )
      if (useIdentitySession.getState().session?.id !== sessionId) return
      useIdentitySession.getState().setProfile(data)
      setNameDraft(null)
      toast.success(t('identity.saved'))
    } catch (error) {
      if (useIdentitySession.getState().session?.id !== sessionId) return
      toast.error(error instanceof Error ? error.message : t('auth.error'))
    } finally {
      setPending(false)
    }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    const sessionId = session!.id
    if (!form.reportValidity()) return
    const values = new FormData(form)
    if (values.get('new_password') !== values.get('confirmation')) {
      toast.error(t('identity.passwordMismatch'), { id: 'profile-password' })
      form.querySelector<HTMLInputElement>('[name=confirmation]')?.focus()
      return
    }
    setPending(true)
    try {
      await apiRequest(session!.audience, '/profile/password-change', {
        method: 'POST',
        revision: profile!.revision,
        body: {
          current_password: values.get('current_password'),
          new_password: values.get('new_password'),
        },
      })
      if (useIdentitySession.getState().session?.id !== sessionId) return
      skipBlock.current = true
      form.reset()
      setPasswordDirty(false)
      toast.success(t('identity.passwordChanged'))
      useIdentitySession.getState().clear()
    } catch (error) {
      if (useIdentitySession.getState().session?.id !== sessionId) return
      toast.error(error instanceof Error ? error.message : t('auth.error'))
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      {actionTarget &&
        customer &&
        createPortal(
          <>
            <Button
              type='button'
              variant='outline'
              disabled={!dirty || pending}
              onClick={() => setDiscardOpen(true)}
            >
              {t('generalSettings.reset')}
            </Button>
            <Button
              type='submit'
              form={`${id}-profile`}
              disabled={!dirty || pending}
            >
              <Save className='size-4' aria-hidden='true' />
              {t('personalProfile.save')}
            </Button>
          </>,
          actionTarget
        )}
      <div className='space-y-6'>
        <ProfileSummary />
        {customer && (
          <form
            id={`${id}-profile`}
            onSubmit={save}
            className='max-w-xl space-y-2'
          >
            <Label htmlFor={`${id}-name`}>{t('identity.displayName')}</Label>
            <Input
              id={`${id}-name`}
              value={name}
              required
              maxLength={160}
              autoComplete='nickname'
              onChange={(e) => setNameDraft(e.target.value)}
              disabled={pending}
            />
            {!actionTarget && (
              <Button disabled={!dirty || pending}>
                {t('personalProfile.save')}
              </Button>
            )}
          </form>
        )}
        <section
          className='max-w-xl space-y-5'
          aria-labelledby={`${id}-password-title`}
        >
          <h3 id={`${id}-password-title`} className='text-base font-semibold'>
            {t('personalProfile.changePassword')}
          </h3>
          <form
            onSubmit={changePassword}
            onChange={() => setPasswordDirty(true)}
            className='space-y-4'
          >
            {[
              ['current_password', 'currentPassword'],
              ['new_password', 'newPassword'],
              ['confirmation', 'confirmPassword'],
            ].map(([field, label]) => (
              <div key={field} className='space-y-2'>
                <Label htmlFor={`${id}-${field}`}>
                  {t(`identity.${label}`)}
                </Label>
                <PasswordInput
                  id={`${id}-${field}`}
                  name={field}
                  required
                  minLength={field === 'current_password' ? 1 : 12}
                  maxLength={256}
                  autoComplete={
                    field === 'current_password'
                      ? 'current-password'
                      : 'new-password'
                  }
                  disabled={pending}
                />
              </div>
            ))}
            <Button disabled={pending || !passwordDirty}>
              {t('personalProfile.changePassword')}
            </Button>
          </form>
        </section>
      </div>
      <ConfirmDialog
        open={discardOpen || blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) {
            setDiscardOpen(false)
            blocker.reset?.()
          }
        }}
        title={t('generalSettings.discard')}
        desc={<span className='sr-only'>{t('generalSettings.discard')}</span>}
        confirmText={t('generalSettings.discardAction')}
        handleConfirm={() => {
          if (blocker.status === 'blocked') blocker.proceed()
          else {
            setNameDraft(null)
            setDiscardOpen(false)
          }
        }}
      />
    </>
  )
}
