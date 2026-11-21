import { useTranslation } from 'react-i18next'
import type { MonitoringSnapshot } from '@/api/monitoring'
import { useSiteTimezone } from '@/hooks/use-site-timezone'
import { TelemetryChart, type ChartPalette } from '@/components/telemetry-chart'

export function ProviderThroughput({ data }: { data?: MonitoringSnapshot }) {
  const { t, i18n } = useTranslation()
  const timeZone = useSiteTimezone()
  const points = data?.points ?? []
  const qps = points.map((point) => point.requests / point.seconds)
  const tps = points.map((point) =>
    point.tokens === null ? null : point.tokens / point.seconds / 1000
  )
  const number = (value: number | null | undefined) =>
    value == null
      ? '-'
      : new Intl.NumberFormat(i18n.language, {
          maximumFractionDigits: 2,
        }).format(value)
  const tpsUnit = t('monitoring.throughput.tpsUnit')
  const trend = (palette: ChartPalette) => ({
    color: [palette.colors[0], palette.colors[2]],
    grid: { left: 8, right: 8, top: 18, bottom: 6, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: palette.surface,
      borderColor: palette.grid,
      textStyle: { color: palette.text, fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((point) =>
        new Date(point.bucket).toLocaleString(i18n.language, {
          timeZone,
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      ),
      axisLine: { lineStyle: { color: palette.grid } },
      axisTick: { show: false },
      axisLabel: { color: palette.text, fontSize: 9, hideOverlap: true },
    },
    yAxis: [
      {
        type: 'value',
        name: 'QPS',
        nameTextStyle: { color: palette.text, fontSize: 9, align: 'left' },
        axisLabel: { color: palette.text, fontSize: 9 },
        splitLine: { lineStyle: { color: palette.grid, type: 'dashed' } },
      },
      {
        type: 'value',
        name: tpsUnit,
        nameTextStyle: { color: palette.text, fontSize: 9, align: 'right' },
        axisLabel: { color: palette.text, fontSize: 9 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        id: 'provider-qps',
        name: 'QPS',
        type: 'line',
        data: qps,
        smooth: 0.38,
        areaStyle: { color: palette.colors[0], opacity: 0.06 },
        showSymbol: false,
        lineStyle: { width: 2, color: palette.colors[0] },
      },
      {
        id: 'provider-tps',
        name: tpsUnit,
        type: 'line',
        yAxisIndex: 1,
        data: tps,
        smooth: 0.38,
        showSymbol: false,
        lineStyle: { width: 2, color: palette.colors[2] },
      },
    ],
  })
  return (
    // ai-design-check-ignore-next-line use-shared-looks -- Preserve the established telemetry panel and its bounded scrolling layout.
    <section
      data-testid='provider-throughput'
      aria-labelledby='provider-throughput-title'
      className='flex h-[272px] min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm xl:h-[312px]'
    >
      <div className='flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-2 sm:px-5'>
        <div className='min-w-0'>
          {/* ai-design-check-ignore-next-line use-shared-looks -- Existing section heading; the project has no shared Heading component. */}
          <h2
            id='provider-throughput-title'
            className='truncate text-sm font-semibold'
          >
            {t('monitoring.throughput.title')}
          </h2>
          <div className='mt-0.5 flex items-center gap-3 text-xs text-muted-foreground'>
            {['QPS', t('monitoring.throughput.tpsUnit')].map((label, index) => (
              <span key={label} className='flex items-center gap-1.5'>
                <span
                  className={`size-1.5 rounded-full ${index === 0 ? 'bg-[var(--telemetry-1)]' : 'bg-[var(--telemetry-3)]'}`}
                  aria-hidden
                />
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className='flex shrink-0 items-baseline gap-3 text-end tabular-nums'>
          {['QPS', tpsUnit].map((label, index) => (
            <span key={label}>
              <strong className='text-sm font-semibold'>
                {number(index === 0 ? qps.at(-1) : tps.at(-1))}
              </strong>
              <span className='ms-1 text-xs text-muted-foreground'>
                {label}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className='relative flex min-h-0 flex-1 items-stretch p-3 sm:p-4'>
        <TelemetryChart
          option={trend}
          label={t('monitoring.throughput.chartLabel')}
          className='h-full min-h-0'
          updateDuration={650}
        />
        <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
          {!points.length && (
            <span className='text-sm text-muted-foreground'>
              {t('data_table.no_results')}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
