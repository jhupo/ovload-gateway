import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdentitySession } from '@/stores/identity-session'
import { apiRequest } from './client'
import { platformRequest } from './platform-client'
import type { IdentitySession } from './types'

const customer: IdentitySession = {
  id: 'session-a',
  audience: 'customer',
  tenant_id: 'tenant-a',
  user_id: 'user-a',
  principal_id: null,
  expires_at: '2099-01-01T00:00:00Z',
  csrf_token: 'synthetic-csrf',
}
function unauthorized() {
  return Response.json(
    { error: { code: 'identity.unauthorized' } },
    { status: 401 }
  )
}

describe('API session invalidation', () => {
  beforeEach(() => useIdentitySession.getState().setSession(customer))
  afterEach(() => {
    vi.unstubAllGlobals()
    useIdentitySession.getState().clear()
  })

  it.each([
    { path: '/api-keys', method: 'POST' as const },
    { path: '/auth/session', method: 'DELETE' as const },
  ])('expires an owned mutation failure at $path', async ({ path, method }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(unauthorized()))
    )
    await expect(
      apiRequest('customer', path, { method })
    ).rejects.toMatchObject({ status: 401 })
    expect(useIdentitySession.getState()).toMatchObject({
      session: null,
      sessionExpired: true,
    })
  })

  it('does not invalidate an active session for a public sign-in rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(unauthorized()))
    )
    await expect(
      apiRequest('customer', '/auth/sessions', { method: 'POST', public: true })
    ).rejects.toMatchObject({ status: 401 })
    expect(useIdentitySession.getState().session).toEqual(customer)
  })

  it('invalidates a 401 even when its error body is malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('{', {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      )
    )
    await expect(
      apiRequest('customer', '/api-keys', { method: 'POST' })
    ).rejects.toThrow()
    expect(useIdentitySession.getState()).toMatchObject({
      session: null,
      sessionExpired: true,
    })
  })

  it('expires an owned platform mutation failure', async () => {
    useIdentitySession
      .getState()
      .setSession({
        ...customer,
        audience: 'management',
        user_id: null,
        tenant_id: null,
        principal_id: 'operator-a',
      })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(unauthorized()))
    )
    await expect(
      platformRequest('/accounts', { method: 'POST' })
    ).rejects.toMatchObject({ status: 401 })
    expect(useIdentitySession.getState()).toMatchObject({
      session: null,
      sessionExpired: true,
    })
  })

  it('reads the top-level management error envelope', async () => {
    useIdentitySession.getState().setSession({
      ...customer,
      audience: 'management',
      user_id: null,
      tenant_id: null,
      principal_id: 'operator-a',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            { code: 40001, errorKey: 'admin.bad_request', params: {}, data: null },
            { status: 400 }
          )
        )
      )
    )
    await expect(apiRequest('management', '/settings')).rejects.toMatchObject({
      status: 400,
      code: '40001',
    })
  })

  it('keeps a newer session when an old request receives 401', async () => {
    let finish!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          })
      )
    )
    const pending = apiRequest('customer', '/api-keys', { method: 'POST' })
    const newer = { ...customer, id: 'session-b' }
    useIdentitySession.getState().setSession(newer)
    finish(unauthorized())
    await expect(pending).rejects.toMatchObject({
      status: 401,
      sessionId: customer.id,
    })
    expect(useIdentitySession.getState().session).toEqual(newer)
    expect(useIdentitySession.getState().sessionExpired).toBe(false)
  })

  it('expires a current session with missing CSRF before dispatch', async () => {
    useIdentitySession
      .getState()
      .setSession({ ...customer, csrf_token: undefined })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(
      apiRequest('customer', '/auth/session', { method: 'DELETE' })
    ).rejects.toMatchObject({ status: 401 })
    expect(fetch).not.toHaveBeenCalled()
    expect(useIdentitySession.getState().sessionExpired).toBe(true)
  })

  it('fences platform 401 responses by the initiating management session', async () => {
    const management: IdentitySession = {
      ...customer,
      audience: 'management',
      user_id: null,
      tenant_id: null,
      principal_id: 'operator-a',
    }
    useIdentitySession.getState().setSession(management)
    let finish!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          })
      )
    )
    const pending = platformRequest('/accounts', { method: 'POST' })
    const newer = { ...management, id: 'session-b' }
    useIdentitySession.getState().setSession(newer)
    finish(unauthorized())
    await expect(pending).rejects.toMatchObject({ status: 401 })
    expect(useIdentitySession.getState().session).toEqual(newer)
  })
})
