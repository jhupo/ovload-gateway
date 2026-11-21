import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ApiError } from '@/api/errors'
import {
  upstreamAccounts,
  type AccountPersonalInfo,
  type AccountQuotaForecast,
  type AccountResetCredit,
  type AccountResetCredits,
  type ConsumeResetCredit,
  type UpstreamAccount,
} from '@/api/upstream-accounts'
import { allows, useIdentitySession } from '@/stores/identity-session'
import { formatUsd } from '@/lib/usd'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { QueryState } from '@/components/query-state'
import { RequestErrorToast } from '@/components/request-error-toast'
import { TokenCount } from '@/components/token-count'
import { type AccountPanel } from './panels'
import {
  AccountIdentity,
  AccountProvider,
  QuotaSummary,
  AccountPlan,
  AccountStatus,
  QuotaWindows,
  AccountCost,
} from './presentation'
import { invalidateAccountQueries } from './query-cache'

type ResetIntent = {
  command: ConsumeResetCredit
  inFlight: boolean
  uncertain: boolean
}

// Preserve the provider idempotency command when its dialog is dismissed.
const resetIntents = new Map<string, ResetIntent>()
const resetListeners = new Set<() => void>()
let resetVersion = 0
function publishResetIntents() {
  resetVersion += 1
  resetListeners.forEach((listener) => listener())
}
function subscribeResetIntents(listener: () => void) {
  resetListeners.add(listener)
  return () => {
    resetListeners.delete(listener)
  }
}
const resetSnapshot = () => resetVersion
useIdentitySession.subscribe((state, previous) => {
  if (state.session?.id !== previous.session?.id) {
    resetIntents.clear()
    publishResetIntents()
  }
})
const resetIntentKey = (owner: string | undefined, accountId: string) =>
  `${owner ?? ''}:${accountId}`

