import { useMemo, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  Clock3,
  Database,
  Users,
  Gauge,
  KeyRound,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  DashboardSummary,
  ObservationTrend,
  TrendKind,
} from '@/api/observability'
import { Card } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { TelemetryChart, type ChartPalette } from '@/components/telemetry-chart'

const cardClassName =
  'border-border/60 bg-card shadow-sm dark:shadow-black/30 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-black/50 motion-reduce:transition-none motion-reduce:hover:transform-none'
const compact = (value: number) =>
  new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)

function Sparkline({
  values,
  color,
}: {
  values: (number | null)[]
  color: number
}) {
  const paths = useMemo(() => {
    const known = values.filter((value): value is number => value !== null)
    if (!known.length) return ''
    const min = Math.min(...known),
      max = Math.max(...known)
    const span = max - min || 1
    return values
      .map((value, index) =>
        value === null
          ? ''
          : `${index === 0 || values[index - 1] === null ? 'M' : 'L'} ${values.length === 1 ? 60 : (index / (values.length - 1)) * 120} ${8 + (1 - (value - min) / span) * 50}`
      )
      .join(' ')
  }, [values])
  return (
    <div
      aria-hidden
      data-slot='sparkline'
      className='pointer-events-none block w-full'
      style={{ color: `var(--telemetry-${color + 1})` }}
    >
      <svg
        viewBox='0 0 120 64'
        preserveAspectRatio='none'
        focusable='false'
        className='h-10 w-full overflow-visible sm:h-14'
      >
        <path
          className='sparkline-line'
          d={paths}
          fill='none'
          stroke='currentColor'
          strokeWidth='1.7'
          strokeLinecap='round'
          strokeLinejoin='round'
          vectorEffect='non-scaling-stroke'
        />
      </svg>
    </div>
  )
}

export function OverviewCards({ data }: { data?: DashboardSummary }) {
  const { t, i18n } = useTranslation()
  const count = (value: number | undefined) =>
    value === undefined
      ? undefined
      : new Intl.NumberFormat(i18n.resolvedLanguage).format(value)
  const cards = [
    {
      key: 'accounts',
      label: t('dashboard.accounts'),
      icon: KeyRound,
      color: 2,
      display: data?.cards.credentials.total,
      detail: t('dashboard.availableShort'),
      footer: data?.cards.credentials.available,
    },
    {
      key: 'requests',
      label: t('adminObservability.todayRequests'),
      icon: Activity,
      color: 0,
      display: data?.cards.traffic.todayRequests,
      detail: t('dashboard.allRequests'),
      footer: data?.cards.traffic.totalRequests,
    },
    {
      key: 'tokens',
      label: t('adminObservability.todayTokens'),
      icon: Database,
      color: 1,
      display: data?.cards.tokens.todayTokens,
      detail: t('dashboard.totalShort'),
      footer: data?.cards.tokens.totalTokens,
    },
    {
      key: 'users',
      label: t('dashboard.newUsers'),
      icon: Users,
      color: 2,
      display: count(data?.cards.users?.newUsers),
      detail: t('dashboard.totalUsersShort'),
      footer: count(data?.cards.users?.totalUsers),
    },
  ]
  return (
    <section
      data-testid='overview-metrics'
      aria-label={t('dashboard.overview')}
      aria-busy={!data}
      className='grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4'
    >
      {cards.map(
        ({ key, label, icon: Icon, color, display, detail, footer }) => (
          <Card
            key={key}
            data-testid={`overview-${key}`}
            className={`min-h-32 min-w-0 gap-3 rounded-xl p-3 sm:min-h-36 sm:p-4 ${cardClassName}`}
          >
            <div className='flex min-h-5 items-center gap-2'>
              <Icon
                aria-hidden
                className='size-4 shrink-0'
                strokeWidth={1.75}
                style={{ color: `var(--telemetry-${color + 1})` }}
              />
              <span className='text-xs font-medium text-muted-foreground'>
                {label}
              </span>
            </div>
            <strong className='text-2xl leading-none font-semibold break-all tabular-nums sm:text-3xl'>
              {display ?? '\u00a0'}
            </strong>
            <div
              data-slot='overview-footer'
              className='mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs sm:pt-3'
            >
              <span className='min-w-0 text-muted-foreground'>{detail}</span>
              <strong className='shrink-0 font-medium tabular-nums'>
                {footer ?? '\u00a0'}
              </strong>
            </div>
          </Card>
        )
      )}
    </section>
  )
}

