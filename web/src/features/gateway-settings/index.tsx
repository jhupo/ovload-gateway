import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import {
  Coins,
  RefreshCw,
  Save,
  RotateCcw,
  Settings2,
  Network,
  Terminal,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ApiError } from '@/api/errors'
import {
  gatewaySettingsApi,
  requestProfileSchema,
  type GatewaySettingsSnapshot,
} from '@/api/gateway-settings'
import { PlatformPreflightError } from '@/api/platform-client'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ConfigurationSection } from '@/components/configuration-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { RequestErrorToast } from '@/components/request-error-toast'
import TabsVertical from '@/components/shadcn-space/tabs/tabs-06'
import { CodexSettings } from './codex-settings'
import {
  fieldTab,
  gatewayDraft,
  gatewayErrors,
  gatewayReplacement,
  numericFields,
  type GatewayDraft,
  type GatewayErrors,
  type GatewayFieldName,
  type NumericField,
} from './draft'
import { GatewayField } from './fields'
import { NativeProfileSettings } from './native-profile-settings'
import { PricingSettings } from './pricing-settings'
import type { ProfileConfiguration, ProfileProvider } from './profile-api'
import { RequestProfileSettings } from './request-profile-settings'
import { reconcileGatewayRevision } from './revision'
import { SchedulingSettings } from './scheduling-settings'

const fieldGrid =
  'grid min-w-0 grid-cols-1 gap-4 @xl/gateway:grid-cols-2 @3xl/gateway:grid-cols-3'

export function GatewaySettings() {
  const sessionId = useIdentitySession((state) => state.session?.id)
  const canManage = useIdentitySession(
    (state) =>
      state.session?.audience === 'management' &&
      allows('security.settings.manage')
  )
  return (
    <GatewaySettingsPage
      key={`${sessionId}:${canManage}`}
      canManage={canManage}
    />
  )
}

