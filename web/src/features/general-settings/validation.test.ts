import { describe, expect, it } from 'vitest'
import type { AuthSettings } from '@/api/auth-settings'
import { authSettingsErrors, siteErrors } from './validation'

const valid = { name: 'Ovload', subtitle: '', support: '', endpoint: '' }

describe('site settings validation', () => {
  it('uses Unicode scalar length and rejects control characters', () => {
    expect(siteErrors({ ...valid, name: '😀'.repeat(80) })).toEqual({})
    expect(siteErrors({ ...valid, name: '😀'.repeat(81) })).toEqual({
      name: 'textError',
    })
    expect(siteErrors({ ...valid, support: 'support\ncontact' })).toEqual({
      support: 'textError',
    })
  })

  it.each([
    'ftp://example.com',
    'https://user:secret@example.com',
    'https://example.com?token=secret',
    'https://example.com/#private',
    'https://example.com/path with spaces',
  ])('rejects endpoint %s', (endpoint) => {
    expect(siteErrors({ ...valid, endpoint }).endpoint).toBe('urlError')
  })

  it('accepts an HTTP(S) endpoint without credentials or query state', () => {
    expect(
      siteErrors({ ...valid, endpoint: 'https://api.example.com/v1' })
    ).toEqual({})
    expect(siteErrors({ ...valid, endpoint: 'http://127.0.0.1:8080' })).toEqual(
      {}
    )
  })
})

const auth: AuthSettings = {
  revision: 1,
  registration_enabled: true,
  verification_required: false,
  recovery_enabled: false,
  enabled_providers: [],
  allowed_domains: [],
  default_user_concurrency: 20,
  default_user_rpm: 1200,
  default_customer_concurrency: 100,
  default_customer_rpm: 6000,
  gift_usd: '1.2500000000',
  agreement: { enabled: false, mode: 'modal', updated: '', documents: [] },
}

describe('registration and agreement settings validation', () => {
  it('accepts exact USD amounts, defaults and optional agreements', () => {
    expect(authSettingsErrors(auth, 'example.com')).toEqual({})
  })

  it('rejects invalid amounts, fractional limits and email domains', () => {
    expect(
      authSettingsErrors(
        {
          ...auth,
          gift_usd: '-1',
          default_user_concurrency: 1.5,
          default_user_rpm: 0,
        },
        'person@example.com'
      )
    ).toEqual({
      defaultBalance: 'defaultBalanceError',
      defaultConcurrency: 'defaultConcurrencyError',
      defaultRpm: 'defaultRpmError',
      emailWhitelist: 'emailWhitelistError',
    })
  })

  it('requires valid documents before enabling agreements', () => {
    expect(
      authSettingsErrors(
        { ...auth, agreement: { ...auth.agreement, enabled: true } },
        ''
      )
    ).toEqual({ agreement: 'agreementError' })
    const document = {
      id: 'terms',
      title: 'Terms',
      slug: 'terms',
      content: '# Terms\n\nBody',
    }
    const enabled = { ...auth.agreement, enabled: true, documents: [document] }
    expect(authSettingsErrors({ ...auth, agreement: enabled }, '')).toEqual({})
    expect(
      authSettingsErrors(
        {
          ...auth,
          agreement: {
            ...enabled,
            documents: [document, { ...document, id: 'duplicate' }],
          },
        },
        ''
      )
    ).toEqual({ agreement: 'slugError' })
    expect(
      authSettingsErrors(
        {
          ...auth,
          agreement: {
            ...enabled,
            documents: [{ ...document, content: '   ' }],
          },
        },
        ''
      )
    ).toEqual({ agreement: 'agreementError' })
  })
})
