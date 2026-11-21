import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { CalendarClock, HardDrive, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  backups,
  type BackupSchedule,
  type BackupSettings,
  type BackupStorage,
  type ImageStorage,
} from '@/api/backups'
import {
  allows,
  hasIdentitySession,
  useIdentitySession,
} from '@/stores/identity-session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { RequestErrorToast } from '@/components/request-error-toast'
import TabsVertical from '@/components/shadcn-space/tabs/tabs-06'
import { BackupRecords } from './backup-records'
import { ImageStorageSettings } from './image-storage'
import { ScheduleSettings } from './schedule-settings'
import { StorageSettings } from './storage-settings'

export function DataBackup() {
  const owner = useIdentitySession((state) => state.session?.id)
  return <BackupWorkspace key={owner ?? 'signed-out'} />
}
function BackupWorkspace() {
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t(`liveInfrastructure.${key}`)
  const owner = useIdentitySession((state) => state.session?.id)
  useIdentitySession((state) => state.grants)
  const permitted = allows('security.settings.manage')
  const client = useQueryClient()
  const [tab, setTab] = useState('storage')
  const [busy, setBusy] = useState(false)
  const [storageDraft, setStorageDraft] = useState<BackupStorage | null>(null)
  const [imageDraft, setImageDraft] = useState<ImageStorage | null>(null)
  const [scheduleDraft, setScheduleDraft] = useState<BackupSchedule | null>(
    null
  )
  const storageDirty = storageDraft !== null || imageDraft !== null
  const scheduleDirty = scheduleDraft !== null
  const blocker = useBlocker({
    shouldBlockFn: () =>
      hasIdentitySession() && (busy || storageDirty || scheduleDirty),
    enableBeforeUnload: storageDirty || scheduleDirty,
    withResolver: true,
  })
  const query = useQuery({
    queryKey: ['backup-settings', owner],
    queryFn: ({ signal }) => backups.settings(signal),
    enabled: !!owner && permitted,
    retry: false,
    gcTime: 0,
  })
  function onSaved(settings: BackupSettings) {
    if (useIdentitySession.getState().session?.id === owner)
      client.setQueryData(['backup-settings', owner], settings)
  }
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: query.data?.scheduleTimezone || 'UTC',
        }).format(new Date(value))
      : '\u2014'
  return (
    <>
      <Header fixed className='bg-background'>
        <ProfileDropdown />
      </Header>
      <Main id='content' fixed>
        <div
          data-slot='page-heading'
          className='flex min-w-0 shrink-0 flex-wrap items-center gap-3'
        >
          <h1 className='text-2xl font-semibold'>{t('dataBackup.title')}</h1>
          {query.data && (
            <Badge variant='outline'>
              {tr(query.data.verified ? 'verified' : 'unverified')}
            </Badge>
          )}
          <Button
            variant='outline'
            size='icon'
            className='ms-auto size-8'
            aria-label={tr('refresh')}
            disabled={!permitted || busy || query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw
              className={query.isFetching ? 'size-4 animate-spin' : 'size-4'}
            />
          </Button>
        </div>
        {permitted && query.isError && (
          <RequestErrorToast message={query.error.message} />
        )}
        {!permitted ? (
          <div role='alert'>{tr('permissionRequired')}</div>
        ) : !query.data ? (
          query.isPending && <div role='status'>{tr('loading')}</div>
        ) : (
          owner && (
            <TabsVertical
              value={tab}
              onValueChange={setTab}
              label={t('dataBackup.title')}
              items={[
                {
                  id: 'storage',
                  label: t('dataBackup.storageTab'),
                  icon: HardDrive,
                  disabled: busy,
                },
                {
                  id: 'schedule',
                  label: t('dataBackup.scheduleTab'),
                  icon: CalendarClock,
                  disabled: busy,
                },
              ]}
            >
              <div className='@container/backup min-w-0 space-y-5'>
                {tab === 'storage' ? (
                  <>
                    <StorageSettings
                      settings={query.data}
                      owner={owner}
                      disabled={busy}
                      draft={storageDraft}
                      onDraftChange={setStorageDraft}
                      onSaved={onSaved}
                      onBusyChange={setBusy}
                    />
                    <ImageStorageSettings
                      owner={owner}
                      disabled={busy}
                      draft={imageDraft}
                      onDraftChange={setImageDraft}
                      onBusyChange={setBusy}
                    />
                  </>
                ) : (
                  <>
                    <ScheduleSettings
                      settings={query.data}
                      owner={owner}
                      disabled={busy}
                      draft={scheduleDraft}
                      onDraftChange={setScheduleDraft}
                      onSaved={onSaved}
                      onBusyChange={setBusy}
                    />
                    <dl className='flex flex-wrap gap-6 text-sm'>
                      <div>
                        <dt className='text-muted-foreground'>
                          {tr('nextRun')}
                        </dt>
                        <dd>{date(query.data.nextRunAt)}</dd>
                      </div>
                      <div>
                        <dt className='text-muted-foreground'>
                          {tr('lastVerified')}
                        </dt>
                        <dd>{date(query.data.lastVerifiedAt)}</dd>
                      </div>
                    </dl>
                    <BackupRecords
                      owner={owner}
                      settings={query.data}
                      disabled={busy || storageDirty || scheduleDirty}
                      onBusyChange={setBusy}
                    />
                  </>
                )}
              </div>
            </TabsVertical>
          )
        )}
        <ConfirmDialog
          open={blocker.status === 'blocked'}
          onOpenChange={(open) => {
            if (!open) blocker.reset?.()
          }}
          title={tr('discard')}
          desc={<span className='sr-only'>{tr('discard')}</span>}
          confirmText={tr('discard')}
          destructive
          handleConfirm={() => blocker.proceed?.()}
        />
      </Main>
    </>
  )
}
