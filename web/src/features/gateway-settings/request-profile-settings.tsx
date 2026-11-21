import { useLayoutEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useIdentitySession } from '@/stores/identity-session'
import { useErrorToast } from '@/hooks/use-error-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfigurationSection } from '@/components/configuration-section'
import { FieldLayout } from '@/components/field-layout'
import {
  requestProfileApi,
  type ProfileConfiguration,
  type ProfilePreview,
  type ProfileProvider,
} from './profile-api'
import {
  defaultProfile,
  openaiPreset,
  profileText,
  requestProfileErrors,
} from './profile-draft'

export function RequestProfileSettings({
  provider,
  value,
  onChange,
  disabled,
}: {
  provider: ProfileProvider
  value: ProfileConfiguration | null
  onChange: (value: ProfileConfiguration | null) => void
  disabled: boolean
}) {
  const { t } = useTranslation('gatewayProfiles')
  const owner = useIdentitySession((state) => state.session?.id)
  const id = useId()
  const [previewOpen, setPreviewOpen] = useState(false)
  const options = useQuery({
    queryKey: ['gateway-client-profiles', owner, provider],
    queryFn: ({ signal }) => requestProfileApi.options(provider, signal),
    enabled: !!owner && !disabled,
    staleTime: Infinity,
    retry: false,
  })
  useErrorToast(
    options.isError ? t('loadFailed') : undefined,
    `client-profile-options-${provider}`
  )
  const defaults = defaultProfile(provider, options.data)
  const configuration =
    provider === 'openai'
      ? openaiPreset(value ?? defaults)
      : (value ?? defaults)
  const signature = JSON.stringify([owner, provider, configuration])
  const latest = useRef(signature)
  const controller = useRef<AbortController | null>(null)
  const [previewState, setPreviewState] = useState<{
    signature: string
    value: ProfilePreview
  } | null>(null)
  const [pendingRequest, setPendingRequest] = useState<{
    signature: string
    controller: AbortController
  } | null>(null)
  const preview =
    previewState?.signature === signature ? previewState.value : null
  const pending =
    pendingRequest?.signature === signature &&
    !pendingRequest.controller.signal.aborted
  const errors = requestProfileErrors(provider, configuration)
  const fixed = configuration.versionMode === 'fixed'
  const desktop = configuration.client === 'desktop'
  const blocked = disabled || (!value && !options.data)
  useLayoutEffect(() => {
    latest.current = signature
    controller.current?.abort()
    return () => controller.current?.abort()
  }, [signature])

  const patch = (values: ProfileConfiguration) =>
    onChange({ ...configuration, ...values })
  const field = (
    name: string,
    optional = false,
    placeholder?: string,
    maxLength = 128
  ) => (
    <FieldLayout
      key={name}
      id={`${id}-${name}`}
      label={t(name)}
      error={errors[name] ? t(errors[name]) : undefined}
    >
      <Input
        id={`${id}-${name}`}
        name={`profile-${provider}-${name}`}
        value={profileText(configuration, name)}
        disabled={blocked}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete='off'
        spellCheck={false}
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `${id}-${name}-error` : undefined}
        data-local-invalid={errors[name] ? 'true' : undefined}
        onChange={(event) =>
          patch({
            [name]: optional && !event.target.value ? null : event.target.value,
          })
        }
      />
    </FieldLayout>
  )
  const select = (
    name: string,
    selected: string,
    choices: { value: string; label: string }[],
    change: (value: string) => void
  ) => (
    <FieldLayout
      id={`${id}-${name}`}
      label={t(name)}
      error={errors[name] ? t(errors[name]) : undefined}
    >
      <Select value={selected} onValueChange={change} disabled={blocked}>
        <SelectTrigger
          id={`${id}-${name}`}
          className='w-full min-w-0'
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? `${id}-${name}-error` : undefined}
          data-local-invalid={errors[name] ? 'true' : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldLayout>
  )
  async function showPreview() {
    if (blocked || pending) return
    if (Object.keys(errors).length) {
      toast.error(t('invalidConfiguration'))
      document.getElementById(`${id}-${Object.keys(errors)[0]}`)?.focus()
      return
    }
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    setPendingRequest({ signature, controller: next })
    try {
      const result = await requestProfileApi.preview(
        provider,
        configuration,
        next.signal
      )
      if (
        !next.signal.aborted &&
        latest.current === signature &&
        useIdentitySession.getState().session?.id === owner
      ) {
        if (result.error) toast.error(t('previewFailed'))
        setPreviewState({ signature, value: result })
        setPreviewOpen(true)
      }
    } catch {
      if (!next.signal.aborted && latest.current === signature)
        toast.error(t('previewFailed'))
    } finally {
      setPendingRequest((current) =>
        current?.controller === next ? null : current
      )
    }
  }
  const versionMode = select(
    'versionMode',
    profileText(configuration, 'versionMode'),
    ['latest', 'fixed'].map((value) => ({ value, label: t(value) })),
    (versionMode) => {
      if (provider === 'xai')
        patch({
          versionMode,
          clientVersion:
            versionMode === 'latest' ? null : (preview?.clientVersion ?? ''),
        })
      else
        patch({
          versionMode,
          versionLag: null,
          codexVersion:
            versionMode === 'latest' ? null : (preview?.codexVersion ?? ''),
          desktopVersion:
            versionMode === 'fixed' && desktop
              ? (preview?.desktopVersion ?? '')
              : null,
          desktopBuild:
            versionMode === 'fixed' && desktop
              ? (preview?.desktopBuild ?? '')
              : null,
        })
    }
  )
  const previewFields =
    provider === 'xai'
      ? [
          'clientIdentifier',
          'clientVersion',
          'clientMode',
          'targetOs',
          'targetArch',
        ]
      : [
          'originator',
          'codexVersion',
          'desktopVersion',
          'desktopBuild',
          'osType',
          'osVersion',
          'arch',
          'terminal',
        ]
  return (
    <ConfigurationSection
      title={t(provider === 'openai' ? 'openaiTitle' : 'xaiTitle')}
      action={
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={disabled || !options.data}
            onClick={() => onChange(structuredClone(defaults))}
          >
            <RotateCcw className='size-4' />
            {t('restoreDefaults')}
          </Button>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={blocked || pending}
            onClick={() => void showPreview()}
          >
            <Eye className='size-4' />
            {t('preview')}
          </Button>
        </div>
      }
    >
      {provider === 'openai' ? (
        <>
          <div className='grid min-w-0 gap-4 @xl/gateway:grid-cols-2 @3xl/gateway:grid-cols-3'>
            {select(
              'client',
              profileText(configuration, 'client'),
              ['desktop', 'cli'].map((value) => ({ value, label: t(value) })),
              (client) =>
                patch({
                  client,
                  originator: null,
                  osType: null,
                  osVersion: null,
                  arch: null,
                  terminal: null,
                  cliEntry:
                    client === 'desktop'
                      ? null
                      : (configuration.cliEntry ?? null),
                  desktopVersion:
                    client === 'cli'
                      ? null
                      : (configuration.desktopVersion ?? null),
                  desktopBuild:
                    client === 'cli'
                      ? null
                      : (configuration.desktopBuild ?? null),
                })
            )}
            {select(
              'platform',
              profileText(configuration, 'platform'),
              ['macos', 'linux', 'windows'].map((value) => ({
                value,
                label: t(value),
              })),
              (platform) =>
                patch({
                  platform,
                  originator: null,
                  osType: null,
                  osVersion: null,
                  arch: null,
                  terminal: null,
                })
            )}
            {!desktop &&
              select(
                'cliEntry',
                profileText(configuration, 'cliEntry') || 'default',
                ['default', 'tui', 'exec'].map((value) => ({
                  value,
                  label: t(value),
                })),
                (cliEntry) =>
                  patch({ cliEntry: cliEntry === 'default' ? null : cliEntry })
              )}
            {select(
              'versionLag',
              String(configuration.versionLag ?? 0),
              Array.from(
                { length: (options.data?.maxVersionLag ?? 10) + 1 },
                (_, i) => ({
                  value: String(i),
                  label: i === 0 ? t('noLag') : t('lagCount', { count: i }),
                })
              ),
              (lag) => patch({ versionLag: Number(lag) || null })
            )}
          </div>
        </>
      ) : (
        <div className='grid min-w-0 gap-4 @xl/gateway:grid-cols-2'>
          {versionMode}
          {fixed && field('clientVersion', false, undefined, 64)}
          {['clientIdentifier', 'clientMode', 'targetOs', 'targetArch'].map(
            (name) =>
              select(
                name,
                profileText(configuration, name),
                [
                  ...new Set([
                    profileText(configuration, name),
                    profileText(defaults, name),
                    ...({
                      clientIdentifier: ['grok-shell'],
                      clientMode: ['headless'],
                      targetOs: ['linux', 'darwin', 'windows'],
                      targetArch: ['x86_64', 'aarch64'],
                    }[name] ?? []),
                  ]),
                ]
                  .filter(Boolean)
                  .map((value) => ({ value, label: value })),
                (value) => patch({ [name]: value })
              )
          )}
        </div>
      )}
      <Dialog open={previewOpen && !!preview} onOpenChange={setPreviewOpen}>
        <DialogContent className='max-h-[85dvh] min-w-0 overflow-y-auto sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>{t('preview')}</DialogTitle>
            <DialogDescription className='sr-only'>
              {t(provider === 'openai' ? 'openaiTitle' : 'xaiTitle')}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div
              className='min-w-0 space-y-4 border-t pt-4'
              data-testid={`profile-${provider}-preview`}
            >
              <div className='min-w-0 space-y-2'>
                <h4 className='text-sm font-medium'>User-Agent</h4>
                <p className='font-mono text-xs leading-relaxed wrap-anywhere'>
                  {preview.userAgent}
                </p>
              </div>
              <dl className='grid min-w-0 gap-x-6 gap-y-3 text-sm @xl/gateway:grid-cols-2'>
                {previewFields
                  .filter(
                    (name) => typeof preview[name] === 'string' && preview[name]
                  )
                  .map((name) => (
                    <div key={name} className='min-w-0'>
                      <dt className='text-xs text-muted-foreground'>
                        {t(name)}
                      </dt>
                      <dd className='mt-1 wrap-anywhere'>
                        {String(preview[name])}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ConfigurationSection>
  )
}
