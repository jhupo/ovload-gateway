import type { LoginProvider } from '@/lib/login-providers'

export type LoginSettings = {
  openRegistration: boolean
  emailVerification: boolean
  passwordRecoveryEnabled: boolean
  emailWhitelist: string
  providers: Record<LoginProvider, { enabled: boolean }>
}
export function createLoginSettings(): LoginSettings {
  return {
    openRegistration: false,
    emailVerification: false,
    passwordRecoveryEnabled: false,
    emailWhitelist: '',
    providers: {
      github: { enabled: false },
      google: { enabled: false },
      linuxdo: { enabled: false },
    },
  }
}
export function parseEmailWhitelist(value: string): string[] | null {
  const entries = value
    .split(/[\n,，]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^@/, '').toLowerCase())
  const domains = [...new Set(entries)]
  if (
    domains.length > 100 ||
    domains.some((domain) => {
      const labels = domain.split('.')
      return (
        domain.length > 253 ||
        labels.length < 2 ||
        !/^[a-z][a-z0-9-]*$/.test(labels[labels.length - 1]) ||
        labels.some(
          (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
        )
      )
    })
  )
    return null
  return domains
}
