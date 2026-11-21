import { StrictMode } from 'react'
import '@/styles/index.css'
import { getInstanceByDom } from 'echarts/core'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { TelemetryChart } from './telemetry-chart'

const option =
  (values: number[], extra = false) =>
  () => ({
    xAxis: { type: 'category', data: ['a', 'b', 'c'] },
    yAxis: { type: 'value', max: 100 },
    series: [
      { id: 'input', type: 'line', data: values },
      ...(extra ? [{ id: 'output', type: 'line', data: [15, 25, 35] }] : []),
    ],
  })

it('does not evaluate options before deferred chart initialization', async () => {
  const deferredOption = vi.fn(option([10, 20, 30]))
  const view = await render(
    <TelemetryChart
      label='Deferred telemetry'
      option={deferredOption}
      deferMs={10_000}
    />
  )

  expect(deferredOption).not.toHaveBeenCalled()
  await view.rerender(
    <TelemetryChart
      label='Deferred telemetry'
      option={deferredOption}
      deferMs={10_000}
    />
  )
  expect(deferredOption).not.toHaveBeenCalled()
  await view.unmount()
})

it('updates the same live chart, animates data changes, removes old series and disposes on unmount', async () => {
  const view = await render(
    <StrictMode>
      <div style={{ width: 600 }}>
        <TelemetryChart label='Telemetry' option={option([10, 20, 30], true)} />
      </div>
    </StrictMode>
  )
  const element = view
    .getByRole('img', { name: 'Telemetry' })
    .element() as HTMLDivElement
  await expect
    .poll(() => getInstanceByDom(element), { timeout: 15_000 })
    .toBeDefined()
  const chart = getInstanceByDom(element)!
  expect(chart.getZr().animation.isFinished()).toBe(false)
  await expect.poll(() => chart.getZr().animation.isFinished(), { timeout: 4000 }).toBe(true)
  await view.rerender(
    <StrictMode>
      <div style={{ width: 600 }}>
        <TelemetryChart label='Telemetry' option={option([70, 80, 90])} />
      </div>
    </StrictMode>
  )
  expect(getInstanceByDom(element)).toBe(chart)
  expect(chart.getOption().series).toEqual([
    expect.objectContaining({ id: 'input', data: [70, 80, 90] }),
  ])
  expect(chart.getZr().animation.isFinished()).toBe(false)
  await expect.poll(() => chart.getZr().animation.isFinished(), { timeout: 4000 }).toBe(true)
  document.documentElement.classList.toggle('dark')
  await expect.poll(() => getInstanceByDom(element)).toBe(chart)
  await expect.poll(() => chart.getOption().animation).toBe(false)
  expect(chart.getOption().animationDurationUpdate).toBe(0)
  document.documentElement.classList.toggle('dark')
  await view.unmount()
  expect(chart.isDisposed()).toBe(true)
  expect(getInstanceByDom(element)).toBeUndefined()
})

it('responds to a live reduced-motion preference without replacing the chart', async () => {
  const original = window.matchMedia.bind(window)
  const media = original('(prefers-reduced-motion: reduce)')
  Object.defineProperty(media, 'matches', { configurable: true, value: false })
  const spy = vi
    .spyOn(window, 'matchMedia')
    .mockImplementation((query) =>
      query === media.media ? media : original(query)
    )
  try {
    const view = await render(
      <TelemetryChart label='Motion' option={option([10, 20, 30])} />
    )
    const element = view
      .getByRole('img', { name: 'Motion' })
      .element() as HTMLDivElement
    await expect
      .poll(() => getInstanceByDom(element), { timeout: 15_000 })
      .toBeDefined()
    const chart = getInstanceByDom(element)!
    expect(chart.getOption().animation).toBe(true)
    Object.defineProperty(media, 'matches', { configurable: true, value: true })
    media.dispatchEvent(new Event('change'))
    await expect.poll(() => chart.getOption().animation).toBe(false)
    expect(chart.getOption().animationDurationUpdate).toBe(0)
    await view.rerender(
      <TelemetryChart label='Motion' option={option([70, 80, 90])} />
    )
    expect(getInstanceByDom(element)).toBe(chart)
    expect(chart.getOption().series).toEqual([
      expect.objectContaining({ data: [70, 80, 90] }),
    ])
    await view.unmount()
  } finally {
    spy.mockRestore()
  }
})
