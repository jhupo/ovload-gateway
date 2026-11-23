import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { ensureStepUp } from '@/api/step-up'
import { StepUpProvider } from './security-step-up'

vi.mock('@/api/session-port', () => ({
  sessionPort: () => ({
    getSession: () => ({
      id: 'management-session',
      audience: 'management',
      csrf_token: 'test-csrf',
    }),
  }),
}))

afterEach(() => vi.unstubAllGlobals())

test('one verification resumes two operations challenged in the same session', async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetch)
  const screen = await render(<StepUpProvider>Management</StepUpProvider>)

  const operations = Promise.all([ensureStepUp(), ensureStepUp()])
  await screen.getByLabelText('登录密码').fill('test-password')
  await screen.getByRole('button', { name: '验证并继续' }).click()

  await operations
  expect(fetch).toHaveBeenCalledTimes(1)
})
