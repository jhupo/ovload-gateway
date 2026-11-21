import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdentitySession } from '@/stores/identity-session'
import { proxies, type ProxyRecord } from './proxies'

describe('proxy API conditional writes', () => {
  beforeEach(() =>
    useIdentitySession
      .getState()
      .setSession({
        id: 'operator-session',
        audience: 'management',
        tenant_id: null,
        user_id: null,
        principal_id: 'operator',
        expires_at: '2099-01-01T00:00:00Z',
        csrf_token: 'synthetic-csrf',
      })
  )
  afterEach(() => {
    vi.unstubAllGlobals()
    useIdentitySession.getState().clear()
  })

  it('sends the observed revision without resending saved credentials', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        Response.json({ code: 200, data: { configRevision: 42 } })
      )
    )
    vi.stubGlobal('fetch', fetch)
    await proxies.update({ id: 'proxy-id', revision: 9 } as ProxyRecord, {
      name: 'Renamed',
      enabled: false,
    })
    const [path, options] = fetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(path).toBe('/api/admin/proxies/update')
    expect(JSON.parse(String(options.body))).toEqual({
      id: 'proxy-id',
      revision: 9,
      name: 'Renamed',
      enabled: false,
    })
    expect(new Headers(options.headers).get('X-CSRF-Token')).toBe(
      'synthetic-csrf'
    )
  })

  it('rejects unsafe revisions before sending a mutation', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(() =>
      proxies.delete({
        id: 'proxy-id',
        revision: Number.MAX_SAFE_INTEGER + 1,
      } as ProxyRecord)
    ).toThrow('Invalid proxy revision')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not report truncated batch results as a successful creation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ code: 200, data: [] })))
    )
    await expect(
      proxies.create([
        {
          name: 'Synthetic',
          proxyUrl: 'http://proxy.example.com',
          maxWebsocketConnections: 0,
          autoLocation: false,
          enabled: true,
        },
      ])
    ).rejects.toThrow('Invalid proxy batch result')
  })
})
