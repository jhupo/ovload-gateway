import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { observability, type UsageDetail } from '@/api/observability'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { accountProviderLabel as providerLabel } from '@/lib/upstream-platforms'
import { formatUsd } from '@/lib/usd'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QueryState } from '@/components/query-state'
import { RequestErrorToast } from '@/components/request-error-toast'
import { Settlement } from './settlement'

const latencyMetrics = [
  'admissionDecisionMs',
  'accountSelectionWaitMs',
  'transportDecisionWaitMs',
  'wsConnectMs',
  'upstreamHeadersMs',
  'firstEventMs',
  'firstReasoningMs',
  'firstTextMs',
  'openaiProcessingMs',
  'upstreamResponseMs',
  'upstreamApiOverheadMs',
  'upstreamEngineMs',
] as const

function Fields({ values }: { values: [string, ReactNode][] }) {
  return (
    <dl className='grid grid-cols-2 gap-x-5 gap-y-4 text-xs'>
      {values.map(([label, value]) => (
        <div key={label} className='min-w-0'>
          <dt className='text-muted-foreground'>{label}</dt>
          <dd className='mt-1 font-medium break-words tabular-nums'>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function CaptureSide({
  value,
  onChange,
}: {
  value: 'client' | 'upstream'
  onChange: (value: 'client' | 'upstream') => void
}) {
  const { t } = useTranslation()
  return (
    <div className='flex items-center justify-between gap-2'>
      <div
        role='group'
        aria-label={t('usage.captureSide')}
        className='flex gap-1 rounded-lg bg-muted p-1'
      >
        {(['client', 'upstream'] as const).map((side) => (
          <Button
            key={side}
            size='sm'
            variant={value === side ? 'outline' : 'ghost'}
            className='h-8 px-3 text-xs'
            aria-pressed={value === side}
            onClick={() => onChange(side)}
          >
            {t(`usage.${side}`)}
          </Button>
        ))}
      </div>
    </div>
  )
}

function DiagnosticDownload({ id, owner }: { id: string; owner: string }) {
  const { t } = useTranslation()
  const controller = useRef<AbortController | null>(null)
  const [pending, setPending] = useState(false)
  useEffect(() => () => controller.current?.abort(), [])
  const download = async () => {
    if (controller.current) return
    const request = new AbortController()
    controller.current = request
    setPending(true)
    try {
      const archive = await observability.exportDiagnostics(id, request.signal)
      if (
        request.signal.aborted ||
        useIdentitySession.getState().session?.id !== owner ||
        !allows('usage.read')
      )
        return
      const url = URL.createObjectURL(archive)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `diagnostics-${id}.zip`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      if (
        !request.signal.aborted &&
        useIdentitySession.getState().session?.id === owner
      )
        toast.error(t('adminObservability.diagnosticExportFailed'), {
          id: 'usage-diagnostics-export',
        })
    } finally {
      if (controller.current === request) {
        controller.current = null
        if (!request.signal.aborted) setPending(false)
      }
    }
  }
  return (
    <Button
      size='icon'
      variant='ghost'
      className='size-8'
      disabled={pending}
      aria-label={t('adminObservability.exportDiagnostics')}
      title={t('adminObservability.exportDiagnostics')}
      onClick={() => void download()}
    >
      <Download className='size-3.5' />
    </Button>
  )
}

function DetailBody({ record: r }: { record: UsageDetail }) {
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t(`usage.${key}`)
  const unknown = t('adminObservability.unknown')
  const [side, setSide] = useState<'client' | 'upstream'>('client')
  const incoming = side === 'client'
  const upstreamAttempt = r.attempts
    .slice()
    .sort((a, b) => b.attemptIndex - a.attemptIndex)[0]
  const outcome = incoming ? r.logicalOutcome : upstreamAttempt?.outcome
  const status = incoming ? r.clientStatusCode : r.upstreamStatusCode
  const error = incoming
    ? r.message
    : (upstreamAttempt?.providerErrorCode ?? upstreamAttempt?.failureClass)
  const number = (value: number | null) =>
    value === null
      ? unknown
      : new Intl.NumberFormat(i18n.language).format(value)
  const milliseconds = (value: number | undefined) =>
    value === undefined ? unknown : `${number(value)} ms`
  return (
    <Tabs defaultValue='trace' className='min-h-0 flex-1 gap-0'>
      <div className='shrink-0 border-b px-5 py-3'>
        <TabsList className='grid w-full grid-cols-4'>
          {['trace', 'request', 'response', 'billing'].map((value) => (
            <TabsTrigger key={value} value={value} className='px-1 text-xs'>
              {tr(value)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain p-5'>
        <TabsContent value='request' className='m-0 space-y-5'>
          <CaptureSide value={side} onChange={setSide} />
          <Fields
            values={[
              [tr('requestId'), r.requestId],
              [
                tr('status'),
                outcome
                  ? t(`adminObservability.outcomes.${outcome}`, {
                      defaultValue: outcome,
                    })
                  : unknown,
              ],
              [t('adminObservability.recordedAt'), r.createdAtDisplay],
              [tr('user'), r.userName ?? r.userId ?? unknown],
              [tr('userEmail'), r.userEmail ?? unknown],
              [tr('provider'), providerLabel(r.provider, unknown)],
              [tr('account'), r.accountName ?? r.accountId ?? unknown],
              [tr('group'), r.routingGroupNamesSnapshot.join(', ') || unknown],
              [tr('model'), r.model ?? unknown],
              [tr('serviceTier'), r.serviceTier ?? unknown],
              [tr('reasoningEffort'), r.reasoningEffort ?? unknown],
              [tr('reasoningPreset'), r.reasoningPreset ?? unknown],
              [tr('subagentKind'), r.subagentKind ?? unknown],
              [
                t('adminObservability.requestedModel'),
                r.requestedModel ?? unknown,
              ],
              [
                t('adminObservability.upstreamModel'),
                r.upstreamModel ?? unknown,
              ],
              ...(incoming
                ? ([
                    [tr('endpoint'), r.route],
                    [tr('protocol'), r.protocol],
                    [tr('httpVersion'), r.httpVersion ?? unknown],
                  ] as [string, ReactNode][])
                : []),
              [
                tr('transport'),
                incoming ? r.clientTransport : (r.upstreamTransport ?? unknown),
              ],
              [
                t('adminObservability.upstreamTransport'),
                r.upstreamTransport ?? unknown,
              ],
              [tr('http'), status ?? unknown],
              [tr('responseId'), r.responseId ?? unknown],
              [tr('upstreamId'), r.upstreamRequestId ?? unknown],
              ...(incoming
                ? ([
                    [tr('ip'), r.clientIp ?? unknown],
                    [tr('userAgent'), r.userAgent ?? unknown],
                  ] as [string, ReactNode][])
                : []),
              [tr('error'), error || unknown],
            ]}
          />
        </TabsContent>
        <TabsContent value='response' className='m-0 space-y-5'>
          <CaptureSide value={side} onChange={setSide} />
          <Fields
            values={[
              [
                tr('status'),
                outcome
                  ? t(`adminObservability.outcomes.${outcome}`, {
                      defaultValue: outcome,
                    })
                  : unknown,
              ],
              [tr('http'), status ?? unknown],
              [tr('responseId'), r.responseId ?? unknown],
              [tr('upstreamId'), r.upstreamRequestId ?? unknown],
              [tr('error'), error || unknown],
            ]}
          />
        </TabsContent>
        <TabsContent value='trace' className='m-0 space-y-6'>
          <Fields
            values={[
              [tr('user'), r.userName ?? r.userEmail ?? r.userId ?? unknown],
              [tr('time'), r.createdAtDisplay],
              [tr('group'), r.routingGroupNamesSnapshot.join(', ') || unknown],
              [tr('provider'), providerLabel(r.provider, unknown)],
            ]}
          />
          <section className='space-y-3 border-t pt-5'>
            <h3 className='text-sm font-semibold'>{tr('latencyBreakdown')}</h3>
            <Fields
              values={latencyMetrics.map((key): [string, ReactNode] => [
                t(`adminObservability.latencyMetrics.${key}`),
                milliseconds(r.latencyDetails[key]),
              ])}
            />
            <Fields
              values={[
                [
                  tr('firstToken'),
                  r.firstTokenLatencyMs === null
                    ? unknown
                    : milliseconds(r.firstTokenLatencyMs),
                ],
                [
                  tr('duration'),
                  r.latencyMs === null ? unknown : milliseconds(r.latencyMs),
                ],
                [
                  t('adminObservability.slotsUsed'),
                  r.latencyDetails.capacityUsedSlots === undefined
                    ? unknown
                    : number(r.latencyDetails.capacityUsedSlots),
                ],
                [
                  t('adminObservability.slotsTotal'),
                  r.latencyDetails.capacityTotalSlots === undefined
                    ? unknown
                    : number(r.latencyDetails.capacityTotalSlots),
                ],
              ]}
            />
          </section>
          <section className='space-y-3 border-t pt-5'>
            <h3 className='text-sm font-semibold'>
              {tr('attempts')}{' '}
              <span className='ml-1 text-muted-foreground'>
                {number(r.attemptCount)}
              </span>
            </h3>
            {!r.attemptsComplete && (
              <p role='status' className='text-xs text-muted-foreground'>
                {t('adminObservability.attemptsIncomplete')}
              </p>
            )}
            {r.attempts.map((attempt) => (
              <section
                key={attempt.id}
                className='space-y-3 rounded-lg border p-3'
              >
                <h3 className='text-sm font-semibold'>
                  #{attempt.attemptIndex} · {attempt.provider}
                </h3>
                <Fields
                  values={[
                    [
                      tr('status'),
                      t(`adminObservability.outcomes.${attempt.outcome}`, {
                        defaultValue: attempt.outcome,
                      }),
                    ],
                    [t('adminObservability.sendState'), attempt.sendState],
                    [
                      tr('account'),
                      attempt.accountName ?? attempt.accountId ?? unknown,
                    ],
                    [tr('model'), attempt.model ?? unknown],
                    [tr('transport'), attempt.transport],
                    [tr('http'), attempt.statusCode ?? unknown],
                    [
                      tr('error'),
                      attempt.providerErrorCode ??
                        attempt.failureClass ??
                        unknown,
                    ],
                    [
                      tr('duration'),
                      attempt.latencyMs === null
                        ? unknown
                        : `${number(attempt.latencyMs)} ms`,
                    ],
                    [tr('input'), number(attempt.inputTokens)],
                    [tr('output'), number(attempt.outputTokens)],
                    [tr('cacheRead'), number(attempt.cachedInputTokens)],
                    [t('dashboard.totalTokens'), number(attempt.totalTokens)],
                    [
                      tr('cost'),
                      attempt.estimatedCostAmount === null
                        ? unknown
                        : attempt.estimatedCostCurrency === 'USD'
                          ? formatUsd(
                              attempt.estimatedCostAmount,
                              i18n.language
                            )
                          : `${attempt.estimatedCostCurrency ?? ''} ${attempt.estimatedCostAmount}`,
                    ],
                    [
                      t('adminObservability.costStatus'),
                      attempt.costEstimateStatus,
                    ],
                  ]}
                />
              </section>
            ))}
            {!r.attempts.length && (
              <p className='text-sm text-muted-foreground'>{tr('empty')}</p>
            )}
          </section>
        </TabsContent>
        <TabsContent value='billing' className='m-0 space-y-5'>
          <Settlement record={r} />
          {r.subscriptionId && (
            <Fields values={[[tr('subscriptionId'), r.subscriptionId]]} />
          )}

          <div className='grid grid-cols-2 gap-3'>
            {[
              {
                key: 'charge',
                value: formatUsd(r.retailChargeUsd, i18n.language),
              },
              {
                key: 'cost',
                value: r.costs.length
                  ? r.costs
                      .map((cost) =>
                        cost.currency === 'USD'
                          ? formatUsd(cost.estimatedAmount, i18n.language)
                          : `${cost.currency} ${cost.estimatedAmount}`
                      )
                      .join(' · ')
                  : unknown,
              },
            ].map((item) => (
              <div key={item.key} className='min-w-0 rounded-lg border p-4'>
                <p className='text-xs text-muted-foreground'>{tr(item.key)}</p>
                <p className='mt-2 text-xl font-semibold break-words tabular-nums'>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
          <Fields
            values={[
              [tr('input'), number(r.tokenDetails.inputTokens)],
              [tr('output'), number(r.tokenDetails.outputTokens)],
              [tr('cacheRead'), number(r.tokenDetails.cachedInputTokens)],
              [tr('cacheWrite'), number(r.tokenDetails.cacheWriteInputTokens)],
              [
                t('adminObservability.reasoningTokens'),
                number(r.tokenDetails.reasoningOutputTokens),
              ],
              [tr('imageInput'), number(r.tokenDetails.imageInputTokens)],
              [tr('imageOutput'), number(r.tokenDetails.imageOutputTokens)],
              [t('dashboard.totalTokens'), number(r.tokenDetails.totalTokens)],
              [
                tr('firstToken'),
                r.firstTokenLatencyMs === null
                  ? unknown
                  : `${number(r.firstTokenLatencyMs)} ms`,
              ],
              [
                tr('duration'),
                r.latencyMs === null ? unknown : `${number(r.latencyMs)} ms`,
              ],
            ]}
          />
          {r.billing && r.billing.inputPriceDisplay !== '—' && (
            <Fields
              values={[
                [tr('inputPrice'), r.billing.inputPriceDisplay],
                [tr('inputAmount'), r.billing.inputAmountDisplay],
                [tr('outputPrice'), r.billing.outputPriceDisplay],
                [tr('outputAmount'), r.billing.outputAmountDisplay],
                [tr('cacheReadPrice'), r.billing.cacheReadPriceDisplay],
                [tr('cacheReadAmount'), r.billing.cacheReadAmountDisplay],
                [tr('cacheWritePrice'), r.billing.cacheWritePriceDisplay],
                [tr('cacheWriteAmount'), r.billing.cacheWriteAmountDisplay],
                [tr('standardAmount'), r.billing.standardAmountDisplay],
                [tr('multiplier'), r.billing.multiplierDisplay],
                [tr('serviceTier'), r.billing.serviceTierDisplay],
                [
                  tr('longContext'),
                  t(
                    r.billing.longContextBillingApplied
                      ? 'common.yes'
                      : 'common.no'
                  ),
                ],
              ]}
            />
          )}
          {r.billing?.image && (
            <Fields
              values={[
                [tr('imageInputPrice'), r.billing.image.inputPriceDisplay],
                [
                  tr('imageCacheReadPrice'),
                  r.billing.image.cacheReadPriceDisplay,
                ],
                [tr('imageInputAmount'), r.billing.image.inputAmountDisplay],
                [
                  tr('imageCacheReadAmount'),
                  r.billing.image.cacheReadAmountDisplay,
                ],
              ]}
            />
          )}
        </TabsContent>
      </div>
    </Tabs>
  )
}

export function RequestDetail({
  id,
  owner,
  canRead,
  onClose,
  returnFocus,
}: {
  id: string | null
  owner: string | undefined
  canRead: boolean
  onClose: () => void
  returnFocus: RefObject<HTMLButtonElement | null>
}) {
  const { t } = useTranslation()
  const detail = useQuery({
    queryKey: ['admin-observability', owner, 'detail', id],
    queryFn: ({ signal }) => observability.detail(id!, signal),
    enabled: canRead && !!owner && !!id,
    retry: false,
    gcTime: 0,
  })
  return (
    <Sheet
      open={id !== null && canRead}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        className='w-full gap-0 sm:max-w-[640px]'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (returnFocus.current?.isConnected) returnFocus.current.focus()
        }}
      >
        <SheetHeader className='shrink-0 border-b px-5 py-4'>
          <SheetTitle>{t('usage.detail')}</SheetTitle>
          <SheetDescription className='sr-only'>
            {t('adminObservability.detailDescription')}
          </SheetDescription>
          <div className='flex items-center justify-between gap-2'>
            <span className='min-w-0 truncate font-mono text-xs text-muted-foreground'>
              {id}
            </span>
            <div className='flex shrink-0 items-center'>
              {id && owner && canRead && (
                <DiagnosticDownload
                  key={`${owner}:${id}`}
                  id={id}
                  owner={owner}
                />
              )}
              <Button
                size='icon'
                variant='ghost'
                className='size-8'
                aria-label={t('usage.copyId')}
                onClick={async () => {
                  if (!id) return
                  try {
                    await navigator.clipboard.writeText(id)
                    if (useIdentitySession.getState().session?.id === owner)
                      toast.success(t('usage.copied'))
                  } catch {
                    if (useIdentitySession.getState().session?.id === owner)
                      toast.error(t('usage.copyFailed'))
                  }
                }}
              >
                <Copy className='size-3.5' />
              </Button>
            </div>
          </div>
          {detail.data && (
            <div className='flex flex-wrap items-center gap-2 text-xs'>
              <Badge variant='secondary'>
                {t(
                  `adminObservability.outcomes.${detail.data.logicalOutcome}`,
                  { defaultValue: detail.data.logicalOutcome }
                )}
              </Badge>
              <span>
                {detail.data.model ?? t('adminObservability.unknown')}
              </span>
              <span className='text-muted-foreground'>·</span>
              <span className='tabular-nums'>
                {detail.data.latencyMs === null
                  ? t('adminObservability.unknown')
                  : `${detail.data.latencyMs}ms`}
              </span>
            </div>
          )}
        </SheetHeader>
        {detail.isError ? (
          <>
            <RequestErrorToast
              message={detail.error.message}
              retry={() => void detail.refetch()}
            />
            <QueryState error={detail.error} retry={detail.refetch} />
          </>
        ) : detail.data && canRead ? (
          <DetailBody key={detail.data.id} record={detail.data} />
        ) : (
          <p role='status' className='p-5 text-sm'>
            {t('adminObservability.loading')}
          </p>
        )}
      </SheetContent>
    </Sheet>
  )
}
