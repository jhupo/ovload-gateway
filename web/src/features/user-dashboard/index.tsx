import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  ArrowUpRight,
  Database,
  DollarSign,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  getCustomerUsageSummary,
  getCustomerUsageTrend,
  listCustomerUsage,
} from '@/api/customer-usage'
import { useIdentitySession } from '@/stores/identity-session'
import { formatUsd } from '@/lib/usd'
import { useWallet } from '@/hooks/use-wallet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Main } from '@/components/layout/main'
import { RequestErrorToast } from '@/components/request-error-toast'
import { TelemetryChart } from '@/components/telemetry-chart'

type Period = 'today' | '7d' | '30d'

function windowFor(period: Period) {
  const to = new Date()
  const from = new Date(to)
  if (period === 'today') from.setUTCHours(0, 0, 0, 0)
  else from.setTime(to.getTime() - (period === '7d' ? 7 : 30) * 86_400_000)
  return { from: from.toISOString(), to: to.toISOString() }
}

export function UserDashboard() {
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t('liveDashboard.' + key)
  const session = useIdentitySession((state) => state.session)
  const [period, setPeriod] = useState<Period>('today')
  const [filter, setFilter] = useState(() => windowFor('today'))
  const wallet = useWallet()
  const summary = useQuery({
    queryKey: ['customer-usage-summary', session?.id, filter],
    queryFn: ({ signal }) => getCustomerUsageSummary(filter, signal),
    enabled: session?.audience === 'customer',
    retry: false,
  })
  const recent = useQuery({
    queryKey: ['customer-usage-recent', session?.id, filter],
    queryFn: ({ signal }) => listCustomerUsage(filter, undefined, 6, signal),
    enabled: session?.audience === 'customer',
    retry: false,
  })
  const trend = useQuery({
    queryKey: ['customer-usage-trend', session?.id, filter],
    queryFn: ({ signal }) => getCustomerUsageTrend(filter, signal),
    enabled: session?.audience === 'customer',
    retry: false,
  })
  const number = (value: number | null | undefined) =>
    value == null
      ? '\u2014'
      : new Intl.NumberFormat(i18n.language).format(value)
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      timeZone: 'UTC',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value))
  const metrics = [
    {
      id: 'balance',
      icon: Wallet,
      label: tr('available'),
      value: formatUsd(wallet.data?.available_usd, i18n.language),
      detail:
        tr('held') + ' ' + formatUsd(wallet.data?.held_usd, i18n.language),
    },
    {
      id: 'consumption',
      icon: DollarSign,
      label: tr('charged'),
      value: formatUsd(summary.data?.retail_charge_usd, i18n.language),
      detail: tr('settled') + ' ' + number(summary.data?.settled_requests),
    },
    {
      id: 'requests',
      icon: Activity,
      label: tr('requests'),
      value: number(summary.data?.requests),
      detail: tr('succeeded') + ' ' + number(summary.data?.succeeded),
    },
    {
      id: 'tokens',
      icon: Database,
      label: tr('tokens'),
      value: number(summary.data?.total_tokens),
      detail:
        tr('reported') + ' ' + number(summary.data?.usage_reported_requests),
    },
  ]
  const errors = [
    wallet.error,
    summary.error,
    recent.error,
    trend.error,
  ].filter(Boolean)
  return (
    <Main id='content' className='@container/user-dashboard flex-1'>
      <div
        data-slot='page-heading'
        className='flex flex-wrap items-center justify-between gap-3'
      >
        <h1 className='text-2xl font-semibold'>{t('sidebar.dashboard')}</h1>
        <div className='flex items-center gap-2'>
          <Select
            value={period}
            onValueChange={(value) => {
              const next = value as Period
              setPeriod(next)
              setFilter(windowFor(next))
            }}
          >
            <SelectTrigger className='h-8 w-36' aria-label={tr('range')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['today', '7d', '30d'] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {tr(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant='outline'
            size='icon'
            className='size-8'
            aria-label={tr('refresh')}
            title={tr('refresh')}
            disabled={
              summary.isFetching ||
              recent.isFetching ||
              trend.isFetching ||
              wallet.isFetching
            }
            onClick={() => {
              setFilter(windowFor(period))
              void wallet.refetch()
            }}
          >
            <RefreshCw className='size-4' />
          </Button>
        </div>
      </div>
      {errors.length > 0 && <RequestErrorToast message={errors[0]?.message} />}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 @3xl/user-dashboard:grid-cols-4'>
        {metrics.map((metric) => (
          <Card key={metric.id} className='min-w-0 gap-0 p-4 shadow-none'>
            <div className='flex items-center justify-between gap-2 text-sm text-muted-foreground'>
              <span>{metric.label}</span>
              <metric.icon className='size-4 shrink-0' aria-hidden='true' />
            </div>
            <div className='mt-3 text-xl font-semibold break-words tabular-nums'>
              {metric.value}
            </div>
            <div className='mt-2 text-xs break-words text-muted-foreground'>
              {metric.detail}
            </div>
          </Card>
        ))}
      </div>
      <section
        className='min-w-0 space-y-4'
        aria-labelledby='customer-trend-title'
      >
        <div className='flex flex-wrap items-center justify-between gap-2 border-b pb-3'>
          <h2 id='customer-trend-title' className='text-base font-semibold'>
            {tr('trend')}
          </h2>
          <span className='text-xs text-muted-foreground'>UTC</span>
        </div>
        {trend.isPending ? (
          <div
            className='flex h-64 items-center justify-center text-sm text-muted-foreground'
            role='status'
          >
            {tr('loading')}
          </div>
        ) : trend.data?.length ? (
          <TelemetryChart
            label={tr('trend')}
            option={(palette) => ({
              color: [palette.colors[0]],
              grid: {
                left: 12,
                right: 16,
                top: 12,
                bottom: 8,
                containLabel: true,
              },
              tooltip: {
                trigger: 'axis',
                confine: true,
                renderMode: 'richText',
              },
              xAxis: {
                type: 'category',
                data: trend.data.map((day) => day.date),
                axisLabel: { color: palette.text, hideOverlap: true },
              },
              yAxis: {
                type: 'value',
                minInterval: 1,
                axisLabel: { color: palette.text },
                splitLine: { lineStyle: { color: palette.grid } },
              },
              series: [
                {
                  id: 'requests',
                  type: 'line',
                  name: tr('requests'),
                  data: trend.data.map((day) => day.summary.requests),
                  showSymbol: true,
                  symbolSize: 6,
                  connectNulls: false,
                },
              ],
            })}
          />
        ) : (
          <div className='flex h-64 items-center justify-center text-sm text-muted-foreground'>
            {tr(trend.isError ? 'unavailable' : 'empty')}
          </div>
        )}
      </section>
      <section
        className='min-w-0 space-y-3'
        aria-labelledby='customer-recent-title'
      >
        <div className='flex flex-wrap items-center justify-between gap-2 border-b pb-3'>
          <h2 id='customer-recent-title' className='text-base font-semibold'>
            {tr('recent')}
          </h2>
          <Button asChild variant='ghost' size='sm' className='h-8'>
            <Link to='/user/usage'>
              {tr('viewAll')}
              <ArrowUpRight className='size-4' />
            </Link>
          </Button>
        </div>
        <Table aria-label={tr('recent')}>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('time')} UTC</TableHead>
              <TableHead>{tr('model')}</TableHead>
              <TableHead>{tr('status')}</TableHead>
              <TableHead>{tr('tokens')}</TableHead>
              <TableHead>{tr('charged')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.data?.items.map((row) => (
              <TableRow key={row.request_id}>
                <TableCell className='text-xs whitespace-nowrap tabular-nums'>
                  {date(row.started_at)}
                </TableCell>
                <TableCell className='max-w-64 text-sm break-words whitespace-normal'>
                  {row.public_model_id ?? '\u2014'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      row.outcome === 'failed' ? 'destructive' : 'secondary'
                    }
                  >
                    {t('liveUsage.outcomes.' + row.outcome, {
                      defaultValue: row.outcome,
                    })}
                  </Badge>
                </TableCell>
                <TableCell className='tabular-nums'>
                  {number(row.total_tokens)}
                </TableCell>
                <TableCell className='whitespace-nowrap tabular-nums'>
                  {formatUsd(row.retail_charge_usd, i18n.language)}
                </TableCell>
              </TableRow>
            ))}
            {!recent.data?.items.length && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className='h-24 text-center text-sm text-muted-foreground'
                >
                  {tr(
                    recent.isPending
                      ? 'loading'
                      : recent.isError
                        ? 'unavailable'
                        : 'empty'
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </Main>
  )
}
