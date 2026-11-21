import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { upstreamAccounts, type UpstreamAccount } from '@/api/upstream-accounts'
import { useIdentitySession } from '@/stores/identity-session'
import { accountPlatform } from '@/lib/upstream-platforms'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AccountDialog } from './account-dialog'
import { defaultSettings, invalidSettings } from './settings'
import { AccountSettingsFields } from './settings-fields'

type Field =
  | 'enabled'
  | 'concurrencyLimit'
  | 'weight'
  | 'groupIds'
  | 'proxy'
  | 'modelAccess'
export function AccountBatchEditor({
  accounts,
  revision,
  onClose,
  onSaved,
}: {
  accounts: UpstreamAccount[]
  revision: number
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`upstreamAccounts.${key}`)
  const owner = useIdentitySession((state) => state.session?.id)
  const [field, setField] = useState<Field>('enabled')
  const [settings, setSettings] = useState(defaultSettings)
  const [proxy, setProxy] = useState('')
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)
  const providers = new Set(
    accounts.map((account) => accountPlatform(account.provider))
  )
  const platform =
    providers.size === 1
      ? `all,${accountPlatform(accounts[0].provider)}`
      : 'all'
  const labels: Record<Field, string> = {
    enabled: 'enabled',
    concurrencyLimit: 'capacity',
    weight: 'weight',
    groupIds: 'groups',
    proxy: 'proxy',
    modelAccess: 'modelPolicy',
  }
  async function save() {
    if (pending || useIdentitySession.getState().session?.id !== owner) return
    const issue = invalidSettings(settings)
    setInvalid(issue)
    if (issue) {
      toast.error(tr('invalid'))
      return
    }
    setPending(true)
    try {
      await upstreamAccounts.batchUpdate(
        revision,
        accounts.map((account) => account.id),
        field === 'proxy'
          ? { outboundProxyId: proxy }
          : { [field]: settings[field] }
      )
      if (useIdentitySession.getState().session?.id !== owner) return
      toast.success(tr('saved'))
      await onSaved()
    } catch (error) {
      if (useIdentitySession.getState().session?.id === owner)
        toast.error(error instanceof Error ? error.message : tr('failed'))
    } finally {
      setPending(false)
    }
  }
  return (
    <AccountDialog
      title={t('upstreamAccounts.batchCount', { count: accounts.length })}
      dirty={dirty}
      pending={pending}
      form='account-batch'
      onClose={onClose}
    >
      <form
        id='account-batch'
        className='space-y-4'
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className='space-y-2'>
          <Label htmlFor='account-batch-field'>{tr('changeField')}</Label>
          <Select
            value={field}
            disabled={pending}
            onValueChange={(value: Field) => {
              setField(value)
              setSettings(defaultSettings)
              setProxy('')
              setInvalid(null)
              setDirty(false)
            }}
          >
            <SelectTrigger id='account-batch-field' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(labels) as Field[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {tr(labels[key])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AccountSettingsFields
          key={field}
          field={field}
          platform={platform}
          canDiscoverModels={field === 'modelAccess'}
          discoverModels={async () => {
            const catalogs = await Promise.all(
              accounts.map((account) => upstreamAccounts.syncModels(account.id))
            )
            return {
              models: [
                ...new Map(
                  catalogs
                    .flatMap((catalog) => catalog.models)
                    .map((model) => [model.id, model])
                ).values(),
              ],
            }
          }}
          value={settings}
          proxyId={proxy}
          disabled={pending}
          invalid={invalid}
          onChange={(value) => {
            setSettings(value)
            setDirty(true)
            setInvalid(null)
          }}
          onProxyChange={(value) => {
            setProxy(value)
            setDirty(true)
          }}
        />
      </form>
    </AccountDialog>
  )
}
