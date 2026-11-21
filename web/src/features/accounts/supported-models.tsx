import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { upstreamAccounts, type ModelAccess } from '@/api/upstream-accounts'
import { useIdentitySession } from '@/stores/identity-session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequestErrorToast } from '@/components/request-error-toast'
import { accountQueryKeys } from './query-cache'

export type ModelDiscovery = (
  signal: AbortSignal
) => Promise<{ models: { id: string; label: string }[] }>

export function SupportedModels({
  accountId,
  value,
  onChange,
  discover,
  canDiscover,
  sourceKey = '',
  disabled,
  invalid,
  initialModels,
}: {
  accountId?: string
  value: ModelAccess
  onChange: (value: ModelAccess) => void
  discover?: ModelDiscovery
  canDiscover?: boolean
  sourceKey?: string
  disabled: boolean
  invalid: boolean
  initialModels?: string[]
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t(`upstreamAccounts.${key}`)
  const owner = useIdentitySession((state) => state.session?.id)
  const queryClient = useQueryClient()
  const [result, setResult] = useState<{
    source: string
    models: string[]
  } | null>(null)
  const [search, setSearch] = useState('')
  const [pendingSource, setPendingSource] = useState<string | null>(null)
  const pending = pendingSource === sourceKey
  const lifecycle = useRef({
    generation: 0,
    controller: null as AbortController | null,
  })
  // Credentials stay out of query keys and network URLs. Changes invalidate late responses.
  useEffect(() => {
    const state = lifecycle.current
    state.generation++
    state.controller?.abort()
    return () => {
      state.generation++
      state.controller?.abort()
    }
  }, [sourceKey, accountId, owner, lifecycle])
  const catalog = useQuery({
    queryKey: accountQueryKeys.supportedModels(owner, accountId),
    queryFn: ({ signal }) => upstreamAccounts.models(accountId!, signal),
    enabled: !!accountId && !discover,
    retry: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
  const current =
    result?.source === sourceKey
      ? result.models
      : discover
        ? initialModels
        : catalog.data?.models.map((model) => model.id)
  const models = [...new Set([...(current ?? []), ...value.models])]
  const selected = (id: string) =>
    value.mode === 'all' ||
    (value.mode === 'allowlist'
      ? value.models.includes(id)
      : !value.models.includes(id))
  async function sync() {
    if (disabled || pending || (discover ? !canDiscover : !accountId)) return
    const state = lifecycle.current
    const ticket = ++state.generation
    const abort = new AbortController()
    state.controller?.abort()
    state.controller = abort
    setPendingSource(sourceKey)
    try {
      const next = discover
        ? await discover(abort.signal)
        : await upstreamAccounts.syncModels(accountId!)
      if (
        ticket !== state.generation ||
        owner !== useIdentitySession.getState().session?.id
      )
        return
      setResult({
        source: sourceKey,
        models: next.models.map((model) => model.id),
      })
      if (!discover && accountId) {
        queryClient.setQueryData(accountQueryKeys.supportedModels(owner, accountId), next)
      }
      toast.success(
        t('upstreamAccounts.modelsSynced', { count: next.models.length }),
        { id: 'account-model-sync' }
      )
    } catch (error) {
      if (ticket === state.generation && !abort.signal.aborted)
        toast.error(error instanceof Error ? error.message : tr('failed'))
    } finally {
      if (ticket === state.generation) setPendingSource(null)
    }
  }
  return (
    <Card className='min-w-0 gap-0 py-0' aria-labelledby='account-model-policy'>
      <RequestErrorToast
        message={catalog.error?.message}
        retry={() => void catalog.refetch()}
      />
      <div className='flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3'>
        <div className='flex items-center gap-2'>
          <Label id='account-model-policy'>{tr('modelPolicy')}</Label>
          {models.length > 0 && (
            <Badge variant='secondary'>
              {value.mode === 'all'
                ? tr('allSupportedModels')
                : `${value.models.length}/${models.length}`}
            </Badge>
          )}
        </div>
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={
            disabled || pending || (discover ? !canDiscover : !accountId)
          }
          title={
            !accountId && !discover ? tr('modelsAfterAuthorization') : undefined
          }
          onClick={() => void sync()}
        >
          <RefreshCw className={pending ? 'size-4 animate-spin' : 'size-4'} />
          {tr('syncModels')}
        </Button>
      </div>
      <CardContent className='space-y-3 p-4'>
        {current !== undefined && models.length === 0 && (
          <p className='text-sm text-muted-foreground'>
            {tr('noSupportedModels')}
          </p>
        )}
        {models.length > 0 && (
          <>
            <div className='flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 p-2'>
              <Checkbox
                id='account-all-models'
                aria-label={tr('allSupportedModels')}
                disabled={disabled}
                checked={value.mode === 'all'}
                onCheckedChange={(checked) =>
                  onChange({ mode: checked ? 'all' : 'allowlist', models: [] })
                }
              />
              <Label htmlFor='account-all-models' className='shrink-0'>
                {tr('allSupportedModels')}
              </Label>
              <Input
                className='min-w-0 flex-1'
                aria-label={tr('searchModels')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={tr('searchModels')}
              />
            </div>
            <div
              id='account-models'
              tabIndex={-1}
              role='group'
              aria-label={tr('models')}
              aria-invalid={invalid}
              className='grid max-h-48 gap-2 overflow-y-auto rounded-md border bg-muted/10 p-3 sm:grid-cols-2'
            >
              {models
                .filter((model) =>
                  model
                    .toLocaleLowerCase('en-US')
                    .includes(search.toLocaleLowerCase('en-US'))
                )
                .map((model) => (
                  <Label
                    key={model}
                    className='flex min-w-0 cursor-pointer items-start gap-2 rounded-md border bg-background px-2 py-1.5 font-normal transition-colors hover:bg-accent has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5'
                  >
                    <Checkbox
                      disabled={disabled}
                      checked={selected(model)}
                      aria-label={model}
                      onCheckedChange={(checked) => {
                        const chosen = models.filter((id) =>
                          id === model ? checked === true : selected(id)
                        )
                        onChange(
                          chosen.length === models.length
                            ? { mode: 'all', models: [] }
                            : { mode: 'allowlist', models: chosen }
                        )
                      }}
                    />
                    <span className='break-all'>{model}</span>
                  </Label>
                ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
