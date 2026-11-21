import { QueryClient, isCancelledError } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { IdentitySession } from '@/api/types'
import { useIdentitySession } from '@/stores/identity-session'
import { invalidateAccountQueries } from './query-cache'

function session(id: string): IdentitySession {
  return {
    id,
    audience: 'management',
    tenant_id: null,
    user_id: null,
    principal_id: 'fixture-operator',
    expires_at: '2050-01-01T00:00:00Z',
  }
}

describe('account query invalidation', () => {
  let client: QueryClient

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 10_000 } },
    })
    useIdentitySession.getState().setSession(session('owner-one'))
  })

  afterEach(() => {
    client.clear()
    useIdentitySession.getState().clear()
  })

  it('invalidates every account projection in the owner shared revision', async () => {
    const changed = [
      ['upstream-accounts', 'owner-one', 'page=1'],
      ['upstream-accounts', 'owner-one', 'page=2'],
      ['upstream-account-detail', 'owner-one', 'account-one'],
      ['upstream-account-detail', 'owner-one', 'account-two'],
      ['upstream-account-models', 'owner-one', 'account-one'],
      ['upstream-account-models', 'owner-one', 'account-two'],
      ['account-test-models', 'owner-one', 'account-one'],
    ]
    const unaffected = [
      ['upstream-accounts', 'owner-two', 'page=1'],
      ['upstream-account-detail', 'owner-two', 'account-one'],
      ['upstream-account-models', 'owner-two', 'account-one'],
      ['account-test-models', 'owner-two', 'account-one'],
      ['account-group-options', 'owner-one'],
    ]
    for (const key of [...changed, ...unaffected])
      client.setQueryData(key, { configRevision: 1 })

    await invalidateAccountQueries(client, 'owner-one')

    for (const key of changed)
      expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    for (const key of unaffected)
      expect(client.getQueryState(key)?.isInvalidated).toBe(false)
  })

  it('ignores a completed command from a previous owner', async () => {
    const key = ['upstream-account-detail', 'owner-two', 'account-one']
    client.setQueryData(key, { configRevision: 2 })
    useIdentitySession.getState().setSession(session('owner-two'))

    await invalidateAccountQueries(client, 'owner-one')

    expect(client.getQueryState(key)?.isInvalidated).toBe(false)
    expect(client.getQueryData(key)).toEqual({ configRevision: 2 })
  })

  it('cancels an older credential catalog read before it can restore old models', async () => {
    const key = ['upstream-account-models', 'owner-one', 'account-one']
    let resolveOld!: (value: { models: string[] }) => void
    let aborted = false
    const older = client
      .fetchQuery({
        queryKey: key,
        queryFn: ({ signal }) => {
          signal.addEventListener('abort', () => {
            aborted = true
          })
          return new Promise<{ models: string[] }>((resolve) => {
            resolveOld = resolve
          })
        },
      })
      .catch((error: unknown) => error)

    await invalidateAccountQueries(client, 'owner-one')

    expect(aborted).toBe(true)
    expect(isCancelledError(await older)).toBe(true)
    const current = { models: ['replacement-model'] }
    await client.fetchQuery({ queryKey: key, queryFn: async () => current })
    resolveOld({ models: ['old-model'] })
    await Promise.resolve()
    expect(client.getQueryData(key)).toEqual(current)
  })

  it('rechecks ownership after canceling older requests', async () => {
    const oldList = ['upstream-accounts', 'owner-one', 'page=1']
    const currentList = ['upstream-accounts', 'owner-two', 'page=1']
    client.setQueryData(oldList, { configRevision: 1 })
    client.setQueryData(currentList, { configRevision: 2 })
    const pending = client
      .fetchQuery({
        queryKey: ['upstream-account-detail', 'owner-one', 'account-one'],
        queryFn: ({ signal }) => {
          return new Promise<never>((_, reject) => {
            signal.addEventListener('abort', () => {
              useIdentitySession.getState().setSession(session('owner-two'))
              reject(new Error('fixture request cancelled'))
            })
          })
        },
      })
      .catch((error: unknown) => error)

    await invalidateAccountQueries(client, 'owner-one')

    expect(isCancelledError(await pending)).toBe(true)
    expect(client.getQueryState(oldList)?.isInvalidated).toBe(false)
    expect(client.getQueryState(currentList)?.isInvalidated).toBe(false)
  })
})
