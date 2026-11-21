import { useQuery } from '@tanstack/react-query'
import { authSettingsApi } from '@/api/auth-settings'

export function useAuthPolicy() {
  return useQuery({
    queryKey: ['registration-policy'],
    queryFn: ({ signal }) => authSettingsApi.publicLoad(signal),
    retry: false,
  })
}
