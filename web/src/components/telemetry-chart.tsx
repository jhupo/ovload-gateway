import { useEffect, useEffectEvent, useRef } from 'react'
import type { EChartsCoreOption, EChartsType } from 'echarts/core'

export type ChartPalette = {
  colors: string[]
  text: string
  grid: string
  surface: string
}

export function TelemetryChart({
  option,
  label,
  className = 'h-64',
  deferMs = 0,
  updateDuration = 400,
}: {
  option: (palette: ChartPalette) => EChartsCoreOption
  label: string
  className?: string
  deferMs?: number
  updateDuration?: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<EChartsType | null>(null)
  const previousSeriesIds = useRef<string[] | null>(null)
  const hasRendered = useRef(false)

  const render = useEffectEvent((animate = true) => {
    const chart = instance.current
    if (!chart) return

    const styles = getComputedStyle(document.documentElement)
    const token = (name: string) =>
      styles.getPropertyValue(`--telemetry-${name}`).trim()
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const shouldAnimate = animate && !reduced
    const initialRender = !hasRendered.current
    const configuration = option({
      colors: ['1', '2', '3', '4', '5', '6', '7'].map(token),
      text: token('text'),
      grid: token('grid'),
      surface: token('surface'),
    })
    const seriesIds = Array.isArray(configuration.series)
      ? configuration.series.map((series, index) =>
          typeof series === 'object' && series !== null && 'id' in series
            ? String(series.id ?? index)
            : String(index)
        )
      : []
    const seriesShapeChanged =
      previousSeriesIds.current !== null &&
      (seriesIds.length !== previousSeriesIds.current.length ||
        seriesIds.some(
          (id, index) => id !== previousSeriesIds.current?.[index]
        ))
    previousSeriesIds.current = seriesIds
    chart.setOption(
      {
        ...configuration,
        series: Array.isArray(configuration.series)
          ? configuration.series.map((series) => ({
              ...series,
              stateAnimation: {
                duration: shouldAnimate ? 180 : 0,
                easing: 'cubicOut',
              },
            }))
          : configuration.series,
        animation: shouldAnimate,
        animationDuration: shouldAnimate ? (initialRender ? 1050 : 550) : 0,
        animationDurationUpdate: shouldAnimate ? updateDuration : 0,
        animationEasing: 'cubicOut',
        animationEasingUpdate: 'cubicInOut',
        animationDelay: (index: number) =>
          shouldAnimate ? (initialRender ? 120 : 0) + index * 35 : 0,
        animationDelayUpdate: (index: number) => index * 20,
        textStyle: { fontFamily: 'Inter, "Noto Sans SC", sans-serif' },
      },
      seriesShapeChanged ? { replaceMerge: ['series'] } : undefined
    )
    hasRendered.current = true
  })

  useEffect(() => {
    if (!container.current) return
    const element = container.current
    let disposed = false
    let resize: ResizeObserver | undefined
    let theme: MutationObserver | undefined
    let motion: MediaQueryList | undefined
    let frame: number | undefined
    const refreshWithoutMotion = () => render(false)
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(() => {
        void import('./telemetry-chart-runtime').then(
          ({ createTelemetryChart }) => {
            if (disposed) return
            const chart = createTelemetryChart(element)
            instance.current = chart
            motion = matchMedia('(prefers-reduced-motion: reduce)')
            resize = new ResizeObserver(() => {
              if (
                element.clientWidth !== chart.getWidth() ||
                element.clientHeight !== chart.getHeight()
              )
                chart.resize()
            })
            resize.observe(element)
            theme = new MutationObserver(refreshWithoutMotion)
            theme.observe(document.documentElement, {
              attributes: true,
              attributeFilter: ['class'],
            })
            motion.addEventListener('change', refreshWithoutMotion)
            render()
            element.dataset.ready = 'true'
          }
        )
      })
    }, deferMs)
    return () => {
      disposed = true
      clearTimeout(timer)
      if (frame !== undefined) cancelAnimationFrame(frame)
      resize?.disconnect()
      theme?.disconnect()
      motion?.removeEventListener('change', refreshWithoutMotion)
      instance.current?.dispose()
      instance.current = null
      hasRendered.current = false
      previousSeriesIds.current = null
    }
  }, [deferMs])

  useEffect(() => {
    render()
  }, [option, updateDuration])

  return (
    <div
      ref={container}
      role='img'
      aria-label={label}
      data-ready='false'
      className={`w-full min-w-0 opacity-0 transition-opacity duration-200 data-[ready=true]:opacity-100 motion-reduce:transition-none ${className}`}
    />
  )
}
