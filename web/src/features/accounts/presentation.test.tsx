import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import type { UpstreamAccount } from '@/api/upstream-accounts'
import { QuotaWindows } from './presentation'

// The server returns both windows as shortTerm; duration establishes their order.
const quota: UpstreamAccount['quota'] = {
  refreshedAt: '2026-11-18T15:00:00Z',
  refreshedAtRelative: null,
  credits: null,
  windows: [
    {
      key: 'weekly',
      group: 'shortTerm',
      windowSeconds: 604_800,
      labelDisplay: '周额度',
      usedPercent: 31,
      resetAtDisplay: '2026-11-21 22:39:39',
    },
    {
      key: 'five-hour',
      group: 'shortTerm',
      windowSeconds: 18_000,
      labelDisplay: '5小时额度',
      usedPercent: 100,
      resetAtDisplay: '2026-11-19 01:31:36',
    },
  ],
}

test('renders both real quota percentages and reset times in the usage detail', async () => {
  const screen = await render(<QuotaWindows account={{ quota }} columns />)
  await expect
    .element(screen.getByRole('progressbar', { name: /5小时额度/ }))
    .toHaveAttribute('aria-valuenow', '100')
  await expect
    .element(screen.getByRole('progressbar', { name: /周额度/ }))
    .toHaveAttribute('aria-valuenow', '31')
  await expect.element(screen.getByText('100%', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('31%', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('2026-11-19 01:31:36')).toBeVisible()
  await expect.element(screen.getByText('2026-11-21 22:39:39')).toBeVisible()
  const progress = screen.container.querySelectorAll('[role=progressbar]')
  expect(progress[0].getAttribute('aria-label')).toContain('5小时额度')
  expect(progress[1].getAttribute('aria-label')).toContain('周额度')
})

test('shows both windows in a compact table cell without creating a daily limit', async () => {
  const screen = await render(<QuotaWindows account={{ quota }} compact />)
  await expect
    .element(screen.getByText('5小时额度', { exact: true }))
    .toBeVisible()
  await expect
    .element(screen.getByText('周额度', { exact: true }))
    .toBeVisible()
  expect(screen.container.textContent).not.toContain('1日额度')
  expect(
    screen.container.querySelector('[title]')?.getAttribute('title')
  ).toContain('2026-11-19 01:31:36')
})

test('keeps unavailable usage indeterminate rather than claiming zero percent', async () => {
  const screen = await render(
    <QuotaWindows
      account={{
        quota: {
          ...quota,
          windows: [{ ...quota.windows[0], usedPercent: null }],
        },
      }}
    />
  )
  await expect
    .element(screen.getByRole('progressbar', { name: /周额度/ }))
    .not.toHaveAttribute('aria-valuenow')
  await expect
    .element(screen.getByRole('progressbar', { name: /周额度/ }))
    .toHaveAttribute('aria-valuetext', 'Unknown')
  expect(screen.container.textContent).not.toContain('0%')
})
