import { useEffect, useId, useRef, useState } from 'react'
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfigurationSection } from '@/components/configuration-section'
import {
  requestProfileApi,
  type ProfileConfiguration,
  type ProfilePreview,
} from './profile-api'

export function NativeProfileSettings({
  provider,
  value,
  onChange,
  disabled,
}: {
  provider: 'claude' | 'gemini'
  value: ProfileConfiguration | null
  onChange: (value: ProfileConfiguration | null) => void
  disabled: boolean
}) {
  const { t } = useTranslation('gatewayProfiles')
  const owner = useIdentitySession((state) => state.session?.id)
  const id = useId()
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<ProfilePreview | null>(null)
  const [pending, setPending] = useState(false)
  const controller = useRef<AbortController | null>(null)
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
  const configuration = value ??
    options.data?.defaults ?? { preset: 'linux-x64' }
  const signature = JSON.stringify([owner, provider, configuration])
  useEffect(() => () => controller.current?.abort(), [signature])
  const blocked = disabled || !options.data
  async function showPreview() {
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setPending(true)
    try {
      const result = await requestProfileApi.preview(
        provider,
        configuration,
        request.signal
      )
      if (request.signal.aborted) return
      setPreview(result)
      setOpen(true)
    } catch {
      if (!request.signal.aborted) toast.error(t('previewFailed'))
    } finally {
      if (controller.current === request) setPending(false)
    }
  }
  return (
    <ConfigurationSection title={t(`${provider}Title`)}>
      <div className='flex min-w-0 flex-wrap items-end gap-3'>
        <div className='flex min-w-0 flex-1 basis-full flex-col gap-2 sm:basis-0'>
          <Label htmlFor={id}>{t('preset')}</Label>
          <Select
            value={String(configuration.preset)}
            disabled={blocked}
            onValueChange={(preset) => onChange({ preset })}
          >
            <SelectTrigger id={id} className='h-9 w-full min-w-0'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.data?.presets?.map(({ configuration: preset }) => (
                <SelectItem
                  key={String(preset.preset)}
                  value={String(preset.preset)}
                >
                  {{
                    'linux-x64': 'Linux · x64',
                    'macos-arm64': 'macOS · ARM64',
                    'windows-x64': 'Windows · x64',
                  }[String(preset.preset)] ?? String(preset.preset)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type='button'
          variant='outline'
          className='h-9'
          disabled={blocked || pending}
          onClick={() => void showPreview()}
        >
          <Eye className='size-4' />
          {t('preview')}
        </Button>
        <Button
          type='button'
          variant='outline'
          className='h-9'
          disabled={blocked}
          onClick={() => onChange(null)}
        >
          <RotateCcw className='size-4' />
          {t('restoreDefaults')}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-h-[85dvh] overflow-y-auto sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle>{t(`${provider}Title`)}</DialogTitle>
            <DialogDescription className='sr-only'>
              {t('preview')}
            </DialogDescription>
          </DialogHeader>
          <dl className='min-w-0 space-y-4 text-sm'>
            {Object.entries(
              (preview?.headers as Record<string, unknown>) ?? {}
            ).map(([key, header]) => (
              <div key={key} className='min-w-0'>
                <dt className='text-muted-foreground'>{key}</dt>
                <dd className='mt-1 font-mono break-all'>{String(header)}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </ConfigurationSection>
  )
}
