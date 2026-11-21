// Platform names belong to the product; adapter IDs belong to the wire protocol.
export const platformIds = ['openai', 'claude', 'gemini', 'xai'] as const
export type AccountPlatform = (typeof platformIds)[number]
export type UpstreamProvider = AccountPlatform | 'openai_api' | 'xai_api'
export type AccessMethod = 'oauth' | 'api_key'

const platforms: Record<
  AccountPlatform,
  {
    label: string
    apiProvider: UpstreamProvider
    apiBaseUrl: string
  }
> = {
  openai: {
    label: 'OpenAI',
    apiProvider: 'openai_api',
    apiBaseUrl: 'https://api.openai.com/v1',
  },
  claude: {
    label: 'Claude',
    apiProvider: 'claude',
    apiBaseUrl: 'https://api.anthropic.com/v1',
  },
  gemini: {
    label: 'Gemini',
    apiProvider: 'gemini',
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  xai: {
    label: 'Grok',
    apiProvider: 'xai_api',
    apiBaseUrl: 'https://api.x.ai/v1',
  },
}
export const accountProviders = platformIds.map((value) => ({
  value,
  label: platforms[value].label,
}))
export const accessMethods: { value: AccessMethod; label: string }[] = [
  { value: 'oauth', label: 'OAuth' },
  { value: 'api_key', label: 'API Key' },
]
export function accountPlatform(provider: string): string {
  return (
    accountProviders.find(
      ({ value }) =>
        value === provider || platforms[value].apiProvider === provider
    )?.value ?? provider
  )
}
export function isAccountPlatform(value: string): value is AccountPlatform {
  return platformIds.some((id) => id === value)
}
export function credentialProvider(
  platform: AccountPlatform,
  method: string
): UpstreamProvider {
  return method === 'api_key' ? platforms[platform].apiProvider : platform
}
export function defaultApiBaseUrl(provider: string): string {
  const platform = accountPlatform(provider)
  return isAccountPlatform(platform) ? platforms[platform].apiBaseUrl : ''
}
export function accountProviderLabel(
  provider: string | null | undefined,
  fallback = '—'
): string {
  const platform = accountPlatform(provider ?? '')
  return isAccountPlatform(platform)
    ? platforms[platform].label
    : provider || fallback
}
export function accessMethodLabel(method: string): string {
  return accessMethods.find((item) => item.value === method)?.label ?? method
}
// Price records retain their adapter identity. Native Claude/Gemini prices apply to both access methods.
export function providerConnectionLabel(provider: string): string {
  const platform = accountPlatform(provider)
  const split =
    isAccountPlatform(platform) && platforms[platform].apiProvider !== platform
  return (
    accountProviderLabel(provider) +
    (split
      ? ' · ' + accessMethodLabel(provider === platform ? 'oauth' : 'api_key')
      : '')
  )
}

/** Providers whose catalog always requires a standard procurement band. */
export function requiresStandardPricingBand(provider: string): boolean {
  return (
    provider === 'openai_api' ||
    provider === 'xai_api' ||
    provider === 'claude' ||
    provider === 'gemini'
  )
}

export function platformOptions(providers: string[]) {
  const present = new Set(providers.map(accountPlatform))
  return [
    ...platformIds.filter((id) => present.has(id)),
    ...[...present].filter((id) => !isAccountPlatform(id)),
  ].map((value) => ({
    value,
    label: accountProviderLabel(value),
  }))
}
export function aggregatePlatformCounts(counts: Record<string, number>) {
  const result: Record<string, number> = {}
  for (const [provider, count] of Object.entries(counts)) {
    const platform = accountPlatform(provider)
    result[platform] = (result[platform] ?? 0) + count
  }
  return result
}
