import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Progress } from './progress'

test('preserves the default progress appearance and accessible value', async () => {
  const screen = await render(<Progress value={31} aria-label='Usage' />)
  await expect
    .element(screen.getByRole('progressbar', { name: 'Usage' }))
    .toHaveAttribute('aria-valuenow', '31')
  expect(
    screen.container
      .querySelector('[data-slot=progress-indicator]')
      ?.classList.contains('bg-primary')
  ).toBe(true)
})

test('provides reusable success, warning, and destructive progress tones', async () => {
  const screen = await render(
    <>
      <Progress tone='success' value={31} aria-label='Normal usage' />
      <Progress tone='warning' value={84} aria-label='High usage' />
      <Progress tone='destructive' value={100} aria-label='Exhausted usage' />
    </>
  )
  const indicators = screen.container.querySelectorAll(
    '[data-slot=progress-indicator]'
  )
  expect(indicators[0].classList.contains('bg-emerald-500')).toBe(true)
  expect(indicators[1].classList.contains('bg-amber-500')).toBe(true)
  expect(indicators[2].classList.contains('bg-destructive')).toBe(true)
  await expect
    .element(screen.getByRole('progressbar', { name: 'Exhausted usage' }))
    .toHaveAttribute('aria-valuenow', '100')
})
