import { useIdentitySession } from '@/stores/identity-session'

export function useWorkspaceProfile() {
  const saved = useIdentitySession((state) => state.profile)
  return {
    profile: {
      username: saved
        ? 'display_name' in saved
          ? saved.display_name
          : saved.username
        : '',
      email: saved && 'email' in saved ? saved.email : '',
      avatar: null,
      registeredAt: saved?.created_at ?? null,
      concurrencyLimit:
        saved && 'max_concurrency' in saved ? saved.max_concurrency : null,
    },
  }
}
