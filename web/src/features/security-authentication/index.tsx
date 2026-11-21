import { useState, type ReactNode } from 'react'
import { useBlocker } from '@tanstack/react-router'
import {
  KeyRound,
  Copy,
  LogIn,
  RefreshCw,
  Save,
  ShieldCheck,
  ShieldEllipsis,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useIdentitySession } from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ConfigurationSection } from '@/components/configuration-section'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { RequestErrorToast } from '@/components/request-error-toast'
import { SettingsControlCard } from '@/components/settings-control-card'
import { SwitchLabeled } from '@/components/shadcn-space/switch/switch-07'
import TabsVertical from '@/components/shadcn-space/tabs/tabs-06'
import { QuickLoginConfiguration } from './quick-login-configuration'
import { useSecuritySettings } from './use-security-settings'

type Tab = 'basic' | 'protection' | 'quickLogin'

function NumberField({
  id,
  label,
  min,
  max,
  suffix,
  value,
  onChange,
}: {
  id: string
  label: string
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  suffix?: string
}) {
  return (
    <div className='min-w-0 space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <div className='flex items-center gap-2'>
        <Input
          id={id}
          type='number'
          inputMode='numeric'
          min={min}
          max={max}
          value={Number.isNaN(value) ? '' : value}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          required
          step={1}
        />
        {suffix && (
          <span className='shrink-0 text-xs text-muted-foreground'>
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

export function SecurityAuthentication() {
  const owner = useIdentitySession((s) => s.session?.id)
  return <SecurityWorkspace key={owner ?? 'signed-out'} />
}
function SecurityWorkspace() {
  const { t } = useTranslation()
  const tr = (key: string) => t(`securityAuthentication.${key}`)
  const [tab, setTab] = useState<Tab>('basic')
  const settings = useSecuritySettings()
  const [rotate, setRotate] = useState(false)
  const [revoke, setRevoke] = useState(false)
  const blocker = useBlocker({
    shouldBlockFn: () => settings.dirty || settings.pending,
    enableBeforeUnload: settings.dirty,
    withResolver: true,
  })
  const values = settings.values
  if (!values)
    return (
      <>
        <Header fixed>
          <ProfileDropdown />
        </Header>
        <Main>
          <h1 className='text-2xl font-semibold'>{tr('title')}</h1>
          {settings.query.isError && (
            <RequestErrorToast message={settings.query.error.message} />
          )}
        </Main>
      </>
    )
  const quickLogin = {
    identityBindingEnabled: values.identityBindingEnabled,
    pendingIdentityHours: String(values.pendingIdentityHours),
    providers: values.providers,
  }
  const setQuickLogin = (v: typeof quickLogin) =>
    settings.patch({
      ...v,
      pendingIdentityHours: Number(v.pendingIdentityHours),
    })
  const tabContent: Record<Tab, ReactNode> = {
    quickLogin: (
      <QuickLoginConfiguration
        value={quickLogin}
        onChange={setQuickLogin}
        errors={{}}
        secrets={settings.secrets}
        hasSecrets={settings.query.data?.hasSecrets}
        onSecretChange={settings.setSecret}
      />
    ),
    basic: (
      <div className='space-y-5'>
        <SettingsControlCard
          title={
            <span className='flex flex-wrap items-center gap-x-3 gap-y-1'>
              <span>{tr('adminKey')}</span>
              {settings.adminKey.data && (
                <span className='text-xs font-normal text-muted-foreground'>
                  {tr(
                    settings.adminKey.data.exists
                      ? 'keyConfigured'
                      : 'keyNotConfigured'
                  )}
                </span>
              )}
            </span>
          }
          compact
          className='py-1'
        >
          <div className='flex flex-wrap gap-2'>
            {settings.adminKey.data?.exists && (
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={settings.pending || !settings.canManage}
                onClick={() => setRevoke(true)}
              >
                <Trash2 className='size-3.5' />
                {tr('deleteKey')}
              </Button>
            )}
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={
                settings.pending ||
                !settings.canManage ||
                !settings.adminKey.data
              }
              onClick={() => setRotate(true)}
            >
              <RefreshCw aria-hidden='true' className='size-3.5' />
              {tr(
                settings.adminKey.data?.exists ? 'regenerate' : 'generateKey'
              )}
            </Button>
          </div>
        </SettingsControlCard>
        {settings.adminKey.isError && (
          <RequestErrorToast message={settings.adminKey.error.message} />
        )}
        <ConfigurationSection title={tr('sessionSecurity')}>
          <div className='grid gap-4 @lg/security:grid-cols-2'>
            <NumberField
              id='access-token-minutes'
              value={values.accessTokenMinutes}
              onChange={(value) =>
                settings.patch({ accessTokenMinutes: value })
              }
              label={tr('accessTokenLifetime')}
              min={0}
              max={43200}
              suffix={tr('minutes')}
            />
            <NumberField
              id='refresh-token-days'
              value={values.refreshTokenDays}
              onChange={(value) => settings.patch({ refreshTokenDays: value })}
              label={tr('refreshTokenLifetime')}
              min={1}
              max={365}
              suffix={tr('days')}
            />
          </div>
          <Separator />
          <SettingsControlCard title={tr('stepUpVerification')} compact>
            <SwitchLabeled
              size='sm'
              containedMotion
              aria-label={tr('stepUpVerification')}
              checked={values.stepUpVerification}
              onCheckedChange={(value) =>
                settings.patch({ stepUpVerification: value })
              }
            />
          </SettingsControlCard>
        </ConfigurationSection>
      </div>
    ),
    protection: (
      <div className='space-y-5'>
        <ConfigurationSection title={tr('captchaProtection')}>
          <SettingsControlCard
            title={
              <span className='space-y-1'>
                <span className='block'>{tr('enableHumanVerification')}</span>
                <span className='block text-xs font-normal text-muted-foreground'>
                  {tr('humanVerificationDescription')}
                </span>
              </span>
            }
            compact
          >
            <SwitchLabeled
              size='sm'
              containedMotion
              aria-label={tr('enableHumanVerification')}
              checked={values.humanVerification}
              onCheckedChange={(value) =>
                settings.patch({ humanVerification: value })
              }
            />
          </SettingsControlCard>
          <Separator />
          <div className='grid min-w-0 gap-4 @lg/security:grid-cols-2'>
            <div className='min-w-0 space-y-2'>
              <Label htmlFor='captcha-site-key'>{tr('captchaSiteKey')}</Label>
              <Input
                id='captcha-site-key'
                autoComplete='off'
                value={values.captchaSiteKey}
                onChange={(e) =>
                  settings.patch({ captchaSiteKey: e.target.value })
                }
              />
              <p className='text-xs text-muted-foreground'>
                {tr('captchaSiteKeyHelp')}{' '}
                <a
                  href='https://dash.cloudflare.com/?to=/:account/turnstile'
                  target='_blank'
                  rel='noreferrer'
                  className='text-primary underline-offset-4 hover:underline'
                >
                  Cloudflare Dashboard
                </a>
              </p>
            </div>
            <div className='min-w-0 space-y-2'>
              <Label htmlFor='captcha-secret-key'>
                {tr('captchaSecretKey')}
              </Label>
              <Input
                id='captcha-secret-key'
                type='password'
                autoComplete='new-password'
                value={settings.secrets.captcha ?? ''}
                onChange={(e) => settings.setSecret('captcha', e.target.value)}
                placeholder={
                  settings.query.data?.hasSecrets.captcha
                    ? '已配置，留空保留'
                    : ''
                }
              />
              <p className='text-xs text-muted-foreground'>
                {tr('captchaSecretKeyHelp')}
              </p>
            </div>
          </div>
        </ConfigurationSection>
        <ConfigurationSection title={tr('abuseProtection')}>
          <div className='grid gap-4 @lg/security:grid-cols-3'>
            <NumberField
              id='auth-rate-limit'
              value={values.authRateLimit}
              onChange={(value) => settings.patch({ authRateLimit: value })}
              label={tr('authRateLimit')}
              min={1}
              max={10000}
              suffix={tr('perMinute')}
            />
            <NumberField
              id='invalid-auth-threshold'
              value={values.invalidAuthThreshold}
              onChange={(value) =>
                settings.patch({ invalidAuthThreshold: value })
              }
              label={tr('invalidAuthThreshold')}
              min={1}
              max={1000}
              suffix={tr('attempts')}
            />
            <NumberField
              id='invalid-auth-block-minutes'
              value={values.invalidAuthBlockMinutes}
              onChange={(value) =>
                settings.patch({ invalidAuthBlockMinutes: value })
              }
              label={tr('invalidAuthBlock')}
              min={1}
              max={1440}
              suffix={tr('minutes')}
            />
          </div>
          <Separator />
          <div className='grid gap-3 @lg/security:grid-cols-2'>
            <SettingsControlCard title={tr('invalidAuthProtection')} compact>
              <SwitchLabeled
                size='sm'
                containedMotion
                aria-label={tr('invalidAuthProtection')}
                checked={values.invalidAuthProtection}
                onCheckedChange={(value) =>
                  settings.patch({ invalidAuthProtection: value })
                }
              />
            </SettingsControlCard>
            <SettingsControlCard title={tr('accessBlock')} compact>
              <SwitchLabeled
                size='sm'
                containedMotion
                aria-label={tr('accessBlock')}
                checked={values.accessBlock}
                onCheckedChange={(value) =>
                  settings.patch({ accessBlock: value })
                }
              />
            </SettingsControlCard>
          </div>
        </ConfigurationSection>
      </div>
    ),
  }
  return (
    <>
      <Header fixed className='bg-background'>
        <ProfileDropdown />
      </Header>
      <ConfirmDialog
        open={revoke}
        onOpenChange={setRevoke}
        title={tr('deleteKeyTitle')}
        desc={tr('deleteKeyDescription')}
        confirmText={tr('deleteKey')}
        destructive
        isLoading={settings.pending}
        handleConfirm={async () => {
          await settings.revokeKey()
          setRevoke(false)
        }}
      />
      <ConfirmDialog
        open={rotate}
        onOpenChange={setRotate}
        title={tr(
          settings.adminKey.data?.exists ? 'regenerateTitle' : 'generateKey'
        )}
        desc={tr(
          settings.adminKey.data?.exists
            ? 'regenerateDescription'
            : 'keyDialogDescription'
        )}
        confirmText={tr(
          settings.adminKey.data?.exists ? 'regenerate' : 'generateKey'
        )}
        handleConfirm={() => {
          setRotate(false)
          void settings.regenerate()
        }}
      />
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.()
        }}
        title='放弃未保存的修改？'
        desc='离开后，未保存的修改将丢失。'
        handleConfirm={() => blocker.proceed?.()}
      />
      <Dialog
        open={!!settings.key}
        onOpenChange={(open) => {
          if (!open) settings.setKey('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr('keyDialogTitle')}</DialogTitle>
            <DialogDescription>{tr('keyDialogDescription')}</DialogDescription>
          </DialogHeader>
          <Input readOnly value={settings.key} />
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(settings.key)
                toast.success(tr('keyCopied'))
              } catch {
                toast.error(tr('keyCopyFailed'))
              }
            }}
          >
            <Copy />
            {tr('copyKey')}
          </Button>
        </DialogContent>
      </Dialog>
      <Main id='content' fixed>
        <div
          data-slot='page-heading'
          className='flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-3'
        >
          <div className='flex min-w-0 flex-wrap items-center gap-3'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              {tr('title')}
            </h1>
          </div>
          <div className='hidden shrink-0 gap-2 md:flex'>
            <Button
              variant='outline'
              disabled={settings.pending || !settings.dirty}
              onClick={settings.reset}
            >
              {tr('reset')}
            </Button>
            <Button
              disabled={
                settings.pending || !settings.dirty || !settings.canManage
              }
              onClick={() => void settings.save()}
            >
              <Save aria-hidden='true' className='size-4' />
              {tr('save')}
            </Button>
          </div>
        </div>
        <TabsVertical
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
          label={tr('title')}
          items={[
            { id: 'basic', label: tr('basic'), icon: ShieldCheck },
            { id: 'protection', label: tr('protection'), icon: ShieldEllipsis },
            { id: 'quickLogin', label: tr('quickLogin'), icon: LogIn },
          ]}
        >
          <div className='@container/security min-w-0 space-y-6'>
            <div className='flex items-center gap-2'>
              {tab === 'basic' && (
                <KeyRound aria-hidden='true' className='size-4 text-primary' />
              )}
              {tab === 'protection' && (
                <ShieldEllipsis
                  aria-hidden='true'
                  className='size-4 text-primary'
                />
              )}
              {tab === 'quickLogin' && (
                <LogIn aria-hidden='true' className='size-4 text-primary' />
              )}
              <h2 className='text-base font-semibold'>{tr(tab)}</h2>
            </div>
            <Separator />
            <fieldset
              disabled={settings.pending || !settings.canManage}
              className='min-w-0'
            >
              {tabContent[tab]}
            </fieldset>
          </div>
        </TabsVertical>
      </Main>
      <div className='fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden'>
        <Button
          className='flex-1'
          variant='outline'
          disabled={settings.pending || !settings.dirty}
          onClick={settings.reset}
        >
          {tr('reset')}
        </Button>
        <Button
          className='flex-1'
          disabled={settings.pending || !settings.dirty || !settings.canManage}
          onClick={() => void settings.save()}
        >
          <Save aria-hidden='true' className='size-4' />
          {tr('save')}
        </Button>
      </div>
    </>
  )
}
