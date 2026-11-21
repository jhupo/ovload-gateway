import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  CustomerUsageDay,
  CustomerUsageFilter,
} from '@/api/customer-usage'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TelemetryChart, type ChartPalette } from '@/components/telemetry-chart'

export function UsageTrend({
  items,
  filter,
}: {
  items: CustomerUsageDay[]
  filter: CustomerUsageFilter
}) {
  const { t, i18n } = useTranslation()
  const [metric, setMetric] = useState('requests')
  const formatter = new Intl.NumberFormat(i18n.language, {
    notation: 'compact',
  })
  const date = new Intl.DateTimeFormat(i18n.language, {
    timeZone: 'UTC',
    month: '2-digit',
    day: '2-digit',
  })
  const byDate = new Map(items.map((item) => [item.date, item.summary]))
  const buckets: {
    timestamp: number
    summary: CustomerUsageDay['summary'] | undefined
  }[] = []
  const firstDay = new Date(filter.from)
  firstDay.setUTCHours(0, 0, 0, 0)
  for (
    let timestamp = firstDay.getTime();
    timestamp < Date.parse(filter.to);
    timestamp += 86_400_000
  ) {
    const key = new Date(timestamp).toISOString().slice(0, 10)
    buckets.push({ timestamp, summary: byDate.get(key) })
  }
  const names =
    metric === 'requests'
      ? [t('liveUsage.requests')]
      : [t('liveUsage.input'), t('liveUsage.output')]
  const values =
    metric === 'requests'
      ? [buckets.map((bucket) => bucket.summary?.requests ?? 0)]
      : [
          buckets.map((bucket) => bucket.summary?.input_tokens ?? null),
          buckets.map((bucket) => bucket.summary?.output_tokens ?? null),
        ]
  const option = (palette: ChartPalette) => ({
    color: palette.colors,
    grid: { left: 4, right: 12, top: 20, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      renderMode: 'richText',
      backgroundColor: palette.surface,
      borderColor: palette.grid,
      textStyle: { color: palette.text },
    },
    xAxis: {
      type: 'category',
      data: buckets.map((bucket) => date.format(bucket.timestamp)),
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.text, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      min: 0,
      minInterval: 1,
      splitNumber: 3,
      axisLabel: {
        color: palette.text,
        formatter: (value: number) => formatter.format(value),
      },
      splitLine: { lineStyle: { color: palette.grid, type: 'dashed' } },
    },
    series: values.map((data, index) => ({
      id: `${metric}-${index}`,
      name: names[index],
      type: 'line',
      data,
      connectNulls: false,
      showSymbol: true,
      symbolSize: 5,
      lineStyle: { width: 2 },
    })),
  })
  return (
    <section
      className='min-w-0 border-b pb-5'
      aria-labelledby='usage-trend-title'
    >
      <Tabs value={metric} onValueChange={setMetric}>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h2 id='usage-trend-title' className='text-sm font-medium'>
            {t('liveUsage.trend')} (UTC)
          </h2>
          <TabsList variant='line' className='h-8'>
            <TabsTrigger value='requests'>
              {t('liveUsage.requests')}
            </TabsTrigger>
            <TabsTrigger value='tokens'>{t('liveUsage.tokens')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value={metric}>
          <TelemetryChart
            label={`${t('liveUsage.trend')} · ${t(`liveUsage.${metric}`)}`}
            option={option}
            className='h-48'
          />
        </TabsContent>
      </Tabs>
    </section>
  )
}
