import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { SignUpForm } from './sign-up-form'

const state = vi.hoisted(() => ({
  verification: false,
  notices: { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() },
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
vi.mock('sonner', () => ({ toast: state.notices }))
vi.mock('../../use-auth-policy', () => ({
  useAuthPolicy: () => ({
    data: {
      registration_enabled: true,
      verification_required: state.verification,
      supports_consent: true,
      revision: 1,
      agreement: { enabled: false },
      oauth_providers: [],
    },
    isPending: false,
    isError: false,
  }),
}))

async function registration() {
  const view = await render(<SignUpForm />)
  await userEvent.fill(view.getByLabelText('Display name'), 'Reader')
  await userEvent.fill(
    view.getByLabelText('Email', { exact: true }),
    'reader@example.invalid'
  )
  await userEvent.fill(
    view.getByLabelText('Password', { exact: true }),
    'example-password'
  )
  await userEvent.fill(
    view.getByLabelText('Confirm Password', { exact: true }),
    'example-password'
  )
  return view
}

describe('SignUpForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.verification = false
    window.history.replaceState(null, '', window.location.pathname)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('validates fields before sending a registration request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const view = await render(<SignUpForm />)
    await userEvent.click(
      view.getByRole('button', { name: 'Register', exact: true })
    )
    await vi.waitFor(() => expect(state.notices.error).toHaveBeenCalled())
    expect(fetch).not.toHaveBeenCalled()
    await expect.element(view.getByLabelText('Display name')).toHaveFocus()
  })

  it('rejects mismatched passwords before dispatch', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const view = await registration()
    await userEvent.fill(
      view.getByLabelText('Confirm Password', { exact: true }),
      'different-password'
    )
    await userEvent.click(
      view.getByRole('button', { name: 'Register', exact: true })
    )
    await vi.waitFor(() =>
      expect(state.notices.error).toHaveBeenCalledWith(
        "Passwords don't match.",
        expect.any(Object)
      )
    )
    expect(fetch).not.toHaveBeenCalled()
    await expect
      .element(view.getByLabelText('Confirm Password', { exact: true }))
      .toHaveFocus()
  })

  it('submits the backend contract and clears passwords after acceptance', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({}, { status: 202 }))
    vi.stubGlobal('fetch', fetch)
    const view = await registration()
    await userEvent.click(
      view.getByRole('button', { name: 'Register', exact: true })
    )
    await vi.waitFor(() =>
      expect(state.notices.success).toHaveBeenCalledWith('Request accepted')
    )
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/auth/registrations')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      email: 'reader@example.invalid',
      display_name: 'Reader',
      password: 'example-password',
      consent_revision: null,
    })
    await expect
      .element(view.getByLabelText('Password', { exact: true }))
      .toHaveValue('')
    await expect
      .element(view.getByRole('heading', { name: 'Verify your email' }))
      .not.toBeInTheDocument()
  })

  it('uses the emailed token when verification is required', async () => {
    state.verification = true
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    const view = await registration()
    await userEvent.click(
      view.getByRole('button', { name: 'Register', exact: true })
    )
    await expect
      .element(view.getByRole('heading', { name: 'Verify your email' }))
      .toBeVisible()
    await userEvent.fill(view.getByLabelText('Verification token'), '123456')
    await userEvent.click(
      view.getByRole('button', { name: 'Verify', exact: true })
    )
    await vi.waitFor(() => expect(state.notices.error).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledTimes(1)
    const token = 'a'.repeat(43)
    await userEvent.fill(view.getByLabelText('Verification token'), token)
    await userEvent.click(
      view.getByRole('button', { name: 'Verify', exact: true })
    )
    await expect
      .element(view.getByLabelText('Email', { exact: true }))
      .toBeVisible()
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/auth/registrations/verify')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ token })
  })

  it('keeps registration fields available when the server rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'identity.unavailable', message: 'Unavailable' } },
            { status: 503 }
          )
        )
    )
    const view = await registration()
    await userEvent.click(
      view.getByRole('button', { name: 'Register', exact: true })
    )
    await vi.waitFor(() => expect(state.notices.error).toHaveBeenCalled())
    expect(state.notices.success).not.toHaveBeenCalled()
    await expect
      .element(view.getByLabelText('Password', { exact: true }))
      .toHaveValue('example-password')
  })
})
