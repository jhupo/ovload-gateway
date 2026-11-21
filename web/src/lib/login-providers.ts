export const loginProviders = ['github', 'google', 'linuxdo'] as const
export type LoginProvider = (typeof loginProviders)[number]
export type QuickLoginConfig = {
  identityBindingEnabled: boolean
  pendingIdentityHours: string
  providers: Record<LoginProvider, { clientId: string; callbackUrl: string }>
}
