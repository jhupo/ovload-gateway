import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import type { CustomerProfile, IdentitySession } from '@/api/types'
import { useIdentitySession } from '@/stores/identity-session'
import { ProfileForm } from './profile-form'

vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => ({ status: 'idle' }),
}))
vi.mock('./profile-summary', () => ({ ProfileSummary: () => null }))

const session: IdentitySession = {
  id: 'synthetic-session',
  audience: 'customer',
  tenant_id: 'synthetic-tenant',
  user_id: 'synthetic-user',
  principal_id: null,
  expires_at: '2099-01-01T00:00:00Z',
  csrf_token: 'synthetic-csrf',
}
const profile: CustomerProfile = {
  id: 'synthetic-user',
  tenant_id: 'synthetic-tenant',
  display_name: 'Synthetic customer',
  email: 'synthetic@example.invalid',
  status: 'active',
  revision: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  max_concurrency: 4,
  requests_per_minute: 60,
  customer_max_concurrency: 4,
  customer_requests_per_minute: 60,
  email_verified_at: null,
}
async function screen() {
  return render(<ProfileForm />)
}

describe('profile editing', () => {
  beforeEach(() => {
    useIdentitySession.getState().setSession(session)
    useIdentitySession.getState().setProfile(profile)
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({ ...profile, display_name: 'Refreshed name' })
        )
      )
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    useIdentitySession.getState().clear()
  })

  it('keeps nickname and password drafts when an owned profile refresh completes', async () => {
    const view = await screen()
    await userEvent.fill(
      view.getByLabelText('Display name'),
      'Unsaved nickname'
    )
    await userEvent.fill(
      view.getByLabelText('Current password', { exact: true }),
      'synthetic-current'
    )
    await userEvent.fill(
      view.getByLabelText('New password', { exact: true }),
      'synthetic-new-password'
    )
    await userEvent.fill(
      view.getByLabelText('Confirm password', { exact: true }),
      'synthetic-new-password'
    )
    await useIdentitySession.getState().refreshProfile()
    await expect.element(view.getByLabelText('Display name')).toBeEnabled()
    await expect
      .element(view.getByLabelText('Display name'))
      .toHaveValue('Unsaved nickname')
    await expect
      .element(view.getByLabelText('Current password', { exact: true }))
      .toHaveValue('synthetic-current')
    await expect
      .element(view.getByLabelText('New password', { exact: true }))
      .toHaveValue('synthetic-new-password')
    await expect
      .element(view.getByLabelText('Confirm password', { exact: true }))
      .toHaveValue('synthetic-new-password')
    await expect
      .element(view.getByRole('button', { name: 'Save', exact: true }))
      .toBeEnabled()
  })

  it('follows refreshed profile names when no nickname draft exists', async () => {
    const view = await screen()
    await useIdentitySession.getState().refreshProfile()
    await expect
      .element(view.getByLabelText('Display name'))
      .toHaveValue('Refreshed name')
    await expect
      .element(view.getByRole('button', { name: 'Save', exact: true }))
      .toBeDisabled()
  })

  it('disables profile security writes until an owned profile mutation finishes', async () => {
    let finish!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: RequestInit) =>
        options?.method === 'PATCH'
          ? new Promise<Response>((resolve) => {
              finish = resolve
            })
          : Promise.resolve(Response.json(profile))
      )
    )
    const view = await screen()
    await userEvent.fill(view.getByLabelText('Display name'), 'Saved nickname')
    await userEvent.click(
      view.getByRole('button', { name: 'Save', exact: true })
    )
    await expect.element(view.getByLabelText('Display name')).toBeDisabled()
    await expect
      .element(view.getByRole('button', { name: 'Save', exact: true }))
      .toBeDisabled()
    await expect
      .element(view.getByLabelText('Current password', { exact: true }))
      .toBeDisabled()
    await expect
      .element(view.getByLabelText('New password', { exact: true }))
      .toBeDisabled()
    finish(
      Response.json({ ...profile, display_name: 'Saved nickname', revision: 2 })
    )
    await expect.element(view.getByLabelText('Display name')).toBeEnabled()
    await expect
      .element(view.getByLabelText('Current password', { exact: true }))
      .toBeEnabled()
    await expect
      .element(view.getByRole('button', { name: 'Save', exact: true }))
      .toBeDisabled()
  })

  it('discards the previous owner drafts when the authenticated principal changes', async () => {
    const view = await screen()
    await userEvent.fill(view.getByLabelText('Display name'), 'Private draft')
    await userEvent.fill(
      view.getByLabelText('Current password', { exact: true }),
      'synthetic-current'
    )
    useIdentitySession.getState().setSession({
      ...session,
      id: 'another-session',
      user_id: 'another-user',
    })
    useIdentitySession.getState().setProfile({
      ...profile,
      id: 'another-user',
      display_name: 'Another customer',
    })
    await expect
      .element(view.getByLabelText('Display name'))
      .toHaveValue('Another customer')
    await expect
      .element(view.getByLabelText('Current password', { exact: true }))
      .toHaveValue('')
  })
})
