import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { ForgotPasswordForm } from './forgot-password-form'

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  notices: { error: vi.fn(), success: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: state.notices }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => state.navigate }))
vi.mock('../../use-auth-policy', () => ({
  useAuthPolicy: () => ({
    data: { recovery_enabled: true },
    isPending: false,
    isError: false,
  }),
}))

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', window.location.pathname)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', window.location.pathname)
  })

  it('blocks an empty email without sending a request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const view = await render(<ForgotPasswordForm />)
    await userEvent.click(
      view.getByRole('button', { name: 'Reset password', exact: true })
    )
    await expect
      .element(view.getByLabelText('Email', { exact: true }))
      .toBeInvalid()
    expect(fetch).not.toHaveBeenCalled()
    expect(state.navigate).not.toHaveBeenCalled()
  })

  it('requests an email and confirms the token before returning to sign in', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    const view = await render(<ForgotPasswordForm />)
    await userEvent.fill(
      view.getByLabelText('Email', { exact: true }),
      'reader@example.invalid'
    )
    await userEvent.click(
      view.getByRole('button', { name: 'Reset password', exact: true })
    )
    await expect
      .element(view.getByLabelText('Verification token'))
      .toBeVisible()
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/auth/password-reset')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      email: 'reader@example.invalid',
    })
    expect(state.navigate).not.toHaveBeenCalled()
    const token = 'a'.repeat(43)
    await userEvent.fill(view.getByLabelText('Verification token'), token)
    await userEvent.fill(
      view.getByLabelText('New password', { exact: true }),
      'replacement-password'
    )
    await userEvent.click(
      view.getByRole('button', { name: 'Reset password', exact: true })
    )
    await vi.waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith({ to: '/sign-in' })
    )
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/auth/password-reset/confirm')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      token,
      new_password: 'replacement-password',
    })
  })

  it('preserves the email when the request fails', async () => {
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
    const view = await render(<ForgotPasswordForm />)
    await userEvent.fill(
      view.getByLabelText('Email', { exact: true }),
      'reader@example.invalid'
    )
    await userEvent.click(
      view.getByRole('button', { name: 'Reset password', exact: true })
    )
    await vi.waitFor(() => expect(state.notices.error).toHaveBeenCalled())
    expect(state.notices.success).not.toHaveBeenCalled()
    await expect
      .element(view.getByLabelText('Email', { exact: true }))
      .toHaveValue('reader@example.invalid')
    expect(state.navigate).not.toHaveBeenCalled()
  })

  it('opens email links at confirmation and rejects malformed or expired tokens', async () => {
    window.history.replaceState(null, '', window.location.pathname + '#confirm')
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'identity.invalid', message: 'Expired token' } },
          { status: 400 }
        )
      )
    vi.stubGlobal('fetch', fetch)
    const view = await render(<ForgotPasswordForm />)
    await userEvent.fill(view.getByLabelText('Verification token'), '123456')
    await userEvent.fill(
      view.getByLabelText('New password', { exact: true }),
      'replacement-password'
    )
    await userEvent.click(
      view.getByRole('button', { name: 'Reset password', exact: true })
    )
    await expect
      .element(view.getByLabelText('Verification token'))
      .toBeInvalid()
    expect(fetch).not.toHaveBeenCalled()
    await userEvent.fill(
      view.getByLabelText('Verification token'),
      'a'.repeat(43)
    )
    await userEvent.click(
      view.getByRole('button', { name: 'Reset password', exact: true })
    )
    await vi.waitFor(() => expect(state.notices.error).toHaveBeenCalled())
    expect(state.navigate).not.toHaveBeenCalled()
    expect(state.notices.success).not.toHaveBeenCalled()
  })
})