function useAccountFormat() {
  const { t, i18n } = useTranslation()
  const unknown = t('upstreamAccounts.unknown')
  return {
    unknown,
    number: (value: number | null | undefined) =>
      value == null
        ? unknown
        : new Intl.NumberFormat(i18n.language).format(value),
    percent: (value: number | null | undefined) =>
      value == null
        ? unknown
        : `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value)}%`,
    money: (value: string | null | undefined) =>
      value == null ? unknown : formatUsd(value, i18n.language),
    date: (value: string | null | undefined) => {
      if (!value) return unknown
      const parsed = new Date(value)
      return Number.isNaN(parsed.valueOf())
        ? unknown
        : new Intl.DateTimeFormat(i18n.language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(parsed)
    },
  }
}

export function AccountDetails({
  account,
  panel,
  onClose,
  restoreFocus,
}: {
  account: UpstreamAccount
  panel: AccountPanel
  onClose: () => void
  restoreFocus: () => void
}) {
  const { t } = useTranslation()
  const f = useAccountFormat()
  const owner = useIdentitySession((state) => state.session?.id)
  useIdentitySession((state) => state.grants)
  const client = useQueryClient()
  const canRead = !!owner && allows('provider_accounts.read')
  const canManage = allows('provider_accounts.manage')
  const [refreshing, setRefreshing] = useState(false)
  useSyncExternalStore(subscribeResetIntents, resetSnapshot)
  const [selectedReset, setSelectedReset] = useState<AccountResetCredit | null>(
    null
  )
  const [resetResult, setResetResult] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const detail = useQuery({
    queryKey: ['upstream-account-detail', owner, account.id],
    queryFn: ({ signal }) => upstreamAccounts.detail(account.id, signal),
    enabled: canRead,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: panel === 'usage' ? 15_000 : false,
  })
  const current = detail.data?.account ?? account
  const personal = useQuery({
    queryKey: ['upstream-account-personal-info', owner, account.id],
    queryFn: ({ signal }) => upstreamAccounts.personalInfo(account.id, signal),
    enabled:
      canRead &&
      panel === 'profile' &&
      (current.capabilities.profile || current.capabilities.subscription),
    retry: false,
  })
  const forecast = useQuery({
    queryKey: ['upstream-account-forecast', owner, account.id],
    queryFn: ({ signal }) => upstreamAccounts.quotaForecast(account.id, signal),
    enabled: canRead && panel === 'forecast' && current.capabilities.quota,
    retry: false,
  })
  const credits = useQuery({
    queryKey: ['upstream-account-reset-credits', owner, account.id],
    queryFn: ({ signal }) => upstreamAccounts.resetCredits(account.id, signal),
    enabled: canRead && panel === 'reset' && current.capabilities.resetCredits,
    retry: false,
  })
  const ownsSession = () => {
    const session = useIdentitySession.getState().session
    return !!owner && session?.id === owner && session.audience === 'management'
  }
  const refresh = async () => {
    if (!ownsSession() || refreshing) return
    setRefreshing(true)
    try {
      if (panel === 'profile') await personal.refetch({ throwOnError: true })
      else if (panel === 'models') {
        await upstreamAccounts.syncModels(account.id)
        await client.invalidateQueries({
          queryKey: ['upstream-account-models', owner, account.id],
        })
        await client.invalidateQueries({
          queryKey: ['account-test-models', owner, account.id],
        })
      } else {
        if (!allows('provider_accounts.manage'))
          throw new Error(t('identity.errors.forbidden'))
        await upstreamAccounts.refreshQuota(account.id)
        if (ownsSession()) await invalidateAccountQueries(client, owner)
      }
    } catch (error) {
      if (ownsSession() && !(error instanceof ApiError && error.status === 401))
        toast.error(error instanceof Error ? error.message : t('auth.error'))
    } finally {
      if (ownsSession() && mounted.current) setRefreshing(false)
    }
  }
  const intentKey = resetIntentKey(owner, account.id)
  const pendingReset = resetIntents.get(intentKey)
  const consumeReset = async () => {
    if (!ownsSession() || !selectedReset || !owner) return
    let intent = resetIntents.get(intentKey)
    if (intent?.inFlight) return
    if (
      !allows('provider_accounts.manage') ||
      !current.capabilities.consumeResetCredit
    ) {
      toast.error(t('identity.errors.forbidden'))
      return
    }
    if (!intent) {
      if (resetIntents.size >= 100) {
        toast.error(t('accounts.resetIntentLimit'))
        return
      }
      intent = {
        command: {
          accountId: account.id,
          creditId: selectedReset.id,
          redeemRequestId: crypto.randomUUID(),
        },
        inFlight: false,
        uncertain: false,
      }
      resetIntents.set(intentKey, intent)
    }
    intent.inFlight = true
    publishResetIntents()
    let confirmed = false
    try {
      const result = await upstreamAccounts.consumeResetCredit(intent.command)
      if (!ownsSession()) return
      if (result.code !== 'reset' && result.code !== 'already_redeemed') {
        intent.uncertain = true
        if (mounted.current)
          setResetResult(typeof result.code === 'string' ? result.code : null)
        toast.error(t('accounts.resetUncertain'))
        return
      }
      confirmed = true
      resetIntents.delete(intentKey)
      if (mounted.current) {
        setSelectedReset(null)
        setResetResult(null)
      }
      toast.success(t('accounts.resetConfirmed'))
    } catch (error) {
      intent.uncertain = true
      if (ownsSession() && !(error instanceof ApiError && error.status === 401))
        toast.error(error instanceof Error ? error.message : t('auth.error'))
    } finally {
      intent.inFlight = false
      publishResetIntents()
    }
    if (confirmed && ownsSession()) {
      // Cache refresh failure cannot change a confirmed provider result.
      await invalidateAccountQueries(client, owner).catch((error: unknown) => {
        if (ownsSession())
          toast.error(error instanceof Error ? error.message : t('auth.error'))
      })
    }
  }
  const canRefresh =
    canRead &&
    (panel === 'profile'
      ? current.capabilities.profile || current.capabilities.subscription
      : canManage && (panel === 'models' || current.capabilities.quotaRefresh))
  const error =
    panel === 'profile'
      ? personal.error
      : panel === 'forecast'
        ? forecast.error
        : panel === 'reset'
          ? credits.error
          : null
  const isLoading =
    panel === 'profile'
      ? personal.isFetching
      : panel === 'forecast'
        ? forecast.isFetching
        : panel === 'reset'
          ? credits.isFetching
          : false
  const retry = () => {
    if (panel === 'profile') void personal.refetch()
    if (panel === 'forecast') void forecast.refetch()
    if (panel === 'reset') void credits.refetch()
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className={`flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[min(48rem,calc(100dvh-3rem))] ${panel === 'usage' || panel === 'profile' || panel === 'models' ? 'sm:max-w-4xl' : 'sm:max-w-xl'}`}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          heading.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
        }}
      >
        <DialogHeader className='shrink-0 border-b px-5 py-4 text-left'>
          <DialogTitle
            ref={heading}
            tabIndex={-1}
            className='flex items-center gap-3 pr-8 outline-none'
          >
            {t(
              panel === 'models'
                ? 'upstreamAccounts.models'
                : `accounts.${panel}`
            )}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {t('upstreamAccounts.details')} · {current.name}
          </DialogDescription>
        </DialogHeader>
        <div
          ref={body}
          className='min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5'
          data-testid='account-detail-body'
        >
          {panel !== 'profile' && (
            <div className='flex min-w-0 flex-wrap items-center justify-between gap-3'>
              <AccountIdentity account={current} />
              <div className='flex shrink-0 flex-wrap justify-end gap-2'>
                <AccountProvider account={current} />
                <AccountPlan account={current} />
              </div>
            </div>
          )}
          <div className='min-w-0 space-y-5'>
            {detail.error && (
              <ReadError
                error={detail.error}
                retry={() => void detail.refetch()}
              />
            )}
            {error && <ReadError error={error} retry={retry} />}
            {isLoading && panel !== 'profile' && (
              <div role='status' className='text-sm text-muted-foreground'>
                {t('upstreamAccounts.loading')}
              </div>
            )}
            {panel === 'usage' &&
              (detail.data ? (
                <Usage account={detail.data.account} />
              ) : (
                <QueryState
                  error={detail.error}
                  retry={() => detail.refetch()}
                />
              ))}
            {panel === 'profile' && (
              <Profile
                account={current}
                data={personal.data}
                loading={personal.isFetching && !personal.data}
              />
            )}
            {panel === 'forecast' && <Forecast data={forecast.data} />}
            {panel === 'reset' && (
              <ResetCredits
                account={current}
                data={credits.data}
                pending={pendingReset}
                onSelect={(credit) => {
                  setSelectedReset(credit)
                  setResetResult(null)
                }}
                canManage={canManage}
              />
            )}
            {panel === 'models' && (
              <Models accountId={account.id} owner={owner} enabled={canRead} />
            )}
          </div>
        </div>
        <DialogFooter className='shrink-0 flex-row items-center justify-between gap-3 border-t bg-background px-5 py-3 sm:justify-between'>
          <span className='min-w-0 text-xs break-words text-muted-foreground'>
            {t('accounts.updated')}{' '}
            {f.date(current.quota.refreshedAt ?? current.updatedAt)}
          </span>
          <div className='flex shrink-0 gap-2'>
            <Button variant='outline' onClick={onClose}>
              {t('common.close')}
            </Button>
            {canRefresh && (
              <Button
                disabled={refreshing || isLoading}
                onClick={() => void refresh()}
                aria-label={t(
                  panel === 'profile'
                    ? 'accounts.refreshProfile'
                    : panel === 'models'
                      ? 'upstreamAccounts.refresh'
                      : 'accounts.refreshQuota'
                )}
              >
                <RefreshCw
                  className={`size-4 ${refreshing || isLoading ? 'animate-spin' : ''}`}
                  aria-hidden='true'
                />
                <span className='hidden sm:inline'>
                  {t(
                    panel === 'profile'
                      ? 'accounts.refreshProfile'
                      : panel === 'models'
                        ? 'upstreamAccounts.refresh'
                        : 'accounts.refreshQuota'
                  )}
                </span>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={!!selectedReset}
        onOpenChange={(open) => {
          if (!open) setSelectedReset(null)
        }}
        title={t('accounts.resetConfirmTitle')}
        desc={
          <>
            <span>{t('accounts.resetConfirmDescription')}</span>
            <span className='mt-2 block break-words'>
              {selectedReset?.title ?? selectedReset?.id}
            </span>
            {pendingReset?.uncertain && (
              <span className='mt-2 block'>
                {t('accounts.resetUncertain')}
                {resetResult && (
                  <code className='mt-1 block break-all'>{resetResult}</code>
                )}
              </span>
            )}
          </>
        }
        confirmText={t(
          pendingReset?.uncertain
            ? 'upstreamAccounts.retry'
            : 'accounts.useReset'
        )}
        disabled={!canManage || !current.capabilities.consumeResetCredit}
        isLoading={pendingReset?.inFlight ?? false}
        handleConfirm={() => void consumeReset()}
      />
    </Dialog>
  )
}

function ReadError({ error, retry }: { error: Error; retry: () => void }) {
  return <RequestErrorToast message={error.message} retry={retry} />
}

function Usage({ account }: { account: UpstreamAccount }) {
  const { t } = useTranslation()
  const f = useAccountFormat()
  const rows = account.usage.models
  const usd = account.usage.costs.find(
    (cost) => cost.currency.toLocaleUpperCase('en-US') === 'USD'
  )
  const tokens = [
    ['input', account.usage.inputTokens],
    ['output', account.usage.outputTokens],
    ['cacheWrite', account.usage.cacheWriteInputTokens],
    ['reasoning', account.usage.reasoningOutputTokens],
    ['read', account.usage.cachedInputTokens],
  ] as const
  return (
    <div className='space-y-4'>
      <div className='grid gap-4 border-b pb-4 sm:grid-cols-[1fr_auto]'>
        <QuotaSummary account={account} horizontal />
        <div className='text-sm'>
          <span className='mr-2 text-muted-foreground'>
            {t('accounts.concurrency')}
          </span>
          <span className='tabular-nums'>
            {f.number(account.capacity.usedSlots)} /{' '}
            {account.capacity.totalSlots === null
              ? t('upstreamAccounts.unlimited')
              : f.number(account.capacity.totalSlots)}
          </span>
        </div>
      </div>
      {account.quota.windows.length > 0 && (
        <QuotaWindows account={account} columns />
      )}
      <div>
        <section className='space-y-3'>
          {/* ai-design-check-ignore-next-line use-shared-looks -- Existing shadcn-admin semantic heading; this project has no Heading component. */}
          <h3 className='text-sm font-semibold'>
            {t('accounts.tokenStructure')}
          </h3>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-6'>
            {tokens.map(([key, value]) => (
              <div
                key={key}
                className='min-w-0 rounded-lg bg-muted/40 px-3 py-2'
              >
                <div className='text-xs text-muted-foreground'>
                  {t(`accounts.${key}`)}
                </div>
                <div className='mt-1 text-base font-semibold break-words tabular-nums'>
                  <TokenCount
                    value={
                      value ?? (account.usage.requestCount === 0 ? 0 : null)
                    }
                  />
                </div>
              </div>
            ))}
            <div className='min-w-0 rounded-lg border px-3 py-2'>
              <div className='text-xs text-muted-foreground'>
                {t('accounts.totalTokens')}
              </div>
              <div className='mt-1 text-base font-semibold break-words tabular-nums'>
                <TokenCount value={account.usage.totalTokens} />
              </div>
            </div>
          </div>
        </section>
      </div>
      <section className='space-y-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          {/* ai-design-check-ignore-next-line use-shared-looks -- Existing shadcn-admin semantic heading; this project has no Heading component. */}
          <h3 className='text-sm font-semibold'>{t('accounts.modelUsage')}</h3>
          <span className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums'>
            {t('upstreamAccounts.accountCharge')}{' '}
            <AccountCost
              value={
                usd?.estimatedAmount ??
                (account.usage.requestCount === 0 ? '0' : null)
              }
              coverage={account.usage}
            />
          </span>
        </div>
        <div className='hidden overflow-hidden rounded-lg border md:block'>
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  'model',
                  'requests',
                  'success',
                  'input',
                  'output',
                  'cache',
                  'cost',
                  'lastRequest',
                ].map((key) => (
                  <TableHead key={key}>{t(`accounts.${key}`)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.model}>
                  <TableCell className='max-w-56 font-medium break-words whitespace-normal'>
                    {row.model}
                  </TableCell>
                  <TableCell>{f.number(row.requestCount)}</TableCell>
                  <TableCell>{f.percent(row.successRate)}</TableCell>
                  <TableCell>
                    <TokenCount value={row.inputTokens} />
                  </TableCell>
                  <TableCell>
                    <TokenCount value={row.outputTokens} />
                  </TableCell>
                  <TableCell>
                    <TokenCount value={row.cachedInputTokens} />
                  </TableCell>
                  <TableCell>
                    <AccountCost value={row.billingAmountUsd} coverage={row} />
                  </TableCell>
                  <TableCell className='whitespace-nowrap'>
                    {f.date(row.lastUsedAt)}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className='h-16 text-center text-muted-foreground'
                  >
                    {t('accounts.noTelemetry')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className='divide-y rounded-lg border md:hidden'>
          {rows.map((row) => (
            <div key={row.model} className='space-y-3 p-3'>
              <div className='flex min-w-0 justify-between gap-3 text-sm'>
                <strong className='min-w-0 break-all'>{row.model}</strong>
                <span className='shrink-0'>
                  <AccountCost value={row.billingAmountUsd} coverage={row} />
                </span>
              </div>
              <div className='grid grid-cols-3 gap-3 text-xs'>
                {(
                  [
                    ['requests', row.requestCount],
                    ['input', row.inputTokens],
                    ['output', row.outputTokens],
                    ['cache', row.cachedInputTokens],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key}>
                    <div className='text-muted-foreground'>
                      {t(`accounts.${key}`)}
                    </div>
                    <div className='mt-1 break-words tabular-nums'>
                      {key === 'requests' ? (
                        f.number(value)
                      ) : (
                        <TokenCount value={value} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!rows.length && (
            <div className='p-5 text-center text-sm text-muted-foreground'>
              {t('accounts.noTelemetry')}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function Forecast({ data }: { data: AccountQuotaForecast | undefined }) {
  const { t } = useTranslation()
  const f = useAccountFormat()
  const [period, setPeriod] = useState('weekly')
  const forecast = data?.forecasts.find((value) => value.period === period)
  const source = forecast?.source
  return (
    <div className='space-y-5'>
      <Tabs value={period} onValueChange={setPeriod}>
        <TabsList className='w-full'>
          <TabsTrigger value='weekly'>{t('accounts.weekly')}</TabsTrigger>
          <TabsTrigger value='monthly'>{t('accounts.monthly')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {/* ai-design-check-ignore-next-line use-shared-looks -- Preserve the existing quota forecast panel layout in this functional change. */}
      <div className='space-y-5 rounded-xl border bg-muted/20 p-5'>
        <div className='flex flex-wrap justify-between gap-2 text-sm'>
          <span className='text-muted-foreground'>
            {source?.label ?? t('accounts.quota')}
          </span>
          <Badge variant='secondary'>{t('accounts.estimate')}</Badge>
        </div>
        <div className='text-3xl font-semibold break-words tabular-nums'>
          {f.percent(source?.usedPercent)}
        </div>
        {source?.usedPercent != null ? (
          <Progress
            value={Math.max(0, Math.min(100, source.usedPercent))}
            aria-label={t('accounts.used')}
          />
        ) : (
          <div className='h-2 rounded-full bg-muted' aria-hidden='true' />
        )}
        <div className='flex justify-between text-xs text-muted-foreground tabular-nums'>
          {[0, 25, 50, 75, 100].map((value) => (
            <span key={value}>{value}%</span>
          ))}
        </div>
        <div className='flex flex-wrap gap-2'>
          {forecast?.unavailableReason && (
            <p role='status' className='text-sm text-muted-foreground'>
              {forecast.unavailableReason}
            </p>
          )}
          {forecast?.lowSample && (
            <Badge variant='secondary'>{t('accounts.lowSample')}</Badge>
          )}
          {!forecast?.unavailableReason &&
            (forecast?.incompleteCost || forecast?.incompleteTokens) && (
              <Badge variant='secondary'>
                {t('accounts.incompleteEvidence')}
              </Badge>
            )}
        </div>
        <div className='grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t pt-4 text-xs text-muted-foreground'>
          <span>{source?.label ?? t('accounts.recorded')}</span>
          <span />
          <span className='text-right'>
            {t(
              period === 'weekly'
                ? 'accounts.projectedWeek'
                : 'accounts.projectedMonth'
            )}
          </span>
        </div>
        {[
          [
            'tokenCapacity',
            source?.tokensDisplay ?? f.unknown,
            forecast?.estimatedTokens == null
              ? f.unknown
              : forecast.estimatedTokensDisplay,
          ],
          [
            'equivalentCost',
            source?.usdDisplay ?? f.unknown,
            forecast?.estimatedUsd == null
              ? f.unknown
              : forecast.estimatedUsdDisplay,
          ],
        ].map(([label, actual, predicted]) => (
          <div key={label} className='rounded-lg bg-background p-3'>
            <div className='mb-2 text-xs text-muted-foreground'>
              {t(`accounts.${label}`)}
            </div>
            <div className='grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm font-semibold tabular-nums'>
              <span className='break-words'>{actual}</span>
              <ArrowRight
                className='size-4 text-muted-foreground'
                aria-hidden='true'
              />
              <span className='text-right break-words'>{predicted}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResetCredits({
  account,
  data,
  pending,
  onSelect,
  canManage,
}: {
  account: UpstreamAccount
  data: AccountResetCredits | undefined
  pending: ResetIntent | undefined
  onSelect: (credit: AccountResetCredit) => void
  canManage: boolean
}) {
  const { t } = useTranslation()
  const f = useAccountFormat()
  const pendingCredit = pending
    ? (data?.credits.find(
        (credit) => credit.id === pending.command.creditId
      ) ?? {
        id: pending.command.creditId ?? '',
        title: null,
        status: null,
        expiresAt: null,
        expiresAtDisplay: null,
        resetType: null,
      })
    : null
  return (
    <div className='space-y-5'>
      <div className='space-y-3 rounded-lg border p-4'>
        <QuotaWindows account={account} columns />
      </div>
      <section className='rounded-lg border'>
        <div className='flex flex-wrap items-center justify-between gap-2 border-b p-4'>
          {/* ai-design-check-ignore-next-line use-shared-looks -- Existing shadcn-admin semantic heading; this project has no Heading component. */}
          <h3 className='text-sm font-semibold'>
            {t('accounts.resetCredits')}
          </h3>
          <Badge variant='secondary'>
            {data
              ? t('accounts.availableCount', { count: data.availableCount })
              : t('accounts.resetCountUnknown')}
          </Badge>
        </div>
        <div className='divide-y'>
          {pendingCredit && (
            <div className='flex flex-wrap items-center justify-between gap-3 p-4'>
              <span role='status' className='text-sm text-muted-foreground'>
                {t('accounts.resetUncertain')}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={
                  !canManage ||
                  !account.capabilities.consumeResetCredit ||
                  pending?.inFlight
                }
                onClick={() => onSelect(pendingCredit)}
              >
                {t('upstreamAccounts.retry')}
              </Button>
            </div>
          )}
          {!data?.credits.length && (
            <div className='p-4 text-sm text-muted-foreground'>
              {t(data ? 'common.no_data' : 'featureAvailability.unavailable')}
            </div>
          )}
          {data?.credits.map((credit) => (
            <div
              key={credit.id}
              className='flex items-center justify-between gap-3 p-4'
            >
              <div className='min-w-0 space-y-1'>
                <div className='text-sm font-medium break-words'>
                  {credit.title ?? credit.resetType ?? t('accounts.fullReset')}
                </div>
                <div className='text-xs text-muted-foreground tabular-nums'>
                  {t('accounts.expires')} {f.date(credit.expiresAt)}
                </div>
                {credit.status && (
                  <Badge variant='outline'>{credit.status}</Badge>
                )}
              </div>
              <Button
                variant='outline'
                size='sm'
                disabled={
                  !canManage ||
                  !account.capabilities.consumeResetCredit ||
                  !!pending
                }
                onClick={() => onSelect(credit)}
              >
                {t('accounts.useReset')}
              </Button>
            </div>
          ))}
        </div>
      </section>
      <div className='flex justify-between gap-3 rounded-lg bg-muted/40 p-4 text-sm'>
        <span>{t('accounts.creditPoints')}</span>
        <strong className='min-w-0 break-all tabular-nums'>
          {account.quota.credits?.balance ?? f.unknown}
        </strong>
      </div>
    </div>
  )
}

function Profile({
  account,
  data,
  loading,
}: {
  loading: boolean
  account: UpstreamAccount
  data: AccountPersonalInfo | undefined
}) {
  const { t, i18n } = useTranslation()
  const f = useAccountFormat()
  const [mode, setMode] = useState('daily')
  const profile = data?.profile
  const summary = profile?.summary
  const insights = profile?.activityInsights
  const subscription = data?.subscription
  let cumulative = 0
  const weeks =
    profile?.activityCalendar?.weeks.map((week) => {
      const weekly = week.cells
        .filter((cell) => !cell.isFuture)
        .reduce((sum, cell) => sum + cell.tokens, 0)
      return {
        ...week,
        cells: week.cells.map((cell) => {
          if (!cell.isFuture) cumulative += cell.tokens
          return {
            ...cell,
            value:
              mode === 'weekly'
                ? weekly
                : mode === 'cumulative'
                  ? cumulative
                  : cell.tokens,
          }
        }),
      }
    }) ?? []
  const max = Math.max(
    1,
    ...weeks.flatMap((week) =>
      week.cells.filter((cell) => !cell.isFuture).map((cell) => cell.value)
    )
  )
  return (
    <div className='space-y-4'>
      {(data?.profileError || profile?.hasStatsError) && (
        <RequestErrorToast
          message={data?.profileError ?? t('accounts.incompleteEvidence')}
        />
      )}
      {!account.capabilities.profile && !account.capabilities.subscription && (
        <Badge variant='secondary'>
          {t('featureAvailability.unavailable')}
        </Badge>
      )}
      <div className='grid items-center gap-4 rounded-lg bg-muted/30 p-4 xl:grid-cols-[minmax(180px,1fr)_3fr]'>
        <div className='flex min-w-0 items-center gap-3'>
          <span
            className='flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-medium'
            aria-hidden='true'
          >
            {(profile?.displayName || account.name).slice(0, 1)}
          </span>
          <div className='min-w-0'>
            <AccountIdentity account={account} />
            <AccountPlan account={account} />
          </div>
        </div>
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-5'>
          {(
            [
              [
                'totalTokens',
                <TokenCount
                  key='totalTokens'
                  value={summary?.totalTextTokens}
                />,
              ],
              [
                'peakTokens',
                <TokenCount key='peakTokens' value={summary?.peakTokens} />,
              ],
              [
                'longestChat',
                summary?.longestTaskDurationMs == null
                  ? f.unknown
                  : t('accounts.minutes', {
                      count: Math.round(summary.longestTaskDurationMs / 60_000),
                    }),
              ],
              [
                'currentStreak',
                summary?.currentStreakDays == null
                  ? f.unknown
                  : t('accounts.days', { count: summary.currentStreakDays }),
              ],
              [
                'longestStreak',
                summary?.longestStreakDays == null
                  ? f.unknown
                  : t('accounts.days', { count: summary.longestStreakDays }),
              ],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className='min-w-0'>
              <div className='text-xs text-muted-foreground'>
                {t(`accounts.${key}`)}
              </div>
              <div className='mt-1 text-base font-semibold break-words tabular-nums'>
                {loading ? <Skeleton className='h-6 w-16' /> : value}
              </div>
            </div>
          ))}
        </div>
      </div>
      {subscription && (
        <section className='space-y-3'>
          {/* ai-design-check-ignore-next-line use-shared-looks -- Matches existing semantic section headings; no shared Heading component. */}
          <h3 className='text-sm font-semibold'>
            {t('accounts.subscription')}
          </h3>
          <div className='grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4'>
            {[
              ['started', f.date(subscription?.startsAt)],
              ['ends', f.date(subscription?.expiresAt)],
              [
                'renewal',
                subscription?.willRenew == null
                  ? f.unknown
                  : t(
                      subscription.willRenew
                        ? 'accounts.autoRenew'
                        : 'accounts.manualRenew'
                    ),
              ],
              [
                'billing',
                [subscription?.billingPeriod, subscription?.billingCurrency]
                  .filter(Boolean)
                  .join(' · ') || f.unknown,
              ],
            ].map(([key, value]) => (
              <div key={key} className='min-w-0 text-xs'>
                <div className='text-muted-foreground'>
                  {t(`accounts.${key}`)}
                </div>
                <div className='mt-2 font-medium break-words'>{value}</div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          {/* ai-design-check-ignore-next-line use-shared-looks -- Existing shadcn-admin semantic heading; this project has no Heading component. */}
          <h3 className='text-sm font-semibold'>{t('accounts.activity')}</h3>
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList>
              {['daily', 'weekly', 'cumulative'].map((value) => (
                <TabsTrigger key={value} value={value} disabled={!weeks.length}>
                  {t(`accounts.activityModes.${value}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div
          className='overflow-x-auto rounded-lg border p-4'
          tabIndex={0}
          role='region'
          aria-label={t('accounts.activityCalendar')}
        >
          {loading ? (
            <Skeleton className='h-32 w-full' />
          ) : weeks.length ? (
            <div className='min-w-[652px]'>
              <div className='mb-2 grid auto-cols-fr grid-flow-col text-xs text-muted-foreground'>
                {weeks.map((week) => (
                  <span
                    key={week.key}
                    className='overflow-visible whitespace-nowrap'
                  >
                    {week.monthLabel
                      ? new Intl.DateTimeFormat(i18n.language, {
                          month: 'short',
                          timeZone: 'UTC',
                        }).format(
                          new Date(
                            `${week.cells.find((cell) => cell.date.endsWith('-01'))?.date ?? week.key}T00:00:00Z`
                          )
                        )
                      : ''}
                  </span>
                ))}
              </div>
              <div className='grid auto-cols-fr grid-flow-col gap-1'>
                {weeks.map((week) => (
                  <div key={week.key} className='grid grid-rows-7 gap-1'>
                    {week.cells.map((cell) => (
                      <span
                        key={cell.date}
                        tabIndex={0}
                        className={`aspect-square rounded-full transition-[filter,box-shadow,opacity] duration-150 hover:shadow-[0_0_0_2px_hsl(var(--ring)/0.45)] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-ring ${cell.isFuture ? 'bg-muted' : 'bg-primary'}`}
                        style={
                          cell.isFuture
                            ? undefined
                            : {
                                opacity:
                                  cell.value === 0
                                    ? 0.07
                                    : 0.2 + 0.8 * (cell.value / max),
                              }
                        }
                        title={`${cell.date} · ${cell.isFuture ? f.unknown : `${f.number(cell.value)} Token`}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className='flex h-32 items-center justify-center text-sm text-muted-foreground'>
              {t('featureAvailability.unavailable')}
            </div>
          )}
        </div>
      </section>
      <div className='grid gap-6 sm:grid-cols-2'>
        <section>
          {/* ai-design-check-ignore-next-line use-shared-looks -- Existing shadcn-admin semantic heading; this project has no Heading component. */}
          <h3 className='mb-3 text-sm font-semibold'>
            {t('accounts.insights')}
          </h3>
          <dl className='space-y-3'>
            {[
              ['fast', f.percent(insights?.fastModePercent)],
              [
                'reasoningPreference',
                insights?.reasoningEffort
                  ? `${insights.reasoningEffort}${insights.reasoningEffortPercent == null ? '' : ` · ${f.percent(insights.reasoningEffortPercent)}`}`
                  : f.unknown,
              ],
              ['skillsExplored', f.number(insights?.skillsExplored)],
              ['skillsUsed', f.number(insights?.totalSkillsUsed)],
              ['threads', f.number(insights?.totalThreads)],
            ].map(([key, value]) => (
              <div className='flex justify-between gap-3 text-sm' key={key}>
                <dt className='text-muted-foreground'>
                  {t(`accounts.${key}`)}
                </dt>
                <dd className='text-right font-medium break-words tabular-nums'>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          {/* ai-design-check-ignore-next-line use-shared-looks -- Existing shadcn-admin semantic heading; this project has no Heading component. */}
          <h3 className='mb-3 text-sm font-semibold'>
            {t('accounts.plugins')}
          </h3>
          <div className='divide-y'>
            {insights?.invocations?.length ? (
              insights.invocations.map((entry, index) => (
                <div
                  key={`${entry.type}:${entry.pluginId ?? ''}:${entry.skillId ?? ''}:${index}`}
                  className='flex justify-between gap-3 py-2 text-xs'
                >
                  <span className='min-w-0 break-words'>
                    {entry.skillName ??
                      entry.pluginName ??
                      entry.skillId ??
                      entry.pluginId ??
                      f.unknown}
                  </span>
                  <span className='shrink-0 text-muted-foreground'>
                    {entry.usageCount == null
                      ? f.unknown
                      : t('accounts.runs', { count: entry.usageCount })}
                  </span>
                </div>
              ))
            ) : (
              <div className='text-sm text-muted-foreground'>
                {t(
                  insights?.invocations
                    ? 'common.no_data'
                    : 'featureAvailability.unavailable'
                )}
              </div>
            )}
          </div>
        </section>
      </div>
      <Collapsible className='border-t pt-2'>
        <CollapsibleTrigger asChild>
          <Button variant='ghost' className='w-full justify-between'>
            {t('accounts.identity')}
            <ChevronDown aria-hidden='true' />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className='space-y-4 pt-4'>
          <AccountStatus account={account} />
          <dl className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            {[
              ['email', account.email ?? f.unknown],
              ['accountId', account.id],
              [
                'proxy',
                account.outboundProxyEndpoint ?? t('upstreamAccounts.direct'),
              ],
              [
                'groups',
                account.groups.map((group) => group.name).join(', ') ||
                  t('upstreamAccounts.none'),
              ],
              ['created', f.date(account.addedAt)],
              ['updated', f.date(account.updatedAt)],
              ['expires', f.date(account.accessTokenExpiresAt)],
              ['lastUsed', f.date(account.usage.lastUsedAt)],
            ].map(([key, value]) => (
              <div key={key} className='min-w-0 space-y-1'>
                <dt className='text-xs text-muted-foreground'>
                  {t(`upstreamAccounts.${key}`)}
                </dt>
                <dd className='text-sm break-all'>{value}</dd>
              </div>
            ))}
          </dl>
          {account.errorReason && (
            <div
              role='status'
              className='rounded-md border border-destructive/30 p-3 text-sm text-destructive'
            >
              <span>{account.errorReason}</span>
              {account.errorMessage && (
                <p className='mt-1 break-words'>{account.errorMessage}</p>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function Models({
  accountId,
  owner,
  enabled,
}: {
  accountId: string
  owner: string | undefined
  enabled: boolean
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const models = useQuery({
    queryKey: ['upstream-account-models', owner, accountId],
    queryFn: ({ signal }) => upstreamAccounts.models(accountId, signal),
    enabled,
    retry: false,
  })
  const filtered =
    models.data?.models.filter((model) =>
      `${model.id} ${model.label}`
        .toLocaleLowerCase('en-US')
        .includes(search.toLocaleLowerCase('en-US'))
    ) ?? []
  const visiblePage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 50) - 1)
  )
  return (
    <div className='space-y-3'>
      {/* ai-design-check-ignore-next-line no-style-overrides -- Model search aligns with the existing 32 px table toolbar. */}
      <Input
        className='h-8'
        value={search}
        maxLength={200}
        aria-label={t('upstreamAccounts.searchModels')}
        placeholder={t('upstreamAccounts.searchModels')}
        onChange={(event) => {
          setSearch(event.target.value)
          setPage(0)
        }}
      />
      {models.error ? (
        <ReadError error={models.error} retry={() => void models.refetch()} />
      ) : (
        <div className='max-h-96 divide-y overflow-y-auto rounded-lg border'>
          {filtered
            .slice(visiblePage * 50, (visiblePage + 1) * 50)
            .map((model) => (
              <div key={model.id} className='px-3 py-2 text-sm break-all'>
                <span>{model.id}</span>
                {model.label !== model.id && (
                  <div className='mt-1 text-xs text-muted-foreground'>
                    {model.label}
                  </div>
                )}
              </div>
            ))}
          {!filtered.length && (
            <div className='p-5 text-center text-sm text-muted-foreground'>
              {t(
                models.isPending
                  ? 'upstreamAccounts.loading'
                  : 'upstreamAccounts.empty'
              )}
            </div>
          )}
        </div>
      )}
      <div className='flex justify-end gap-2'>
        <Button
          size='icon-sm'
          variant='outline'
          aria-label={t('upstreamAccounts.previous')}
          disabled={visiblePage === 0}
          onClick={() => setPage(visiblePage - 1)}
        >
          <ChevronLeft className='size-4' />
        </Button>
        <Button
          size='icon-sm'
          variant='outline'
          aria-label={t('upstreamAccounts.next')}
          disabled={(visiblePage + 1) * 50 >= filtered.length}
          onClick={() => setPage(visiblePage + 1)}
        >
          <ChevronRight className='size-4' />
        </Button>
      </div>
    </div>
  )
}
