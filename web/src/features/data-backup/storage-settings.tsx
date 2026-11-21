import { useState, type FormEvent } from 'react'
import { Save, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { backups, type BackupSettings, type BackupStorage } from '@/api/backups'
import { integrations } from '@/api/integrations'
import { useIdentitySession } from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ConfigurationSection } from '@/components/configuration-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import { BackupField } from './fields'

export function StorageSettings({
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
  draft: BackupStorage | null
  onDraftChange: (draft: BackupStorage | null) => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`liveInfrastructure.${key}`)
  const [pending, setPending] = useState(false)
  const [testing, setTesting] = useState(false)
  const values = draft ?? {
    endpoint: settings.endpoint ?? '',
    region: settings.region ?? '',
    bucket: settings.bucket ?? '',
    prefix: settings.prefix ?? '',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: settings.forcePathStyle,
  }
  function change<K extends keyof BackupStorage>(
    key: K,
    value: BackupStorage[K]
  ) {
    onDraftChange({ ...values, [key]: value })
  }
  function busy(value: boolean) {
    setPending(value)
    onBusyChange(value)
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
    let endpoint: URL
    try {
      endpoint = new URL(values.endpoint)
    } catch {
      toast.error(tr('invalid'), { id: 'backup-storage' })
      return
    }
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    ) {
      toast.error(tr('invalid'), { id: 'backup-storage' })
      return
    }
    busy(true)
    try {
      const result = await backups.storage({
        ...values,
        secretAccessKey: values.secretAccessKey || undefined,
      })
      if (useIdentitySession.getState().session?.id !== owner) return
      onDraftChange(null)
      onSaved(result)
      toast.success(tr('saved'))
    } catch (error) {
      if (useIdentitySession.getState().session?.id === owner)
        toast.error(
          error instanceof Error ? error.message : tr('unavailable'),
          { id: 'backup-storage' }
        )
    } finally {
      busy(false)
    }
  }
  async function toggle(enabled: boolean) {
    if (pending || disabled || draft) return
    busy(true)
    try {
      await integrations.backupToggle(settings.storageRevision, enabled)
      const result = await backups.settings()
      if (useIdentitySession.getState().session?.id === owner) {
        onSaved(result)
        toast.success(tr('saved'))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr('unavailable'))
    } finally {
      busy(false)
    }
  }
  async function test() {
    if (
      pending ||
      disabled ||
      draft ||
      useIdentitySession.getState().session?.id !== owner
    )
      return
    busy(true)
    try {
      const result = await backups.test()
      if (useIdentitySession.getState().session?.id !== owner) return
      setTesting(false)
      if (result.ok) {
        const settings = await backups.settings()
        if (useIdentitySession.getState().session?.id !== owner) return
        onSaved(settings)
        toast.success(tr('testPassed'))
      } else toast.error(tr('testFailed'), { id: 'backup-storage-test' })
    } catch (error) {
      if (useIdentitySession.getState().session?.id === owner)
        toast.error(
          error instanceof Error ? error.message : tr('unavailable'),
          { id: 'backup-storage-test' }
        )
    } finally {
      busy(false)
    }
  }
  return (
    <>
      <ConfigurationSection
        title={t('dataBackup.storageTitle')}
        action={
          <SwitchLabeled
            size='sm'
            containedMotion
            checked={settings.storageEnabled}
            disabled={
              disabled ||
              pending ||
              !!draft ||
              (!settings.storageEnabled && !settings.verified)
            }
            onCheckedChange={(enabled) => void toggle(enabled)}
            aria-label={t('dataBackup.enableStorage')}
          />
        }
      >
        <form onSubmit={save} className='space-y-4'>
          <fieldset
            disabled={disabled || pending}
            className='grid min-w-0 gap-4 @lg/backup:grid-cols-2'
          >
            {(['endpoint', 'region', 'bucket', 'prefix'] as const).map(
              (key) => (
                <BackupField
                  key={key}
                  id={`backup-${key}`}
                  label={t(
                    `dataBackup.${key === 'prefix' ? 'keyPrefix' : key}`
                  )}
                  value={values[key]}
                  required={key !== 'prefix'}
                  maxLength={key === 'endpoint' ? 2048 : 255}
                  onChange={(event) => change(key, event.target.value)}
                />
              )
            )}
            <BackupField
              id='backup-access-key'
              label={t('dataBackup.accessKey')}
              type='password'
              required
              maxLength={255}
              value={values.accessKeyId}
              placeholder={
                settings.hasAccessKey ? tr('savedCredentialReenter') : ''
              }
              onChange={(event) => change('accessKeyId', event.target.value)}
            />
            <BackupField
              id='backup-secret-key'
              label={t('dataBackup.secretKey')}
              type='password'
              required={!settings.hasSecret}
              maxLength={512}
              value={values.secretAccessKey ?? ''}
              placeholder={settings.hasSecret ? tr('savedCredentialKeep') : ''}
              onChange={(event) =>
                change('secretAccessKey', event.target.value)
              }
            />
            <div className='flex items-center justify-between gap-4'>
              <Label htmlFor='backup-path-style'>{tr('forcePathStyle')}</Label>
              <SwitchLabeled
                id='backup-path-style'
                size='sm'
                containedMotion
                checked={values.forcePathStyle}
                onCheckedChange={(value) => change('forcePathStyle', value)}
              />
            </div>
          </fieldset>
          <div className='flex justify-end gap-2 border-t pt-4'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={
                disabled ||
                pending ||
                !!draft ||
                !settings.hasSecret ||
                !settings.endpoint
              }
              onClick={() => setTesting(true)}
            >
              <Server />
              {t('dataBackup.testConnection')}
            </Button>
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
      <ConfirmDialog
        open={testing}
        onOpenChange={(open) => {
          if (!pending) setTesting(open)
        }}
        title={tr('storageTestConfirm')}
        desc={<span className='sr-only'>{tr('storageTestConfirm')}</span>}
        confirmText={tr('runTest')}
        isLoading={pending}
        handleConfirm={() => void test()}
      />
    </>
  )
}
