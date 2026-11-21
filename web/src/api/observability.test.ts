import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdentitySession } from '@/stores/identity-session'
import { observability, observationWindow } from './observability'
import type { IdentitySession } from './types'

const management: IdentitySession = {
  id: 'observation-session-a',
  audience: 'management',
  tenant_id: null,
  user_id: null,
  principal_id: 'synthetic-operator',
  expires_at: '2099-01-01T00:00:00Z',
}
const success = (data: unknown) =>
  Response.json({ code: 200, message: 'ok', data })

describe('management observation transport', () => {
  beforeEach(() => useIdentitySession.getState().setSession(management))
  afterEach(() => {
    vi.unstubAllGlobals()
    useIdentitySession.getState().clear()
  })

  it('uses a frozen 24-hour range and server record pagination/filter names', async () => {
    const fetch = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        success({ items: [], currentPage: 3, pageSize: 20, total: 41 })
      )
    )
    vi.stubGlobal('fetch', fetch)
    const params = observationWindow('24h', Date.parse('2026-10-29T08:00:00Z'))
    params.set('status', 'all')
    params.set('currentPage', '3')
    params.set('pageSize', '20')
    params.set('clientApiKeyName', 'synthetic key & label')
    await observability.records(params, new AbortController().signal)
    const url = new URL(
      fetch.mock.calls[0]![0] as string,
      'https://gateway.invalid'
    )
    expect(url.pathname).toBe('/api/admin/usage/records')
    expect(url.searchParams.get('startTime')).toBe('2026-10-28T08:00:00.000Z')
    expect(url.searchParams.get('endTime')).toBe('2026-10-29T08:00:00.000Z')
    expect(url.searchParams.get('period')).toBeNull()
    expect(url.searchParams.get('asOf')).toBeNull()
    expect(url.searchParams.get('currentPage')).toBe('3')
    expect(url.searchParams.get('clientApiKeyName')).toBe(
      'synthetic key & label'
    )
  })

  it('keeps unknown usage and ten-decimal USD costs unchanged', async () => {
    const data = {
      id: 'synthetic-request',
      tokenDetails: { inputTokens: null, outputTokens: 0, totalTokens: null },
      costs: [
        { currency: 'USD', estimatedAmount: '9007199254740993.1234567890' },
      ],
      attempts: [],
      attemptsComplete: false,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(success(data)))
    )
    const detail = await observability.detail(
      data.id,
      new AbortController().signal
    )
    expect(detail.tokenDetails.inputTokens).toBeNull()
    expect(detail.tokenDetails.outputTokens).toBe(0)
    expect(detail.costs[0]?.estimatedAmount).toBe('9007199254740993.1234567890')
    expect(detail.attemptsComplete).toBe(false)
  })

  it('does not send management observations with a customer session', async () => {
    useIdentitySession
      .getState()
      .setSession({
        ...management,
        audience: 'customer',
        principal_id: null,
        user_id: 'synthetic-user',
        tenant_id: 'synthetic-customer',
      })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(
      observability.dashboard(
        observationWindow('today', 0),
        new AbortController().signal
      )
    ).rejects.toMatchObject({ status: 401 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a late observation after its initiating session changes', async () => {
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
    const pending = observability.errors(
      new URLSearchParams(),
      new AbortController().signal
    )
    useIdentitySession
      .getState()
      .setSession({ ...management, id: 'observation-session-b' })
    finish(success({ items: [], currentPage: 1, pageSize: 20, total: 0 }))
    await expect(pending).rejects.toMatchObject({
      status: 401,
      sessionId: management.id,
    })
    expect(useIdentitySession.getState().session?.id).toBe(
      'observation-session-b'
    )
  })

  it('forwards query cancellation into the real request client', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener(
              'abort',
              () => reject(init.signal?.reason),
              { once: true }
            )
          })
      )
    )
    const controller = new AbortController()
    const pending = observability.trend(
      observationWindow('7d', Date.now()),
      controller.signal
    )
    controller.abort(
      new DOMException('Synthetic query cancellation', 'AbortError')
    )
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
