import { create } from 'zustand'
import { apiRequest } from '@/api/client'
import { ApiError } from '@/api/errors'
import { installSessionPort } from '@/api/session-port'
import type {
  Audience,
  CustomerProfile,
  IdentitySession,
  ManagementProfile,
  PermissionGrant,
} from '@/api/types'

type IdentityState = {
  session: IdentitySession | null
  profile: CustomerProfile | ManagementProfile | null
  grants: PermissionGrant[]
  sessionExpired: boolean
  setSession: (session: IdentitySession) => void
  setProfile: (profile: CustomerProfile | ManagementProfile) => void
  clear: () => void
  invalidateSession: (expectedId: string | undefined) => boolean
  restore: (audience: Audience) => Promise<IdentitySession>
  refreshProfile: () => Promise<void>
  refreshPermissions: () => Promise<void>
}

let restoreInFlight:
  | { audience: Audience; promise: Promise<IdentitySession> }
  | undefined
let identityEpoch = 0
const audienceHintKey = 'ovload.last-audience'

function rememberAudience(audience: Audience) {
  try {
    localStorage.setItem(audienceHintKey, audience)
  } catch {
    /* The HttpOnly cookie remains authoritative when browser storage is blocked. */
  }
}

export const useIdentitySession = create<IdentityState>((set, get) => ({
  session: null,
  profile: null,
  grants: [],
  sessionExpired: false,
  setSession: (session) => {
    rememberAudience(session.audience)
    identityEpoch++
    restoreInFlight = undefined
    set({ session, profile: null, grants: [], sessionExpired: false })
  },
  setProfile: (profile) => set({ profile }),
  clear: () => {
    identityEpoch++
    restoreInFlight = undefined
    set({ session: null, profile: null, grants: [], sessionExpired: false })
  },
  invalidateSession: (expectedId) => {
    if (!expectedId || get().session?.id !== expectedId) return false
    identityEpoch++
    restoreInFlight = undefined
    set({ session: null, profile: null, grants: [], sessionExpired: true })
    return true
  },
  restore: (audience) => {
    if (restoreInFlight?.audience === audience) return restoreInFlight.promise
    const fence = ++identityEpoch
    const promise = apiRequest<IdentitySession>(audience, '/session')
      .then(async ({ data }) => {
        if (identityEpoch !== fence)
          throw new ApiError(401, 'identity.unauthorized', 'Session changed')
        const [{ data: profile }, { data: permissions }] = await Promise.all([
          apiRequest<CustomerProfile | ManagementProfile>(audience, '/profile'),
          audience === 'management'
            ? apiRequest<{ items: PermissionGrant[] }>(
                audience,
                '/session/permissions'
              )
            : Promise.resolve({ data: { items: [] as PermissionGrant[] } }),
        ])
        if (identityEpoch !== fence)
          throw new ApiError(401, 'identity.unauthorized', 'Session changed')
        const ownsProfile =
          audience === 'management'
            ? 'username' in profile && profile.id === data.principal_id
            : 'tenant_id' in profile &&
              profile.id === data.user_id &&
              profile.tenant_id === data.tenant_id
        if (
          data.audience !== audience ||
          !ownsProfile ||
          permissions.items.some(
            (grant) => grant.principal_id !== data.principal_id
          )
        )
          throw new ApiError(
            503,
            'identity.unavailable',
            'Invalid session owner'
          )
        set({
          session: data,
          profile,
          grants: permissions.items,
          sessionExpired: false,
        })
        rememberAudience(data.audience)
        return data
      })
      .finally(() => {
        if (restoreInFlight?.promise === promise) restoreInFlight = undefined
      })
    restoreInFlight = { audience, promise }
    return promise
  },
  refreshProfile: async () => {
    const session = get().session
    const fence = identityEpoch
    if (!session) return
    const { data } = await apiRequest<CustomerProfile | ManagementProfile>(
      session.audience,
      '/profile'
    )
    if (identityEpoch === fence && get().session?.id === session.id)
      set({ profile: data })
  },
  refreshPermissions: async () => {
    const session = get().session
    const fence = identityEpoch
    if (session?.audience !== 'management') return
    const { data } = await apiRequest<{ items: PermissionGrant[] }>(
      'management',
      '/session/permissions'
    )
    if (identityEpoch === fence && get().session?.id === session.id)
      set({ grants: data.items })
  },
}))

installSessionPort({
  getSession: () => useIdentitySession.getState().session,
  invalidateSession: (expectedId) =>
    useIdentitySession.getState().invalidateSession(expectedId),
})

export function allows(permission: string, tenantId?: string): boolean {
  const state = useIdentitySession.getState()
  return (
    state.session?.audience === 'management' &&
    state.grants.some(
      (grant) =>
        grant.status === 'active' &&
        (!grant.expires_at || Date.parse(grant.expires_at) > Date.now()) &&
        grant.permissions.includes(permission) &&
        (grant.scope === 'platform' ||
          (tenantId !== undefined && grant.tenant_id === tenantId))
    )
  )
}

export function hasIdentitySession() {
  const session = useIdentitySession.getState().session
  return !!session && Date.parse(session.expires_at) > Date.now()
}

export async function restoreBrowserSession(): Promise<IdentitySession | null> {
  let preferred: Audience = 'management'
  try {
    if (localStorage.getItem(audienceHintKey) === 'customer')
      preferred = 'customer'
  } catch {
    /* Only a non-sensitive audience hint is stored in JavaScript storage. */
  }
  const audiences: Audience[] = [
    preferred,
    preferred === 'management' ? 'customer' : 'management',
  ]
  for (const audience of audiences) {
    try {
      return await useIdentitySession.getState().restore(audience)
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error
    }
  }
  return null
}
