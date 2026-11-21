import { useId, useMemo, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import {
  accountProviderLabel,
  aggregatePlatformCounts,
} from '@/lib/upstream-platforms'
import { useSettingsGroups } from '@/hooks/use-settings-options'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfigurationSection } from '@/components/configuration-section'
import { errorCategories } from '@/features/channels/data'
import { SettingsSelectionTable } from '@/features/feature-settings/settings-selection-table'
import {
  thresholdKeys,
  type ChannelMonitoringDraft,
  type MonitoringErrors,
} from './channel-monitoring-draft'

export function ChannelMonitoringSettings({
  value,
  onChange,
  errors,
  formRef,
  onSave,
}: {
  value: ChannelMonitoringDraft
  onChange: (value: ChannelMonitoringDraft) => void
  errors: MonitoringErrors
  formRef: RefObject<HTMLFormElement | null>
  onSave: () => void
}) {
  const { t } = useTranslation()
  const groups = useSettingsGroups()
  const id = useId()
  const groupOptions = useMemo(
    () =>
      groups.map((group) => ({
        id: group.id,
        name: group.name,
        detail: Object.keys(aggregatePlatformCounts(group.providerCounts))
          .map((provider) => accountProviderLabel(provider))
          .join(', '),
        status: t('groups.' + (group.enabled ? 'active' : 'disabled')),
        visibility: t('groups.' + group.visibility),
        accountCount: group.memberCount,
      })),
    [t, groups]
  )
  const errorOptions = useMemo(
    () =>
      errorCategories.map((error) => ({
        id: error,
        name: t('channelConfig.errorCategories.' + error),
        detail: error,
      })),
    [t]
  )
  return (
    <div className='min-w-0 space-y-6'>
      <form
        ref={formRef}
        noValidate
        data-testid='channel-monitoring-thresholds'
        onSubmit={(event) => {
          event.preventDefault()
          onSave()
        }}
      >
        <ConfigurationSection title={t('channelMonitoringSettings.thresholds')}>
          <div className='grid min-w-0 grid-cols-2 gap-4 @max-[20rem]/features:grid-cols-1 @3xl/features:grid-cols-4'>
            {thresholdKeys.map((key) => {
              const path = 'thresholds.' + key
              const error = errors[path]
              const unit = key.startsWith('ttft')
                ? 'ms'
                : key === 'samples'
                  ? ''
                  : '%'
              return (
                <div key={key} className='min-w-0 space-y-2'>
                  <Label
                    htmlFor={id + key}
                    className='text-xs text-muted-foreground'
                  >
                    {t('channelConfig.' + key)}
                    {unit && ' ' + unit}
                  </Label>
                  <Input
                    id={id + key}
                    name={path}
                    type='number'
                    inputMode={unit === '%' ? 'decimal' : 'numeric'}
                    min={key === 'samples' ? 1 : 0}
                    max={
                      unit === '%' ? 100 : key === 'samples' ? 1000000 : 3600000
                    }
                    step={unit === '%' ? '0.01' : '1'}
                    value={value.thresholds[key]}
                    aria-invalid={!!error}
                    aria-describedby={error ? id + key + '-error' : undefined}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        thresholds: {
                          ...value.thresholds,
                          [key]: event.target.value,
                        },
                      })
                    }
                  />
                  {error && (
                    <span id={id + key + '-error'} className='sr-only'>
                      {t('channelMonitoringSettings.' + error)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </ConfigurationSection>
      </form>
      <SettingsSelectionTable
        title={t('channelConfig.monitorGroups')}
        addLabel={t('channelMonitoringSettings.addGroup')}
        selectLabel={t('channelMonitoringSettings.selectGroup')}
        detailLabel={t('groups.platform')}
        options={groupOptions}
        selected={value.groupIds}
        onChange={(groupIds) => onChange({ ...value, groupIds })}
        testId='channel-monitoring-groups'
        filterDetail
      />
      <SettingsSelectionTable
        title={t('channelMonitoringSettings.errors')}
        addLabel={t('channelMonitoringSettings.addError')}
        selectLabel={t('channelMonitoringSettings.selectError')}
        detailLabel={t('channelMonitoringSettings.errorCode')}
        options={errorOptions}
        selected={value.ignoredErrors}
        onChange={(ignoredErrors) =>
          onChange({
            ...value,
            ignoredErrors:
              ignoredErrors as ChannelMonitoringDraft['ignoredErrors'],
          })
        }
        testId='channel-monitoring-errors'
      />
    </div>
  )
}
