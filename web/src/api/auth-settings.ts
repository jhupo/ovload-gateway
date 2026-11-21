import type { Agreement } from './contracts/settings'
import { apiRequest } from './client'

export type AuthSettings = {
  enabled_providers: string[]
  revision: number
  registration_enabled: boolean
  verification_required: boolean
  recovery_enabled: boolean
  allowed_domains: string[]
  default_user_concurrency: number
  default_user_rpm: number
  default_customer_concurrency: number
  default_customer_rpm: number
  agreement: Agreement
  gift_usd: string
}
export type PublicAuthSettings = Pick<
  AuthSettings,
  | 'revision'
  | 'registration_enabled'
  | 'verification_required'
  | 'recovery_enabled'
  | 'agreement'
> & {
  oauth_providers: string[]
  oauth_available: string[]
  mail_available: boolean
  supports_consent: boolean
}
export const authSettingsApi = {
  load: async (signal?: AbortSignal) =>
    (await apiRequest<AuthSettings>('management', '/auth/settings', { signal }))
      .data,
  update: async (value: AuthSettings, signal?: AbortSignal) =>
    (
      await apiRequest<AuthSettings>('management', '/auth/settings', {
        method: 'PATCH',
        body: value,
        revision: value.revision,
        signal,
      })
    ).data,
  publicLoad: async (signal?: AbortSignal) => {
    const { data } = await apiRequest<Partial<PublicAuthSettings>>(
      'customer',
      '/auth/registration-policy',
      { public: true, signal }
    )
    const supportsConsent =
      typeof data.revision === 'number' &&
      !!data.agreement &&
      Array.isArray(data.oauth_providers) &&
      Array.isArray(data.oauth_available)
    return {
      revision: data.revision ?? 1,
      agreement: data.agreement ?? {
        enabled: false,
        mode: 'modal' as const,
        updated: '',
        documents: [],
      },
      registration_enabled: data.registration_enabled === true,
      verification_required: data.verification_required === true,
      recovery_enabled: data.recovery_enabled === true,
      mail_available: data.mail_available === true,
      oauth_providers: data.oauth_providers ?? [],
      oauth_available: data.oauth_available ?? [],
      supports_consent: supportsConsent,
    }
  },
}
