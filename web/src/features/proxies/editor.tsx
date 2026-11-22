import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { Eye, EyeOff, Save, Wifi } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { proxies, type ProxyRecord } from '@/api/proxies'
import {
  hasIdentitySession,
  useIdentitySession,
} from '@/stores/identity-session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ProxyDialog } from './components'
import {
  hasProxyControlCharacters,
  parseProxyImport,
  validProxyUrl,
} from './import'

export function ProxyEditor({
  item,
  owner,
  onSaved,
  onClose,
  restoreFocus,
}: {
  item?: ProxyRecord
  owner: string
  onSaved: () => void
  onClose: () => void
  restoreFocus: () => void
}) {
  const { t } = useTranslation()
  const [record, setRecord] = useState(item)
  const [initial] = useState(() => ({
    name: item?.name ?? '',
    url: item?.hasAuthentication ? '' : (item?.endpoint ?? ''),
  }))
  const [draft, setDraft] = useState(initial)
  const [tab, setTab] = useState('single'),
    [text, setText] = useState(''),
    [showUrl, setShowUrl] = useState(false),
    [discard, setDiscard] = useState(false)
  const dirty =
    text.length > 0 || JSON.stringify(draft) !== JSON.stringify(initial)
  const blocker = useBlocker({
    shouldBlockFn: () => dirty && hasIdentitySession(),
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  const parsed = parseProxyImport(text)
  function requireOwner() {
    if (useIdentitySession.getState().session?.id !== owner)
      throw new Error(t('liveInfrastructure.sessionChanged'))
  }
  function urlValue() {
    const url = draft.url.trim()
    if (record && (!url || url === initial.url)) return undefined
    if (!validProxyUrl(url)) throw new Error(t('proxies.errors.url'))
    return url
  }
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: async () => {
      requireOwner()
      if (tab === 'batch') {
        if (parsed.invalidLine !== null || !parsed.inputs.length)
          throw new Error(
            t('liveInfrastructure.importInvalid', {
              line: parsed.invalidLine ?? 1,
            })
          )
        return proxies.create(parsed.inputs)
      }
      if (
        !draft.name.trim() ||
        new TextEncoder().encode(draft.name.trim()).length > 160 ||
        hasProxyControlCharacters(draft.name)
      )
        throw new Error(t('proxies.errors.name'))
      const proxyUrl = urlValue()
      const input = {
        name: draft.name.trim(),
        autoLocation: true,
        location: null,
        ...(proxyUrl ? { proxyUrl } : {}),
      }
      if (record)
        return [
          {
            status: 'succeeded' as const,
            data: await proxies.update(record, input),
          },
        ]
      return proxies.create([
        {
          ...input,
          proxyUrl: draft.url.trim(),
          maxWebsocketConnections: 0,
          enabled: true,
        },
      ])
    },
    onSuccess: (results) => {
      if (useIdentitySession.getState().session?.id !== owner) return
      onSaved()
      if (results.some((r) => r.status !== 'succeeded')) {
        // Keep only unsuccessful lines, so retry cannot create duplicates.
        setText(
          parsed.inputs
            .filter((_, index) => results[index]?.status !== 'succeeded')
            .map((row) => row.proxyUrl)
            .join('\n')
        )
        toast.error(t('liveInfrastructure.partialFailure'))
      } else {
        toast.success(t('liveInfrastructure.saved'))
        onClose()
      }
    },
    onError: (error) => {
      if (useIdentitySession.getState().session?.id === owner)
        toast.error(error.message)
    },
  })
  const probe = useMutation({
    gcTime: 0,
    mutationFn: async () => {
      requireOwner()
      const url = urlValue()
      let result
      if (record && !url) {
        const [tested] = await proxies.test(record, true)
        if (tested?.status !== 'succeeded')
          throw new Error(t('liveInfrastructure.testFailed'))
        requireOwner()
        setRecord(tested.data)
        onSaved()
        result = tested.data.lastTest
      } else result = await proxies.probe(url ?? draft.url.trim(), true)
      if (!result?.success) throw new Error(t('liveInfrastructure.testFailed'))
      return result
    },
    onSuccess: (result) => {
      if (useIdentitySession.getState().session?.id === owner)
        toast.success(
          [
            t('liveInfrastructure.testPassed'),
            result.exitIp,
            `${result.latencyMs} ms`,
          ]
            .filter(Boolean)
            .join(' · ')
        )
    },
    onError: (error) => {
      if (useIdentitySession.getState().session?.id === owner)
        toast.error(error.message)
    },
  })
  const busy = mutation.isPending || probe.isPending
  function close() {
    if (!busy) {
      if (dirty) setDiscard(true)
      else onClose()
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!busy) mutation.mutate()
  }
  return (
    <>
      <ProxyDialog
        title={t(item ? 'proxies.edit' : 'proxies.add')}
        description={t('proxyDesign.editorDescription')}
        busy={busy}
        compact={tab === 'single'}
        fixedHeight={tab === 'batch'}
        onClose={close}
        restoreFocus={restoreFocus}
      >
        <form onSubmit={submit} className='flex min-h-0 flex-1 flex-col gap-4'>
          <div className='min-h-0 flex-1 space-y-4 overflow-y-auto p-1'>
            {!item && (
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className='w-full'>
                  <TabsTrigger disabled={busy} value='single'>
                    {t('proxyDesign.single')}
                  </TabsTrigger>
                  <TabsTrigger disabled={busy} value='batch'>
                    {t('proxyDesign.batch')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <fieldset disabled={busy} className='space-y-4'>
              {tab === 'batch' ? (
                <div className='space-y-3'>
                  <Label htmlFor='proxy-batch'>{t('proxies.urls')}</Label>
                  <Textarea
                    id='proxy-batch'
                    className='min-h-40'
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    autoComplete='off'
                    spellCheck={false}
                    maxLength={64000}
                    rows={8}
                    placeholder='http://user:password@host:8080'
                  />
                  <div className='flex flex-wrap justify-between gap-2 text-sm text-muted-foreground'>
                    <span>{t('proxies.importLimit')}</span>
                    <span>
                      {t('proxies.importCount', {
                        valid: parsed.inputs.length,
                        invalid: parsed.invalidLine === null ? 0 : 1,
                      })}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div className='space-y-2'>
                    <Label htmlFor='proxy-name'>{t('proxyDesign.name')}</Label>
                    <Input
                      id='proxy-name'
                      required
                      value={draft.name}
                      maxLength={160}
                      autoComplete='off'
                      onChange={(e) =>
                        setDraft((old) => ({ ...old, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='proxy-url'>
                      {t('proxyDesign.address')}
                    </Label>
                    <p
                      id='proxy-url-help'
                      className='text-xs leading-relaxed text-muted-foreground'
                    >
                      {t(
                        record?.hasAuthentication
                          ? 'proxyDesign.keepAuthentication'
                          : 'proxyDesign.addressHelp'
                      )}
                    </p>
                    <div className='flex items-center gap-2'>
                      <Input
                        id='proxy-url'
                        type={record?.hasAuthentication && !showUrl ? 'password' : 'text'}
                        aria-describedby='proxy-url-help'
                        required={!record}
                        autoComplete='new-password'
                        spellCheck={false}
                        maxLength={2048}
                        placeholder={record?.endpoint ?? 'http://host:8080'}
                        value={draft.url}
                        onChange={(e) =>
                          setDraft((old) => ({ ...old, url: e.target.value }))
                        }
                      />
                      <Button
                        type='button'
                        size='icon'
                        variant='ghost'
                        aria-label={t(
                          showUrl
                            ? 'proxyDesign.hideAddress'
                            : 'proxyDesign.showAddress'
                        )}
                        onClick={() => setShowUrl(!showUrl)}
                      >
                        {showUrl ? <EyeOff /> : <Eye />}
                      </Button>
                    </div>
                  </div>
                  <p className='border-t pt-4 text-xs leading-relaxed text-muted-foreground'>
                    {t('proxyDesign.autoLocationHelp')}
                  </p>
                </>
              )}
            </fieldset>
          </div>
          <div className='flex shrink-0 flex-wrap justify-end gap-2'>
            <Button
              type='button'
              variant='ghost'
              disabled={busy}
              onClick={close}
            >
              {t('proxies.cancel')}
            </Button>
            {tab === 'single' && (
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={() => probe.mutate()}
              >
                <Wifi />
                {t('proxies.test')}
              </Button>
            )}
            <Button type='submit' disabled={busy}>
              <Save />
              {t(
                tab === 'batch'
                  ? 'proxyDesign.importSave'
                  : 'proxyDesign.saveProxy'
              )}
            </Button>
          </div>
        </form>
      </ProxyDialog>
      <ConfirmDialog
        open={discard || blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) {
            setDiscard(false)
            if (blocker.status === 'blocked') blocker.reset()
          }
        }}
        title={t('proxies.discardTitle')}
        desc={t('proxyDesign.discardDescription')}
        confirmText={t('proxies.discard')}
        handleConfirm={() => {
          setDiscard(false)
          if (blocker.status === 'blocked') blocker.proceed()
          else onClose()
        }}
      />
    </>
  )
}