export function SummaryCards({
  data,
  averageLatency,
}: {
  data?: DashboardSummary
  averageLatency?: string
}) {
  const { t } = useTranslation()
  const points = data?.trend.points ?? []
  const input = points.reduce(
    (total, point) => total + point.inputTokensValue,
    0
  )
  const output = points.reduce(
    (total, point) => total + point.outputTokensValue,
    0
  )
  const requests = points.reduce((sum, point) => sum + point.requestsValue, 0)
  const errors = points.reduce((sum, point) => sum + point.errorsValue, 0)
  const minutes =
    data && points.length
      ? Math.max(
          (Date.parse(data.asOf) - Date.parse(points[0].bucket)) / 60000,
          1 / 60
        )
      : null
  const cards = [
    {
      key: 'tokens',
      icon: Database,
      color: 1,
      values: points.map((point) => point.tokensValue),
      footer: [
        [t('dashboard.input'), compact(input)],
        [t('dashboard.output'), compact(output)],
      ],
    },
    {
      key: 'performance',
      icon: Gauge,
      color: 0,
      values: points.map((point) => point.requestsValue),
      footer: [
        [t('dashboard.rpm'), minutes ? compact(requests / minutes) : '-'],
        [
          t('dashboard.tpm'),
          minutes
            ? compact(
                points.reduce((sum, point) => sum + point.tokensValue, 0) /
                  minutes
              )
            : '-',
        ],
      ],
    },
    {
      key: 'avgResponse',
      icon: Clock3,
      color: 4,
      values: points.map((point) => point.latencyValue),
      footer: [
        [t('dashboard.average'), averageLatency ?? '-'],
        [
          t('dashboard.firstByte'),
          data?.cards.cache.averageFirstTokenLatencyMs,
        ],
      ],
    },
    {
      key: 'success',
      icon: CheckCircle2,
      color: 5,
      values: points.map((point) => point.successRateValue),
      footer: [
        [t('dashboard.successShort'), data?.healthTimeline.reliabilityDisplay],
        [t('dashboard.errors'), compact(errors)],
      ],
    },
  ]
  return (
    <section
      aria-label={t('dashboard.metrics')}
      aria-busy={!data}
      className='grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4'
    >
      {cards.map(({ key, icon: Icon, color, values, footer }) => (
        <Card
          key={key}
          data-testid={`metric-${key}`}
          className={`min-w-0 gap-3 rounded-xl p-3 sm:p-4 ${cardClassName}`}
        >
          <div className='flex min-h-5 items-center gap-2'>
            <Icon
              aria-hidden
              className='size-4 shrink-0'
              strokeWidth={1.75}
              style={{ color: `var(--telemetry-${color + 1})` }}
            />
            <span className='text-xs font-medium text-muted-foreground'>
              {t(`dashboard.${key}`)}
            </span>
          </div>
          <Sparkline values={values} color={color} />
          <div
            data-slot='metric-footer'
            className='mt-auto grid grid-cols-2 gap-2 border-t border-border/60 pt-2.5 text-xs sm:pt-3'
          >
            {footer.map(([label, value]) => (
              <span
                key={label}
                className='flex min-w-0 flex-col gap-1 last:items-end'
              >
                <span className='text-muted-foreground'>{label}</span>
                <strong className='font-medium break-all text-foreground tabular-nums'>
                  {data ? value : '\u00a0'}
                </strong>
              </span>
            ))}
          </div>
        </Card>
      ))}
    </section>
  )
}

