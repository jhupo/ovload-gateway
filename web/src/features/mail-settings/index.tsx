import { useId, useRef, useState, type ReactNode } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { FileText, Save, Send, Server, Settings2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { integrations } from '@/api/integrations'
import { useIntegrationSettings } from '@/hooks/use-integration-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ConfigurationSection } from '@/components/configuration-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { SettingsControlCard } from '@/components/settings-control-card'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import TabsVertical from '@/components/shadcn-space/tabs/tabs-06'
import {
  mailDraftErrors,
  initialMailDraft,
  normalizeMailDraft,
  type MailDraft,
} from './draft'
import { TemplateSettings } from './template-settings'
import {
  firstTemplateIssue,
  readEmailTemplates,
  type TemplateEvent,
  type TemplateLocale,
  type TemplateIssue,
} from './templates'

function Field({
  name,
  label,
  value,
  onChange,
  error,
  placeholder,
  type = 'text',
  inputMode,
  help,
  maxLength = 254,
  action,
}: {
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  placeholder?: string
  type?: 'text' | 'password' | 'email'
  inputMode?: 'numeric'
  help?: string
  maxLength?: number
  action?: ReactNode
}) {
  const id = useId()
  return (
    <div className='min-w-0 space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <div className='relative'>
        <Input
          id={id}
          name={name}
          className={`scroll-mt-6 scroll-mb-24 ${action ? 'pe-10' : ''}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          inputMode={inputMode}
          autoComplete={type === 'password' ? 'new-password' : 'off'}
          spellCheck={false}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={
            [help && `${id}-help`, error && `${id}-error`]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
        {action && (
          <div className='absolute inset-y-0 end-1 flex items-center'>
            {action}
          </div>
        )}
      </div>
      {help && (
        <p id={`${id}-help`} className='text-xs text-muted-foreground'>
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className='sr-only'>
          {error}
        </p>
      )}
    </div>
  )
}

export function MailSettings() {
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t(`mailSettings.${key}`)
  const [tab, setTab] = useState('basic')
  const [templateEvent, setTemplateEvent] =
    useState<TemplateEvent>('verification')
  const [templateLocale, setTemplateLocale] = useState<TemplateLocale>(() =>
    i18n.language.startsWith('zh') ? 'zh' : 'en'
  )
  const [templateIssue, setTemplateIssue] = useState<TemplateIssue>()
  const settings = useIntegrationSettings<MailDraft>(
    'mail',
    initialMailDraft,
    (v) => ({ ...v, templates: readEmailTemplates(v.templates) })
  )
  const { saved, draft, setDraft } = settings
  const [smtpPassword, setSmtpPassword] = useState<string | null>('')
  const [testing, setTesting] = useState(false)
  const [testRecipient, setTestRecipient] = useState('')
  const [errors, setErrors] = useState<
    Partial<Record<keyof MailDraft, string>>
  >({})
  const [resetOpen, setResetOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const dirty =
    JSON.stringify(saved) !== JSON.stringify(draft) || smtpPassword !== ''
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  function update<K extends keyof MailDraft>(key: K, value: MailDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    if (key === 'templates') setTemplateIssue(undefined)
  }
  async function save() {
    const next = mailDraftErrors(draft)
    const issue = firstTemplateIssue(draft.templates)
    setErrors(next)
    setTemplateIssue(issue)
    const basicError = Object.values(next)[0]
    if (basicError || issue) {
      setTab(basicError ? 'basic' : 'templates')
      if (!basicError && issue) {
        setTemplateEvent(issue.event)
        setTemplateLocale(issue.locale)
      }
      toast.error(tr(basicError ?? issue!.message), {
        id: 'mail-settings-validation',
      })
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<
            HTMLInputElement | HTMLTextAreaElement
          >('[aria-invalid="true"]')
          ?.focus()
      )
      return
    }
    const normalized = normalizeMailDraft(draft)
    try {
      await settings.save(normalized, { smtpPassword })
      setSmtpPassword('')
      toast.success(tr('saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr('saveError'))
    }
  }
  function reset() {
    settings.reset()
    setSmtpPassword('')
    setErrors({})
    setTemplateIssue(undefined)
    setResetOpen(false)
  }
  async function test(recipient?: string) {
    setTesting(true)
    try {
      await integrations.mailTest(recipient)
      toast.success(t('integrationSettings.testSucceeded'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr('saveError'))
    } finally {
      setTesting(false)
    }
  }

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
            <h1 className='text-2xl font-semibold tracking-tight'>
              {tr('title')}
            </h1>
          </div>
          <div className='hidden shrink-0 gap-2 md:flex'>
            <Button
              variant='outline'
              disabled={!dirty}
              onClick={() => setResetOpen(true)}
            >
              {tr('reset')}
            </Button>
            <Button
              type='submit'
              form='mail-settings-form'
              disabled={!dirty || settings.blocked || testing}
            >
              <Save aria-hidden='true' className='size-4' />
              {tr('save')}
            </Button>
          </div>
        </div>
        <TabsVertical
          value={tab}
          onValueChange={setTab}
          label={tr('title')}
          items={[
            { id: 'basic', label: tr('basic'), icon: Settings2 },
            { id: 'templates', label: tr('templates'), icon: FileText },
          ]}
        >
          <form
            id='mail-settings-form'
            ref={formRef}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
            className='@container/settings min-w-0 space-y-6'
          >
            <h2 className='text-base font-semibold'>
              {tr(tab === 'basic' ? 'basic' : 'templates')}
            </h2>
            <Separator />
            <fieldset
              disabled={settings.blocked || testing}
              className='min-w-0 space-y-6'
            >
              {tab === 'basic' ? (
                <>
                  <ConfigurationSection
                    title={tr('smtp')}
                    action={
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        disabled={dirty || !draft.smtpHost}
                        onClick={() => void test()}
                        title={
                          dirty ? t('integrationSettings.saveFirst') : undefined
                        }
                      >
                        <Server aria-hidden='true' className='size-4' />
                        {tr('testConnection')}
                      </Button>
                    }
                  >
                    <div className='grid min-w-0 gap-4 @lg/settings:grid-cols-2'>
                      <Field
                        name='smtpHost'
                        label={tr('smtpHost')}
                        value={draft.smtpHost}
                        onChange={(value) => update('smtpHost', value)}
                        error={errors.smtpHost && tr(errors.smtpHost)}
                        placeholder='smtp.example.com'
                        maxLength={253}
                      />
                      <Field
                        name='smtpPort'
                        label={tr('smtpPort')}
                        value={draft.smtpPort}
                        onChange={(value) => update('smtpPort', value)}
                        error={errors.smtpPort && tr(errors.smtpPort)}
                        inputMode='numeric'
                        maxLength={5}
                      />
                      <Field
                        name='smtpUsername'
                        label={tr('smtpUsername')}
                        value={draft.smtpUsername}
                        onChange={(value) => update('smtpUsername', value)}
                        error={errors.smtpUsername && tr(errors.smtpUsername)}
                      />
                      <Field
                        name='smtpPassword'
                        label={tr('smtpPassword')}
                        value={smtpPassword ?? ''}
                        onChange={setSmtpPassword}
                        type='password'
                        help={
                          settings.hasSecrets.smtpPassword
                            ? t('integrationSettings.secretSaved')
                            : tr('secretHelp')
                        }
                        maxLength={1024}
                        action={
                          settings.hasSecrets.smtpPassword && (
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon'
                              className='size-7'
                              title={t('integrationSettings.clearSecret')}
                              aria-label={t('integrationSettings.clearSecret')}
                              onClick={() => setSmtpPassword(null)}
                            >
                              <Trash2 className='size-4' />
                            </Button>
                          )
                        }
                      />
                    </div>
                    <SettingsControlCard title={tr('smtpUseTls')} compact>
                      <SwitchLabeled
                        size='sm'
                        containedMotion
                        aria-label={tr('smtpUseTls')}
                        checked={draft.smtpUseTls}
                        onCheckedChange={(value) => update('smtpUseTls', value)}
                      />
                    </SettingsControlCard>
                  </ConfigurationSection>
                  <ConfigurationSection title={tr('sender')}>
                    <div className='grid min-w-0 gap-4 @lg/settings:grid-cols-2'>
                      <Field
                        name='senderEmail'
                        label={tr('senderEmail')}
                        value={draft.senderEmail}
                        onChange={(value) => update('senderEmail', value)}
                        error={errors.senderEmail && tr(errors.senderEmail)}
                        type='email'
                        placeholder='no-reply@example.com'
                      />
                      <Field
                        name='senderName'
                        label={tr('senderName')}
                        value={draft.senderName}
                        onChange={(value) => update('senderName', value)}
                        error={errors.senderName && tr(errors.senderName)}
                        placeholder='Ovload'
                        maxLength={100}
                      />
                    </div>
                  </ConfigurationSection>
                  <ConfigurationSection title={tr('testMail')}>
                    <div className='grid min-w-0 gap-4 @lg/settings:grid-cols-[minmax(0,1fr)_auto] @lg/settings:items-end'>
                      <Field
                        name='testRecipient'
                        label={tr('testRecipient')}
                        value={testRecipient}
                        onChange={setTestRecipient}
                        type='email'
                        placeholder='admin@example.com'
                      />
                      <Button
                        type='button'
                        disabled={
                          dirty ||
                          !draft.smtpHost ||
                          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testRecipient)
                        }
                        onClick={() => void test(testRecipient)}
                        title={
                          dirty ? t('integrationSettings.saveFirst') : undefined
                        }
                      >
                        <Send aria-hidden='true' className='size-4' />
                        {tr('sendTest')}
                      </Button>
                    </div>
                  </ConfigurationSection>
                </>
              ) : (
                <TemplateSettings
                  value={draft.templates}
                  onChange={(value) => update('templates', value)}
                  event={templateEvent}
                  locale={templateLocale}
                  onEventChange={setTemplateEvent}
                  onLocaleChange={setTemplateLocale}
                  issue={templateIssue}
                />
              )}
            </fieldset>
          </form>
        </TabsVertical>
      </Main>
      <div className='fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden'>
        <Button
          className='flex-1'
          variant='outline'
          disabled={!dirty}
          onClick={() => setResetOpen(true)}
        >
          {tr('reset')}
        </Button>
        <Button
          className='flex-1'
          type='submit'
          form='mail-settings-form'
          disabled={!dirty || settings.blocked || testing}
        >
          <Save aria-hidden='true' className='size-4' />
          {tr('save')}
        </Button>
      </div>
      <ConfirmDialog
        open={resetOpen || blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) {
            setResetOpen(false)
            blocker.reset?.()
          }
        }}
        title={tr('discard')}
        desc={<span className='sr-only'>{tr('discard')}</span>}
        cancelBtnText={tr('cancel')}
        confirmText={tr('discardAction')}
        handleConfirm={() => {
          if (blocker.status === 'blocked') blocker.proceed()
          else reset()
        }}
      />
    </>
  )
}
