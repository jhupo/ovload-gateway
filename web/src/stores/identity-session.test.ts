import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CustomerProfile,
  IdentitySession,
  ManagementProfile,
  PermissionGrant,
} from '@/api/types'
import { restoreBrowserSession, useIdentitySession } from './identity-session'

const session: IdentitySession = {
  id: 'session-a',
  audience: 'customer',
  tenant_id: 'tenant-a',
  user_id: 'user-a',
  principal_id: null,
  expires_at: '2099-01-01T00:00:00Z',
  csrf_token: 'synthetic-csrf',
}
const profile: CustomerProfile = {
  id: 'user-a',
  tenant_id: 'tenant-a',
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

describe('identity session lifecycle', () => {
  beforeEach(() => {
    useIdentitySession.getState().clear()
    useIdentitySession.getState().setSession(session)
    useIdentitySession.getState().setProfile(profile)
  })
  afterEach(() => {
    localStorage.removeItem('ovload.last-audience')
    vi.unstubAllGlobals()
    useIdentitySession.getState().clear()
  })

  it('expires the current owner once and fences old failures after a new sign-in', () => {
    const ended: string[] = []
    const unsubscribe = useIdentitySession.subscribe((state, previous) => {
      if (previous.session && !state.session) ended.push(previous.session.id)
    })
    expect(useIdentitySession.getState().invalidateSession(session.id)).toBe(
      true
    )
    expect(useIdentitySession.getState().invalidateSession(session.id)).toBe(
      false
    )
    expect(useIdentitySession.getState()).toMatchObject({
      session: null,
      profile: null,
      grants: [],
      sessionExpired: true,
    })
    useIdentitySession.getState().setSession({ ...session, id: 'session-b' })
    expect(useIdentitySession.getState().invalidateSession(session.id)).toBe(
      false
    )
    expect(useIdentitySession.getState().session?.id).toBe('session-b')
    expect(ended).toEqual(['session-a'])
    unsubscribe()
  })

  it('distinguishes explicit sign-out from session expiry', () => {
    useIdentitySession.getState().clear()
    expect(useIdentitySession.getState()).toMatchObject({
      session: null,
      profile: null,
      grants: [],
      sessionExpired: false,
    })
  })

  it('restores a persisted customer cookie after an expired management cookie', async () => {
    useIdentitySession.getState().clear()
    localStorage.removeItem('ovload.last-audience')
    const fetch = vi.fn((url: string) =>
      Promise.resolve(
        url.includes('/admin/')
          ? Response.json(
              { code: 'identity.unauthorized', message: 'Expired' },
              { status: 401 }
            )
          : Response.json(url.endsWith('/session') ? session : profile)
      )
    )
    vi.stubGlobal('fetch', fetch)
    await expect(restoreBrowserSession()).resolves.toEqual(session)
    expect(useIdentitySession.getState().profile).toEqual(profile)
    expect(fetch.mock.calls[0][0]).toContain('/admin/v1/session')
    expect(localStorage.getItem('ovload.last-audience')).toBe('customer')
  })

  it('does not hide a server failure as an expired login', async () => {
    useIdentitySession.getState().clear()
    const fetch = vi.fn(() =>
      Promise.resolve(
        Response.json(
          { code: 'identity.unavailable', message: 'Unavailable' },
          { status: 503 }
        )
      )
    )
    vi.stubGlobal('fetch', fetch)
    await expect(restoreBrowserSession()).rejects.toMatchObject({ status: 503 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(useIdentitySession.getState().session).toBeNull()
  })

  it('returns to login only after neither audience has a valid cookie', async () => {
    useIdentitySession.getState().clear()
    const fetch = vi.fn(() =>
      Promise.resolve(
        Response.json(
          { code: 'identity.unauthorized', message: 'Expired' },
          { status: 401 }
        )
      )
    )
    vi.stubGlobal('fetch', fetch)
    await expect(restoreBrowserSession()).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(useIdentitySession.getState().session).toBeNull()
  })

  it('keeps existing profile visible while restoring the same owner', async () => {
    let resolveProfile!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.endsWith('/session')
          ? Promise.resolve(Response.json(session))
          : new Promise<Response>((resolve) => {
              resolveProfile = resolve
            })
      )
    )
    const restore = useIdentitySession.getState().restore('customer')
    await vi.waitFor(() => expect(resolveProfile).toBeTypeOf('function'))
    expect(useIdentitySession.getState().profile).toBe(profile)
    resolveProfile(Response.json({ ...profile, display_name: 'Updated name' }))
    await restore
    expect(useIdentitySession.getState().profile).toMatchObject({
      display_name: 'Updated name',
    })
  })

  it('does not restore old profile data after the owner changed', async () => {
    let resolveProfile!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveProfile = resolve
          })
      )
    )
    const refresh = useIdentitySession.getState().refreshProfile()
    useIdentitySession
      .getState()
      .setSession({ ...session, id: 'session-b', user_id: 'user-b' })
    resolveProfile(Response.json(profile))
    await refresh
    expect(useIdentitySession.getState().session?.id).toBe('session-b')
    expect(useIdentitySession.getState().profile).toBeNull()
  })

  it('keeps management permissions visible until the full verified snapshot commits', async () => {
    const management: IdentitySession = {
      ...session,
      audience: 'management',
      tenant_id: null,
      user_id: null,
      principal_id: 'principal-a',
    }
    const operator: ManagementProfile = {
      id: 'principal-a',
      username: 'synthetic-operator',
      status: 'active',
      revision: 1,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    }
    const grant: PermissionGrant = {
      id: 'grant-a',
      principal_id: operator.id,
      scope: 'platform',
      tenant_id: null,
      permissions: ['usage.read'],
      status: 'active',
      expires_at: null,
      revision: 1,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    }
    useIdentitySession.getState().setSession(management)
    useIdentitySession.setState({ profile: operator, grants: [grant] })
    let resolveProfile!: (response: Response) => void
    let resolvePermissions!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/session'))
          return Promise.resolve(Response.json(management))
        return new Promise<Response>((resolve) => {
          if (url.endsWith('/profile')) resolveProfile = resolve
          else resolvePermissions = resolve
        })
      })
    )
    const snapshots: { profile: unknown; grants: PermissionGrant[] }[] = []
    const unsubscribe = useIdentitySession.subscribe((state) => {
      snapshots.push({ profile: state.profile, grants: state.grants })
    })
    try {
      const restore = useIdentitySession.getState().restore('management')
      await vi.waitFor(() => expect(resolvePermissions).toBeTypeOf('function'))
      expect(useIdentitySession.getState().grants).toEqual([grant])
      expect(snapshots).toEqual([])
      const updated = { ...operator, revision: 2 }
      resolveProfile(Response.json(updated))
      expect(useIdentitySession.getState().profile).toBe(operator)
      resolvePermissions(Response.json({ items: [] }))
      await restore
      expect(snapshots).toEqual([{ profile: updated, grants: [] }])
      expect(useIdentitySession.getState().grants).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it('rejects a restored profile belonging to a different owner without publishing it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          Response.json(
            url.endsWith('/session')
              ? session
              : { ...profile, id: 'user-b', tenant_id: 'tenant-b' }
          )
        )
      )
    )
    await expect(
      useIdentitySession.getState().restore('customer')
    ).rejects.toThrow('Invalid session owner')
    expect(useIdentitySession.getState().profile).toBe(profile)
    expect(useIdentitySession.getState().session).toBe(session)
  })
})
