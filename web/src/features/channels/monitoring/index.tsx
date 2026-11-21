import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ConfigurationSection } from '@/components/configuration-section'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import { groups } from '@/features/groups/data/groups'
import {
  CheckboxCollection,
  ConfigurationInput,
  ConfigurationSelect,
} from '../components/configuration'
import { GroupSelection } from '../components/group-selection'
import { errorCategories, providerOptions } from '../data'
import { AddModel } from './add-model'

const emptyConfig = {
  enabled: false,
  interval: '',
  timeout: '',
  retries: '',
  providers: [] as {
    id: string
    enabled: boolean
    models: string[]
    customModels: string[]
  }[],
  groups: [] as string[],
  ignored: [] as string[],
  thresholds: {
    samples: '',
    errorWarning: '',
    errorCritical: '',
    ttftTarget: '',
    ttftWarning: '',
    ttftCritical: '',
    cacheWarning: '',
    cacheCritical: '',
  },
}
export function ChannelMonitoring() {
  const { t } = useTranslation()
  const [config, setConfig] = useState(emptyConfig)
  const [providerToAdd, setProviderToAdd] = useState('')
  return (
    <>
      <Header fixed className='bg-background'>
        <ProfileDropdown />
      </Header>
      <Main id='content' className='flex min-w-0 flex-1 flex-col'>
        <div
          data-slot='page-heading'
          className='flex flex-wrap items-center justify-between gap-3'
        >
          <div className='flex items-center gap-3'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {t('channels.monitoring.title')}
            </h1>
          </div>
          <Button disabled>
            <Save />
            {t('channelConfig.save')}
          </Button>
        </div>

        <fieldset disabled className='flex min-w-0 flex-col gap-5'>
          <ConfigurationSection title={t('channelConfig.checks')}>
            <div className='grid items-end gap-5 sm:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr_1fr]'>
              <div className='flex h-9 items-center justify-between gap-3'>
                <Label htmlFor='automatic-check'>
                  {t('channelConfig.enabled')}
                </Label>
                <SwitchLabeled
                  disabled
                  id='automatic-check'
                  checked={config.enabled}
                  onCheckedChange={(enabled) =>
                    setConfig({ ...config, enabled })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label
                  id='interval-label'
                  className='text-xs text-muted-foreground'
                >
                  {t('channelConfig.frequency')}
                </Label>
                <RadioGroup
                  disabled
                  aria-labelledby='interval-label'
                  value={config.interval}
                  onValueChange={(interval) =>
                    setConfig({ ...config, interval })
                  }
                  className='grid grid-cols-3 gap-1 rounded-md bg-muted p-1'
                >
                  {['1', '5', '15'].map((value) => (
                    <label
                      key={value}
                      className='relative flex h-7 cursor-pointer items-center justify-center rounded text-xs has-focus-visible:ring-2 has-focus-visible:ring-ring has-[[data-state=checked]]:bg-background has-[[data-state=checked]]:shadow-sm'
                    >
                      <RadioGroupItem value={value} className='sr-only' />
                      {t('channelConfig.minute', { count: Number(value) })}
                    </label>
                  ))}
                </RadioGroup>
              </div>
              <ConfigurationInput
                label={t('channelConfig.timeout')}
                type='number'
                min={1}
                max={300}
                unit='s'
                value={config.timeout}
                onChange={(e) =>
                  setConfig({ ...config, timeout: e.target.value })
                }
              />
              <ConfigurationInput
                label={t('channelConfig.retries')}
                type='number'
                min={0}
                max={5}
                value={config.retries}
                onChange={(e) =>
                  setConfig({ ...config, retries: e.target.value })
                }
              />
            </div>
          </ConfigurationSection>
          <ConfigurationSection
            title={t('channelConfig.platforms')}
            id='provider-configuration'
            action={
              config.providers.length < providerOptions.length && (
                <div className='flex items-end gap-2'>
                  <ConfigurationSelect
                    disabled
                    label={t('channelConfig.addProvider')}
                    value={providerToAdd}
                    onChange={setProviderToAdd}
                    options={providerOptions
                      .filter(
                        (p) => !config.providers.some((row) => row.id === p.id)
                      )
                      .map((p) => ({ value: p.id, label: p.name }))}
                  />
                  <Button
                    size='icon'
                    variant='outline'
                    aria-label={t('channelConfig.addProvider')}
                    disabled={!providerToAdd}
                    onClick={() => {
                      const p = providerOptions.find(
                        (p) => p.id === providerToAdd
                      )
                      if (p) {
                        setConfig({
                          ...config,
                          providers: [
                            ...config.providers,
                            {
                              id: p.id,
                              enabled: true,
                              models: [],
                              customModels: [],
                            },
                          ],
                        })
                        setProviderToAdd('')
                      }
                    }}
                  >
                    <Plus />
                  </Button>
                </div>
              )
            }
          >
            <div className='divide-y'>
              {config.providers.map((row) => {
                const provider = providerOptions.find((p) => p.id === row.id)
                if (!provider) return null
                const models = row.customModels
                return (
                  <div
                    key={row.id}
                    className='grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[170px_minmax(0,1fr)_36px] sm:items-center'
                  >
                    <div className='flex items-center gap-3'>
                      <SwitchLabeled
                        aria-label={provider.name}
                        checked={row.enabled}
                        onCheckedChange={(enabled) =>
                          setConfig({
                            ...config,
                            providers: config.providers.map((p) =>
                              p.id === row.id ? { ...p, enabled } : p
                            ),
                          })
                        }
                      />
                      <span className='text-sm font-medium'>
                        {provider.name}
                      </span>
                      <Button
                        size='icon'
                        variant='ghost'
                        className='ml-auto sm:hidden'
                        aria-label={t('channelConfig.remove', {
                          name: provider.name,
                        })}
                        onClick={() =>
                          setConfig({
                            ...config,
                            providers: config.providers.filter(
                              (p) => p.id !== row.id
                            ),
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div
                      className='flex flex-wrap gap-2'
                      role='group'
                      aria-label={
                        provider.name + ' ' + t('channelConfig.models')
                      }
                    >
                      {models.map((model) => (
                        <label
                          key={model}
                          className='flex max-w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border bg-muted/15 px-3 py-2 text-xs'
                        >
                          <Checkbox
                            checked={row.models.includes(model)}
                            onCheckedChange={(checked) =>
                              setConfig({
                                ...config,
                                providers: config.providers.map((p) =>
                                  p.id === row.id
                                    ? {
                                        ...p,
                                        models:
                                          checked === true
                                            ? [...p.models, model]
                                            : p.models.filter(
                                                (m) => m !== model
                                              ),
                                      }
                                    : p
                                ),
                              })
                            }
                          />
                          <span className='min-w-0 break-all'>{model}</span>
                        </label>
                      ))}
                      <AddModel
                        provider={provider.name}
                        models={models}
                        onAdd={(model) =>
                          setConfig((current) => ({
                            ...current,
                            providers: current.providers.map((p) =>
                              p.id === row.id
                                ? {
                                    ...p,
                                    models: [...p.models, model],
                                    customModels: [...p.customModels, model],
                                  }
                                : p
                            ),
                          }))
                        }
                      />
                    </div>
                    <Button
                      size='icon'
                      variant='ghost'
                      className='hidden sm:inline-flex'
                      aria-label={t('channelConfig.remove', {
                        name: provider.name,
                      })}
                      onClick={() =>
                        setConfig({
                          ...config,
                          providers: config.providers.filter(
                            (p) => p.id !== row.id
                          ),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )
              })}
            </div>
          </ConfigurationSection>
          <div className='grid min-w-0 gap-4'>
            <ConfigurationSection
              title={t('channelConfig.monitorGroups')}
              id='monitoring-groups'
            >
              <GroupSelection
                title={t('channelConfig.monitorGroups')}
                groups={groups}
                selected={config.groups}
                onChange={(groups) => setConfig({ ...config, groups })}
              />
            </ConfigurationSection>
            <ConfigurationSection
              title={t('channelConfig.errors')}
              id='error-exclusions'
            >
              <CheckboxCollection
                title={t('channelConfig.errors')}
                options={errorCategories.map((id) => ({
                  id,
                  label: t('channelConfig.errorCategories.' + id),
                }))}
                selected={config.ignored}
                countLabel={t('channelConfig.ignored', {
                  count: config.ignored.length,
                })}
                onChange={(ignored) => setConfig({ ...config, ignored })}
              />
            </ConfigurationSection>
          </div>
          <ConfigurationSection
            title={t('channelConfig.thresholds')}
            id='health-thresholds'
          >
            <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
              {(
                Object.keys(
                  config.thresholds
                ) as (keyof typeof config.thresholds)[]
              ).map((key) => (
                <ConfigurationInput
                  key={key}
                  label={t('channelConfig.' + key)}
                  type='number'
                  min={key === 'samples' ? 1 : 0}
                  unit={
                    key.startsWith('ttft')
                      ? 'ms'
                      : key === 'samples'
                        ? undefined
                        : '%'
                  }
                  value={config.thresholds[key]}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      thresholds: {
                        ...config.thresholds,
                        [key]: e.target.value,
                      },
                    })
                  }
                />
              ))}
            </div>
          </ConfigurationSection>
        </fieldset>
        <div className='sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur-sm md:-mx-6 md:px-6'>
          <Button variant='outline' disabled>
            {t('channelConfig.reset')}
          </Button>
          <Button disabled>
            <Save />
            {t('channelConfig.save')}
          </Button>
        </div>
      </Main>
    </>
  )
}
