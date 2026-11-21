import { useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { Gift, Save, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { type FeatureSettingsValues } from '@/api/workspace-settings'
import { useIdentitySession } from '@/stores/identity-session'
import { useIntegrationSettings } from '@/hooks/use-integration-settings'
import { useWorkspaceSettings } from '@/hooks/use-workspace-settings'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import TabsVertical from '@/components/shadcn-space/tabs/tabs-06'
import { auditErrors, defaultAuditDraft } from './audit-draft'
import { AuditSettings } from './audit-settings'
import {
  defaultReferralDraft,
  normalizeReferral,
  referralErrors,
} from './referral-draft'
import { ReferralSettings } from './referral-settings'

export function FeatureSettings() {
  const owner = useIdentitySession((state) => state.session?.id)
  return <FeatureSettingsContent key={owner ?? 'signed-out'} />
}

function FeatureSettingsContent() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('security')
  const [resetOpen, setResetOpen] = useState(false)
  const referralRef = useRef<HTMLFormElement>(null)
  const auditRef = useRef<HTMLFormElement>(null)
  const settings = useWorkspaceSettings<FeatureSettingsValues>('features', {
    audit: defaultAuditDraft,
    referral: defaultReferralDraft,
  })
  const { audit, referral } = settings.draft
  const keys = useIntegrationSettings<Record<string, never>>('audit', {})
  const [secretDraft, setSecretDraft] = useState<Record<string, string | null>>(
    {}
  )
  const [saving, setSaving] = useState(false)
  const setAudit = (audit: FeatureSettingsValues['audit']) => {
    const removed = settings.draft.audit.shared.endpoints.filter(
      (node) => !audit.shared.endpoints.some((next) => next.id === node.id)
    )
    if (removed.length)
      setSecretDraft((current) => {
        const next = { ...current }
        removed.forEach((node) => {
          next[node.id] = null
        })
        return next
      })
    settings.setDraft({ ...settings.draft, audit })
  }
  const setReferral = (referral: FeatureSettingsValues['referral']) =>
    settings.setDraft({ ...settings.draft, referral })
  const [auditValidation, setAuditValidation] = useState<
    Record<string, string>
  >({})
  const [referralValidation, setReferralValidation] = useState<
    Record<string, string>
  >({})
  const dirty =
    settings.dirty || Object.values(secretDraft).some((v) => v !== '')
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  async function saveDraft() {
    const auditIssues = auditErrors(audit)
    const referralIssues = referralErrors(referral)
    setAuditValidation(auditIssues)
    setReferralValidation(referralIssues)
    const isAudit = Object.keys(auditIssues).length > 0
    const issues = isAudit ? auditIssues : referralIssues
    if (Object.keys(issues).length) {
      setTab(isAudit ? 'security' : 'referral')
      toast.error(
        t(
          `${isAudit ? 'auditSettings' : 'referralSettings'}.${Object.values(issues)[0]}`
        )
      )
      requestAnimationFrame(() =>
        (isAudit ? auditRef : referralRef).current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus()
      )
      return
    }
    setSaving(true)
    try {
      await settings.saveAsync({ audit, referral: normalizeReferral(referral) })
      if (Object.keys(secretDraft).length) await keys.save({}, secretDraft)
      setSecretDraft({})
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('auth.error'))
    } finally {
      setSaving(false)
    }
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
            {t('featureSettings.title')}
          </h1>
          <div className='ms-auto hidden gap-2 md:flex'>
            <Button
              variant='outline'
              disabled={!dirty}
              onClick={() => setResetOpen(true)}
            >
              {t('generalSettings.reset')}
            </Button>
            <Button
              disabled={!dirty || settings.blocked || keys.blocked || saving}
              onClick={() => void saveDraft()}
            >
              <Save aria-hidden='true' className='size-4' />
              {t('generalSettings.save')}
            </Button>
          </div>
        </div>
        <TabsVertical
          value={tab}
          onValueChange={setTab}
          label={t('featureSettings.title')}
          items={[
            {
              id: 'security',
              label: t('featureSettings.security'),
              icon: ShieldCheck,
            },
            {
              id: 'referral',
              label: t('featureSettings.referral'),
              icon: Gift,
            },
          ]}
        >
          <div className='@container/features min-w-0 space-y-6'>
            <h2 className='shrink-0 text-base font-semibold'>
              {t('featureSettings.' + tab)}
            </h2>
            <Separator />

            <fieldset
              disabled={settings.blocked || keys.blocked || saving}
              aria-busy={settings.busy}
              className='min-w-0 space-y-6'
            >
              {tab === 'security' && (
                <AuditSettings
                  credentials={{
                    draft: secretDraft,
                    set: (id, value) =>
                      setSecretDraft((current) => ({
                        ...current,
                        [id]: value,
                      })),
                    has: keys.hasSecrets,
                    dirty,
                  }}
                  value={audit}
                  errors={auditValidation}
                  formRef={auditRef}
                  onSave={saveDraft}
                  onChange={(value) => {
                    setAudit(value)
                    setAuditValidation({})
                  }}
                />
              )}
              {tab === 'referral' && (
                <ReferralSettings
                  value={referral}
                  errors={referralValidation}
                  formRef={referralRef}
                  onSave={saveDraft}
                  onChange={(value) => {
                    setReferral(value)
                    setReferralValidation({})
                  }}
                />
              )}
            </fieldset>
          </div>
        </TabsVertical>
      </Main>
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
          disabled={!dirty || settings.blocked || keys.blocked || saving}
          onClick={() => void saveDraft()}
        >
          <Save aria-hidden='true' className='size-4' />
          {t('generalSettings.save')}
        </Button>
      </div>
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
            setSecretDraft({})
            setReferralValidation({})
            setAuditValidation({})
            setResetOpen(false)
          }
        }}
      />
    </>
  )
}
