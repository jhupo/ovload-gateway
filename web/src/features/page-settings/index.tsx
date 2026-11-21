import { useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { Gift, HeartPulse, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { type PageSettingsValues } from '@/api/workspace-settings'
import { useIdentitySession } from '@/stores/identity-session'
import { useWorkspaceSettings } from '@/hooks/use-workspace-settings'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { SettingsControlCard } from '@/components/settings-control-card'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import TabsVertical from '@/components/shadcn-space/tabs/tabs-06'
import {
  channelMonitoringErrors,
  defaultChannelMonitoring,
  type ChannelMonitoringDraft,
} from './channel-monitoring-draft'
import { ChannelMonitoringSettings } from './channel-monitoring-settings'
import { LotteryRoundControl } from './lottery-round-control'

type PageSettingsDraft = Omit<PageSettingsValues, 'monitoring'> & {
  monitoring: ChannelMonitoringDraft
}

export function PageSettings() {
  const owner = useIdentitySession((state) => state.session?.id)
  return <PageSettingsContent key={owner ?? 'signed-out'} />
}

function PageSettingsContent() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('channelMonitoring')
  const [resetOpen, setResetOpen] = useState(false)
  const monitoringRef = useRef<HTMLFormElement>(null)
  const settings = useWorkspaceSettings<PageSettingsDraft>('pages', {
    channelStatusEnabled: true,
    lotteryEnabled: true,
    monitoring: defaultChannelMonitoring(),
  })
  const {
    monitoring,
    channelStatusEnabled: enabled,
    lotteryEnabled,
  } = settings.draft
  const [validation, setValidation] = useState<Record<string, string>>({})
  const dirty = settings.dirty
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  function saveDraft() {
    const issues = channelMonitoringErrors(monitoring)
    setValidation(issues)
    if (Object.keys(issues).length) {
      setTab('channelMonitoring')
      toast.error(t('channelMonitoringSettings.' + Object.values(issues)[0]))
      requestAnimationFrame(() =>
        monitoringRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus()
      )
      return
    }
    settings.save()
  }

  return (
    <>
      <Header fixed className='bg-background'>
        <ProfileDropdown />
      </Header>
      <Main id='content' fixed>
        <div
          data-slot='page-heading'
          className='flex flex-wrap items-center gap-3'
        >
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t('pageSettings.title')}
          </h1>
          {
            <div className='ms-auto hidden gap-2 md:flex'>
              <Button
                variant='outline'
                disabled={!dirty}
                onClick={() => setResetOpen(true)}
              >
                {t('generalSettings.reset')}
              </Button>
              <Button disabled={!dirty || settings.blocked} onClick={saveDraft}>
                <Save aria-hidden='true' className='size-4' />
                {t('generalSettings.save')}
              </Button>
            </div>
          }
        </div>
        <TabsVertical
          value={tab}
          onValueChange={setTab}
          label={t('pageSettings.title')}
          items={[
            {
              id: 'channelMonitoring',
              label: t('featureSettings.channelMonitoring'),
              icon: HeartPulse,
            },
            { id: 'lottery', label: t('lottery.title'), icon: Gift },
          ]}
        >
          <div className='@container/features min-w-0 space-y-6'>
            <h2 className='text-base font-semibold'>
              {tab === 'lottery'
                ? t('lottery.title')
                : t('featureSettings.channelMonitoring')}
            </h2>
            <Separator />

            <fieldset
              disabled={settings.blocked}
              aria-busy={settings.busy}
              className='min-w-0 space-y-6'
            >
              {tab === 'channelMonitoring' ? (
                <>
                  <SettingsControlCard
                    title={t('pageSettings.channelStatus')}
                    compact
                  >
                    <SwitchLabeled
                      size='sm'
                      containedMotion
                      aria-label={t('pageSettings.channelStatus')}
                      className='shrink-0'
                      checked={enabled}
                      onCheckedChange={(next) =>
                        settings.setDraft({
                          ...settings.draft,
                          channelStatusEnabled: next,
                        })
                      }
                    />
                  </SettingsControlCard>
                  <ChannelMonitoringSettings
                    value={monitoring}
                    errors={validation}
                    formRef={monitoringRef}
                    onSave={saveDraft}
                    onChange={(monitoring) => {
                      settings.setDraft({ ...settings.draft, monitoring })
                      setValidation({})
                    }}
                  />
                </>
              ) : (
                <>
                  <SettingsControlCard
                    title={t('lotterySettings.pageEnabled')}
                    compact
                  >
                    <SwitchLabeled
                      size='sm'
                      containedMotion
                      aria-label={t('lotterySettings.pageEnabled')}
                      checked={lotteryEnabled}
                      onCheckedChange={(next) =>
                        settings.setDraft({
                          ...settings.draft,
                          lotteryEnabled: next,
                        })
                      }
                    />
                  </SettingsControlCard>
                  <LotteryRoundControl />
                </>
              )}
            </fieldset>
          </div>
        </TabsVertical>
      </Main>
      {
        <div className='fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden'>
          <Button
            className='flex-1'
            variant='outline'
            disabled={!dirty}
            onClick={() => setResetOpen(true)}
          >
            {t('generalSettings.reset')}
          </Button>
          <Button
            className='flex-1'
            disabled={!dirty || settings.blocked}
            onClick={saveDraft}
          >
            <Save aria-hidden='true' className='size-4' />
            {t('generalSettings.save')}
          </Button>
        </div>
      }
      <ConfirmDialog
        open={resetOpen || blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) {
            setResetOpen(false)
            blocker.reset?.()
          }
        }}
        title={t('generalSettings.discard')}
        desc={<span className='sr-only'>{t('generalSettings.discard')}</span>}
        cancelBtnText={t('generalSettings.cancel')}
        confirmText={t('generalSettings.discardAction')}
        handleConfirm={() => {
          if (blocker.status === 'blocked') blocker.proceed()
          else {
            settings.reset()
            setValidation({})
            setResetOpen(false)
          }
        }}
      />
    </>
  )
}
