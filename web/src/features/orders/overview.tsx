import { useRef, useState } from 'react'
import {
  Wallet,
  ReceiptText,
  CreditCard,
  ChartNoAxesCombined,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { calendarDate } from '@/lib/calendar'
import { useClock } from '@/hooks/use-clock'
import { useErrorToast } from '@/hooks/use-error-toast'
import { usePaymentSummary } from '@/hooks/use-payment-summary'
import { useSiteTimezone } from '@/hooks/use-site-timezone'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { QueryState } from '@/components/query-state'
import { TelemetryChart } from '@/components/telemetry-chart'
import { amount } from './data'
import { PaymentHistory } from './payment-history'
import { OrderDate, OrderShell } from './shared'

export function PaymentOverview() {
  const timeZone = useSiteTimezone()
  const now = useClock(30000)
  const today = calendarDate(now, timeZone)
  const { t } = useTranslation()
  const tr = (k: string) => t('orders.' + k)
  const historyTrigger = useRef<HTMLButtonElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hidden, setHidden] = useState<string[]>([])
  const [range, setRange] = useState('30'),
    [from, setFrom] = useState(() =>
      new Date(Date.parse(today + 'T00:00:00Z') - 29 * 86400000)
        .toISOString()
        .slice(0, 10)
    ),
    [to, setTo] = useState(today)
  const invalid =
    !from ||
    !to ||
    from > to ||
    (Date.parse(to) - Date.parse(from)) / 86400000 > 366
  const result = usePaymentSummary(
    invalid ? today : from,
    invalid ? today : to,
    today
  )
  const summary = result.data
  useErrorToast(invalid ? tr('invalidRange') : undefined, 'payment-range')
  if (!summary)
    return <QueryState error={result.error} retry={result.refetch} />
  const metrics = [
    {
      label: 'todayRevenue',
      value: amount(summary.today, 'CNY'),
      icon: Wallet,
    },
    {
      label: 'rangeRevenue',
      value: amount(summary.total, 'CNY'),
      icon: CreditCard,
    },
    {
      label: 'rangeOrders',
      value: String(summary.count),
      icon: ReceiptText,
    },
    {
      label: 'average',
      value: amount(summary.count ? summary.total / summary.count : 0, 'CNY'),
      icon: ChartNoAxesCombined,
    },
  ]
  return (
    <OrderShell
      title='sidebar.payment_overview'
      actions={
        <div className='flex flex-wrap items-center gap-2'>
          <div className='flex gap-1 rounded-lg border p-1'>
            {['7', '30', '90', 'custom'].map((n) => (
              <Button
                key={n}
                size='sm'
                variant={range === n ? 'default' : 'ghost'}
                onClick={() => {
                  setRange(n)
                  if (n !== 'custom') {
                    setTo(today)
                    setFrom(
                      new Date(
                        Date.parse(today + 'T00:00:00Z') -
                          (Number(n) - 1) * 86400000
                      )
                        .toISOString()
                        .slice(0, 10)
                    )
                  }
                }}
              >
                {n === 'custom' ? tr('custom') : tr('days' + n)}
              </Button>
            ))}
          </div>
          {range === 'custom' && (
            <>
              <OrderDate value={from} onChange={setFrom} label={tr('from')} />
              <OrderDate value={to} onChange={setTo} label={tr('to')} />
            </>
          )}
        </div>
      }
    >
      {invalid ? (
        <p role='alert' className='sr-only'>
          {tr('invalidRange')}
        </p>
      ) : (
        <>
          <div className='grid grid-cols-2 gap-3 xl:grid-cols-4'>
            {metrics.map((m) => (
              <Card
                key={m.label}
                className='gap-3 py-4 shadow-sm transition-shadow hover:shadow-md'
              >
                <CardContent className='flex items-start justify-between gap-2 px-4'>
                  <div className='min-w-0'>
                    <div className='text-xs text-muted-foreground'>
                      {tr(m.label)}
                    </div>
                    <div className='mt-2 truncate text-xl font-semibold tabular-nums sm:text-2xl'>
                      {m.value}
                    </div>
                  </div>
                  <m.icon className='size-4 shrink-0 text-muted-foreground' />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className='grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)]'>
            <Card className='min-w-0 gap-3 shadow-sm'>
              <CardHeader>
                <CardTitle>{tr('dailyRevenue')}</CardTitle>
                <div className='flex gap-2'>
                  {['revenue', 'count'].map((key, i) => (
                    <Button
                      key={key}
                      variant='ghost'
                      size='sm'
                      aria-pressed={!hidden.includes(key)}
                      className='text-xs'
                      onClick={() =>
                        setHidden((v) =>
                          v.includes(key)
                            ? v.filter((x) => x !== key)
                            : [...v, key]
                        )
                      }
                    >
                      <span
                        className='size-2.5 rounded-full border-2'
                        style={{
                          borderColor: `var(--telemetry-${i + 1})`,
                          opacity: hidden.includes(key) ? 0.3 : 1,
                        }}
                      />
                      {tr(key)}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className='px-2 sm:px-4'>
                <TelemetryChart
                  label={tr('dailyRevenue')}
                  className='h-64 sm:h-[300px]'
                  updateDuration={850}
                  option={(p) => ({
                    color: [p.colors[0], p.colors[1]],
                    tooltip: {
                      trigger: 'axis',
                      renderMode: 'richText',
                      backgroundColor: p.surface,
                      borderColor: p.grid,
                      textStyle: { color: p.text },
                    },

                    grid: { left: 54, right: 40, top: 18, bottom: 35 },
                    xAxis: {
                      type: 'category',
                      boundaryGap: false,
                      axisTick: { show: false },
                      data: summary.days.map((d) => d.day.slice(5)),
                      axisLabel: {
                        color: p.text,
                        fontSize: 10,
                        hideOverlap: true,
                      },
                      axisLine: { show: false },
                    },
                    yAxis: [
                      {
                        type: 'value',
                        name: 'CNY',
                        axisLabel: {
                          color: p.text,
                          fontSize: 10,
                          hideOverlap: true,
                        },
                        splitLine: {
                          lineStyle: { color: p.grid, type: 'solid' },
                        },
                      },
                      {
                        type: 'value',
                        name: tr('count'),
                        minInterval: 1,
                        axisLabel: {
                          color: p.text,
                          fontSize: 10,
                          hideOverlap: true,
                        },
                        splitLine: { show: false },
                      },
                    ],
                    series: [
                      {
                        id: 'revenue',
                        itemStyle: { color: p.colors[0] },
                        name: tr('revenue'),
                        type: 'line',
                        smooth: 0.3,
                        showSymbol: summary.days.length <= 31,
                        symbolSize: 4,
                        lineStyle: { width: 2 },
                        areaStyle: { opacity: 0.1 },
                        emphasis: { focus: 'series', lineStyle: { width: 3 } },
                        symbol: 'circle',
                        data: summary.days.map((d) => d.revenue / 100),
                      },
                      {
                        id: 'orders',
                        itemStyle: { color: p.colors[1] },
                        name: tr('count'),
                        type: 'line',
                        smooth: 0.3,
                        showSymbol: summary.days.length <= 31,
                        symbolSize: 4,
                        lineStyle: { width: 2 },
                        areaStyle: { opacity: 0.1 },
                        emphasis: { focus: 'series', lineStyle: { width: 3 } },
                        symbol: 'circle',
                        yAxisIndex: 1,
                        data: summary.days.map((d) => d.count),
                      },
                    ].filter(
                      (series) =>
                        !hidden.includes(
                          series.id === 'orders' ? 'count' : 'revenue'
                        )
                    ),
                  })}
                />
              </CardContent>
            </Card>
            <Card className='min-w-0 gap-3 shadow-sm'>
              <CardHeader>
                <CardTitle>{tr('ranking')}</CardTitle>
              </CardHeader>
              <CardContent className='px-4'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>{tr('user')}</TableHead>
                      <TableHead className='text-left'>
                        {tr('paidAmount')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.ranking.map((r, i) => (
                      <TableRow key={r.id}>
                        <TableCell className='text-muted-foreground'>
                          {i + 1}
                        </TableCell>
                        <TableCell className='py-3'>
                          <button
                            className='rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring'
                            onClick={(event) => {
                              historyTrigger.current = event.currentTarget
                              setSelected(r.email)
                            }}
                          >
                            {r.name}
                          </button>
                          <div className='max-w-40 truncate text-xs text-muted-foreground'>
                            {r.email}
                          </div>
                        </TableCell>
                        <TableCell className='text-left font-medium tabular-nums'>
                          {amount(r.total, 'CNY')}
                          <div className='mt-1 text-xs font-normal text-muted-foreground'>
                            {r.count} {tr('count')}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!summary.ranking.length && (
                  <p className='p-8 text-center text-sm text-muted-foreground'>
                    {t('data_table.no_results')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <PaymentHistory
        restoreFocus={() => historyTrigger.current?.focus()}
        email={selected}
        onClose={() => setSelected(null)}
      />
    </OrderShell>
  )
}
