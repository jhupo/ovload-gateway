import type { UpstreamAccount } from '@/api/upstream-accounts'

export type AccountPanel = 'usage' | 'profile' | 'forecast' | 'reset' | 'models'
export function accountPanels(account: UpstreamAccount): AccountPanel[] {
  const oauth = account.authenticationKind === 'oauth'
  return [
    'usage',
    ...(oauth &&
    (account.capabilities.profile || account.capabilities.subscription)
      ? ['profile' as const]
      : []),
    // Gemini reports model buckets without the weekly/monthly windows used by forecasts.
    ...(oauth && account.capabilities.quota && account.provider !== 'gemini'
      ? ['forecast' as const]
      : []),
    ...(oauth && account.capabilities.resetCredits ? ['reset' as const] : []),
    ...(oauth && account.provider === 'openai' ? [] : ['models' as const]),
  ]
}
