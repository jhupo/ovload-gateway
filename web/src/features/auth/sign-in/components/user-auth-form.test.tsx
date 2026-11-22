import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { useIdentitySession } from '@/stores/identity-session'
import { UserAuthForm } from './user-auth-form'

const errorToast = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
vi.mock('../../use-auth-policy', () => ({
  useAuthPolicy: () => ({
    data: {
      supports_consent: true,
      revision: 1,
      agreement: { enabled: false },
      oauth_providers: [],
    },
    isPending: false,
    isError: false,
  }),
}))
// The auth form tests exercise credentials; the external challenge has its own requests.
vi.mock('@/lib/human-verification', () => ({
  consumeHumanToken: () => '',
  resetHumanVerification: vi.fn(),
}))
vi.mock('@/features/auth/human-verification', () => ({
  HumanVerification: () => null,
  consumeHumanToken: () => '',
  resetHumanVerification: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: errorToast, dismiss: vi.fn() } }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string
    children: React.ReactNode
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const session = {
  id: 'synthetic-session',
  audience: 'customer',
  tenant_id: 'synthetic-tenant',
  user_id: 'synthetic-user',
  principal_id: null,
  expires_at: '2099-01-01T00:00:00Z',
  csrf_token: 'synthetic-csrf',
}
async function screen() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <UserAuthForm />
    </QueryClientProvider>
  )
}

describe('UserAuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useIdentitySession.getState().clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    useIdentitySession.getState().clear()
  })

  it('validates unified credentials before dispatch and exposes recovery', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const view = await screen()
    await userEvent.click(view.getByRole('button', { name: /^Sign in$/i }))
    await vi.waitFor(() => expect(errorToast).toHaveBeenCalled())
    await expect
      .element(view.getByRole('textbox', { name: 'Email or username' }))
      .toHaveFocus()
    expect(fetch).not.toHaveBeenCalled()
    await expect
      .element(view.getByRole('link', { name: /Forgot password/i }))
      .toHaveAttribute('href', '/forgot-password')
    await expect
      .element(view.getByRole('tab', { name: 'Operator' }))
      .not.toBeInTheDocument()
  })

  it('uses actual session and profile responses before entering the customer workspace', async () => {
    const fetch = vi.fn((url: string) =>
      Promise.resolve(
        Response.json(
          url.endsWith('/auth/sessions')
            ? session
            : {
                id: session.user_id,
                tenant_id: session.tenant_id,
                display_name: 'Synthetic customer',
                revision: 1,
              }
        )
      )
    )
    vi.stubGlobal('fetch', fetch)
    const view = await screen()
    await userEvent.fill(
      view.getByRole('textbox', { name: 'Email or username' }),
      'synthetic@example.invalid'
    )
    await userEvent.fill(
      view.getByLabelText('Password', { exact: true }),
      'synthetic-password'
    )
    await userEvent.click(view.getByRole('button', { name: /^Sign in$/i }))
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/user/dashboard',
        replace: true,
      })
    )
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/auth/sessions',
      '/api/v1/profile',
    ])
    expect(useIdentitySession.getState().session).toEqual(session)
    expect(useIdentitySession.getState().profile).toMatchObject({
      display_name: 'Synthetic customer',
    })
    expect(errorToast).not.toHaveBeenCalled()
  })

  it('uses the returned management audience to load permissions and enter its workspace', async () => {
    const management = {
      ...session,
      audience: 'management',
      tenant_id: null,
      user_id: null,
      principal_id: 'synthetic-operator',
    }
    const fetch = vi.fn((url: string) =>
      Promise.resolve(
        Response.json(
          url.endsWith('/auth/sessions')
            ? management
            : url.endsWith('/session/permissions')
              ? {
                  items: [
                    {
                      principal_id: management.principal_id,
                      scope: 'platform',
                      status: 'active',
                      expires_at: null,
                      permissions: ['usage.read'],
                    },
                  ],
                }
              : { id: management.principal_id, username: 'synthetic-operator' }
        )
      )
    )
    vi.stubGlobal('fetch', fetch)
    const view = await screen()
    await userEvent.fill(
      view.getByRole('textbox', { name: 'Email or username' }),
      'synthetic-operator'
    )
    await userEvent.fill(
      view.getByLabelText('Password', { exact: true }),
      'synthetic-password'
    )
    await userEvent.click(view.getByRole('button', { name: /^Sign in$/i }))
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/dashboard',
        replace: true,
      })
    )
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/auth/sessions',
      '/api/admin/v1/profile',
      '/api/admin/v1/session/permissions',
    ])
    expect(useIdentitySession.getState().session).toEqual(management)
  })

  it('never turns an authentication rejection into preview access', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            { error: { code: 'identity.unauthorized' } },
            { status: 401 }
          )
        )
      )
    )
    const view = await screen()
    await userEvent.fill(
      view.getByRole('textbox', { name: 'Email or username' }),
      'synthetic@example.invalid'
    )
    await userEvent.fill(
      view.getByLabelText('Password', { exact: true }),
      'synthetic-password'
    )
    await userEvent.click(view.getByRole('button', { name: /^Sign in$/i }))
    await vi.waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith(
        i18n.t('auth.invalid_credentials'),
        { id: 'sign-in-error' }
      )
    )
    expect(useIdentitySession.getState().session).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })
})
