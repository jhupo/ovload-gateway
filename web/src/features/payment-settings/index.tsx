import { useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { CreditCard, Gift, Save, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useIntegrationSettings } from '@/hooks/use-integration-settings'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { ConfigurationSection } from '@/components/configuration-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import TabsVertical from '@/components/shadcn-space/tabs/tabs-06'
import {
  fieldTab,
  normalizePaymentDraft,
  paymentErrors,
  createPaymentDraft,
  type NumericField,
  type PaymentDraft,
  type PaymentErrors,
} from './draft'
import { PaymentField, PaymentSelect, PaymentToggle } from './fields'
import { RechargeOffers } from './offers'

export function PaymentSettings() {
  const { t } = useTranslation()
  const tr = (key: string) => t('paymentSettings.' + key)
  const settings = useIntegrationSettings<PaymentDraft>(
    'payment',
    createPaymentDraft()
  )
  const { saved, draft, setDraft } = settings
  const [secrets, setSecrets] = useState<Record<string, string | null>>({})
  const [tab, setTab] = useState('basic')
  const [errors, setErrors] = useState<PaymentErrors>({})
  const [discard, setDiscard] = useState(false)
  const [offerEditorDirty, setOfferEditorDirty] = useState(false)
  const editor = useRef<HTMLDivElement>(null)
  const dirty =
    JSON.stringify(saved) !== JSON.stringify(draft) ||
    Object.values(secrets).some((v) => v !== '')
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || offerEditorDirty,
    enableBeforeUnload: dirty || offerEditorDirty,
    withResolver: true,
  })
  function update<K extends keyof PaymentDraft>(
    key: K,
    value: PaymentDraft[K]
  ) {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors({})
  }
  async function save() {
    const next = paymentErrors(draft)
    setErrors(next)
    const first = Object.keys(next)[0]
    if (first) {
      setTab(fieldTab(first))
      toast.error(tr(next[first]!), { id: 'payment-settings-validation' })
      requestAnimationFrame(() =>
        editor.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus()
      )
      return
    }
    try {
      const normalized = normalizePaymentDraft(draft)
      await settings.save(normalized, secrets)
      setSecrets({})
      toast.success(tr('saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr('saveError'), {
        id: 'payment-settings-save',
      })
    }
  }
  const actions = (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={!dirty}
        onClick={() => setDiscard(true)}
      >
        {tr('reset')}
      </Button>
      <Button
        type='button'
        disabled={!dirty || settings.blocked}
        onClick={() => void save()}
      >
        <Save className='size-4' />
        {tr('save')}
      </Button>
    </>
  )
  const numbers = (...names: NumericField[]) => (
    <div
      className={
        'grid min-w-0 grid-cols-1 gap-4 @xl/payment:grid-cols-2' +
        (names.length > 2 ? ' @3xl/payment:grid-cols-3' : '')
      }
    >
      {names.map((name) => (
        <PaymentField
          key={name}
          name={name}
          value={draft[name]}
          numeric
          maxLength={24}
          error={errors[name]}
          onChange={(value) => update(name, value)}
        />
      ))}
    </div>
  )
  return (
    <>
      <Header fixed className='bg-background'>
        <ProfileDropdown />
      </Header>
      <Main id='content' fixed>
        <div
          data-slot='page-heading'
          className='flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-3'
        >
          <div className='flex min-w-0 flex-wrap items-center gap-3'>
            <h1 className='text-2xl font-semibold'>{tr('title')}</h1>
          </div>
          <div className='hidden shrink-0 gap-2 md:flex'>{actions}</div>
        </div>
        <TabsVertical
          value={tab}
          onValueChange={setTab}
          label={tr('title')}
          items={[
            { id: 'basic', label: tr('basic'), icon: Settings2 },
            { id: 'alipay', label: tr('alipay'), icon: CreditCard },
            { id: 'offers', label: tr('offers'), icon: Gift },
          ]}
        >
          <div ref={editor} className='@container/payment min-w-0 space-y-6'>
            <h2 className='text-base font-semibold'>{tr(tab)}</h2>
            <Separator />
            <fieldset disabled={settings.blocked} className='min-w-0 space-y-6'>
              {tab === 'basic' && (
                <>
                  <ConfigurationSection title={tr('paymentService')}>
                    <PaymentToggle
                      name='balanceEnabled'
                      value={draft.balanceEnabled}
                      onChange={(value) => update('balanceEnabled', value)}
                    />
                  </ConfigurationSection>
                  <ConfigurationSection title={tr('amountLimits')}>
                    {numbers('minAmount', 'maxAmount', 'dailyLimit')}
                  </ConfigurationSection>
                  <ConfigurationSection title={tr('orderSettings')}>
                    {numbers('orderTimeout', 'maxPending')}
                  </ConfigurationSection>
                  <ConfigurationSection title={tr('conversion')}>
                    {numbers(
                      'rechargeMultiplier',
                      'subscriptionRate',
                      'feeRate'
                    )}
                  </ConfigurationSection>
                  <ConfigurationSection
                    title={tr('cancellation')}
                    action={
                      <SwitchLabeled
                        size='sm'
                        containedMotion
                        checked={draft.cancelLimitEnabled}
                        onCheckedChange={(value) =>
                          update('cancelLimitEnabled', value)
                        }
                        aria-label={tr('cancelLimitEnabled')}
                      />
                    }
                  >
                    {numbers('cancelMax', 'cancelWindow')}
                    <div className='grid min-w-0 grid-cols-1 gap-4 @xl/payment:grid-cols-2'>
                      <PaymentSelect
                        name='cancelUnit'
                        value={draft.cancelUnit}
                        options={['minute', 'hour', 'day']}
                        onChange={(value) =>
                          update(
                            'cancelUnit',
                            value as PaymentDraft['cancelUnit']
                          )
                        }
                      />
                      <PaymentSelect
                        name='cancelMode'
                        value={draft.cancelMode}
                        options={['rolling', 'fixed']}
                        onChange={(value) =>
                          update(
                            'cancelMode',
                            value as PaymentDraft['cancelMode']
                          )
                        }
                      />
                    </div>
                  </ConfigurationSection>
                </>
              )}
              {tab === 'alipay' && (
                <>
                  <ConfigurationSection
                    title={tr('alipayExperience')}
                    action={
                      <SwitchLabeled
                        size='sm'
                        containedMotion
                        checked={draft.enabled}
                        onCheckedChange={(value) => update('enabled', value)}
                        aria-label={tr('enabled')}
                      />
                    }
                  >
                    <div className='grid grid-cols-1 gap-4 @xl/payment:grid-cols-2'>
                      <PaymentToggle
                        name='forceQr'
                        value={draft.forceQr}
                        onChange={(value) => update('forceQr', value)}
                      />
                      <PaymentToggle
                        name='mobileDeepLink'
                        value={draft.mobileDeepLink}
                        onChange={(value) => update('mobileDeepLink', value)}
                      />
                    </div>
                  </ConfigurationSection>
                  <ConfigurationSection
                    title={tr('alipaySettings')}
                    action={<Badge variant='outline'>RSA2</Badge>}
                  >
                    <div className='grid min-w-0 grid-cols-1 gap-4 @xl/payment:grid-cols-2'>
                      <PaymentField
                        name='alipayAppId'
                        value={draft.alipayAppId}
                        maxLength={32}
                        error={errors.alipayAppId}
                        onChange={(value) => update('alipayAppId', value)}
                      />
                      <PaymentField
                        name='alipaySellerId'
                        value={draft.alipaySellerId}
                        maxLength={32}
                        error={errors.alipaySellerId}
                        onChange={(value) => update('alipaySellerId', value)}
                      />
                      <PaymentSelect
                        name='alipayMode'
                        value={draft.alipayMode}
                        options={['qrcode', 'redirect']}
                        onChange={(value) =>
                          update(
                            'alipayMode',
                            value as PaymentDraft['alipayMode']
                          )
                        }
                      />
                      {['privateKey', 'publicKey'].map((name) => (
                        <div key={name} className='min-w-0 space-y-2'>
                          <Label htmlFor={'payment-' + name}>{tr(name)}</Label>
                          <Textarea
                            id={'payment-' + name}
                            className='font-mono text-xs'
                            autoComplete='off'
                            spellCheck={false}
                            maxLength={16384}
                            value={secrets[name] ?? ''}
                            onChange={(event) =>
                              setSecrets((current) => ({
                                ...current,
                                [name]: event.target.value,
                              }))
                            }
                            placeholder={
                              settings.hasSecrets[name]
                                ? t('integrationSettings.secretSaved')
                                : '-----BEGIN ... KEY-----'
                            }
                          />
                          {settings.hasSecrets[name] && (
                            <Button
                              type='button'
                              size='sm'
                              variant='ghost'
                              onClick={() =>
                                setSecrets((current) => ({
                                  ...current,
                                  [name]: null,
                                }))
                              }
                            >
                              {t('integrationSettings.clearSecret')}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </ConfigurationSection>
                </>
              )}
              {tab === 'offers' && (
                <RechargeOffers
                  draft={draft}
                  errors={errors}
                  update={update}
                  onEditorDirtyChange={setOfferEditorDirty}
                />
              )}
            </fieldset>
          </div>
        </TabsVertical>
      </Main>
      <div className='fixed inset-x-0 bottom-0 z-30 flex flex-wrap justify-end gap-2 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden'>
        {actions}
      </div>
      <ConfirmDialog
        open={discard || blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) {
            setDiscard(false)
            if (blocker.status === 'blocked') blocker.reset()
          }
        }}
        title={tr('discardTitle')}
        desc={tr('discardDescription')}
        confirmText={tr('discard')}
        handleConfirm={() => {
          settings.reset()
          setSecrets({})
          setErrors({})
          setDiscard(false)
          if (blocker.status === 'blocked') blocker.proceed()
        }}
      />
    </>
  )
}
