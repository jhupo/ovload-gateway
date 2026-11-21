import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdentitySession } from '@/stores/identity-session'
import { backups } from './backups'

const wire = {
  storageRevision: 7,
  endpoint: 'https://storage.example.com',
  region: 'test-region',
  bucket: 'synthetic-bucket',
  prefix: 'backups/',
  forcePathStyle: false,
  verified: true,
  hasAccessKey: true,
  hasSecret: true,
  scheduleEnabled: false,
  cronExpression: '0 2 * * *',
  retentionDays: 14,
  retentionCount: 10,
  nextRunAt: null,
  lastVerifiedAt: null,
  updatedAt: '2026-01-01T00:00:00Z',
}
describe('backup API credential boundary', () => {
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

  it('consumes the credential-presence settings contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ code: 200, data: wire })))
    )
    const settings = await backups.settings()
    expect(settings).toMatchObject({
      storageRevision: 7,
      hasAccessKey: true,
      hasSecret: true,
    })
    expect(settings).not.toHaveProperty('secretAccessKey')
    expect(settings).not.toHaveProperty('accessKeyId')
    expect(JSON.stringify(settings)).not.toContain('synthetic-secret-key')
    expect(JSON.stringify(settings)).not.toContain('synthetic-access-key')
  })

  it('does not turn missing credentials into a configured state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            code: 200,
            data: { ...wire, hasAccessKey: false, hasSecret: false },
          })
        )
      )
    )
    expect(await backups.settings()).toMatchObject({
      hasAccessKey: false,
      hasSecret: false,
    })
  })

  it('submits write-only credentials with CSRF and keeps an omitted secret unchanged', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(Response.json({ code: 200, data: wire }))
    )
    vi.stubGlobal('fetch', fetch)
    const settings = await backups.storage({
      endpoint: wire.endpoint,
      region: wire.region,
      bucket: wire.bucket,
      prefix: wire.prefix,
      forcePathStyle: false,
      accessKeyId: 'synthetic-replacement',
    })
    const [path, options] = fetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(path).toBe('/api/admin/settings/backups/storage/update')
    expect(new Headers(options.headers).get('X-CSRF-Token')).toBe(
      'synthetic-csrf'
    )
    expect(JSON.parse(String(options.body))).not.toHaveProperty(
      'secretAccessKey'
    )
    expect(settings).not.toHaveProperty('secretAccessKey')
  })
})
