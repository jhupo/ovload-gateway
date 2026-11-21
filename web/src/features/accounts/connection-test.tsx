import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { testAccountConnection } from '@/api/account-connection-test'
import { upstreamAccounts, type UpstreamAccount } from '@/api/upstream-accounts'
import { useIdentitySession } from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { RequestErrorToast } from '@/components/request-error-toast'
import { AccountIdentity, AccountProvider, AccountStatus } from './presentation'

export function AccountConnectionTest({
  account,
  onClose,
}: {
  account: UpstreamAccount
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t(`upstreamAccounts.${key}`)
  const client = useQueryClient()
  const owner = useIdentitySession((state) => state.session?.id)
  const [mode, setMode] = useState<'regular' | 'compact'>('regular')
  const [failureMessage, setFailureMessage] = useState('')
  const [started, setStarted] = useState<number | null>(null)
  const [finished, setFinished] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [events, setEvents] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)
  const [model, setModel] = useState('')
  const [pending, setPending] = useState(false)
  const [output, setOutput] = useState('')
  const [complete, setComplete] = useState(false)
  const [prompt, setPrompt] = useState('hi')
  const [images, setImages] = useState<string[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const catalog = useQuery({
    queryKey: ['account-test-models', owner, account.id],
    queryFn: ({ signal }) => upstreamAccounts.testModels(account.id, signal),
    enabled: !!owner,
    retry: false,
    gcTime: 15 * 60_000,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
  const models = catalog.data?.models ?? []
  const selected =
    models.find((item) => item.id === model)?.id ?? models[0]?.id ?? ''
  const selectedModel = models.find((item) => item.id === selected)
  const imageTest = selectedModel?.kind === 'image'
  const selectedMode = selectedModel?.compact ? mode : 'regular'
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const close = () => {
    controller.current?.abort()
    onClose()
  }
  async function syncModels() {
    setSyncing(true)
    try {
      await upstreamAccounts.syncModels(account.id)
      await catalog.refetch({ throwOnError: true })
      await client.invalidateQueries({
        queryKey: ['upstream-account-models', owner, account.id],
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr('failed'))
    } finally {
      setSyncing(false)
    }
  }
  const time = (value: number | null) =>
    value === null
      ? '—'
      : new Intl.DateTimeFormat(i18n.language, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(value)
  async function run() {
    if (
      pending ||
      syncing ||
      catalog.isFetching ||
      catalog.isError ||
      !selected
    )
      return
    const abort = new AbortController()
    controller.current = abort
    setPending(true)
    setFailureMessage('')
    setStarted(Date.now())
    setFinished(null)
    setFailed(false)
    setEvents([])
    setOutput('')
    setImages([])
    setComplete(false)
    try {
      await testAccountConnection(
        account.id,
        selected,
        abort.signal,
        (text) => setOutput((previous) => (previous + text).slice(-32000)),
        {
          prompt,
          mode: selectedMode,
          onEvent: (event) =>
            setEvents((previous) =>
              [
                ...previous,
                `${time(Date.now())} · ${tr(`testEvent.${event}`)}`,
              ].slice(-30)
            ),
          onImage: (url) =>
            setImages((previous) =>
              previous.includes(url) ? previous : [...previous, url].slice(0, 4)
            ),
        }
      )
      if (
        !abort.signal.aborted &&
        useIdentitySession.getState().session?.id === owner
      ) {
        setComplete(true)
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        setFailed(true)
        setFailureMessage(error instanceof Error ? error.message : tr('failed'))
      }
      if (
        !abort.signal.aborted &&
        useIdentitySession.getState().session?.id === owner
      )
        toast.error(error instanceof Error ? error.message : tr('failed'))
    } finally {
      if (!abort.signal.aborted) {
        setPending(false)
        setFinished(Date.now())
      }
    }
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DialogContent className='flex h-[min(42rem,calc(100dvh-2rem))] w-[min(calc(100%-2rem),32rem)] max-w-none flex-col gap-0 sm:max-w-none'>
          <DialogHeader>
            <DialogTitle>{tr('testAccountConnection')}</DialogTitle>
            <DialogDescription className='sr-only'>
              {tr('testReadyHint')}
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-4'>
            <div className='flex min-w-0 items-center gap-3'>
              <AccountProvider account={account} />
              <AccountIdentity account={account} />
            </div>
            <AccountStatus account={account} />
          </div>
          <form
            id='account-test'
            className='min-h-0 flex-1 space-y-4 overflow-y-auto pr-1'
            onSubmit={(event) => {
              event.preventDefault()
              void run()
            }}
          >
            <div className='space-y-2'>
              <div className='flex items-center justify-between gap-3'>
                <Label htmlFor='account-test-model'>{tr('testModel')}</Label>
                <Button
                  type='button'
                  size='icon-sm'
                  variant='ghost'
                  title={tr('syncModels')}
                  aria-label={tr('syncModels')}
                  disabled={pending || syncing || catalog.isFetching}
                  onClick={() => void syncModels()}
                >
                  <RefreshCw className='size-4' />
                </Button>
              </div>
              <Select
                value={selected}
                onValueChange={(value) => {
                  setModel(value)
                  setOutput('')
                  setImages([])
                  setComplete(false)
                  setFailed(false)
                  setStarted(null)
                  setFinished(null)
                  setMode('regular')
                  setPrompt(
                    models.find((item) => item.id === value)?.kind === 'image'
                      ? tr('imagePromptDefault')
                      : 'hi'
                  )
                  setFailureMessage('')
                  setEvents([])
                }}
                disabled={
                  pending ||
                  syncing ||
                  catalog.isFetching ||
                  catalog.isError ||
                  !models.length
                }
              >
                <SelectTrigger id='account-test-model' className='w-full'>
                  <SelectValue
                    placeholder={tr(catalog.isFetching ? 'loading' : 'models')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {models.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label || item.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <RequestErrorToast
                message={catalog.error?.message}
                retry={() => catalog.refetch()}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='account-test-prompt'>
                {tr(imageTest ? 'imagePrompt' : 'testPrompt')}
              </Label>
              <Textarea
                id='account-test-prompt'
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={2000}
                disabled={pending}
                placeholder={tr(
                  imageTest ? 'imagePromptDefault' : 'testPromptDefault'
                )}
                className='resize-y'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='account-test-mode'>{tr('testMode')}</Label>
              <Select
                value={selectedMode}
                disabled={pending || syncing || !selected}
                onValueChange={(value) => {
                  setMode(value as 'regular' | 'compact')
                  setOutput('')
                  setEvents([])
                  setFailureMessage('')
                  setFailed(false)
                  setComplete(false)
                  setStarted(null)
                  setFinished(null)
                }}
              >
                <SelectTrigger id='account-test-mode' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='regular'>{tr('regularTest')}</SelectItem>
                  {selectedModel?.compact && (
                    <SelectItem value='compact'>{tr('compactTest')}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <Card>
              <CardContent className='space-y-2'>
                <div className='flex items-center justify-between gap-2 text-xs'>
                  <span className='font-medium'>{tr('testProgress')}</span>
                  <span className='text-muted-foreground'>
                    {pending
                      ? tr('testing')
                      : complete
                        ? tr('testPassed')
                        : failed
                          ? tr('testFailedState')
                          : tr('readyTest')}
                  </span>
                </div>
                <Progress
                  value={pending ? 55 : complete || failed ? 100 : 0}
                  aria-label={tr('testProgress')}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className='space-y-2'>
                <div className='flex items-center justify-between gap-2 text-xs'>
                  <span role='status' className='font-medium'>
                    {tr(
                      pending
                        ? 'testing'
                        : complete
                          ? 'testPassed'
                          : failed
                            ? 'testFailedState'
                            : 'readyTest'
                    )}
                  </span>
                  {started && finished && (
                    <span className='text-muted-foreground tabular-nums'>
                      {new Intl.NumberFormat(i18n.language, {
                        maximumFractionDigits: 2,
                      }).format((finished - started) / 1000)}{' '}
                      s
                    </span>
                  )}
                </div>
                <div
                  role='log'
                  aria-label={tr('testOutput')}
                  aria-live='polite'
                  className='h-36 overflow-auto text-xs break-words whitespace-pre-wrap tabular-nums'
                >
                  {events.map((event, index) => (
                    <div key={index} className='text-muted-foreground'>
                      {event}
                    </div>
                  ))}
                  {output && <div className='mt-2'>{output}</div>}
                  {failureMessage && (
                    <div className='mt-2'>{failureMessage}</div>
                  )}
                </div>
              </CardContent>
            </Card>
            {!imageTest && (
              <div className='flex justify-between gap-2 text-xs text-muted-foreground'>
                <span>
                  {tr('testModel')}: {selected || '—'}
                </span>
                <span className='max-w-[55%] truncate' title={prompt}>
                  {tr('testPrompt')}: “{prompt || 'hi'}”
                </span>
              </div>
            )}
            {images.length > 0 && (
              <div className='grid gap-3'>
                {images.map((url, index) => (
                  <div key={url} className='space-y-2'>
                    <img
                      src={url}
                      alt={tr('imagePreview')}
                      onError={() => {
                        setFailed(true)
                        setComplete(false)
                        toast.error(tr('testFailed'))
                      }}
                      referrerPolicy='no-referrer'
                      className='max-h-44 w-full rounded-md object-contain'
                    />
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        setPreview(url)
                        setPreviewOpen(true)
                      }}
                      aria-label={`${tr('imagePreview')} ${index + 1}`}
                    >
                      {tr('imagePreview')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </form>
          <DialogFooter>
            <Button variant='outline' onClick={close}>
              {pending ? tr('stop') : t('common.close')}
            </Button>
            <Button
              form='account-test'
              type='submit'
              disabled={
                pending ||
                syncing ||
                catalog.isFetching ||
                catalog.isError ||
                !selected
              }
            >
              <Play className='size-4' />
              {tr('startTest')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className='sm:max-w-4xl'>
          <DialogHeader>
            <DialogTitle>{tr('imagePreview')}</DialogTitle>
            <DialogDescription className='sr-only'>
              {account.name}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <img
              src={preview}
              alt={tr('imagePreview')}
              referrerPolicy='no-referrer'
              className='max-h-[75dvh] w-full object-contain'
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
