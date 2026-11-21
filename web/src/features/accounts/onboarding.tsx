import { useEffect, useRef, useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  settingsFor,
  upstreamAccounts,
  type AuthorizationFlow,
  type UpstreamAccount,
} from '@/api/upstream-accounts'
import { useIdentitySession } from '@/stores/identity-session'
import {
  accessMethods,
  isAccountPlatform,
  accountPlatform,
  credentialProvider,
  type AccountPlatform,
} from '@/lib/upstream-platforms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UpstreamPlatformSelect } from '@/components/upstream-platform-select'
import { AccountDialog } from './account-dialog'
import { defaultApiBaseUrl, validApiBaseUrl, validApiKey } from './connection'
import { AccountConnectionFields } from './connection-fields'
import { defaultSettings, invalidSettings } from './settings'
import { AccountSettingsFields } from './settings-fields'
import { SupportedModels } from './supported-models'

export function AccountOnboarding({
  account,
  onClose,
  onSaved,
}: {
  account?: UpstreamAccount
  onClose: () => void
  onSaved: (accountId?: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`upstreamAccounts.${key}`)
  const owner = useIdentitySession((state) => state.session?.id)
  const [platform, setPlatform] = useState<AccountPlatform>(() => {
    const value = accountPlatform(account?.provider ?? 'openai')
    return isAccountPlatform(value) ? value : 'openai'
  })
  const [method, setMethod] = useState(
    account?.authenticationKind === 'api_key' ? 'api_key' : 'oauth'
  )
  const provider = credentialProvider(platform, method)
  const [settings, setSettings] = useState(() =>
    account ? settingsFor(account) : defaultSettings
  )
  const [proxyId, setProxyId] = useState(account?.outboundProxyId ?? '')
  const [name, setName] = useState(account?.name ?? '')
  const [callbackUrl, setCallbackUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(() => defaultApiBaseUrl(provider))
  const keyAccount = method === 'api_key'
  const [step, setStep] = useState<'details' | 'authorize' | 'models'>(
    'details'
  )
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<string[]>([])
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    form.current?.querySelector<HTMLElement>('input, button')?.focus()
    form.current?.closest('[data-account-dialog-body]')?.scrollTo(0, 0)
  }, [step])
  const [flow, setFlow] = useState<AuthorizationFlow | null>(null)
  const [pending, setPending] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)
  const dirty =
    !!callbackUrl ||
    !!flow ||
    name !== (account?.name ?? '') ||
    !!apiKey ||
    baseUrl !== defaultApiBaseUrl(provider) ||
    JSON.stringify(settings) !==
      JSON.stringify(account ? settingsFor(account) : defaultSettings) ||
    proxyId !== (account?.outboundProxyId ?? '')
  const currentOwner = () =>
    !!owner && useIdentitySession.getState().session?.id === owner
  function validation(field: string) {
    setInvalid(field)
    toast.error(tr('invalid'), { id: 'account-validation' })
    document.getElementById(`account-${field}`)?.focus()
  }
  async function submit() {
    if (pending || !currentOwner()) return
    const issue = invalidSettings({
      ...settings,
      modelAccess:
        step === 'models' ? settings.modelAccess : defaultSettings.modelAccess,
    })
    if (issue) return validation(issue)
    if (step === 'details') {
      if (!name.trim() || new TextEncoder().encode(name.trim()).length > 512)
        return validation('name')
      if (keyAccount && !validApiBaseUrl(baseUrl)) return validation('baseUrl')
      if (keyAccount && !validApiKey(apiKey)) return validation('apiKey')
    }
    if (
      step === 'authorize' &&
      (!callbackUrl.trim() ||
        new TextEncoder().encode(callbackUrl).length > 65536 ||
        !flow ||
        !Number.isFinite(Date.parse(flow.expiresAt)) ||
        Date.parse(flow.expiresAt) <= Date.now())
    )
      return validation('callback')
    setPending(true)
    try {
      if (step === 'details') {
        if (keyAccount) {
          const result = await upstreamAccounts.previewModels(
            provider,
            baseUrl,
            apiKey,
            proxyId
          )
          if (!currentOwner()) return
          setPreview(result.models.map((model) => model.id))
          setStep('models')
        } else {
          const next = await upstreamAccounts.startAuthorization(
            provider,
            name.trim(),
            proxyId,
            account?.id
          )
          if (!currentOwner()) return
          const target = new URL(next.authorizationUrl)
          if (
            target.protocol !== 'https:' ||
            target.username ||
            target.password
          )
            throw new Error(tr('invalidAuthorization'))
          setFlow(next)
          setStep('authorize')
        }
      } else if (step === 'authorize') {
        const completed = await upstreamAccounts.completeAuthorization(
          provider,
          flow!.flowId,
          callbackUrl.trim(),
          // New accounts stay disabled until the model policy is saved.
          { ...settings, enabled: account ? settings.enabled : false }
        )
        if (!currentOwner()) return
        // Record completion before any model request, so retry cannot redeem the callback twice.
        setCreatedId(completed.accountId)
        setCallbackUrl('')
        setFlow(null)
        setStep('models')
      } else {
        let savedId = createdId
        if (keyAccount && !createdId) {
          const imported = await upstreamAccounts.import(
            provider,
            {
              schema_version: 1,
              name: name.trim(),
              api_key: apiKey,
              base_url: baseUrl,
            },
            settings,
            proxyId
          )
          if (!currentOwner()) return
          setCreatedId(imported.accountIds[0] ?? null)
          savedId = imported.accountIds[0] ?? null
        } else if (createdId) {
          const latest = await upstreamAccounts.detail(createdId)
          if (!currentOwner()) return
          await upstreamAccounts.batchUpdate(
            latest.account.configRevision,
            [createdId],
            {
              modelAccess: settings.modelAccess,
              enabled: settings.enabled,
            }
          )
        } else return
        if (!currentOwner()) return
        setApiKey('')
        toast.success(tr('saved'))
        await onSaved(savedId ?? undefined)
      }
      setInvalid(null)
    } catch (error) {
      if (currentOwner())
        toast.error(error instanceof Error ? error.message : tr('failed'), {
          id: 'account-onboarding',
        })
    } finally {
      setPending(false)
    }
  }
  function back() {
    setFlow(null)
    setCallbackUrl('')
    setPreview([])
    setInvalid(null)
    setStep('details')
  }
  async function copyAuthorization() {
    if (!flow) return
    try {
      await navigator.clipboard.writeText(flow.authorizationUrl)
      toast.success(tr('authorizationCopied'))
    } catch {
      toast.error(tr('authorizationCopyFailed'))
    }
  }
  return (
    <AccountDialog
      title={tr(account ? 'reauthorize' : 'add')}
      dirty={
        createdId
          ? JSON.stringify(settings.modelAccess) !==
            JSON.stringify(account?.modelAccess ?? defaultSettings.modelAccess)
          : dirty
      }
      pending={pending}
      form='account-onboarding'
      submitText={
        step === 'details'
          ? 'nextStep'
          : step === 'authorize'
            ? 'completeAuthorization'
            : keyAccount
              ? 'create'
              : 'saveModelPolicy'
      }
      pendingText={
        step === 'details'
          ? keyAccount
            ? 'fetchingModels'
            : 'generatingAuthorization'
          : step === 'authorize'
            ? 'authorizing'
            : 'saving'
      }
      cancelText={createdId ? 'configureLater' : undefined}
      onBack={step !== 'details' && !createdId ? back : undefined}
      onClose={() => {
        if (createdId) void onSaved(createdId)
        else onClose()
      }}
    >
      <form
        id='account-onboarding'
        ref={form}
        aria-label={tr(
          step === 'details'
            ? 'basicInformation'
            : step === 'authorize'
              ? 'accountAuthorization'
              : 'modelPolicy'
        )}
        className='space-y-5'
        noValidate
        onChange={() => setInvalid(null)}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {step === 'details' && (
          <>
            <fieldset disabled={pending} className='min-w-0 space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='account-provider'>{tr('provider')}</Label>
                <UpstreamPlatformSelect
                  id='account-provider'
                  className='w-full'
                  disabled={!!account || !!flow}
                  value={platform}
                  onValueChange={(value) => {
                    if (!isAccountPlatform(value)) return
                    setPlatform(value)
                    setSettings((settings) => ({
                      ...settings,
                      groupIds: [],
                      modelAccess: { mode: 'all', models: [] },
                    }))
                    setApiKey('')
                    setName('')
                    setMethod('oauth')
                    setBaseUrl(defaultApiBaseUrl(value))
                    setCallbackUrl('')
                    setInvalid(null)
                  }}
                />
              </div>
              {!account && (
                <Tabs
                  value={method}
                  onValueChange={(value) => {
                    setMethod(value)
                    setSettings((current) => ({
                      ...current,
                      modelAccess: { mode: 'all', models: [] },
                    }))
                    setApiKey('')
                    setBaseUrl(defaultApiBaseUrl(provider))
                    setCallbackUrl('')
                    setInvalid(null)
                  }}
                >
                  <TabsList className='w-full' aria-label={tr('accessMethod')}>
                    {accessMethods.map((item) => (
                      <TabsTrigger
                        key={item.value}
                        className='flex-1'
                        value={item.value}
                      >
                        {item.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
              {keyAccount ? (
                <>
                  <div className='space-y-2'>
                    <Label htmlFor='account-name'>{tr('account')}</Label>
                    <Input
                      id='account-name'
                      maxLength={512}
                      autoComplete='off'
                      value={name}
                      aria-invalid={invalid === 'name'}
                      aria-describedby={
                        invalid === 'name'
                          ? 'account-onboarding-validation'
                          : undefined
                      }
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  <AccountConnectionFields
                    key={`${provider}-${method}`}
                    baseUrl={baseUrl}
                    apiKey={apiKey}
                    onBaseUrlChange={(value) => {
                      setBaseUrl(value)
                      setSettings((current) => ({
                        ...current,
                        modelAccess: { mode: 'all', models: [] },
                      }))
                    }}
                    onApiKeyChange={(value) => {
                      setApiKey(value)
                      setSettings((current) => ({
                        ...current,
                        modelAccess: { mode: 'all', models: [] },
                      }))
                    }}
                    invalid={invalid}
                    validationId='account-onboarding-validation'
                  />
                </>
              ) : (
                <div className='space-y-2'>
                  <Label htmlFor='account-name'>{tr('account')}</Label>
                  <Input
                    id='account-name'
                    value={name}
                    maxLength={512}
                    autoComplete='off'
                    aria-invalid={invalid === 'name'}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
              )}
            </fieldset>
            <AccountSettingsFields
              key={`${provider}-${method}`}
              platform={`all,${platform}`}
              value={settings}
              proxyId={proxyId}
              account={account}
              hideModels
              disabled={pending}
              onChange={setSettings}
              onProxyChange={setProxyId}
              invalid={invalid}
            />
          </>
        )}
        {step === 'authorize' && flow && (
          <div className='space-y-5'>
            <div className='space-y-2'>
              <Label htmlFor='account-authorization-url'>
                {tr('authorizationLink')}
              </Label>
              <Input
                id='account-authorization-url'
                readOnly
                value={flow.authorizationUrl}
                onFocus={(event) => event.target.select()}
              />
              <div className='flex flex-wrap gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => void copyAuthorization()}
                >
                  <Copy className='size-4' />
                  {tr('copyAuthorization')}
                </Button>
                <Button type='button' variant='outline' size='sm' asChild>
                  <a
                    href={flow.authorizationUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    {tr('openAuthorization')}
                    <ExternalLink className='size-4' />
                  </a>
                </Button>
              </div>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='account-callback'>{tr('callback')}</Label>
              <Input
                id='account-callback'
                maxLength={65536}
                autoComplete='off'
                spellCheck={false}
                disabled={pending}
                value={callbackUrl}
                placeholder={tr(
                  platform === 'openai'
                    ? 'openaiCallbackPlaceholder'
                    : 'callbackPlaceholder'
                )}
                aria-invalid={invalid === 'callback'}
                onChange={(event) => setCallbackUrl(event.target.value)}
              />
            </div>
          </div>
        )}
        {step === 'models' && (
          <SupportedModels
            accountId={createdId ?? undefined}
            value={settings.modelAccess}
            onChange={(modelAccess) =>
              setSettings((current) => ({ ...current, modelAccess }))
            }
            discover={
              keyAccount
                ? (signal) =>
                    upstreamAccounts.previewModels(
                      provider,
                      baseUrl,
                      apiKey,
                      proxyId,
                      signal
                    )
                : undefined
            }
            canDiscover={keyAccount}
            initialModels={preview}
            disabled={pending}
            invalid={invalid === 'models'}
          />
        )}
        {invalid && (
          <span className='sr-only' id='account-onboarding-validation'>
            {tr('invalid')}
          </span>
        )}
      </form>
    </AccountDialog>
  )
}
