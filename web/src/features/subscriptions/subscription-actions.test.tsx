import { expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import i18n from '@/i18n'
import { newPlan, type Subscription } from './data'
import { Subscriptions } from './index'
import '@/styles/index.css'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  getRouteApi: () => ({
    useSearch: () => ({ query: '', status: 'all', plan: 'all' }),
    useNavigate: () => () => {},
  }),
}))

vi.mock('@/components/layout/header', () => ({ Header: () => null }))
vi.mock('@/components/profile-dropdown', () => ({ ProfileDropdown: () => null }))

const plan = { ...newPlan(), id: 'plan-test', name: 'Standard', dailyCents: 100 }
const record: Subscription = {
  id: 'subscription-test',
  userId: 'test-user',
  plan,
  start: '2020-01-01T00:00:00Z',
  end: '2099-01-01T00:00:00Z',
  dailyUsed: 0,
  weeklyUsed: 0,
  monthlyUsed: 0,
  revoked: false,
  notes: '',
}

vi.mock('@/hooks/use-commerce-page', () => ({
  useCommercePage: () => ({
    plans: [plan],
    records: [record],
    users: [{ id: 'test-user', username: 'Sample', email: '', status: 'active' }],
    ready: true,
    busy: false,
    tableState: {
      pagination: { pageIndex: 0, pageSize: 50 },
      sorting: [],
      onPaginationChange: () => {},
      onSortingChange: () => {},
      total: 1,
    },
  }),
}))

test('subscription actions remain clickable across quota clock updates', async () => {
  await i18n.changeLanguage('en')
  const screen = await render(<Subscriptions />)
  const trigger = screen.getByRole('button', {
    name: i18n.t('subscriptions.actionsFor', { name: 'Sample' }),
  })
  for (const action of ['adjust', 'reset', 'revoke']) {
    await userEvent.click(trigger)
    const item = screen.getByRole('menuitem', {
      name: i18n.t(`subscriptions.${action}`),
    })
    if (action === 'adjust') {
      await new Promise((resolve) => setTimeout(resolve, 2100))
    }
    await userEvent.click(item)
    const dialog = screen.getByRole(action === 'adjust' ? 'dialog' : 'alertdialog')
    await expect.element(dialog).toBeVisible()
    await userEvent.click(dialog.getByRole('button', { name: /cancel/i }))
    await expect.element(dialog).not.toBeInTheDocument()
  }
})
