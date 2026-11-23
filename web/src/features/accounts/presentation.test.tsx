import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import type { UpstreamAccount } from '@/api/upstream-accounts'
import { AccountQuotaCell, QuotaWindows } from './presentation'

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

test('keeps extra reported quota windows in the table summary popover', async () => {
  const screen = await render(
    <AccountQuotaCell
      account={{
        authenticationKind: 'oauth',
        quota: {
          ...quota,
          windows: [
            ...quota.windows,
            {
              key: 'monthly',
              windowSeconds: 2_592_000,
              labelDisplay: '月额度',
              usedPercent: 18,
              resetAtDisplay: '2026-12-21 22:39:39',
            },
          ],
        },
      }}
    />
  )
  const summary = screen.getByRole('button', { name: /shared quota/i })
  await expect.element(screen.getByText('100%', { exact: true })).toBeVisible()
  await expect.element(summary).toHaveAttribute('aria-expanded', 'false')
  expect(screen.container.querySelectorAll('[role=progressbar]')).toHaveLength(2)

  await userEvent.click(summary)

  const details = screen.getByRole('dialog')
  await expect.element(summary).toHaveAttribute('aria-expanded', 'true')
  await expect.element(details.getByText('5H', { exact: true })).toBeVisible()
  await expect.element(details.getByText('7D', { exact: true })).toBeVisible()
  await expect
    .element(details.getByRole('progressbar', { name: /5小时额度/ }))
    .toHaveAttribute('aria-valuenow', '100')
  await expect
    .element(details.getByRole('progressbar', { name: /周额度/ }))
    .toHaveAttribute('aria-valuenow', '31')
  await expect
    .element(details.getByRole('progressbar', { name: /月额度/ }))
    .toHaveAttribute('aria-valuenow', '18')
  await expect
    .element(details.getByText('2026-11-19 01:31:36'))
    .toBeVisible()
  await expect
    .element(details.getByText('2026-11-21 22:39:39'))
    .toBeVisible()
  await expect
    .element(details.getByText('1日额度', { exact: true }))
    .not.toBeInTheDocument()
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
