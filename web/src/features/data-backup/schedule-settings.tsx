import { useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  backups,
  type BackupSettings,
  type BackupSchedule,
} from '@/api/backups'
import { useIdentitySession } from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
import { ConfigurationSection } from '@/components/configuration-section'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import { BackupField } from './fields'

export function ScheduleSettings({
  settings,
  owner,
  disabled,
  draft,
  onDraftChange,
  onSaved,
  onBusyChange,
}: {
  settings: BackupSettings
  owner: string
  disabled: boolean
  onSaved: (settings: BackupSettings) => void
  onBusyChange: (pending: boolean) => void
  draft: BackupSchedule | null
  onDraftChange: (draft: BackupSchedule | null) => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`liveInfrastructure.${key}`)
  const [pending, setPending] = useState(false)
  const values = draft ?? {
    scheduleEnabled: settings.scheduleEnabled,
    cronExpression: settings.cronExpression ?? '',
    retentionDays: settings.retentionDays,
    retentionCount: settings.retentionCount,
  }
  function change<K extends keyof BackupSchedule>(
    key: K,
    value: BackupSchedule[K]
  ) {
    onDraftChange({ ...values, [key]: value })
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      pending ||
      disabled ||
      useIdentitySession.getState().session?.id !== owner ||
      !event.currentTarget.reportValidity()
    )
      return
    if (
      !values.cronExpression.trim() ||
      [values.retentionDays, values.retentionCount].some(
        (value) =>
          !Number.isSafeInteger(value) || value < 0 || value > 4294967295
      )
    ) {
      toast.error(tr('invalid'), { id: 'backup-schedule' })
      return
    }
    setPending(true)
    onBusyChange(true)
    try {
      const result = await backups.schedule(values)
      if (useIdentitySession.getState().session?.id !== owner) return
      onDraftChange(null)
      onSaved(result)
      toast.success(tr('saved'))
    } catch (error) {
      if (useIdentitySession.getState().session?.id === owner)
        toast.error(
          error instanceof Error ? error.message : tr('unavailable'),
          { id: 'backup-schedule' }
        )
    } finally {
      setPending(false)
      onBusyChange(false)
    }
  }
  return (
    <ConfigurationSection
      title={t('dataBackup.scheduleTitle')}
      action={
        <SwitchLabeled
          id='backup-schedule-enabled'
          size='sm'
          containedMotion
          disabled={disabled || pending || !settings.storageEnabled}
          aria-label={t('dataBackup.enableSchedule')}
          checked={values.scheduleEnabled}
          onCheckedChange={(value) => change('scheduleEnabled', value)}
        />
      }
    >
      <form onSubmit={save} className='space-y-4'>
        <fieldset disabled={disabled || pending} className='space-y-4'>
          <div className='grid min-w-0 gap-4 @lg/backup:grid-cols-3'>
            <BackupField
              id='backup-cron'
              label={t('dataBackup.cronExpression')}
              required
              value={values.cronExpression}
              maxLength={256}
              onChange={(event) => change('cronExpression', event.target.value)}
            />
            {(['retentionDays', 'retentionCount'] as const).map((key) => (
              <BackupField
                key={key}
                id={`backup-${key}`}
                label={t(
                  `dataBackup.${key === 'retentionDays' ? 'expirationDays' : 'maxRetained'}`
                )}
                type='number'
                required
                min={0}
                max={4294967295}
                step={1}
                value={values[key]}
                onChange={(event) => change(key, Number(event.target.value))}
              />
            ))}
          </div>
        </fieldset>
        <div className='flex justify-end border-t pt-4'>
          <Button
            type='submit'
            size='sm'
            disabled={disabled || pending || !draft}
          >
            <Save />
            {t('dataBackup.save')}
          </Button>
        </div>
      </form>
    </ConfigurationSection>
  )
}