function GatewaySettingsPage({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const tr = (key: string) => t('gatewaySettings.' + key)
  const real = (key: string) => t('realGatewaySettings.' + key)
  const [tab, setTab] = useState('basic')
  const [saved, setSaved] = useState<GatewayDraft | null>(null)
  const [draft, setDraft] = useState<GatewayDraft | null>(null)
  const [loading, setLoading] = useState(canManage)
  const [pending, setPending] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [saveUnconfirmed, setSaveUnconfirmed] = useState(false)
  const [pricingDirty, setPricingDirty] = useState(false)
  const [pricingPending, setPricingPending] = useState(false)
  const [localInvalid, setLocalInvalid] = useState(false)
  const [formGeneration, setFormGeneration] = useState(0)
  const [discard, setDiscard] = useState<string | null>(null)
  const [errors, setErrors] = useState<GatewayErrors>({})
  const formRef = useRef<HTMLFormElement>(null)
  const loadController = useRef<AbortController | null>(null)
  const saveController = useRef<AbortController | null>(null)
  const gatewayDirty =
    !!draft && JSON.stringify(saved) !== JSON.stringify(draft)
  const busy = loading || pending || pricingPending
  const dirty = gatewayDirty || pricingDirty || localInvalid
  const hasDraft = draft !== null
  const blocker = useBlocker({
    shouldBlockFn: () =>
      dirty ||
      pending ||
      pricingPending ||
      !!formRef.current?.querySelector(
        '[data-local-invalid="true"][data-local-draft="true"]'
      ),
    enableBeforeUnload: dirty || pending || pricingPending,
    withResolver: true,
  })
  useEffect(() => {
    const form = formRef.current
    if (!form) return
    const observer = new MutationObserver(() =>
      setLocalInvalid(
        !!form.querySelector(
          '[data-local-invalid="true"][data-local-draft="true"]'
        )
      )
    )
    observer.observe(form, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-local-invalid'],
    })
    return () => observer.disconnect()
  }, [tab, hasDraft, formGeneration])
  const applySnapshot = useCallback((snapshot: GatewaySettingsSnapshot) => {
    const next = gatewayDraft(snapshot)
    setSaved(next)
    setDraft(next)
    setLocalInvalid(false)
    setConflict(false)
    setSaveUnconfirmed(false)
    setErrors({})
    setFormGeneration((value) => value + 1)
  }, [])
  const reload = useCallback(async () => {
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    setLoading(true)
    setLoadFailed(false)
    try {
      const snapshot = await gatewaySettingsApi.load(controller.signal)
      if (controller.signal.aborted) return
      applySnapshot(snapshot)
    } catch {
      if (!controller.signal.aborted) setLoadFailed(true)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [applySnapshot])
  useEffect(() => {
    if (canManage) {
      const controller = new AbortController()
      loadController.current = controller
      void gatewaySettingsApi
        .load(controller.signal)
        .then((snapshot) => {
          if (!controller.signal.aborted) applySnapshot(snapshot)
        })
        .catch(() => {
          if (!controller.signal.aborted) setLoadFailed(true)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }
    return () => {
      loadController.current?.abort()
      saveController.current?.abort()
    }
  }, [canManage, applySnapshot])

  function update<K extends keyof GatewayDraft>(
    key: K,
    value: GatewayDraft[K]
  ) {
    if (busy) return
    setDraft((current) => current && { ...current, [key]: value })
    setErrors((current) => ({ ...current, [key]: undefined }))
  }
  async function save() {
    if (
      !draft ||
      !canManage ||
      busy ||
      saveController.current ||
      conflict ||
      loadFailed ||
      saveUnconfirmed
    )
      return
    const invalid = formRef.current?.querySelector<HTMLElement>(
      '[data-local-invalid="true"]'
    )
    if (invalid) {
      invalid.focus()
      toast.error(real('checkFields'))
      return
    }
    const issues = gatewayErrors(draft, saved)
    setErrors(issues)
    const field = Object.keys(issues)[0] as GatewayFieldName | undefined
    if (field) {
      setTab(fieldTab(field))
      const range =
        field in numericFields
          ? numericFields[field as NumericField]
          : undefined
      toast.error(
        range ||
          issues[field] === 'versionError' ||
          issues[field] === 'modelError'
          ? t('realGatewaySettings.' + issues[field], {
              field: real(field),
              min: range?.min,
              max: range?.max,
            })
          : real('checkFields'),
        { id: 'gateway-settings-validation' }
      )
      requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLElement>(`[name="${field}"][aria-invalid="true"]`)
          ?.focus()
      )
      return
    }
    const controller = new AbortController()
    saveController.current = controller
    setPending(true)
    try {
      const result = await gatewaySettingsApi.replace(
        gatewayReplacement(draft, saved),
        controller.signal
      )
      if (controller.signal.aborted) return
      const next = gatewayDraft(result)
      setSaved(next)
      setDraft(next)
      setErrors({})
      toast.success(real('saved'))
    } catch (error) {
      if (controller.signal.aborted) return
      const stale = error instanceof ApiError && error.status === 409
      setConflict(stale)
      const rejected =
        error instanceof PlatformPreflightError ||
        (error instanceof ApiError && [400, 422].includes(error.status))
      setSaveUnconfirmed(!stale && !rejected)
      toast.error(
        error instanceof PlatformPreflightError
          ? error.message
          : real(stale ? 'conflict' : rejected ? 'checkFields' : 'saveFailed'),
        {
          id: 'gateway-settings-save',
          description:
            rejected && error instanceof Error ? error.message : undefined,
        }
      )
    } finally {
      if (!controller.signal.aborted) setPending(false)
      if (saveController.current === controller) saveController.current = null
    }
  }
  const controlsDisabled = !canManage || !draft || busy
  async function pricingWritten() {
    try {
      const snapshot = await gatewaySettingsApi.load()
      if (!saved || !draft) {
        applySnapshot(snapshot)
        setLoadFailed(false)
        return
      }
      const refreshed = reconcileGatewayRevision(saved, draft, snapshot)
      if (!refreshed) {
        setConflict(true)
        toast.error(real('conflict'))
        return
      }
      setSaved(refreshed.saved)
      setDraft(refreshed.draft)
      setConflict(false)
      setSaveUnconfirmed(false)
    } catch {
      setSaveUnconfirmed(true)
      toast.warning(real('saveFailed'))
    }
  }
  const numbers = (...keys: NumericField[]) => (
    <div className={fieldGrid}>
      {keys.map((name) => (
        <GatewayField
          key={name}
          name={name}
          value={draft?.[name] ?? ''}
          namespace='realGatewaySettings'
          min={numericFields[name].min}
          max={numericFields[name].max}
          type='number'
          disabled={controlsDisabled}
          error={errors[name]}
          onChange={(value) => update(name, value)}
        />
      ))}
    </div>
  )
  const profile = (provider: ProfileProvider) => {
    const props = {
      value: draft?.providerRequestProfiles[provider] ?? null,
      disabled: controlsDisabled,
      onChange: (value: ProfileConfiguration | null) => {
        if (!draft) return
        const profiles = { ...draft.providerRequestProfiles }
        if (value === null) delete profiles[provider]
        else profiles[provider] = requestProfileSchema.parse(value)
        update('providerRequestProfiles', profiles)
      },
    }
    return provider === 'gemini' || provider === 'claude' ? (
      <NativeProfileSettings provider={provider} {...props} />
    ) : (
      <RequestProfileSettings provider={provider} {...props} />
    )
  }
  const actions = (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={busy || !canManage}
        aria-label={real('reload')}
        title={real('reload')}
        onClick={() => {
          if (gatewayDirty || localInvalid) setDiscard('reload')
          else void reload()
        }}
      >
        <RefreshCw className='size-4' />
        <span className='hidden md:inline'>{real('reload')}</span>
      </Button>
      <Button
        type='button'
        variant='outline'
        disabled={(!gatewayDirty && !localInvalid) || busy}
        aria-label={tr('reset')}
        title={tr('reset')}
        onClick={() => setDiscard('reset')}
      >
        <RotateCcw className='size-4' />
        <span className='hidden md:inline'>{tr('reset')}</span>
      </Button>
      <Button
        type='submit'
        form='gateway-settings-form'
        aria-label={pending ? real('saving') : tr('save')}
        title={pending ? real('saving') : tr('save')}
        disabled={
          !gatewayDirty || busy || conflict || loadFailed || saveUnconfirmed
        }
      >
        <Save className='size-4' />
        <span className='hidden md:inline'>
          {pending ? real('saving') : tr('save')}
        </span>
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
          {tab !== 'modelPricing' && (
            <div className='hidden shrink-0 gap-2 md:flex'>{actions}</div>
          )}
        </div>
        <TabsVertical
          fillContent={tab === 'modelPricing'}
          value={tab}
          onValueChange={(value) => {
            if (busy) return
            const invalid = formRef.current?.querySelector<HTMLElement>(
              '[data-local-invalid="true"][data-local-draft="true"]'
            )
            if (invalid) {
              invalid.focus()
              toast.error(real('checkFields'))
              return
            }
            if (pricingDirty && value !== tab) setDiscard(value)
            else setTab(value)
          }}
          label={tr('title')}
          items={[
            { id: 'basic', label: tr('basic'), icon: Settings2 },
            { id: 'codex', label: tr('codex'), icon: Terminal },
            { id: 'xai', label: real('xai'), icon: Network },
            { id: 'gemini', label: 'Gemini', icon: Network },
            { id: 'claude', label: 'Claude', icon: Terminal },
            { id: 'modelPricing', label: tr('modelPricing'), icon: Coins },
          ]}
        >
          <div
            className={cn(
              '@container/gateway min-w-0',
              tab === 'modelPricing'
                ? 'flex min-h-0 flex-1 flex-col gap-6'
                : 'space-y-6'
            )}
          >
            <h2 className='shrink-0 text-base font-semibold'>
              {tab === 'gemini'
                ? 'Gemini'
                : tab === 'claude'
                  ? 'Claude'
                  : ['xai', 'models'].includes(tab)
                    ? real(tab)
                    : tr(tab)}
            </h2>
            <Separator />
            {tab === 'modelPricing' ? (
              <PricingSettings
                onDirtyChange={setPricingDirty}
                onPendingChange={setPricingPending}
                onWritten={pricingWritten}
              />
            ) : (
              <>
                {!canManage && <div role='status'>{real('forbidden')}</div>}
                {canManage && !draft && !loadFailed && (
                  <div role='status'>{real('loading')}</div>
                )}
                {loadFailed && (
                  <RequestErrorToast
                    message={real('loadFailed')}
                    retry={() => void reload()}
                  />
                )}
                {conflict && (
                  <div role='alert' className='text-sm text-destructive'>
                    {real('conflict')}
                  </div>
                )}

                <form
                  key={formGeneration}
                  id='gateway-settings-form'
                  ref={formRef}
                  noValidate
                  className='min-w-0 space-y-6'
                  onSubmit={(event) => {
                    event.preventDefault()
                    void save()
                  }}
                >
                  {tab === 'basic' && (
                    <>
                      <SchedulingSettings
                        draft={draft}
                        errors={errors}
                        update={update}
                        disabled={controlsDisabled}
                      />
                      <ConfigurationSection title={real('queues')}>
                        {numbers(
                          'maxWaitingPerKey',
                          'maxWaitingPerAccount',
                          'concurrencyWaitTimeoutSeconds'
                        )}
                      </ConfigurationSection>
                      <ConfigurationSection title={real('refresh')}>
                        {numbers('refreshMarginSeconds', 'refreshConcurrency')}
                      </ConfigurationSection>
                      <ConfigurationSection title={real('retention')}>
                        {numbers(
                          'usageRetentionDays',
                          'opsEventRetentionDays',
                          'auditRetentionDays'
                        )}
                      </ConfigurationSection>
                    </>
                  )}
                  {tab === 'xai' && profile('xai')}
                  {tab === 'gemini' && profile('gemini')}
                  {tab === 'claude' && profile('claude')}
                  {tab === 'codex' && (
                    <>
                      <CodexSettings
                        draft={draft}
                        errors={errors}
                        update={update}
                        disabled={controlsDisabled}
                      />
                      {profile('openai')}
                    </>
                  )}
                </form>
              </>
            )}
          </div>
        </TabsVertical>
      </Main>
      {tab !== 'modelPricing' && (
        <div className='fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 gap-2 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden [&>button]:min-w-0'>
          {actions}
        </div>
      )}
      <ConfirmDialog
        open={discard !== null || blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDiscard(null)
            blocker.reset?.()
          }
        }}
        title={tr('discardTitle')}
        desc={<span className='sr-only'>{tr('discardTitle')}</span>}
        confirmText={tr('discard')}
        isLoading={busy}
        handleConfirm={() => {
          if (busy) return
          if (blocker.status === 'blocked') blocker.proceed()
          else if (discard === 'reload') void reload()
          else if (discard === 'reset') {
            setDraft(saved)
            setErrors({})
            setLocalInvalid(false)
            setFormGeneration((value) => value + 1)
          } else if (discard) setTab(discard)
          setDiscard(null)
        }}
      />
    </>
  )
}
