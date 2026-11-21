import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  upstreamAccounts,
  type AccountSettings,
  type UpstreamAccount,
} from '@/api/upstream-accounts'
import { useIdentitySession } from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { RequestErrorToast } from '@/components/request-error-toast'
import { SettingsToggle } from '@/components/settings-toggle'
import { SupportedModels, type ModelDiscovery } from './supported-models'

export function AccountSettingsFields({
  value,
  platform,
  field,
  proxyId,
  account,
  disabled,
  onChange,
  onProxyChange,
  invalid,
  discoverModels,
  canDiscoverModels,
  modelSourceKey,
  hideModels = false,
}: {
  value: AccountSettings
  platform?: string
  field?: keyof AccountSettings | 'proxy'
  proxyId: string
  account?: UpstreamAccount
  disabled: boolean
  onChange: (value: AccountSettings) => void
  onProxyChange: (value: string) => void
  invalid: string | null
  discoverModels?: ModelDiscovery
  canDiscoverModels?: boolean
  modelSourceKey?: string
  hideModels?: boolean
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`upstreamAccounts.${key}`)
  const owner = useIdentitySession((state) => state.session?.id)
  const [selectedGroupNames, setSelectedGroupNames] = useState<
    Record<string, string>
  >({})
  const [selectedProxyNames, setSelectedProxyNames] = useState<
    Record<string, string>
  >({})
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [proxyOpen, setProxyOpen] = useState(false)
  const [groupSearch, setGroupSearch] = useState('')
  const [proxySearch, setProxySearch] = useState('')
  const [groupPage, setGroupPage] = useState(1)
  const [proxyPage, setProxyPage] = useState(1)
  const show = (name: string) => !field || field === name
  const groups = useQuery({
    queryKey: [
      'account-group-options',
      owner,
      platform,
      groupSearch,
      groupPage,
    ],
    queryFn: ({ signal }) =>
      upstreamAccounts.groups(groupSearch, groupPage, signal, platform),
    retry: false,
    gcTime: 0,
  })
  const proxies = useQuery({
    queryKey: ['account-proxy-options', owner, proxySearch, proxyPage],
    queryFn: ({ signal }) =>
      upstreamAccounts.proxies(proxySearch, proxyPage, signal),
    retry: false,
    gcTime: 0,
  })
  const options = new Map(
    [...(account?.groups ?? []), ...(groups.data?.items ?? [])].map((group) => [
      group.id,
      group,
    ])
  )
  for (const id of value.groupIds)
    if (!options.has(id)) options.set(id, { id, name: id, enabled: false })
  const pager = (
    page: number,
    total: number | undefined,
    set: (value: number) => void
  ) => (
    <div className='flex justify-end gap-1'>
      <Button
        type='button'
        size='icon-sm'
        variant='ghost'
        disabled={disabled || page <= 1}
        aria-label={tr('previous')}
        onClick={() => set(page - 1)}
      >
        <ChevronLeft className='size-4' />
      </Button>
      <Button
        type='button'
        size='icon-sm'
        variant='ghost'
        disabled={disabled || total === undefined || page >= total}
        aria-label={tr('next')}
        onClick={() => set(page + 1)}
      >
        <ChevronRight className='size-4' />
      </Button>
    </div>
  )
  return (
    <fieldset disabled={disabled} className='min-w-0 space-y-4'>
      {show('enabled') && (
        <SettingsToggle
          label={tr('enabled')}
          disabled={disabled}
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
      )}
      <div
        className={
          field ? 'grid gap-4' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'
        }
      >
        {show('concurrencyLimit') && (
          <div className='space-y-2'>
            <Label htmlFor='account-concurrencyLimit'>{tr('capacity')}</Label>
            <Input
              id='account-concurrencyLimit'
              type='number'
              min={1}
              max={4294967295}
              step={1}
              aria-invalid={invalid === 'concurrencyLimit'}
              aria-describedby={
                invalid === 'concurrencyLimit'
                  ? 'account-validation'
                  : undefined
              }
              value={value.concurrencyLimit ?? ''}
              placeholder={tr('unlimited')}
              onChange={(event) =>
                onChange({
                  ...value,
                  concurrencyLimit:
                    event.target.value === ''
                      ? null
                      : Number(event.target.value),
                })
              }
            />
          </div>
        )}
        {show('weight') && (
          <div className='space-y-2'>
            <Label htmlFor='account-weight'>{tr('weight')}</Label>
            <Input
              id='account-weight'
              type='number'
              min={1}
              max={100}
              step={1}
              aria-invalid={invalid === 'weight'}
              aria-describedby={
                invalid === 'weight' ? 'account-validation' : undefined
              }
              value={value.weight || ''}
              onChange={(event) =>
                onChange({ ...value, weight: Number(event.target.value) })
              }
            />
          </div>
        )}
      </div>
      <div className={field ? 'grid gap-4' : 'grid gap-4 sm:grid-cols-2'}>
        {show('groupIds') && (
          <div className='min-w-0 space-y-2'>
            <Label htmlFor='account-groups'>{tr('groups')}</Label>
            <Popover open={groupsOpen} onOpenChange={setGroupsOpen}>
              <PopoverTrigger asChild>
                <Button
                  id='account-groups'
                  type='button'
                  role='combobox'
                  aria-expanded={groupsOpen}
                  variant='outline'
                  disabled={disabled}
                  className='w-full justify-between'
                >
                  <span className='truncate'>
                    {value.groupIds
                      .map(
                        (id) =>
                          selectedGroupNames[id] ?? options.get(id)?.name ?? id
                      )
                      .join(', ') || tr('none')}
                  </span>
                  <ChevronsUpDown className='ml-2 size-4 shrink-0 opacity-50' />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className='w-[var(--radix-popover-trigger-width)] min-w-64 p-0'
                align='start'
              >
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder={tr('searchGroups')}
                    value={groupSearch}
                    onValueChange={(text) => {
                      setGroupSearch(text)
                      setGroupPage(1)
                    }}
                  />
                  <CommandList>
                    <CommandEmpty>{tr('none')}</CommandEmpty>
                    {groups.data?.items.map((group) => (
                      <CommandItem
                        key={group.id}
                        value={group.id}
                        onSelect={() => {
                          setSelectedGroupNames((names) => ({
                            ...names,
                            [group.id]: group.name,
                          }))
                          onChange({
                            ...value,
                            groupIds: value.groupIds.includes(group.id)
                              ? value.groupIds.filter((id) => id !== group.id)
                              : [...value.groupIds, group.id],
                          })
                        }}
                      >
                        <Check
                          className={`size-4 ${value.groupIds.includes(group.id) ? '' : 'opacity-0'}`}
                        />
                        <span className='truncate'>{group.name}</span>
                      </CommandItem>
                    ))}
                  </CommandList>
                  {pager(groupPage, groups.data?.page.totalPages, setGroupPage)}
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}
        {show('proxy') && (
          <div className='min-w-0 space-y-2'>
            <Label htmlFor='account-proxy'>{tr('proxy')}</Label>
            <Popover open={proxyOpen} onOpenChange={setProxyOpen}>
              <PopoverTrigger asChild>
                <Button
                  id='account-proxy'
                  type='button'
                  role='combobox'
                  aria-expanded={proxyOpen}
                  variant='outline'
                  disabled={disabled}
                  className='w-full justify-between'
                >
                  <span className='truncate'>
                    {proxyId
                      ? (selectedProxyNames[proxyId] ??
                        proxies.data?.items.find((p) => p.id === proxyId)
                          ?.name ??
                        account?.outboundProxyEndpoint ??
                        proxyId)
                      : tr('direct')}
                  </span>
                  <ChevronsUpDown className='ml-2 size-4 shrink-0 opacity-50' />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className='w-[var(--radix-popover-trigger-width)] min-w-64 p-0'
                align='start'
              >
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder={tr('searchProxies')}
                    value={proxySearch}
                    onValueChange={(text) => {
                      setProxySearch(text)
                      setProxyPage(1)
                    }}
                  />
                  <CommandList>
                    <CommandEmpty>{tr('none')}</CommandEmpty>
                    <CommandItem
                      value='__direct'
                      onSelect={() => {
                        onProxyChange('')
                        setProxyOpen(false)
                      }}
                    >
                      <Check
                        className={`size-4 ${!proxyId ? '' : 'opacity-0'}`}
                      />
                      {tr('direct')}
                    </CommandItem>
                    {proxies.data?.items.map((proxy) => (
                      <CommandItem
                        key={proxy.id}
                        value={proxy.id}
                        disabled={!proxy.enabled && proxy.id !== proxyId}
                        onSelect={() => {
                          setSelectedProxyNames((names) => ({
                            ...names,
                            [proxy.id]: proxy.name,
                          }))
                          onProxyChange(proxy.id)
                          setProxyOpen(false)
                        }}
                      >
                        <Check
                          className={`size-4 ${proxy.id === proxyId ? '' : 'opacity-0'}`}
                        />
                        <span className='truncate'>
                          {proxy.name} ({proxy.endpoint})
                        </span>
                      </CommandItem>
                    ))}
                  </CommandList>
                  {pager(
                    proxyPage,
                    proxies.data?.page.totalPages,
                    setProxyPage
                  )}
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
      {groups.error && <RequestErrorToast message={groups.error.message} />}
      {proxies.error && <RequestErrorToast message={proxies.error.message} />}
      {!hideModels && show('modelAccess') && (
        <SupportedModels
          key={modelSourceKey ?? account?.id ?? 'batch'}
          accountId={account?.id}
          value={value.modelAccess}
          onChange={(modelAccess) => onChange({ ...value, modelAccess })}
          discover={discoverModels}
          canDiscover={canDiscoverModels}
          sourceKey={modelSourceKey}
          disabled={disabled}
          invalid={invalid === 'models'}
        />
      )}
      {show('notes') && (
        <div className='space-y-2'>
          <Label htmlFor='account-notes'>{tr('notes')}</Label>
          <Textarea
            id='account-notes'
            value={value.notes}
            maxLength={500}
            aria-invalid={invalid === 'notes'}
            aria-describedby={
              invalid === 'notes' ? 'account-validation' : undefined
            }
            rows={3}
            onChange={(event) =>
              onChange({ ...value, notes: event.target.value })
            }
          />
        </div>
      )}
      {invalid && (
        <span id='account-validation' className='sr-only'>
          {tr('invalid')}
        </span>
      )}
    </fieldset>
  )
}
