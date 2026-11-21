import type { QueryClient } from '@tanstack/react-query'
import { useIdentitySession } from '@/stores/identity-session'

const accountQueryFamilies = [
  'upstream-accounts',
  'upstream-account-detail',
  'upstream-account-models',
  'account-supported-models',
  'account-test-models',
  'upstream-account-personal-info',
  'upstream-account-forecast',
  'upstream-account-reset-credits',
] as const

export const accountQueryKeys = {
  supportedModels: (owner: string | undefined, accountId: string | undefined) =>
    ['account-supported-models', owner, accountId] as const,
}

export async function invalidateAccountQueries(
  client: QueryClient,
  owner: string | undefined
): Promise<void> {
  const ownsSession = () => {
    const session = useIdentitySession.getState().session
    return (
      !!owner && session?.id === owner && session?.audience === 'management'
    )
  }
  if (!ownsSession()) return
  const keys = accountQueryFamilies.map((family) => [family, owner] as const)
  // Configuration revisions are shared; an older read must not repopulate them.
  await Promise.all(keys.map((queryKey) => client.cancelQueries({ queryKey })))
  if (!ownsSession()) return
  await Promise.all(
    keys.map((queryKey) => client.invalidateQueries({ queryKey }))
  )
}
