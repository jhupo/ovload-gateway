import { allows, useIdentitySession } from '@/stores/identity-session'

export function canOpenManagementPath(path: string): boolean {
  if (
    path === '/settings' ||
    path.startsWith('/settings/') ||
    path === '/help-center'
  )
    return true
  if (path === '/users' || path === '/security-authentication') {
    const permission =
      path === '/users' ? 'identity.users.read' : 'security.settings.manage'
    return useIdentitySession
      .getState()
      .grants.some(
        (grant) =>
          grant.status === 'active' &&
          (!grant.expires_at || Date.parse(grant.expires_at) > Date.now()) &&
          grant.permissions.includes(permission)
      )
  }
  if (
    [
      '/dashboard',
      '/monitoring',
      '/usage',
      '/channels/monitoring',
      '/channel-status',
    ].some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  )
    return allows('usage.read')
  if (
    ['/accounts', '/groups', '/proxies'].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    )
  )
    return allows('provider_accounts.read')
  if (
    ['/channels/pricing', '/orders', '/subscriptions', '/redemption-codes'].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    )
  )
    return allows('billing.read')
  return allows('security.settings.manage')
}

export function managementHomePath():
  | '/dashboard'
  | '/users'
  | '/security-authentication'
  | '/settings' {
  if (canOpenManagementPath('/dashboard')) return '/dashboard'
  if (canOpenManagementPath('/users')) return '/users'
  if (canOpenManagementPath('/security-authentication'))
    return '/security-authentication'
  return '/settings'
}