export function UsageTrend({
  data,
  kind,
}: {
  data?: ObservationTrend
  kind: TrendKind
}) {
  const { t } = useTranslation()
  const [hidden, setHidden] = useState<string[]>([])
  const points = data?.points ?? []
  const series =
    kind === 'usage'
      ? [
          {
            key: 'input',
            color: 0,
            rate: false,
            values: points.map((point) => point.inputTokensValue),
          },
          {
            key: 'output',
            color: 1,
            rate: false,
            values: points.map((point) => point.outputTokensValue),
          },
          {
            key: 'cacheWrite',
            color: 4,
            rate: false,
            values: points.map(() => null),
          },
          {
            key: 'cacheRead',
            color: 6,
            rate: false,
            values: points.map((point) => point.cachedInputTokensValue),
          },
          {
            key: 'cacheRate',
            color: 2,
            rate: true,
            values: points.map((point) =>
              point.inputTokensValue > 0 ? point.cacheHitRateValue * 100 : null
            ),
          },
        ]
      : kind === 'latency'
        ? [
            {
              key: 'firstTokenP95',
              color: 0,
              rate: false,
              values: points.map((point) => point.firstTokenP95Ms),
            },
            {
              key: 'latencyP95',
              color: 4,
              rate: false,
              values: points.map((point) => point.latencyP95Ms),
            },
          ]
        : [
            {
              key: 'requests',
              color: 0,
              rate: false,
              values: points.map((point) => point.requestsValue),
            },
            {
              key: 'errors',
              color: 5,
              rate: false,
              values: points.map((point) => point.errorsValue),
            },
          ]
  const label = (key: string) =>
    t(
      key === 'firstTokenP95' || key === 'latencyP95'
        ? `adminObservability.${key}`
        : `dashboard.${key}`
    )
  const option = (palette: ChartPalette) => ({
    grid: { left: 48, right: 42, top: 18, bottom: 42 },
    tooltip: {
      trigger: 'axis' as const,
      renderMode: 'richText' as const,
      backgroundColor: palette.surface,
      borderColor: palette.grid,
      textStyle: { color: palette.text },
      confine: true,
    },
    xAxis: {
      type: 'category' as const,
      boundaryGap: false,
      data: points.map((point) => point.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.text, fontSize: 10, hideOverlap: true },
    },
    yAxis: [
      {
        type: 'value' as const,
        min: 0,
        splitNumber: 4,
        splitLine: { lineStyle: { color: palette.grid } },
        axisLabel: { color: palette.text, fontSize: 10, formatter: compact },
      },
      {
        type: 'value' as const,
        min: 0,
        max: 100,
        interval: 25,
        splitLine: { show: false },
        axisLabel: {
          color: palette.colors[2],
          fontSize: 10,
          formatter: '{value}%',
        },
      },
    ],
    series: series
      .filter((item) => item.key !== 'cacheWrite' && !hidden.includes(item.key))
      .map((item) => ({
        id: item.key,
        name: label(item.key),
        type: 'line' as const,
        data: item.values,
        connectNulls: false,
        yAxisIndex: item.rate ? 1 : 0,
        smooth: 0.3,
        symbol: 'circle',
        symbolSize: 4,
        showSymbol: points.length <= 31,
        itemStyle: { color: palette.colors[item.color] },
        lineStyle: {
          width: 2,
          type: item.rate ? ('dashed' as const) : ('solid' as const),
        },
        areaStyle: item.rate
          ? undefined
          : { color: palette.colors[item.color], opacity: 0.1 },
      })),
  })
  return (
    <div className='min-w-0 space-y-3' aria-busy={!data}>
      <div
        className='flex flex-wrap justify-center gap-x-1 gap-y-0 sm:gap-x-2'
        data-testid='trend-legend'
      >
        {series.map((item) => (
          <button
            key={item.key}
            type='button'
            aria-label={t('dashboard.toggleSeries', { name: label(item.key) })}
            aria-pressed={
              item.key !== 'cacheWrite' && !hidden.includes(item.key)
            }
            disabled={item.key === 'cacheWrite'}
            title={
              item.key === 'cacheWrite'
                ? t('featureAvailability.unavailable')
                : undefined
            }
            onClick={() =>
              setHidden((current) =>
                current.includes(item.key)
                  ? current.filter((key) => key !== item.key)
                  : [...current, item.key]
              )
            }
            className='flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring aria-[pressed=false]:text-muted-foreground aria-[pressed=false]:line-through'
          >
            <span
              className='size-2.5 rounded-full border-2'
              style={{ borderColor: `var(--telemetry-${item.color + 1})` }}
            />
            {label(item.key)}
          </button>
        ))}
      </div>
      {points.length ? (
        <TelemetryChart
          option={option}
          label={t(`adminObservability.trends.${kind}`)}
          className='h-48'
          deferMs={180}
          updateDuration={850}
        />
      ) : (
        <div className='flex h-48 items-center justify-center text-sm text-muted-foreground'>
          {data ? t('data_table.no_results') : null}
        </div>
      )}
    </div>
  )
}

export function RequestHealth({
  timeline,
}: {
  timeline: DashboardSummary['healthTimeline']
}) {
  const { t } = useTranslation()
  return (
    <Card className={`gap-4 p-5 ${cardClassName}`}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='text-sm font-semibold'>{t('dashboard.health')}</h2>
        <span className='text-sm font-semibold tabular-nums'>
          {timeline.reliabilityDisplay}
        </span>
      </div>
      <div className='flex gap-[3px]'>
        {timeline.points.map((point) => (
          <Tooltip key={point.bucketStart}>
            <TooltipTrigger asChild>
              <button
                aria-label={`${point.time} · ${point.reliabilityDisplay}`}
                className='h-5 min-w-0 flex-1 rounded-[3px] transition-transform outline-none hover:scale-y-125 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none'
                style={{
                  background:
                    point.status === 'stable'
                      ? 'var(--telemetry-2)'
                      : point.status === 'unstable' ||
                          point.status === 'unavailable'
                        ? 'var(--telemetry-4)'
                        : 'var(--muted)',
                }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className='space-y-1 text-xs'>
                <div>{point.time}</div>
                <div>
                  {t('dashboard.success')} {point.reliabilityDisplay}
                </div>
                <div>
                  {t('dashboard.requests')} {point.successRequests}
                </div>
                <div>
                  {t('dashboard.errors')} {point.failedRequests}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </Card>
  )
}
