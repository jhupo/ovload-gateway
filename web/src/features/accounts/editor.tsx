import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ApiError } from '@/api/errors'
import {
  settingsFor,
  upstreamAccounts,
  type UpstreamAccount,
  type AccountConnection,
} from '@/api/upstream-accounts'
import { useIdentitySession } from '@/stores/identity-session'
import { accountPlatform } from '@/lib/upstream-platforms'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RequestErrorToast } from '@/components/request-error-toast'
import { SettingsToggle } from '@/components/settings-toggle'
import { AccountDialog } from './account-dialog'
import { validApiBaseUrl, validApiKey } from './connection'
import { AccountConnectionFields } from './connection-fields'
import { invalidSettings } from './settings'
import { AccountSettingsFields } from './settings-fields'

export function AccountEditor({
  account,
  onClose,
  onSaved,
}: {
  account: UpstreamAccount
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`upstreamAccounts.${key}`)
  const [name, setName] = useState(account.name)
  const [initial] = useState(() => settingsFor(account))
  const [settings, setSettings] = useState(initial)
  const [proxyId, setProxyId] = useState(account.outboundProxyId ?? '')
  const [pending, setPending] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)
  const owner = useIdentitySession((state) => state.session?.id)
  const [editConnection, setEditConnection] = useState(false)
  const [baseUrl, setBaseUrl] = useState('')
  const [transport, setTransport] =
    useState<AccountConnection['transport']>('http')
  const [apiKey, setApiKey] = useState('')
  const configuration = useQuery({
    queryKey: ['upstream-account-detail', owner, account.id],
    queryFn: ({ signal }) => upstreamAccounts.detail(account.id, signal),
    enabled:
      account.provider === 'openai' || account.authenticationKind === 'api_key',
    retry: false,
  })
  const dirty =
    name !== account.name ||
    JSON.stringify(initial) !== JSON.stringify(settings) ||
    proxyId !== (account.outboundProxyId ?? '') ||
    editConnection
  async function save() {
    if (pending) return
    const issue =
      !name.trim() ||
      new TextEncoder().encode(name.trim()).length > 512 ||
      Array.from(name).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      )
        ? 'name'
        : invalidSettings(settings)
    setInvalid(issue)
    if (issue) {
      toast.error(tr('invalid'), { id: 'account-validation' })
      document.getElementById(`account-${issue}`)?.focus()
      return
    }
    if (!owner || useIdentitySession.getState().session?.id !== owner) return
    let connection: AccountConnection | undefined
    if (editConnection) {
      if (
        configuration.data?.account.configRevision !== account.configRevision
      ) {
        toast.error(tr('conflict'), { id: 'upstream-account-save' })
        return
      }
      if (
        account.authenticationKind === 'api_key' &&
        !validApiBaseUrl(baseUrl)
      ) {
        setInvalid('baseUrl')
        toast.error(tr('invalid'), { id: 'account-validation' })
        document.getElementById('account-baseUrl')?.focus()
        return
      }
      if (apiKey && !validApiKey(apiKey)) {
        setInvalid('apiKey')
        toast.error(tr('invalid'), { id: 'account-validation' })
        document.getElementById('account-apiKey')?.focus()
        return
      }
      connection = {
        transport,
        ...(account.authenticationKind === 'api_key'
          ? { baseUrl, ...(apiKey ? { apiKey } : {}) }
          : {}),
      }
    }
    setPending(true)
    try {
      await upstreamAccounts.update(
        account,
        settings,
        proxyId,
        connection,
        name.trim()
      )
      if (useIdentitySession.getState().session?.id !== owner) return
      toast.success(tr('saved'))
      setApiKey('')
      await onSaved()
    } catch (error) {
      if (useIdentitySession.getState().session?.id === owner)
        toast.error(
          error instanceof ApiError && error.status === 409
            ? tr('conflict')
            : error instanceof Error
              ? error.message
              : tr('failed'),
          {
            id: 'upstream-account-save',
          }
        )
    } finally {
      setPending(false)
    }
  }
  return (
    <AccountDialog
      title={`${tr('edit')} · ${account.name}`}
      dirty={dirty}
      pending={pending}
      form='account-editor'
      onClose={onClose}
    >
      <form
        id='account-editor'
        noValidate
        onChange={() => setInvalid(null)}
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className='mb-5 space-y-2'>
          <Label htmlFor='account-name'>{tr('account')}</Label>
          <Input
            id='account-name'
            value={name}
            disabled={pending}
            maxLength={512}
            aria-invalid={invalid === 'name'}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        {(account.provider === 'openai' ||
          account.authenticationKind === 'api_key') && (
          <div className='mb-5 space-y-4'>
            <SettingsToggle
              label={tr('connection')}
              checked={editConnection}
              disabled={pending || !configuration.data?.credentialConfiguration}
              onCheckedChange={(checked) => {
                if (
                  checked &&
                  configuration.data?.account.configRevision !==
                    account.configRevision
                ) {
                  toast.error(tr('conflict'), { id: 'upstream-account-save' })
                  return
                }
                setEditConnection(checked)
                setBaseUrl(
                  configuration.data?.credentialConfiguration?.base_url ?? ''
                )
                setTransport(
                  account.provider === 'openai_api'
                    ? 'http'
                    : (configuration.data?.credentialConfiguration?.transport ??
                        'http')
                )
                setApiKey('')
              }}
            />
            {configuration.isError && (
              <RequestErrorToast message={configuration.error.message} />
            )}
            {editConnection && (
              <fieldset disabled={pending} className='space-y-4'>
                {account.authenticationKind === 'api_key' && (
                  <AccountConnectionFields
                    baseUrl={baseUrl}
                    apiKey={apiKey}
                    onBaseUrlChange={setBaseUrl}
                    onApiKeyChange={setApiKey}
                    invalid={invalid}
                    validationId='account-editor-validation'
                    replacement
                  />
                )}
                <div className='space-y-2'>
                  <Label htmlFor='account-transport'>{tr('transport')}</Label>
                  <Select
                    value={transport}
                    onValueChange={(value: AccountConnection['transport']) =>
                      setTransport(value)
                    }
                  >
                    <SelectTrigger id='account-transport' className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='http'>HTTP</SelectItem>
                      {account.provider === 'openai' && (
                        <SelectItem value='prefer_websocket'>
                          WebSocket / HTTP
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </fieldset>
            )}
          </div>
        )}
        <AccountSettingsFields
          platform={`all,${accountPlatform(account.provider)}`}
          account={account}
          modelSourceKey={`${editConnection}:${baseUrl}:${apiKey}:${proxyId}`}
          canDiscoverModels={validApiBaseUrl(baseUrl) && validApiKey(apiKey)}
          discoverModels={
            editConnection && account.authenticationKind === 'api_key'
              ? (signal) =>
                  upstreamAccounts.previewModels(
                    account.provider as import('@/api/upstream-accounts').UpstreamProvider,
                    baseUrl,
                    apiKey,
                    proxyId,
                    signal
                  )
              : undefined
          }
          value={settings}
          proxyId={proxyId}
          disabled={pending}
          onChange={setSettings}
          onProxyChange={setProxyId}
          invalid={invalid}
        />
        {invalid && (
          <span className='sr-only' id='account-editor-validation'>
            {tr('invalid')}
          </span>
        )}
      </form>
    </AccountDialog>
  )
}
