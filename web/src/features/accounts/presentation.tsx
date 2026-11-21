import { KeyRound, Link, Globe, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { UpstreamAccount } from '@/api/upstream-accounts'
import { accountProviderLabel, accountPlatform } from '@/lib/upstream-platforms'
import { formatUsd } from '@/lib/usd'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { TokenCount } from '@/components/token-count'
import { orderedQuotaWindows, quotaWindowPercent } from './quota-windows'

export function AccountIdentity({ account }: { account: UpstreamAccount }) {
  return (
    <div className='min-w-0'>
      <div className='truncate font-medium' title={account.name}>
        {account.name}
      </div>
      {account.email && (
        <div
          className='mt-1 truncate text-xs text-muted-foreground'
          title={account.email ?? undefined}
        >
          {account.email}
        </div>
      )}
    </div>
  )
}

const planVariants = {
  free: 'neutral',
  go: 'success',
  plus: 'info',
  pro: 'premium',
  team: 'warning',
  business: 'warning',
  enterprise: 'success',
} as const
export function AccountPlan({
  account,
}: {
  account: Pick<
    UpstreamAccount,
    'planType' | 'planTypeDisplay' | 'authenticationKind'
  >
}) {
  const plan = account.planType?.toLocaleLowerCase('en-US') as
    | keyof typeof planVariants
    | undefined
  return (
    <Badge
      variant={
        account.authenticationKind === 'api_key'
          ? 'neutral'
          : plan
            ? (planVariants[plan] ?? 'secondary')
            : 'secondary'
      }
    >
      {account.authenticationKind === 'api_key'
        ? 'API'
        : account.planTypeDisplay}
    </Badge>
  )
}

const statusVariants = {
  normal: 'success',
  quota_exhausted: 'warning',
  rate_limited: 'warning',
  error: 'destructive',
  disabled: 'neutral',
} as const

export function AccountStatus({ account }: { account: UpstreamAccount }) {
  const { t } = useTranslation()
  return (
    <Badge
      variant={
        statusVariants[account.status as keyof typeof statusVariants] ??
        'neutral'
      }
    >
      <span aria-hidden='true' className='size-1.5 rounded-full bg-current' />
      {t(`upstreamAccounts.statuses.${account.status}`)}
    </Badge>
  )
}

export function QuotaWindows({
  account,
  compact = false,
  columns = false,
}: {
  account: Pick<UpstreamAccount, 'quota'>
  compact?: boolean
  columns?: boolean
}) {
  const { t, i18n } = useTranslation()
  const windows = orderedQuotaWindows(account.quota.windows)
  const percent = new Intl.NumberFormat(i18n.language, {
    style: 'percent',
    maximumFractionDigits: 1,
  })
  if (!windows.length)
    return (
      <span className='text-xs text-muted-foreground'>
        {t('accounts.quotaUnavailable')}
      </span>
    )
  return (
    <div
      className={
        columns
          ? 'grid gap-4 sm:grid-cols-2'
          : compact
            ? 'space-y-2'
            : 'space-y-4'
      }
    >
      {windows.map((quota) => {
        const value = quotaWindowPercent(quota.usedPercent)
        const label = quota.labelDisplay
        const reset = quota.resetAtDisplay || t('upstreamAccounts.unknown')
        return (
          <div
            key={quota.key}
            className={compact ? 'space-y-1' : 'space-y-2'}
            title={
              compact
                ? `${label} · ${t('accounts.resets')} ${reset}`
                : undefined
            }
          >
            <div
              className={cn(
                'flex justify-between gap-2 tabular-nums',
                compact ? 'text-xs' : 'text-sm'
              )}
            >
              <span className={compact ? 'text-muted-foreground' : undefined}>
                {label}
              </span>
              <span className={compact ? 'font-medium' : undefined}>
                {value === null
                  ? t('upstreamAccounts.unknown')
                  : percent.format((quota.usedPercent ?? 0) / 100)}
              </span>
            </div>
            <Progress
              value={value}
              tone={
                value !== null && value >= 100
                  ? 'destructive'
                  : value !== null && value >= 75
                    ? 'warning'
                    : 'success'
              }
              aria-label={`${label} · ${t('accounts.used')}`}
              aria-valuetext={
                value === null ? t('upstreamAccounts.unknown') : undefined
              }
            />
            {!compact && (
              <div className='flex flex-wrap justify-between gap-2 text-xs text-muted-foreground tabular-nums'>
                <span>{t('accounts.resets')}</span>
                <span>{reset}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function AccountProvider({
  account,
}: {
  account: Pick<UpstreamAccount, 'provider' | 'authenticationKind'>
}) {
  const label = accountProviderLabel(account.provider)
  const method =
    account.authenticationKind === 'api_key'
      ? 'API Key'
      : account.authenticationKind === 'oauth'
        ? 'OAuth'
        : account.authenticationKind
  const AuthIcon = account.authenticationKind === 'oauth' ? Link : KeyRound
  const icon = {
    openai: 'openai',
    claude: 'claude',
    gemini: 'googlegemini',
    xai: 'xai',
  }[accountPlatform(account.provider)]
  return (
    <div className='flex items-center gap-2'>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant='secondary'
            size='icon'
            tabIndex={0}
            role='img'
            aria-label={label}
          >
            {icon ? (
              <img
                src={`/images/providers/${icon}.svg`}
                alt=''
                className='size-3 dark:invert'
              />
            ) : (
              <Globe aria-hidden='true' />
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant='secondary'
            size='icon'
            tabIndex={0}
            role='img'
            aria-label={method}
          >
            <AuthIcon aria-hidden='true' />
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{method}</TooltipContent>
      </Tooltip>
    </div>
  )
}
export function QuotaSummary({
  account,
  horizontal = false,
}: {
  account: UpstreamAccount
  horizontal?: boolean
}) {
  const { t, i18n } = useTranslation()
  const number = (value: number | null) =>
    value == null ? '—' : new Intl.NumberFormat(i18n.language).format(value)
  const usd = account.usage.costs.find(
    (cost) => cost.currency === 'USD'
  )?.estimatedAmount
  const money = (value: string | null | undefined) =>
    formatUsd(value, i18n.language)
  return (
    <dl
      className={
        horizontal
          ? 'grid grid-cols-2 gap-4 text-left text-sm tabular-nums sm:grid-cols-4'
          : 'grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-left text-xs tabular-nums'
      }
    >
      {(
        [
          [
            t('upstreamAccounts.requestTotal'),
            number(account.usage.requestCount),
          ],
          [
            'Token',
            <TokenCount
              key='tokens'
              value={
                account.usage.totalTokens ??
                (account.usage.requestCount === 0 ? 0 : null)
              }
            />,
          ],
          [
            t('upstreamAccounts.accountCharge'),
            <AccountCost
              key='cost'
              value={usd ?? (account.usage.requestCount === 0 ? '0' : null)}
              coverage={account.usage}
            />,
          ],
          [
            t('upstreamAccounts.userCharge'),
            money(account.usage.retailChargeUsd),
          ],
        ] as const
      ).map(([label, value]) => (
        <div
          className={horizontal ? 'min-w-0 space-y-2' : 'contents'}
          key={label}
        >
          <dt className='text-muted-foreground'>
            {label}
            {horizontal ? '' : ':'}
          </dt>
          <dd className={horizontal ? 'font-medium break-all' : undefined}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function AccountCost({
  value,
  coverage,
}: {
  value: string | null | undefined
  coverage: {
    costEstimateStatus: string
    knownCostCount?: number | null
    unknownCostCount?: number | null
  }
}) {
  const { t, i18n } = useTranslation()
  const partial = coverage.costEstimateStatus === 'partial'
  const message =
    coverage.unknownCostCount == null || coverage.knownCostCount == null
      ? t('accounts.partialCostHint')
      : t('accounts.partialCostDetails', {
          known: coverage.knownCostCount,
          missing: coverage.unknownCostCount,
        })
  return (
    <span className='inline-flex items-center gap-1 whitespace-nowrap'>
      {formatUsd(value, i18n.language)}
      {partial && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              role='img'
              aria-label={message}
              className='inline-flex rounded-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring'
            >
              <Info className='size-3' aria-hidden='true' />
            </span>
          </TooltipTrigger>
          <TooltipContent>{message}</TooltipContent>
        </Tooltip>
      )}
    </span>
  )
}

export function AccountGroups({ account }: { account: UpstreamAccount }) {
  const { t } = useTranslation()
  const groups = account.groups
  if (!groups.length)
    return (
      <span className='text-xs text-muted-foreground'>
        {t('accounts.noGroup')}
      </span>
    )
  return (
    <div className='min-w-0 space-y-1'>
      {groups.slice(0, 2).map((group, index) => (
        <div key={group.id} className='flex min-w-0 items-center gap-1'>
          <Badge
            variant='outline'
            className='max-w-full min-w-0'
            title={group.name}
          >
            <span className='truncate'>{group.name}</span>
          </Badge>
          {index === 1 && groups.length > 2 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant='outline'
                  size='sm'
                  className='shrink-0'
                  aria-label={t('accounts.allGroupsFor', {
                    name: account.name,
                    count: groups.length,
                  })}
                >
                  +{groups.length - 2}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align='start'
                className='w-64 max-w-[calc(100vw-2rem)] p-3'
              >
                <div className='mb-2 text-xs font-medium'>
                  {t('accounts.groupCount', { count: groups.length })}
                </div>
                <ul
                  className='max-h-44 space-y-1 overflow-y-auto overscroll-contain'
                  aria-label={t('accounts.group')}
                >
                  {groups.map((item) => (
                    <li
                      key={item.id}
                      className='rounded-md bg-muted/40 px-2 py-2 text-xs break-words'
                    >
                      {item.name}
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}
        </div>
      ))}
    </div>
  )
}
