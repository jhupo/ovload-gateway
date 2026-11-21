import { useRef, useState, type FormEvent } from 'react'
import { skipToken, useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { customersApi, type CustomerDetail } from '@/api/customers'
import { useIdentitySession } from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PasswordInput } from '@/components/password-input'
import { RequestErrorToast } from '@/components/request-error-toast'
import { useUsersActions } from '../context'
import type { User } from '../data/schema'
import { UserIdentity } from './user-identity'
import { UserStatusLabel } from './user-labels'

type UserEditorProps = {
  user?: User
  onClose: () => void
  restoreFocus: () => void
}

function hasControl(value: string, allowNoteWhitespace = false) {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (allowNoteWhitespace && (code === 0x09 || code === 0x0a)) continue
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

export function UserEditor(props: UserEditorProps) {
  const { t } = useTranslation()
  const actions = useUsersActions()
  const { user } = props
  const userId = user?.id
  const tenantId = user?.tenantId
  const canManage = actions.canManage(tenantId)
  const profile = useQuery({
    queryKey: ['customer-profile', actions.owner, tenantId, userId],
    queryFn:
      userId && tenantId
        ? ({ signal }) =>
            customersApi.get({ id: userId, tenant_id: tenantId }, signal)
        : skipToken,
    enabled: !!user && canManage,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  if (!user || (canManage && profile.data?.etag && !profile.isFetching)) {
    return <UserEditorForm {...props} detail={profile.data} />
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className='flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[34rem]'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          props.restoreFocus()
        }}
      >
        <DialogHeader className='border-b px-5 py-5 text-start sm:px-6'>
          <DialogTitle>{t('users.edit_user')}</DialogTitle>
          <DialogDescription className='sr-only'>
            {t('users.edit_for', { name: user.username })}
          </DialogDescription>
        </DialogHeader>
        <div
          className='px-5 py-5 text-sm sm:px-6'
          role={profile.isError ? 'alert' : 'status'}
        >
          {!canManage ? (
            t('identity.permissionRequired')
          ) : profile.isError ? (
            <RequestErrorToast
              message={profile.error.message}
              retry={() => void profile.refetch()}
            />
          ) : profile.isFetching ? (
            t('identity.loading')
          ) : (
            t('identity.errors.unavailable')
          )}
          {canManage && !profile.isFetching && !profile.isError && (
            <Button
              variant='link'
              size='sm'
              onClick={() => void profile.refetch()}
            >
              {t('identity.retry')}
            </Button>
          )}
        </div>
        <DialogFooter className='border-t bg-muted/25 px-5 py-4 sm:px-6'>
          <Button variant='outline' onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UserEditorForm({
  user,
  onClose,
  restoreFocus,
  detail,
}: UserEditorProps & {
  detail?: { data: CustomerDetail; etag: string | null }
}) {
  const { t } = useTranslation()
  const actions = useUsersActions()
  const isNew = !user
  const fieldId = user?.id ?? 'new-user'
  const original = detail?.data
  const [username, setUsername] = useState(original?.display_name ?? '')
  const [email, setEmail] = useState(original?.email ?? '')
  const [concurrency, setConcurrency] = useState(
    original ? String(original.max_concurrency) : ''
  )
  const [rpm, setRpm] = useState(
    original ? String(original.requests_per_minute) : ''
  )
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [notes, setNotes] = useState(original?.notes ?? '')
  const [invalid, setInvalid] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const dirty =
    username !== (original?.display_name ?? '') ||
    email !== (original?.email ?? '') ||
    concurrency !== (original ? String(original.max_concurrency) : '') ||
    rpm !== (original ? String(original.requests_per_minute) : '') ||
    password !== '' ||
    confirmPassword !== '' ||
    notes !== (original?.notes ?? '')
  const disabled =
    actions.pending ||
    !actions.canManage(user?.tenantId) ||
    (!isNew && !detail?.etag)
  function close() {
    if (actions.pending) return
    if (dirty) setDiscardOpen(true)
    else onClose()
  }
  function reject(field: string, message = t('identity.errors.invalid_input')) {
    setInvalid(field)
    toast.error(message, { id: 'user-editor-validation' })
    formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus()
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (disabled) return
    const bytes = (value: string) => new TextEncoder().encode(value).length
    if (
      !username.trim() ||
      bytes(username.trim()) > 160 ||
      hasControl(username)
    )
      return reject('username')
    const emailElement =
      formRef.current?.querySelector<HTMLInputElement>('[name=email]')
    if (
      !email.trim() ||
      bytes(email.trim()) > 320 ||
      !emailElement?.validity.valid
    )
      return reject('email')
    if (
      !/^[1-9]\d*$/.test(concurrency) ||
      !Number.isSafeInteger(Number(concurrency)) ||
      Number(concurrency) > 100_000
    )
      return reject('concurrency')
    if (
      !/^[1-9]\d*$/.test(rpm) ||
      !Number.isSafeInteger(Number(rpm)) ||
      Number(rpm) > 10_000_000
    )
      return reject('rpm')
    if (
      (isNew || password !== '') &&
      (bytes(password) < 12 || bytes(password) > 256)
    )
      return reject('password', t('identity.passwordLength'))
    if (isNew && password !== confirmPassword)
      return reject('confirmation', t('identity.passwordMismatch'))
    if (bytes(notes) > 1000 || hasControl(notes, true)) return reject('notes')
    setInvalid(null)
    const owner = actions.owner
    try {
      const values = {
        display_name: username.trim(),
        email: email.trim(),
        max_concurrency: Number(concurrency),
        requests_per_minute: Number(rpm),
        notes,
      }
      if (isNew) await actions.create({ ...values, password })
      else if (original && detail?.etag)
        await actions.update(original, detail.etag, {
          ...values,
          ...(password ? { password } : {}),
        })
      else return
      if (useIdentitySession.getState().session?.id !== owner) return
      toast.success(t('identity.saved'))
      onClose()
    } catch (error) {
      if (useIdentitySession.getState().session?.id !== owner) return
      toast.error(error instanceof Error ? error.message : t('auth.error'))
    }
  }
  const aria = (field: string) => ({
    'aria-invalid': invalid === field || undefined,
    'aria-describedby': invalid === field ? `${fieldId}-error` : undefined,
  })
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DialogContent
          showCloseButton={false}
          className='flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[34rem]'
          onEscapeKeyDown={(event) => {
            if (dirty || actions.pending) {
              event.preventDefault()
              close()
            }
          }}
          onInteractOutside={(event) => {
            if (dirty || actions.pending) {
              event.preventDefault()
              close()
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            restoreFocus()
          }}
        >
          <DialogHeader className='shrink-0 border-b px-5 py-5 text-start sm:px-6'>
            <div className='flex items-start justify-between gap-4'>
              <div className='min-w-0 space-y-2'>
                <DialogTitle>
                  {t(isNew ? 'users.add' : 'users.edit_user')}
                </DialogTitle>
                {user && (
                  <p className='truncate text-xs text-muted-foreground'>
                    ID {user.id} · {user.email}
                  </p>
                )}
              </div>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='-me-2 -mt-1 size-8 shrink-0 text-muted-foreground shadow-none'
                onClick={close}
                disabled={actions.pending}
                aria-label={t('common.close')}
              >
                <X className='size-4' aria-hidden='true' />
              </Button>
            </div>
            <DialogDescription className='sr-only'>
              {isNew
                ? t('users.add')
                : t('users.edit_for', { name: user.username })}
            </DialogDescription>
          </DialogHeader>
          <form
            ref={formRef}
            className='flex min-h-0 flex-1 flex-col'
            noValidate
            onSubmit={(event) => void submit(event)}
            onChange={() => setInvalid(null)}
          >
            <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6'>
              {user && (
                <div className='mb-6 flex min-w-0 items-center justify-between gap-4'>
                  <div className='min-w-0 flex-1'>
                    <UserIdentity user={user} />
                  </div>
                  <UserStatusLabel status={user.status} />
                </div>
              )}
              <div className='grid gap-5 sm:grid-cols-2'>
                <div className='min-w-0 space-y-2'>
                  <Label htmlFor={`username-${fieldId}`}>
                    {t('identity.displayName')}
                  </Label>
                  <Input
                    id={`username-${fieldId}`}
                    name='username'
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    maxLength={160}
                    autoComplete='off'
                    disabled={disabled}
                    {...aria('username')}
                  />
                </div>
                <div className='min-w-0 space-y-2'>
                  <Label htmlFor={`email-${fieldId}`}>{t('users.email')}</Label>
                  <Input
                    id={`email-${fieldId}`}
                    name='email'
                    type='email'
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    maxLength={320}
                    autoComplete='off'
                    spellCheck={false}
                    disabled={disabled}
                    {...aria('email')}
                  />
                </div>
                <div className='space-y-2 sm:col-span-2'>
                  <Label htmlFor={`role-${fieldId}`}>{t('users.role')}</Label>
                  <Select value='user' disabled>
                    <SelectTrigger id={`role-${fieldId}`} className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='user'>
                        {t('users.roles.user')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator className='sm:col-span-2' />
                <div className='grid grid-cols-2 gap-4 sm:col-span-2'>
                  <div className='space-y-2'>
                    <Label htmlFor={`concurrency-${fieldId}`}>
                      {t('users.concurrency')}
                    </Label>
                    <Input
                      id={`concurrency-${fieldId}`}
                      name='concurrency'
                      type='number'
                      min={1}
                      max={100000}
                      step={1}
                      value={concurrency}
                      onChange={(event) => setConcurrency(event.target.value)}
                      disabled={disabled}
                      {...aria('concurrency')}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor={`rpm-${fieldId}`}>{t('users.rpm')}</Label>
                    <Input
                      id={`rpm-${fieldId}`}
                      name='rpm'
                      type='number'
                      min={1}
                      max={10000000}
                      step={1}
                      value={rpm}
                      onChange={(event) => setRpm(event.target.value)}
                      disabled={disabled}
                      {...aria('rpm')}
                    />
                  </div>
                </div>
                <div className='space-y-2 sm:col-span-2'>
                  <Label htmlFor={`password-${fieldId}`}>
                    {t(isNew ? 'users.password' : 'users.new_password')}
                  </Label>
                  <PasswordInput
                    id={`password-${fieldId}`}
                    name='password'
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete='new-password'
                    maxLength={256}
                    placeholder={
                      isNew ? undefined : t('users.password_unchanged')
                    }
                    disabled={disabled}
                    {...aria('password')}
                  />
                </div>
                {isNew && (
                  <div className='space-y-2 sm:col-span-2'>
                    <Label htmlFor={`confirm-${fieldId}`}>
                      {t('users.confirm_password')}
                    </Label>
                    <PasswordInput
                      id={`confirm-${fieldId}`}
                      name='confirmation'
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      autoComplete='new-password'
                      maxLength={256}
                      disabled={disabled}
                      {...aria('confirmation')}
                    />
                  </div>
                )}
                <div className='space-y-2 sm:col-span-2'>
                  <Label htmlFor={`notes-${fieldId}`}>{t('users.notes')}</Label>
                  <Textarea
                    id={`notes-${fieldId}`}
                    name='notes'
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={1000}
                    className='min-h-20 resize-y'
                    disabled={disabled}
                    {...aria('notes')}
                  />
                </div>
                {invalid && (
                  <span id={`${fieldId}-error`} className='sr-only'>
                    {t('identity.errors.invalid_input')}
                  </span>
                )}
              </div>
            </div>
            <DialogFooter className='shrink-0 flex-row items-center justify-between gap-3 border-t bg-muted/25 px-5 py-4 sm:justify-between sm:px-6'>
              <span className='text-[11px] whitespace-nowrap text-muted-foreground'>
                {!actions.canManage(user?.tenantId)
                  ? t('identity.permissionRequired')
                  : ''}
              </span>
              <div className='flex items-center gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={close}
                  disabled={actions.pending}
                >
                  {t('common.cancel')}
                </Button>
                <Button type='submit' disabled={disabled || !dirty}>
                  {t(isNew ? 'users.add' : 'users.save')}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t('generalSettings.discard')}
        desc={<span className='sr-only'>{t('generalSettings.discard')}</span>}
        confirmText={t('generalSettings.discardAction')}
        handleConfirm={onClose}
      />
    </>
  )
}
