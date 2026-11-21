import { useId, useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { Globe, ImagePlus, Save, Trash2, LogIn, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  allows,
  hasIdentitySession,
  useIdentitySession,
} from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfigurationSection } from '@/components/configuration-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { FieldLayout } from '@/components/field-layout'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { RequestErrorToast } from '@/components/request-error-toast'
import TabsVertical from '@/components/shadcn-space/tabs/tabs-06'
import { useAuthPolicy } from '../auth/use-auth-policy'
import { AgreementSettings } from './agreement-settings'
import { createLoginSettings } from './login'
import { RegistrationSettings, QuickLoginSettings } from './login-settings'
import { useAuthSettings } from './use-auth-settings'
import { useSiteSettings } from './use-site-settings'
import { UserDefaultsSettings } from './user-defaults'

function Field({
  name,
  label,
  value,
  onChange,
  error,
  placeholder,
  type = 'text',
  maxLength = 500,
}: {
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  placeholder?: string
  type?: string
  maxLength?: number
}) {
  const id = useId()
  return (
    <FieldLayout id={id} label={label} error={error}>
      <Input
        id={id}
        name={name}
        autoComplete='off'
        spellCheck={type === 'url' ? false : undefined}
        className='scroll-mt-24 scroll-mb-24'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        maxLength={maxLength * 2}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
    </FieldLayout>
  )
}

export function GeneralSettings() {
  const sessionId = useIdentitySession((state) => state.session?.id)
  const canManage = useIdentitySession(
    (state) =>
      state.session?.audience === 'management' &&
      allows('security.settings.manage')
  )
  return (
    <GeneralSettingsPage
      key={`${sessionId}:${canManage}`}
      canManage={canManage}
    />
  )
}

