import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { backups, type ImageStorage } from '@/api/backups'
import { useIdentitySession } from '@/stores/identity-session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ConfigurationSection } from '@/components/configuration-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { RequestErrorToast } from '@/components/request-error-toast'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import { BackupField } from './fields'

export function ImageStorageSettings({
  owner,
  disabled,
  draft,
  onDraftChange,
  onBusyChange,
}: {
  owner: string
  disabled: boolean
  draft: ImageStorage | null
  onDraftChange: (draft: ImageStorage | null) => void
  onBusyChange: (value: boolean) => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`liveInfrastructure.${key}`)
  const client = useQueryClient()
  const [pending, setPending] = useState(false)
  const [testing, setTesting] = useState(false)
  const query = useQuery({
    queryKey: ['image-storage', owner],
    queryFn: ({ signal }) => backups.imageSettings(signal),
    retry: false,
    gcTime: 0,
  })
  const settings = query.data
  const values =
    draft ??
    (settings ? { ...settings, accessKeyId: '', secretAccessKey: '' } : null)
  const owns = () => useIdentitySession.getState().session?.id === owner
  function change<K extends keyof ImageStorage>(
    key: K,
    value: ImageStorage[K]
  ) {
    if (values) onDraftChange({ ...values, [key]: value })
  }
  function busy(value: boolean) {
    setPending(value)
    onBusyChange(value)
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !values ||
      pending ||
      disabled ||
      !owns() ||
      !event.currentTarget.reportValidity()
    )
      return
    busy(true)
    try {
      const result = await backups.imageStorage({
        enabled: values.enabled,
        endpoint: values.endpoint,
        region: values.region,
        bucket: values.bucket,
        prefix: values.prefix,
        forcePathStyle: values.forcePathStyle,
        publicDomain: values.publicDomain,
        presignedExpiryHours: values.presignedExpiryHours,
        accessKeyId: values.accessKeyId || undefined,
        secretAccessKey: values.secretAccessKey || undefined,
      })
      if (!owns()) return
      client.setQueryData(['image-storage', owner], result)
      onDraftChange(null)
      toast.success(tr('saved'))
    } catch (error) {
      if (owns())
        toast.error(error instanceof Error ? error.message : tr('unavailable'))
    } finally {
      busy(false)
    }
  }
  async function test() {
    if (pending || disabled || draft || !owns()) return
    busy(true)
    try {
      const result = await backups.testImages()
      if (!owns()) return
      setTesting(false)
      await query.refetch()
      if (result.ok) toast.success(tr('testPassed'))
      else toast.error(result.message || tr('testFailed'))
    } catch (error) {
      if (owns())
        toast.error(error instanceof Error ? error.message : tr('unavailable'))
    } finally {
      busy(false)
    }
  }
  return (
    <>
      <ConfigurationSection
        title={t('dataBackup.asyncStorageTitle')}
        action={
          values && (
            <SwitchLabeled
              size='sm'
              containedMotion
              checked={values.enabled}
              disabled={disabled || pending}
              aria-label={t('dataBackup.enableAsyncStorage')}
              onCheckedChange={(value) => change('enabled', value)}
            />
          )
        }
      >
        {query.isError && <RequestErrorToast message={query.error.message} />}
        {settings && values && (
          <form onSubmit={save} className='space-y-4'>
            <Badge variant='outline'>
              {tr(settings.verified ? 'verified' : 'unverified')}
            </Badge>
            <fieldset
              disabled={disabled || pending}
              className='grid min-w-0 gap-4 @lg/backup:grid-cols-2'
            >
              {(['endpoint', 'region', 'bucket', 'prefix'] as const).map(
                (key) => (
                  <BackupField
                    key={key}
                    id={`image-${key}`}
                    label={t(
                      `dataBackup.${key === 'prefix' ? 'keyPrefix' : key}`
                    )}
                    value={values[key]}
                    required={values.enabled && key !== 'prefix'}
                    maxLength={key === 'endpoint' ? 2048 : 255}
                    onChange={(event) => change(key, event.target.value)}
                  />
                )
              )}
              <BackupField
                id='image-access-key'
                label={t('dataBackup.accessKey')}
                type='password'
                required={values.enabled && !settings.hasAccessKey}
                maxLength={512}
                value={values.accessKeyId}
                placeholder={
                  settings.hasAccessKey ? tr('savedCredentialKeep') : ''
                }
                onChange={(event) => change('accessKeyId', event.target.value)}
              />
              <BackupField
                id='image-secret-key'
                label={t('dataBackup.secretKey')}
                type='password'
                required={values.enabled && !settings.hasSecret}
                maxLength={512}
                value={values.secretAccessKey ?? ''}
                placeholder={
                  settings.hasSecret ? tr('savedCredentialKeep') : ''
                }
                onChange={(event) =>
                  change('secretAccessKey', event.target.value)
                }
              />
              <BackupField
                id='image-public-domain'
                label={t('dataBackup.publicDomain')}
                value={values.publicDomain}
                maxLength={2048}
                onChange={(event) => change('publicDomain', event.target.value)}
              />
              <BackupField
                id='image-expiry'
                label={t('dataBackup.presignedExpiry')}
                type='number'
                min={1}
                max={168}
                step={1}
                required
                value={String(values.presignedExpiryHours)}
                onChange={(event) =>
                  change('presignedExpiryHours', Number(event.target.value))
                }
              />
              <div className='flex items-center justify-between gap-4'>
                <Label htmlFor='image-path-style'>{tr('forcePathStyle')}</Label>
                <SwitchLabeled
                  id='image-path-style'
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
                disabled={disabled || pending || !!draft || !settings.hasSecret}
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
        )}
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