function GeneralSettingsPage({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`generalSettings.${key}`)
  const [tab, setTab] = useState('basic')
  const siteSettings = useSiteSettings(canManage)
  const authSettings = useAuthSettings(canManage && tab !== 'basic')
  const { formRef: authFormRef } = authSettings
  const publicPolicy = useAuthPolicy()
  const settings = tab === 'basic' ? siteSettings : authSettings
  const { draft, errors, formRef, update } = siteSettings
  const dirty = siteSettings.dirty || authSettings.dirty
  const policy = authSettings.draft
  const login = {
    ...createLoginSettings(),
    openRegistration: policy?.registration_enabled ?? false,
    emailVerification: policy?.verification_required ?? false,
    passwordRecoveryEnabled: policy?.recovery_enabled ?? false,
    emailWhitelist: authSettings.emailWhitelist,
    providers: Object.fromEntries(
      ['github', 'google', 'linuxdo'].map((key) => [
        key,
        { enabled: policy?.enabled_providers.includes(key) ?? false },
      ])
    ) as ReturnType<typeof createLoginSettings>['providers'],
  }
  const patchPolicy = (next: Partial<NonNullable<typeof policy>>) => {
    if (policy) authSettings.setDraft({ ...policy, ...next })
  }
  const [discard, setDiscard] = useState<'reset' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const busy = settings.loading || settings.pending
  const blocked = !canManage || !settings.ready || busy || settings.loadFailed
  const blocker = useBlocker({
    shouldBlockFn: () =>
      hasIdentitySession() &&
      (dirty || settings.pending || settings.readingLogo),
    enableBeforeUnload: dirty || settings.pending || settings.readingLogo,
    withResolver: true,
  })
  const actions = (
    <>
      <Button
        variant='outline'
        disabled={(!dirty && !settings.readingLogo) || busy}
        onClick={() => setDiscard('reset')}
      >
        {tr('reset')}
      </Button>
      <Button
        type='submit'
        form={tab === 'basic' ? 'general-settings-form' : 'auth-settings-form'}
        disabled={
          !settings.dirty || blocked || !!settings.issue || settings.readingLogo
        }
      >
        <Save aria-hidden='true' className='size-4' />
        {tr(settings.pending ? 'saving' : 'save')}
      </Button>
    </>
  )
  return (
    <>
      <Header fixed className='bg-background'>
        <ProfileDropdown />
      </Header>
      <Main id='content' fixed>
        <div
          data-slot='page-heading'
          className='flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-3'
        >
          <div className='flex min-w-0 flex-wrap items-center gap-3'>
            <h1 className='text-2xl font-semibold'>{tr('title')}</h1>
          </div>
          <div className='hidden shrink-0 gap-2 md:flex'>{actions}</div>
        </div>
        <TabsVertical
          value={tab}
          onValueChange={(value) => {
            if (!busy) setTab(value)
          }}
          label={tr('title')}
          items={[
            { id: 'basic', label: tr('basic'), icon: Globe },
            {
              id: 'login',
              label: tr('registrationLogin'),
              icon: LogIn,
            },
            { id: 'agreement', label: tr('agreement'), icon: FileText },
          ]}
        >
          <div className='min-w-0'>
            {tab === 'basic' ? (
              <div className='@container/settings min-w-0'>
                <form
                  id='general-settings-form'
                  ref={formRef}
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault()
                    void settings.save()
                  }}
                  className='w-full min-w-0 space-y-6'
                >
                  <h2 className='text-base font-semibold'>{tr('basic')}</h2>
                  <Separator />
                  {!canManage && <div role='status'>{tr('forbidden')}</div>}
                  {canManage && settings.loading && (
                    <Skeleton
                      className='h-24 w-full'
                      aria-label={t('identity.loading')}
                    />
                  )}
                  <fieldset disabled={blocked} className='min-w-0'>
                    <ConfigurationSection title={tr('siteIdentity')}>
                      <div className='grid gap-5 @lg/settings:grid-cols-[104px_minmax(0,1fr)] @lg/settings:gap-6'>
                        <div className='relative w-fit self-start @lg/settings:self-center'>
                          <div className='h-full'>
                            <Button
                              id='site-logo'
                              type='button'
                              variant='outline'
                              className='size-20 rounded-lg p-4 @lg/settings:size-[104px]'
                              aria-label={tr('upload')}
                              onClick={() => fileRef.current?.click()}
                              aria-invalid={!!errors.logo}
                              aria-describedby={
                                errors.logo ? 'site-logo-error' : undefined
                              }
                            >
                              {siteSettings.logo ? (
                                <img
                                  src={siteSettings.logo}
                                  alt={tr('logoAlt')}
                                  width={56}
                                  height={56}
                                  className='size-full rounded-md object-contain'
                                />
                              ) : (
                                <ImagePlus
                                  aria-hidden='true'
                                  className='size-6 text-muted-foreground'
                                />
                              )}
                            </Button>
                            {errors.logo && (
                              <span id='site-logo-error' className='sr-only'>
                                {tr(errors.logo)}
                              </span>
                            )}
                            {siteSettings.logo && (
                              <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                className='absolute top-1 right-1 size-7 bg-background/90 text-muted-foreground'
                                aria-label={tr('removeLogo')}
                                onClick={siteSettings.removeLogo}
                              >
                                <Trash2 aria-hidden='true' className='size-4' />
                              </Button>
                            )}
                            <input
                              ref={fileRef}
                              name='logo'
                              className='hidden'
                              type='file'
                              accept='image/png,image/jpeg'
                              onChange={(event) => {
                                void siteSettings.selectLogo(
                                  event.target.files?.[0]
                                )
                                event.target.value = ''
                              }}
                            />
                          </div>
                        </div>
                        <div className='grid min-w-0 gap-4 @lg/settings:grid-cols-2'>
                          <Field
                            name='name'
                            label={tr('name')}
                            value={draft.name}
                            onChange={(value) => update('name', value)}
                            error={errors.name ? tr(errors.name) : undefined}
                            maxLength={80}
                          />
                          <Field
                            name='subtitle'
                            label={tr('subtitle')}
                            value={draft.subtitle}
                            onChange={(value) => update('subtitle', value)}
                            error={
                              errors.subtitle ? tr(errors.subtitle) : undefined
                            }
                            maxLength={160}
                          />
                          <Field
                            name='support'
                            label={tr('support')}
                            value={draft.support}
                            onChange={(value) => update('support', value)}
                            error={
                              errors.support ? tr(errors.support) : undefined
                            }
                          />
                          <Field
                            name='endpoint'
                            label={tr('endpoint')}
                            value={draft.endpoint}
                            onChange={(value) => update('endpoint', value)}
                            error={
                              errors.endpoint ? tr(errors.endpoint) : undefined
                            }
                            type='url'
                            placeholder='https://api.example.com'
                          />
                        </div>
                      </div>
                    </ConfigurationSection>
                  </fieldset>
                </form>
              </div>
            ) : (
              <form
                id='auth-settings-form'
                ref={authFormRef}
                noValidate
                className='@container/settings min-w-0 space-y-6'
                onSubmit={(event) => {
                  event.preventDefault()
                  void authSettings.save()
                }}
              >
                <h2 className='text-base font-semibold'>
                  {tr(tab === 'login' ? 'registrationLogin' : 'agreement')}
                </h2>
                <Separator />
                {authSettings.issue && (
                  <RequestErrorToast
                    message={tr(authSettings.issue)}
                    retry={() => void authSettings.load()}
                  />
                )}
                {!canManage && <div role='status'>{tr('forbidden')}</div>}
                {authSettings.loading && (
                  <Skeleton
                    className='h-24 w-full'
                    aria-label={t('identity.loading')}
                  />
                )}
                <fieldset disabled={blocked} className='min-w-0 space-y-6'>
                  {tab === 'login' ? (
                    <>
                      <RegistrationSettings
                        value={login}
                        errors={authSettings.errors}
                        mailAvailable={
                          publicPolicy.data?.mail_available === true
                        }
                        onChange={(value) => {
                          authSettings.setEmailWhitelist(value.emailWhitelist)
                          patchPolicy({
                            registration_enabled: value.openRegistration,
                            verification_required: value.emailVerification,
                            recovery_enabled: value.passwordRecoveryEnabled,
                          })
                        }}
                      />
                      <fieldset>
                        <QuickLoginSettings
                          value={login}
                          available={
                            publicPolicy.data?.mail_available
                              ? publicPolicy.data.oauth_available
                              : []
                          }
                          onChange={(value) =>
                            patchPolicy({
                              enabled_providers: Object.entries(value.providers)
                                .filter(([, v]) => v.enabled)
                                .map(([key]) => key)
                                .sort(),
                            })
                          }
                        />
                      </fieldset>
                      <UserDefaultsSettings
                        value={{
                          defaultBalance: policy?.gift_usd ?? '',
                          defaultConcurrency: String(
                            policy?.default_user_concurrency ?? ''
                          ),
                          defaultRpm: String(policy?.default_user_rpm ?? ''),
                        }}
                        errors={authSettings.errors}
                        onChange={(key, value) => {
                          if (key === 'defaultBalance')
                            patchPolicy({ gift_usd: value })
                          else if (key === 'defaultConcurrency')
                            patchPolicy({
                              default_user_concurrency: Number(value),
                              default_customer_concurrency: Number(value),
                            })
                          else
                            patchPolicy({
                              default_user_rpm: Number(value),
                              default_customer_rpm: Number(value),
                            })
                        }}
                      />
                    </>
                  ) : (
                    policy && (
                      <AgreementSettings
                        value={policy.agreement}
                        error={authSettings.errors.agreement}
                        onChange={(agreement) => patchPolicy({ agreement })}
                      />
                    )
                  )}
                </fieldset>
              </form>
            )}
          </div>
        </TabsVertical>
      </Main>
      {
        <div className='fixed inset-x-0 bottom-0 z-40 flex flex-wrap gap-2 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden [&>button]:flex-1'>
          {actions}
        </div>
      }
      <ConfirmDialog
        open={!!discard || blocker.status === 'blocked'}
        isLoading={settings.pending}
        onOpenChange={(open) => {
          if (!open) {
            setDiscard(null)
            blocker.reset?.()
          }
        }}
        title={tr('discard')}
        desc={<span className='sr-only'>{tr('discard')}</span>}
        cancelBtnText={tr('cancel')}
        confirmText={tr('discardAction')}
        handleConfirm={() => {
          if (blocker.status === 'blocked') blocker.proceed()
          else {
            siteSettings.reset()
            authSettings.reset()
            setDiscard(null)
          }
        }}
      />
    </>
  )
}
